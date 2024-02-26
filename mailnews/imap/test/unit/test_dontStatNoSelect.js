/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// This file tests that checking folders for new mail with STATUS
// doesn't try to STAT noselect folders.

var gServer, gImapServer;
var gIMAPInbox;
var gFolder2Mailbox;
var gFolder1, gFolder2;

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(function () {
  var daemon = new ImapDaemon();
  daemon.createMailbox("folder 1", { subscribed: true });
  const folder1Mailbox = daemon.getMailbox("folder 1");
  folder1Mailbox.flags.push("\\Noselect");
  daemon.createMailbox("folder 2", { subscribed: true });
  gFolder2Mailbox = daemon.getMailbox("folder 2");
  addMessageToFolder(gFolder2Mailbox);
  gServer = makeServer(daemon, "");

  gImapServer = createLocalIMAPServer(gServer.port);

  // Bug 1050840: check a newly created server has the default number of connections
  Assert.equal(gImapServer.maximumConnectionsNumber, 5);
  gImapServer.maximumConnectionsNumber = 1;

  localAccountUtils.loadLocalMailAccount();

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
  imapAccount.incomingServer = gImapServer;
  MailServices.accounts.defaultAccount = imapAccount;

  // Get the folder list...
  gImapServer.performExpand(null);
  gServer.performTest("SUBSCRIBE");
  // pref tuning: one connection only, turn off notifications
  // Make sure no biff notifications happen
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  const rootFolder = gImapServer.rootFolder;
  gIMAPInbox = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  gFolder1 = rootFolder.getChildNamed("folder 1");
  gFolder2 = rootFolder.getChildNamed("folder 2");
  gFolder1.setFlag(Ci.nsMsgFolderFlags.CheckNew);
  gFolder2.setFlag(Ci.nsMsgFolderFlags.CheckNew);
});

add_task(function checkStatSelect() {
  // imap fake server's resetTest resets the authentication state - charming.
  // So poke the _test member directly.
  gServer._test = true;
  gIMAPInbox.getNewMessages(null, null);
  gServer.performTest("STATUS");
  // We want to wait for the STATUS to be really done before we issue
  // more STATUS commands, so we do a NOOP on the
  // INBOX, and since we only have one connection with the fake server,
  // that will essentially serialize things.
  gServer._test = true;
  gIMAPInbox.updateFolder(null);
  gServer.performTest("NOOP");
});

add_task(async function checkStatNoSelect() {
  // folder 2 should have been stat'd, but not folder 1. All we can really check
  // is that folder 2 was stat'd and that its unread msg count is 1
  Assert.equal(gFolder2.getNumUnread(false), 1);
  addMessageToFolder(gFolder2Mailbox);
  gFolder1.clearFlag(Ci.nsMsgFolderFlags.ImapNoselect);
  gServer._test = true;

  const folderListener = new FolderListener();

  // we've cleared the ImapNoselect flag, so we will attempt to STAT folder 1,
  // which will fail. So we verify that we go on and STAT folder 2, and that
  // it picks up the message we added to it above.
  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.boolPropertyChanged
  );
  gIMAPInbox.getNewMessages(null, null);
  // Wait for the folder listener to get told about new messages.
  await folderListener.promise;
});

add_task(function endTest() {
  Assert.equal(gFolder2.getNumUnread(false), 2);

  // Clean up the server in preparation
  gServer.resetTest();
  gImapServer.closeCachedConnections();
  gServer.performTest();
  gServer.stop();
});

function addMessageToFolder(mbox) {
  // make a couple of messages
  let messages = [];
  const gMessageGenerator = new MessageGenerator();
  messages = messages.concat(gMessageGenerator.makeMessage());

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(messages[0].toMessageString())
  );
  const message = new ImapMessage(msgURI.spec, mbox.uidnext++);
  mbox.addMessage(message);
}

function FolderListener() {
  this._promise = new Promise(resolve => {
    this._resolve = resolve;
  });
}

FolderListener.prototype = {
  onFolderBoolPropertyChanged(aItem, aProperty, aOldValue, aNewValue) {
    // This means that the STAT on "folder 2" has finished.
    if (aProperty == "NewMessages" && aNewValue) {
      this._resolve();
    }
  },
  get promise() {
    return this._promise;
  },
};
