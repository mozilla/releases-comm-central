/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that folders which cease to exist do not break the autosync timer
 * callback and keep the timer running.
 */

const { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_task(async function () {
  // Create an IMAP server to talk to.
  const imapServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.imap.plain
  );
  imapServer.daemon.createMailbox("Drafts", {
    flags: ["\\Drafts"],
    subscribed: true,
  });
  imapServer.daemon.createMailbox("Sent", {
    flags: ["\\Sent"],
    subscribed: true,
  });

  // Create an account and incoming server.
  const account = MailServices.accounts.createAccount();
  const incomingServer = (account.incomingServer =
    MailServices.accounts.createIncomingServer("user", "test.test", "imap"));
  incomingServer.password = "password";
  incomingServer.port = 143;

  // Discover the folders.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  await listener.promise;

  // Start the autosync manager timer.
  const manager = Cc["@mozilla.org/imap/autosyncmgr;1"].getService(
    Ci.nsIAutoSyncManager
  );
  // Trick the autosync manager into action.
  manager.QueryInterface(Ci.nsIObserver);
  manager.observe(null, "mail-startup-done", "");
  manager.observe(null, "mail:appIdle", "idle");

  Assert.ok(manager.timerIsRunning, "timer should be running");
  Assert.greater(
    manager.discoveryQLength,
    0,
    "discovery queue should not be empty"
  );
  Assert.greater(manager.updateQLength, 0, "update queue should not be empty");

  // Remove the account.
  MailServices.accounts.removeAccount(account, false);

  // Wait for the timer to stop running.
  await TestUtils.waitForCondition(
    () => !manager.timerIsRunning,
    "waiting for timer to stop"
  );
  Assert.equal(
    manager.discoveryQLength,
    0,
    "discovery queue should be emptied"
  );
  Assert.equal(manager.updateQLength, 0, "update queue should be emptied");
});
