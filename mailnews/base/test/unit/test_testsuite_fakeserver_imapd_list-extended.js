/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that imapd.js fakeserver correctly implements LIST-EXTENDED imap
// extension (RFC 5258 - http://tools.ietf.org/html/rfc5258)

// async support
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");
load("../../../resources/alertTestUtils.js");

// IMAP pump
Components.utils.import("resource://testing-common/mailnews/IMAPpump.js");

Components.utils.import("resource://gre/modules/Services.jsm");

// Globals


// Dovecot is one of the servers that supports LIST-EXTENDED
setupIMAPPump("Dovecot");
// create our own hander so that we can call imapd functions directly
var handler;

// Definition of tests
var tests = [
  setupMailboxes,
  testList,
  testListSelectSubscribed,
  testListReturnChilderen,
  testListReturnSubscribed,
  testListSelectMultiple,
  endTest
]

// mbox mailboxes cannot contain both child mailboxes and messages, so this will
// be one test case.
function setupMailboxes()
{
  IMAPPump.mailbox.flags = ["\\Marked", "\\NoInferiors"];
  IMAPPump.mailbox.subscribed = true;
  IMAPPump.daemon.createMailbox("Fruit", {});
  IMAPPump.daemon.createMailbox("Fruit/Apple", {});
  IMAPPump.daemon.createMailbox("Fruit/Banana", {subscribed : true});
  IMAPPump.daemon.createMailbox("Fruit/Peach", {nonExistent : true,
                                            subscribed : true});
  IMAPPump.daemon.createMailbox("Tofu", {});
  IMAPPump.daemon.createMailbox("Vegetable", {subscribed : true});
  IMAPPump.daemon.createMailbox("Vegetable/Broccoli", {subscribed : true});
  IMAPPump.daemon.createMailbox("Vegetable/Corn", {});

  handler = IMAPPump.server._handlerCreator(IMAPPump.daemon);
  let response = handler.onError('1', 'LOGIN user password');
  do_check_true(response.includes('OK'));
  // wait for imap pump to do it's thing or else we get memory leaks
  IMAPPump.inbox.updateFolderWithListener(null, asyncUrlListener);
  yield false;
}

// test that 'LIST "" "*"' returns the proper responses (standard LIST usage)
function testList()
{
  let response = handler.onError('2', 'LIST "" "*"');

  do_check_true(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  do_check_true(response.includes('* LIST () "/" "Fruit"'));
  do_check_true(response.includes('* LIST () "/" "Fruit/Apple"'));
  do_check_true(response.includes('* LIST () "/" "Fruit/Banana"'));
  do_check_true(response.includes('* LIST () "/" "Tofu"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable/Broccoli"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable/Corn"'));
  do_check_false(response.includes('Peach'));

  yield true;
}

// test that 'LIST (SUBSCRIBED) "" "*"' returns the proper responses
function testListSelectSubscribed()
{
  let response = handler.onError('3', 'LIST (SUBSCRIBED) "" "*"');

  do_check_true(response.includes('* LIST (\\Marked \\NoInferiors \\Subscribed) "/" "INBOX"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Fruit/Banana"'));
  do_check_true(response.includes('* LIST (\\Subscribed \\NonExistent) "/" "Fruit/Peach"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Vegetable"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Vegetable/Broccoli"'));
  do_check_false(response.includes('"Fruit"'));
  do_check_false(response.includes('Apple'));
  do_check_false(response.includes('Tofu'));
  do_check_false(response.includes('Corn'));

  yield true;
}

// test that 'LIST "" "%" RETURN (CHILDEREN)' returns the proper responses
function testListReturnChilderen()
{
  let response = handler.onError('4', 'LIST "" "%" RETURN (CHILDREN)');

  do_check_true(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  do_check_true(response.includes('* LIST (\\HasChildren) "/" "Fruit"'));
  do_check_true(response.includes('* LIST (\\HasNoChildren) "/" "Tofu"'));
  do_check_true(response.includes('* LIST (\\HasChildren) "/" "Vegetable"'));
  do_check_false(response.includes('Apple'));
  do_check_false(response.includes('Banana'));
  do_check_false(response.includes('Peach'));
  do_check_false(response.includes('Broccoli'));
  do_check_false(response.includes('Corn'));

  yield true;
}

// test that 'LIST "" "*" RETURN (SUBSCRIBED)' returns the proper responses
function testListReturnSubscribed()
{
  let response = handler.onError('5', 'LIST "" "*" RETURN (SUBSCRIBED)');

  do_check_true(response.includes('* LIST (\\Marked \\NoInferiors \\Subscribed) "/" "INBOX"'));
  do_check_true(response.includes('* LIST () "/" "Fruit"'));
  do_check_true(response.includes('* LIST () "/" "Fruit/Apple"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Fruit/Banana"'));
  do_check_true(response.includes('* LIST () "/" "Tofu"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Vegetable"'));
  do_check_true(response.includes('* LIST (\\Subscribed) "/" "Vegetable/Broccoli"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable/Corn"'));
  do_check_false(response.includes('Peach'));

  yield true;
}

// test that 'LIST "" ("INBOX" "Tofu" "Vegetable/%")' returns the proper responses
function testListSelectMultiple()
{
  let response = handler._dispatchCommand('LIST', ['', '("INBOX" "Tofu" "Vegetable/%")']);

  do_check_true(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  do_check_true(response.includes('* LIST () "/" "Tofu"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable/Broccoli"'));
  do_check_true(response.includes('* LIST () "/" "Vegetable/Corn"'));
  do_check_false(response.includes('"Vegetable"'));
  do_check_false(response.includes('Fruit'));
  do_check_false(response.includes('Peach'));

  yield true;
}

// Cleanup at end
function endTest()
{
  handler = null;
  teardownIMAPPump();
}

function run_test()
{
  Services.prefs.setBoolPref("mail.server.server1.autosync_offline_stores", false);
  async_run_tests(tests);
}

/*
 * helper functions
 */

function recursiveDeleteMailboxes(aMailbox)
{
  for each (var child in aMailbox.allChildren) {
    recursiveDeleteMailboxes(child);
  }
  IMAPPump.daemon.deleteMailbox(aMailbox);
}
