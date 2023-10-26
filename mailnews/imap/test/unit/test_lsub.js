/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that listing subscribed mailboxes uses LIST (SUBSCRIBED) instead of LSUB
// for servers that have LIST-EXTENDED capability
// see: bug 495318
// see: RFC 5258 - http://tools.ietf.org/html/rfc5258

var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_setup(function () {
  setupIMAPPump();

  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
});

// Setup the mailboxes that will be used for this test.
add_setup(async function () {
  IMAPPump.mailbox.subscribed = true;
  IMAPPump.daemon.createMailbox("folder1", {
    subscribed: true,
    flags: ["\\Noselect"],
  });
  IMAPPump.daemon.createMailbox("folder1/folder11", {
    subscribed: true,
    flags: ["\\Noinferiors"],
  });
  IMAPPump.daemon.createMailbox("folder2", {
    subscribed: true,
    nonExistent: true,
  });
  IMAPPump.daemon.createMailbox("folder3", {});

  // select the inbox to force folder discovery, etc.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

// Tests that LSUB returns the proper response.
add_task(function testLsub() {
  // Check that we have \Noselect and \Noinferiors flags - these would not have
  // been returned if we had used LSUB instead of LIST(SUBSCRIBED).
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  const folder1 = rootFolder.getChildNamed("folder1");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(!folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // Make sure the above test was not a fluke.
  const folder11 = folder1.getChildNamed("folder11");
  Assert.ok(!folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // Test that \NonExistent implies \Noselect.
  rootFolder.getChildNamed("folder2");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));

  // Should not get a folder3 since it is not subscribed.
  let folder3;
  try {
    folder3 = rootFolder.getChildNamed("folder3");
  } catch (ex) {}
  Assert.equal(false, folder1.getFlag(Ci.nsMsgFolderFlags.Subscribed));
  Assert.equal(null, folder3);
});

// Cleanup at end.
add_task(function endTest() {
  teardownIMAPPump();
});
