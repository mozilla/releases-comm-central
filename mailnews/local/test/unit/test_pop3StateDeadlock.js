/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the recovery of the POP3 client after an unexpected server disconnect.
 * Verifies that an abruptly dropped connection during a multi-line response
 * (like UIDL) properly propagates an error, releases the server lock, and
 * resets internal buffer states to prevent a permanent account deadlock on
 * subsequent sync attempts.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var server;
var daemon;
var incomingServer;

add_setup(async function () {
  // Set up the POP3 daemon and server
  [daemon, server] = setupServerDaemon();

  // Override the UIDL command handler to simulate a dirty disconnect.
  const originalUIDL = POP3_RFC5034_handler.prototype.UIDL;

  let firstTime = true;
  POP3_RFC5034_handler.prototype.UIDL = function (args) {
    if (firstTime) {
      firstTime = false;

      // Tell the test server to cleanly drop the TCP socket
      // immediately after sending the string returned below.
      this.closing = true;

      // Return a partial multi-line response, omitting the terminating ".\r\n"
      return "+OK UIDL listing follows\r\n1 uniqueid001\r\n";
    }
    // On subsequent calls (the recovery attempt), behave normally
    return originalUIDL.call(this, args);
  };

  server.start();

  registerCleanupFunction(() => {
    if (server) {
      server.stop();
    }
    server = null;
    daemon = null;
    incomingServer = null;

    // Clear the event loop to prevent socket leakage
    const thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  });

  // Set up the local folders and server configuration
  incomingServer = createPop3ServerAndLocalFolders(server.port);
  daemon.setMessages(["message1.eml"]);
});

add_task(async function test_dirty_disconnect_recovery() {
  const urlListener = new PromiseTestUtils.PromiseUrlListener();

  // Attempt 1: This will fail because our mocked server drops the connection mid-UIDL
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();

  // Wait for the failure to propagate
  await Assert.rejects(
    urlListener.promise,
    () => true,
    "Check that getting mail properly fails due to the forced dirty disconnect"
  );

  // The server lock must be released.
  Assert.equal(
    incomingServer.serverBusy,
    false,
    "incomingServer.serverBusy should be false after the connection drops."
  );

  // Attempt 2: Ensure the internal state of the client isn't permanently polluted.
  server.resetTest();
  const urlListener2 = new PromiseTestUtils.PromiseUrlListener();

  MailServices.pop3.GetNewMail(
    null,
    urlListener2,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();

  try {
    await urlListener2.promise;
    Assert.ok(
      true,
      "Successfully recovered and fetched mail on the second attempt."
    );
  } catch (e) {
    Assert.fail(`State deadlock detected! Client failed to recover: ${e}`);
  }
});
