/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the folders that should get flagged for offline use do, and that
 * those that shouldn't don't.
 */

// make SOLO_FILE="test_folderOfflineFlags.js" -C mailnews/imap/test check-one

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

/**
 * Setup the mailboxes that will be used for this test.
 */
add_setup(async function () {
  setupIMAPPump("GMail");

  IMAPPump.mailbox.subscribed = true;
  IMAPPump.mailbox.specialUseFlag = "\\Inbox";
  IMAPPump.daemon.createMailbox("[Gmail]", {
    flags: ["\\Noselect"],
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/All Mail", {
    specialUseFlag: "\\AllMail",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Drafts", {
    specialUseFlag: "\\Drafts",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Sent", {
    specialUseFlag: "\\Sent",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Spam", {
    specialUseFlag: "\\Spam",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Starred", {
    specialUseFlag: "\\Starred",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Trash", {
    specialUseFlag: "\\Trash",
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("folder1", { subscribed: true });
  IMAPPump.daemon.createMailbox("folder2", { subscribed: true });

  // select the inbox to force folder discovery, etc.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

/**
 * Test that folders generally are marked for offline use by default.
 */
add_task(function testGeneralFoldersOffline() {
  Assert.ok(IMAPPump.inbox.getFlag(Ci.nsMsgFolderFlags.Offline));

  const gmail = IMAPPump.incomingServer.rootFolder.getChildNamed("[Gmail]");

  const allmail = gmail.getFolderWithFlags(Ci.nsMsgFolderFlags.Archive);
  Assert.ok(allmail.getFlag(Ci.nsMsgFolderFlags.Offline));

  const drafts = gmail.getFolderWithFlags(Ci.nsMsgFolderFlags.Drafts);
  Assert.ok(drafts.getFlag(Ci.nsMsgFolderFlags.Offline));

  const sent = gmail.getFolderWithFlags(Ci.nsMsgFolderFlags.SentMail);
  Assert.ok(sent.getFlag(Ci.nsMsgFolderFlags.Offline));

  const rootFolder = IMAPPump.incomingServer.rootFolder;

  const folder1 = rootFolder.getChildNamed("folder1");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.Offline));

  const folder2 = rootFolder.getChildNamed("folder2");
  Assert.ok(folder2.getFlag(Ci.nsMsgFolderFlags.Offline));
});

/**
 * Test that Trash isn't flagged for offline use by default.
 */
add_task(function testTrashNotOffline() {
  const gmail = IMAPPump.incomingServer.rootFolder.getChildNamed("[Gmail]");
  const trash = gmail.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  Assert.ok(!trash.getFlag(Ci.nsMsgFolderFlags.Offline));
});

/**
 * Test that Junk isn't flagged for offline use by default.
 */
add_task(function testJunkNotOffline() {
  const gmail = IMAPPump.incomingServer.rootFolder.getChildNamed("[Gmail]");
  const spam = gmail.getFolderWithFlags(Ci.nsMsgFolderFlags.Junk);
  Assert.ok(!spam.getFlag(Ci.nsMsgFolderFlags.Offline));
});

/** Cleanup at the end. */
add_task(function endTest() {
  teardownIMAPPump();
});
