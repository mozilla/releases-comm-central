/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that Imapd.jsm fakeserver correctly emulates GMail server
// That means X-GM-EXT-1 capability and GMail flavor XLIST
// per https://developers.google.com/google-apps/gmail/imap_extensions

// async support
/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");

// IMAP pump
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

setupIMAPPump("GMail");
// create our own handler so that we can call imapd functions directly
var handler;

// Definition of tests
var tests = [setupMailboxes, testXlist, endTest];

// mbox mailboxes cannot contain both child mailboxes and messages, so this will
// be one test case.
function* setupMailboxes() {
  IMAPPump.mailbox.specialUseFlag = "\\Inbox";
  IMAPPump.daemon.createMailbox("[Gmail]", { flags: ["\\Noselect"] });
  IMAPPump.daemon.createMailbox("[Gmail]/All Mail", {
    specialUseFlag: "\\AllMail",
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Drafts", {
    specialUseFlag: "\\Drafts",
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Sent", { specialUseFlag: "\\Sent" });
  IMAPPump.daemon.createMailbox("[Gmail]/Spam", { specialUseFlag: "\\Spam" });
  IMAPPump.daemon.createMailbox("[Gmail]/Starred", {
    specialUseFlag: "\\Starred",
  });
  IMAPPump.daemon.createMailbox("[Gmail]/Trash", { specialUseFlag: "\\Trash" });
  IMAPPump.daemon.createMailbox("test", {});

  handler = IMAPPump.server._handlerCreator(IMAPPump.daemon);
  let response = handler.onError("1", "LOGIN user password");
  Assert.ok(response.includes("OK"));
  // wait for imap pump to do its thing or else we get memory leaks
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// test that 'XLIST "" "*"' returns the proper responses
function* testXlist() {
  let response = handler.onError("2", 'XLIST "" "*"');

  Assert.ok(response.includes('* LIST (\\HasNoChildren \\Inbox) "/" "INBOX"'));
  Assert.ok(
    response.includes('* LIST (\\Noselect \\HasChildren) "/" "[Gmail]"')
  );
  Assert.ok(
    response.includes(
      '* LIST (\\HasNoChildren \\AllMail) "/" "[Gmail]/All Mail"'
    )
  );
  Assert.ok(
    response.includes('* LIST (\\HasNoChildren \\Drafts) "/" "[Gmail]/Drafts"')
  );
  Assert.ok(
    response.includes('* LIST (\\HasNoChildren \\Sent) "/" "[Gmail]/Sent"')
  );
  Assert.ok(
    response.includes('* LIST (\\HasNoChildren \\Spam) "/" "[Gmail]/Spam"')
  );
  Assert.ok(
    response.includes(
      '* LIST (\\HasNoChildren \\Starred) "/" "[Gmail]/Starred"'
    )
  );
  Assert.ok(
    response.includes('* LIST (\\HasNoChildren \\Trash) "/" "[Gmail]/Trash"')
  );
  Assert.ok(response.includes('* LIST (\\HasNoChildren) "/" "test"'));

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
