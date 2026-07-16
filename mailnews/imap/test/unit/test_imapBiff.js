/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

let incomingServer;
let server;
let inbox;

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);

  server = new IMAPServer({ extensions: ["RFC2177"] });

  const account = MailServices.accounts.createAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "localhost",
    "imap"
  );
  incomingServer.password = "password";
  incomingServer.port = server.port;
  incomingServer.QueryInterface(Ci.nsIImapIncomingServer).useIdle = true;
  account.incomingServer = incomingServer;

  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;

  inbox = incomingServer.rootFolder
    .getChildNamed("INBOX")
    .QueryInterface(Ci.nsIMsgImapMailFolder);
  const updateListener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateFolderWithListener(null, updateListener);
  await updateListener.promise;

  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
  });
});

/**
 * Wait until the client connection for a mailbox is in RFC 2177 IDLE.
 *
 * @param {string} mailboxName
 */
async function waitForIdle(mailboxName) {
  await TestUtils.waitForCondition(
    () =>
      server.daemon.getConnections(mailboxName).some(handler => handler.idling),
    `${mailboxName} should enter IDLE`
  );
}

async function waitForConnectionsToClose() {
  await TestUtils.waitForCondition(
    () => !server.daemon.getConnections().length,
    "all cached IMAP connections should close"
  );
}

async function updateFolder(folder) {
  const listener = new PromiseTestUtils.PromiseUrlListener();
  folder.updateFolderWithListener(null, listener);
  await listener.promise;
}

/**
 * Make the subset of an nsIMailboxSpec consumed by
 * nsImapMailFolder::UpdateImapMailboxStatus.
 *
 * @param {object} values
 * @returns {nsIMailboxSpec}
 */
function makeMailboxSpec(values) {
  return {
    QueryInterface: ChromeUtils.generateQI(["nsIMailboxSpec"]),
    numMessages: values.numMessages,
    numUnseenMessages: values.numUnseenMessages,
    numRecentMessages: 0,
    nextUID: values.nextUID,
    folderSelected: true,
  };
}

add_task(async function testIdleDeliveryBiffs() {
  await waitForIdle("INBOX");

  const folderListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
    biffNotifications: [],
    onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
      if (property == "BiffState" || property == "NewMailReceived") {
        this.biffNotifications.push({ folder, property, oldValue, newValue });
      }
    },
  };
  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.intPropertyChanged
  );

  const generator = new MessageGenerator();
  await server.addMessages("INBOX", [generator.makeMessage()], false);
  const messageAdded = PromiseTestUtils.promiseFolderNotification(
    inbox,
    "msgAdded"
  );

  Assert.equal(
    server.daemon.sendUnsolicited("INBOX", "* 1 EXISTS"),
    1,
    "one idling connection should receive the new message count"
  );

  await messageAdded;
  await TestUtils.waitForCondition(
    () => incomingServer.biffState == Ci.nsIMsgFolder.nsMsgBiffState_NewMail,
    "the unsolicited EXISTS response should result in biff"
  );

  Assert.equal(inbox.getTotalMessages(false), 1, "one header was downloaded");
  Assert.equal(inbox.getNumUnread(false), 1, "the new message is unread");
  Assert.equal(
    inbox.getNumNewMessages(false),
    1,
    "the new message contributes to the biff count"
  );
  Assert.equal(
    folderListener.biffNotifications.length,
    1,
    "the message produces one biff notification"
  );

  MailServices.mailSession.RemoveFolderListener(folderListener);
});

add_task(async function testStatusDefersBiffUntilFlagSync() {
  // Build a three-message local cache with one older message still unread and
  // new, matching the state left behind before the sleep/wake race.
  incomingServer.closeCachedConnections();
  await waitForConnectionsToClose();

  const generator = new MessageGenerator();
  await server.addMessages(
    "INBOX",
    generator.makeMessages({ count: 2 }),
    false
  );
  const oldServerMessages = server.getMessagesInFolder(inbox);
  oldServerMessages[1].setFlag("\\Seen");
  oldServerMessages[2].setFlag("\\Seen");
  await updateFolder(inbox);

  Assert.equal(inbox.getTotalMessages(false), 3, "three messages are cached");
  Assert.equal(inbox.getNumUnread(false), 1, "one cached message is unread");
  Assert.equal(
    inbox.getNumNewMessages(false),
    1,
    "the unread cached message remains new"
  );

  incomingServer.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  incomingServer.QueryInterface(Ci.nsIImapIncomingServer).useIdle = false;
  incomingServer.closeCachedConnections();
  await waitForConnectionsToClose();

  // The old message is read on another device while one batch of four newer
  // messages arrives. No further server mutation occurs after this point.
  oldServerMessages[0].setFlag("\\Seen");
  await server.addMessages(
    "INBOX",
    generator.makeMessages({ count: 4 }),
    false
  );

  const biffNotifications = [];
  const folderListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
    onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
      if (property == "BiffState" || property == "NewMailReceived") {
        biffNotifications.push({ folder, property, oldValue, newValue });
      }
    },
  };
  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.intPropertyChanged
  );

  const statusListener = new PromiseTestUtils.PromiseUrlListener();
  inbox.updateStatus(statusListener, null);
  await statusListener.promise;
  await TestUtils.waitForCondition(
    () => inbox.getTotalMessages(false) == 7 && inbox.getNumUnread(false) == 4,
    "the STATUS-triggered folder synchronization should finish"
  );
  info(
    `After synchronization: new=${inbox.getNumNewMessages(false)}, ` +
      `biffState=${incomingServer.biffState}, ` +
      `performingBiff=${incomingServer.performingBiff}, ` +
      `notifications=${biffNotifications.length}`
  );
  await TestUtils.waitForCondition(
    () => inbox.getNumNewMessages(false) == 4 && !incomingServer.performingBiff,
    "the synchronized folder should finish biff"
  );

  Assert.equal(inbox.getNumUnread(false), 4, "only the new batch is unread");
  const oldHeader = inbox.msgDatabase.getMsgHdrForKey(oldServerMessages[0].uid);
  Assert.ok(oldHeader.isRead, "the old message is reconciled as read");
  Assert.ok(
    !(oldHeader.flags & Ci.nsMsgMessageFlags.New),
    "the old message is no longer locally new"
  );
  Assert.equal(
    biffNotifications.filter(
      event =>
        event.property != "BiffState" ||
        event.newValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail
    ).length,
    1,
    "the stable server batch should produce only one positive biff"
  );

  MailServices.mailSession.RemoveFolderListener(folderListener);
});

add_task(function testNoFreshUnseenDoesNotBiff() {
  const sink = inbox.QueryInterface(Ci.nsIImapMailFolderSink);

  // Prime a last-known server count one above the reconciled local count,
  // then model local processing having consumed the pending delta.
  sink.UpdateImapMailboxStatus(
    null,
    makeMailboxSpec({ numMessages: 8, numUnseenMessages: 5, nextUID: 9 })
  );
  inbox.changeNumPendingUnread(-inbox.numPendingUnread);
  incomingServer.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;

  const biffNotifications = [];
  const folderListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIFolderListener"]),
    onFolderIntPropertyChanged(folder, property, oldValue, newValue) {
      if (property == "BiffState") {
        biffNotifications.push({ folder, oldValue, newValue });
      }
    },
  };
  MailServices.mailSession.AddFolderListener(
    folderListener,
    Ci.nsIFolderListener.intPropertyChanged
  );

  // A selected-folder NOOP may update UIDNEXT, but it supplies no UNSEEN
  // count. The last known count must not be interpreted as a fresh delta.
  sink.UpdateImapMailboxStatus(
    null,
    makeMailboxSpec({ numMessages: 9, numUnseenMessages: -1, nextUID: 10 })
  );

  Assert.equal(
    incomingServer.biffState,
    Ci.nsIMsgFolder.nsMsgBiffState_NoMail,
    "NOOP without a fresh UNSEEN count should not biff"
  );
  Assert.deepEqual(
    biffNotifications,
    [],
    "NOOP without a fresh UNSEEN count should not notify biff"
  );
  Assert.equal(
    inbox.numPendingUnread,
    0,
    "the pending count should not change"
  );
  Assert.equal(
    inbox.serverUnseen,
    5,
    "the last known UNSEEN count should remain"
  );
  Assert.equal(
    inbox.serverNextUID,
    10,
    "the fresh UIDNEXT value should be kept"
  );

  // A later STATUS with a genuine unseen increase must still biff once.
  inbox.changeNumPendingUnread(1);
  sink.UpdateImapMailboxStatus(
    null,
    makeMailboxSpec({ numMessages: 9, numUnseenMessages: 6, nextUID: 10 })
  );

  Assert.equal(
    incomingServer.biffState,
    Ci.nsIMsgFolder.nsMsgBiffState_NewMail,
    "a fresh increase in UNSEEN should still biff"
  );
  Assert.equal(inbox.getNumNewMessages(false), 1, "one new unread should biff");
  Assert.equal(
    biffNotifications.length,
    1,
    "the fresh increase should produce exactly one biff notification"
  );

  MailServices.mailSession.RemoveFolderListener(folderListener);
});
