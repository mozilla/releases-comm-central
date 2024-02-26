/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test to ensure that, in case of GMail server, fetching of custom GMail
 * attributes works properly.
 *
 * Bug 721316
 *
 * See https://bugzilla.mozilla.org/show_bug.cgi?id=721316
 * for more info.
 *
 * Original Author: Atul Jangra<atuljangra66@gmail.com>
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Messages to load must have CRLF line endings, that is Windows style
var gMessage = "bugmail10"; // message file used as the test message

var gXGmMsgid = "1278455344230334865";
var gXGmThrid = "1266894439832287888";
var gXGmLabels = '(\\Inbox \\Sent Important "Muy Importante" foo)';

add_setup(async function () {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  setupIMAPPump("GMail");
  IMAPPump.mailbox.specialUseFlag = "\\Inbox";
  IMAPPump.mailbox.subscribed = true;

  // need all mail folder to identify this as gmail server.
  IMAPPump.daemon.createMailbox("[Gmail]", { flags: ["\\NoSelect"] });
  IMAPPump.daemon.createMailbox("[Gmail]/All Mail", {
    subscribed: true,
    specialUseFlag: "\\AllMail",
  });
  // Load and update a message in the imap fake server.
  const message = new ImapMessage(
    specForFileName(gMessage),
    IMAPPump.mailbox.uidnext++,
    []
  );
  message.xGmMsgid = gXGmMsgid;
  message.xGmThrid = gXGmThrid;
  message.xGmLabels = gXGmLabels;
  IMAPPump.mailbox.addMessage(message);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function testFetchXGmMsgid() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const val = msgHdr.getStringProperty("X-GM-MSGID");
  Assert.equal(val, gXGmMsgid);
});

add_task(function testFetchXGmThrid() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const val = msgHdr.getStringProperty("X-GM-THRID");
  Assert.equal(val, gXGmThrid);
});

add_task(function testFetchXGmLabels() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const val = msgHdr.getStringProperty("X-GM-LABELS");
  // We need to remove the starting "(" and ending ")" from gXGmLabels while comparing
  Assert.equal(val, gXGmLabels.substring(1, gXGmLabels.length - 1));
});

// Cleanup at end
add_task(function endTest() {
  teardownIMAPPump();
});

/*
 * helper functions
 */

// given a test file, return the file uri spec
function specForFileName(aFileName) {
  const file = do_get_file("../../../data/" + aFileName);
  const msgfileuri = Services.io.newFileURI(file).QueryInterface(Ci.nsIFileURL);
  return msgfileuri.spec;
}
