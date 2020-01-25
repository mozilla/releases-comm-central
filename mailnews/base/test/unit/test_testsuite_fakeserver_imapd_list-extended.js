/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that Imapd.jsm fakeserver correctly implements LIST-EXTENDED imap
// extension (RFC 5258 - http://tools.ietf.org/html/rfc5258)

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

// Globals

// Dovecot is one of the servers that supports LIST-EXTENDED
setupIMAPPump("Dovecot");
// create our own handler so that we can call imapd functions directly
var handler;

// Definition of tests
var tests = [
  setupMailboxes,
  testList,
  testListSelectSubscribed,
  testListReturnChilderen,
  testListReturnSubscribed,
  testListSelectMultiple,
  endTest,
];

// mbox mailboxes cannot contain both child mailboxes and messages, so this will
// be one test case.
function* setupMailboxes() {
  IMAPPump.mailbox.flags = ["\\Marked", "\\NoInferiors"];
  IMAPPump.mailbox.subscribed = true;
  IMAPPump.daemon.createMailbox("Fruit", {});
  IMAPPump.daemon.createMailbox("Fruit/Apple", {});
  IMAPPump.daemon.createMailbox("Fruit/Banana", { subscribed: true });
  IMAPPump.daemon.createMailbox("Fruit/Peach", {
    nonExistent: true,
    subscribed: true,
  });
  IMAPPump.daemon.createMailbox("Tofu", {});
  IMAPPump.daemon.createMailbox("Vegetable", { subscribed: true });
  IMAPPump.daemon.createMailbox("Vegetable/Broccoli", { subscribed: true });
  IMAPPump.daemon.createMailbox("Vegetable/Corn", {});

  handler = IMAPPump.server._handlerCreator(IMAPPump.daemon);
  let response = handler.onError("1", "LOGIN user password");
  Assert.ok(response.includes("OK"));
  // wait for imap pump to do it's thing or else we get memory leaks
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// test that 'LIST "" "*"' returns the proper responses (standard LIST usage)
function* testList() {
  let response = handler.onError("2", 'LIST "" "*"');

  Assert.ok(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit/Apple"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit/Banana"'));
  Assert.ok(response.includes('* LIST () "/" "Tofu"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Broccoli"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Corn"'));
  Assert.ok(!response.includes("Peach"));

  yield true;
}

// test that 'LIST (SUBSCRIBED) "" "*"' returns the proper responses
function* testListSelectSubscribed() {
  let response = handler.onError("3", 'LIST (SUBSCRIBED) "" "*"');

  Assert.ok(
    response.includes(
      '* LIST (\\Marked \\NoInferiors \\Subscribed) "/" "INBOX"'
    )
  );
  Assert.ok(response.includes('* LIST (\\Subscribed) "/" "Fruit/Banana"'));
  Assert.ok(
    response.includes('* LIST (\\Subscribed \\NonExistent) "/" "Fruit/Peach"')
  );
  Assert.ok(response.includes('* LIST (\\Subscribed) "/" "Vegetable"'));
  Assert.ok(
    response.includes('* LIST (\\Subscribed) "/" "Vegetable/Broccoli"')
  );
  Assert.ok(!response.includes('"Fruit"'));
  Assert.ok(!response.includes("Apple"));
  Assert.ok(!response.includes("Tofu"));
  Assert.ok(!response.includes("Corn"));

  yield true;
}

// test that 'LIST "" "%" RETURN (CHILDEREN)' returns the proper responses
function* testListReturnChilderen() {
  let response = handler.onError("4", 'LIST "" "%" RETURN (CHILDREN)');

  Assert.ok(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  Assert.ok(response.includes('* LIST (\\HasChildren) "/" "Fruit"'));
  Assert.ok(response.includes('* LIST (\\HasNoChildren) "/" "Tofu"'));
  Assert.ok(response.includes('* LIST (\\HasChildren) "/" "Vegetable"'));
  Assert.ok(!response.includes("Apple"));
  Assert.ok(!response.includes("Banana"));
  Assert.ok(!response.includes("Peach"));
  Assert.ok(!response.includes("Broccoli"));
  Assert.ok(!response.includes("Corn"));

  yield true;
}

// test that 'LIST "" "*" RETURN (SUBSCRIBED)' returns the proper responses
function* testListReturnSubscribed() {
  let response = handler.onError("5", 'LIST "" "*" RETURN (SUBSCRIBED)');

  Assert.ok(
    response.includes(
      '* LIST (\\Marked \\NoInferiors \\Subscribed) "/" "INBOX"'
    )
  );
  Assert.ok(response.includes('* LIST () "/" "Fruit"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit/Apple"'));
  Assert.ok(response.includes('* LIST (\\Subscribed) "/" "Fruit/Banana"'));
  Assert.ok(response.includes('* LIST () "/" "Tofu"'));
  Assert.ok(response.includes('* LIST (\\Subscribed) "/" "Vegetable"'));
  Assert.ok(
    response.includes('* LIST (\\Subscribed) "/" "Vegetable/Broccoli"')
  );
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Corn"'));
  Assert.ok(!response.includes("Peach"));

  yield true;
}

// test that 'LIST "" ("INBOX" "Tofu" "Vegetable/%")' returns the proper responses
function* testListSelectMultiple() {
  let response = handler._dispatchCommand("LIST", [
    "",
    '("INBOX" "Tofu" "Vegetable/%")',
  ]);

  Assert.ok(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  Assert.ok(response.includes('* LIST () "/" "Tofu"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Broccoli"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Corn"'));
  Assert.ok(!response.includes('"Vegetable"'));
  Assert.ok(!response.includes("Fruit"));
  Assert.ok(!response.includes("Peach"));

  yield true;
}

// Cleanup at end
function endTest() {
  handler = null;
  teardownIMAPPump();
}

function run_test() {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
  async_run_tests(tests);
}
