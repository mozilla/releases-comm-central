/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that listing subscribed mailboxes uses LIST (SUBSCRIBED) instead of LSUB
// for servers that have LIST-EXTENDED capability
// see: bug 495318
// see: RFC 5258 - http://tools.ietf.org/html/rfc5258

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");

// IMAP pump

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// Globals

setupIMAPPump();

// Definition of tests
var tests = [setupMailboxes, testLsub, endTest];

// setup the mailboxes that will be used for this test
function* setupMailboxes() {
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
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// tests that LSUB returns the proper response
function* testLsub() {
  // check that we have \Noselect and \Noinferiors flags - these would not have
  // been returned if we had used LSUB instead of LIST(SUBSCRIBED)
  let rootFolder = IMAPPump.incomingServer.rootFolder;
  let folder1 = rootFolder.getChildNamed("folder1");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(!folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // make sure the above test was not a fluke
  let folder11 = folder1.getChildNamed("folder11");
  Assert.ok(!folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));
  Assert.ok(folder11.getFlag(Ci.nsMsgFolderFlags.ImapNoinferiors));

  // test that \NonExistent implies \Noselect
  rootFolder.getChildNamed("folder2");
  Assert.ok(folder1.getFlag(Ci.nsMsgFolderFlags.ImapNoselect));

  // should not get a folder3 since it is not subscribed
  let folder3;
  try {
    folder3 = rootFolder.getChildNamed("folder3");
  } catch (ex) {}
  // do_check_false(folder1.getFlag(Ci.nsMsgFolderFlags.Subscribed));
  Assert.equal(null, folder3);

  yield true;
}

// Cleanup at end
function endTest() {
  teardownIMAPPump();
}

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  async_run_tests(tests);
}
