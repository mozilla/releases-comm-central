/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Test that Imapd.sys.mjs fakeserver correctly implements LIST-EXTENDED imap
// extension (RFC 5258 - http://tools.ietf.org/html/rfc5258)

// IMAP pump
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPpump.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Globals

// Dovecot is one of the servers that supports LIST-EXTENDED
setupIMAPPump("Dovecot");
// create our own handler so that we can call imapd functions directly
var handler;

add_setup(function () {
  Services.prefs.setBoolPref(
    "mail.server.server1.autosync_offline_stores",
    false
  );
});

// mbox mailboxes cannot contain both child mailboxes and messages, so this will
// be one test case.
add_setup(async function () {
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
  const response = handler.onError("1", "LOGIN user password");
  Assert.ok(response.includes("OK"));
  // wait for imap pump to do it's thing or else we get memory leaks
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

// test that 'LIST "" "*"' returns the proper responses (standard LIST usage)
add_task(function testList() {
  const response = handler.onError("2", 'LIST "" "*"');

  Assert.ok(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit/Apple"'));
  Assert.ok(response.includes('* LIST () "/" "Fruit/Banana"'));
  Assert.ok(response.includes('* LIST () "/" "Tofu"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Broccoli"'));
  Assert.ok(response.includes('* LIST () "/" "Vegetable/Corn"'));
  Assert.ok(!response.includes("Peach"));
});

// test that 'LIST (SUBSCRIBED) "" "*"' returns the proper responses
add_task(function testListSelectSubscribed() {
  const response = handler.onError("3", 'LIST (SUBSCRIBED) "" "*"');

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
});

// test that 'LIST "" "%" RETURN (CHILDEREN)' returns the proper responses
add_task(function testListReturnChilderen() {
  const response = handler.onError("4", 'LIST "" "%" RETURN (CHILDREN)');

  Assert.ok(response.includes('* LIST (\\Marked \\NoInferiors) "/" "INBOX"'));
  Assert.ok(response.includes('* LIST (\\HasChildren) "/" "Fruit"'));
  Assert.ok(response.includes('* LIST (\\HasNoChildren) "/" "Tofu"'));
  Assert.ok(response.includes('* LIST (\\HasChildren) "/" "Vegetable"'));
  Assert.ok(!response.includes("Apple"));
  Assert.ok(!response.includes("Banana"));
  Assert.ok(!response.includes("Peach"));
  Assert.ok(!response.includes("Broccoli"));
  Assert.ok(!response.includes("Corn"));
});

// test that 'LIST "" "*" RETURN (SUBSCRIBED)' returns the proper responses
add_task(function testListReturnSubscribed() {
  const response = handler.onError("5", 'LIST "" "*" RETURN (SUBSCRIBED)');

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
});

// test that 'LIST "" ("INBOX" "Tofu" "Vegetable/%")' returns the proper responses
add_task(function testListSelectMultiple() {
  const response = handler._dispatchCommand("LIST", [
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
});

// Cleanup at end
add_task(function endTest() {
  handler = null;
  teardownIMAPPump();
});
