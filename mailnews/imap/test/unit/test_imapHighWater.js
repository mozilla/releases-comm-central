/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator, MessageScenarioFactory } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gIMAPDaemon, gServer, gIMAPIncomingServer;

var gIMAPInbox;
var gFolder1, gRootFolder;

// Adds some messages directly to a mailbox (eg new mail)
function addMessagesToServer(messages, mailbox) {
  // Create the ImapMessages and store them on the mailbox
  messages.forEach(function (message) {
    const dataUri = Services.io.newURI(
      "data:text/plain;base64," + btoa(message.toMessageString())
    );
    mailbox.addMessage(new ImapMessage(dataUri.spec, mailbox.uidnext++, []));
  });
}

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();

  /*
   * Set up an IMAP server.
   */
  gIMAPDaemon = new ImapDaemon();
  gServer = makeServer(gIMAPDaemon, "");
  gIMAPDaemon.createMailbox("folder 1", { subscribed: true });
  gIMAPIncomingServer = createLocalIMAPServer(gServer.port);
  gIMAPIncomingServer.maximumConnectionsNumber = 1;

  // We need an identity so that updateFolder doesn't fail
  const localAccount = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  localAccount.addIdentity(identity);
  localAccount.defaultIdentity = identity;
  localAccount.incomingServer = localAccountUtils.incomingServer;

  // Let's also have another account, using the same identity
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(identity);
  imapAccount.defaultIdentity = identity;
  imapAccount.incomingServer = gIMAPIncomingServer;
  MailServices.accounts.defaultAccount = imapAccount;

  // pref tuning: one connection only, turn off notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  // Don't prompt about offline download when going offline
  Services.prefs.setIntPref("offline.download.download_messages", 2);
});

add_setup(function () {
  // make 10 messages
  const messageGenerator = new MessageGenerator();
  const scenarioFactory = new MessageScenarioFactory(messageGenerator);

  // build up a list of messages
  let messages = [];
  messages = messages.concat(scenarioFactory.directReply(10));

  // Add 10 messages with uids 1-10.
  const imapInbox = gIMAPDaemon.getMailbox("INBOX");
  addMessagesToServer(messages, imapInbox);
  messages = [];
  messages = messages.concat(messageGenerator.makeMessage());
  // Add a single message to move target folder.
  addMessagesToServer(messages, gIMAPDaemon.getMailbox("folder 1"));

  // Get the IMAP inbox...
  gRootFolder = gIMAPIncomingServer.rootFolder;
  gIMAPInbox = gRootFolder
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox)
    .QueryInterface(Ci.nsIMsgImapMailFolder);
});

add_task(async function doMoves() {
  // update folders to download headers.
  const urlListenerInbox = new PromiseTestUtils.PromiseUrlListener();
  gIMAPInbox.updateFolderWithListener(null, urlListenerInbox);
  await urlListenerInbox.promise;
  gFolder1 = gRootFolder
    .getChildNamed("folder 1")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const urlListenerFolder1 = new PromiseTestUtils.PromiseUrlListener();
  gFolder1.updateFolderWithListener(null, urlListenerFolder1);
  await urlListenerFolder1.promise;
  // get five messages to move from Inbox to folder 1.
  let headers1 = [];
  let count = 0;
  for (const header of gIMAPInbox.msgDatabase.enumerateMessages()) {
    if (count >= 5) {
      break;
    }
    if (header instanceof Ci.nsIMsgDBHdr) {
      headers1.push(header);
    }
    count++;
  }
  // this will add dummy headers with keys > 0xffffff80
  const copyListenerDummyHeaders = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gIMAPInbox,
    headers1,
    gFolder1,
    true,
    copyListenerDummyHeaders,
    gDummyMsgWindow,
    true
  );
  await copyListenerDummyHeaders.promise;

  const urlListenerInboxAfterDummy = new PromiseTestUtils.PromiseUrlListener();
  gIMAPInbox.updateFolderWithListener(null, urlListenerInboxAfterDummy);
  await urlListenerInboxAfterDummy.promise;

  const urlListenerFolder1AfterDummy =
    new PromiseTestUtils.PromiseUrlListener();
  gFolder1.updateFolderWithListener(
    gDummyMsgWindow,
    urlListenerFolder1AfterDummy
  );
  await urlListenerFolder1AfterDummy.promise;

  // Check that playing back offline events gets rid of dummy
  // headers, and thus highWater is recalculated.
  Assert.equal(gFolder1.msgDatabase.dBFolderInfo.highWater, 6);
  headers1 = [];
  count = 0;
  for (const header of gIMAPInbox.msgDatabase.enumerateMessages()) {
    if (count >= 5) {
      break;
    }
    if (header instanceof Ci.nsIMsgDBHdr) {
      headers1.push(header);
    }
    count++;
  }
  // Check that copyMessages will handle having a high highwater mark.
  // It will thrown an exception if it can't.
  const msgHdr = gFolder1.msgDatabase.createNewHdr(0xfffffffd);
  gFolder1.msgDatabase.addNewHdrToDB(msgHdr, false);
  const copyListenerHighWater = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    gIMAPInbox,
    headers1,
    gFolder1,
    true,
    copyListenerHighWater,
    gDummyMsgWindow,
    true
  );
  await copyListenerHighWater.promise;
  gServer.performTest("UID COPY");

  gFolder1.msgDatabase.deleteHeader(msgHdr, null, true, false);
  const urlListenerInboxAfterDelete = new PromiseTestUtils.PromiseUrlListener();
  gIMAPInbox.updateFolderWithListener(null, urlListenerInboxAfterDelete);
  await urlListenerInboxAfterDelete.promise;
  // this should clear the dummy headers.
  const urlListenerFolder1AfterDelete =
    new PromiseTestUtils.PromiseUrlListener();
  gFolder1.updateFolderWithListener(
    gDummyMsgWindow,
    urlListenerFolder1AfterDelete
  );
  await urlListenerFolder1AfterDelete.promise;
  Assert.equal(gFolder1.msgDatabase.dBFolderInfo.highWater, 11);
});

add_task(function endTest() {
  Services.io.offline = true;
  gServer.performTest("LOGOUT");
  gIMAPIncomingServer.closeCachedConnections();
  gServer.stop();
});
