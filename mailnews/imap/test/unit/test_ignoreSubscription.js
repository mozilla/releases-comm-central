/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that new top level folders and subfolders of Inbox are discovered when
 * subscriptions are ignored.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();
  IMAPPump.incomingServer.usingSubscription = false;

  // Create mailboxes on server as subscribed or not alternately, but
  // subscription state really doesn't matter.
  IMAPPump.daemon.createMailbox("top1", { subscribed: false });
  IMAPPump.daemon.createMailbox("top2", { subscribed: true });
  IMAPPump.daemon.createMailbox("INBOX/sf1", { subscribed: false });
  IMAPPump.daemon.createMailbox("INBOX/sf2", { subscribed: true });

  // Need a bit more than 70ms delay here to prevent fakeserver from dropping
  // the connection during folder discovery.  So, for good measure, set delay
  // to 1 second.
  await PromiseTestUtils.promiseDelay(1000);

  // Trigger and await INBOX imap select. (Not really needed and does not
  // eliminate need for delay above.)
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(function checkDiscovery() {
  const rootFolder = IMAPPump.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgImapMailFolder
  );
  const inbox = IMAPPump.inbox.QueryInterface(Ci.nsIMsgImapMailFolder);

  // Check that top level folders and Inbox subfolders are all discovered.
  Assert.ok(rootFolder.containsChildNamed("top1"), "top1 discovered");
  Assert.ok(rootFolder.containsChildNamed("top2"), "top2 discovered");
  Assert.ok(rootFolder.containsChildNamed("INBOX"), "INBOX discovered");
  Assert.ok(inbox.containsChildNamed("sf1"), "INBOX/sf1 discovered");
  Assert.ok(inbox.containsChildNamed("sf2"), "INBOX/sf2 discovered");
});

add_task(function endTest() {
  teardownIMAPPump();
});
