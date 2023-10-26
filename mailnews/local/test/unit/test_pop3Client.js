/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const [daemon, server, handler] = setupServerDaemon();
handler.kCapabilities = ["uidl", "top"]; // CAPA response is case-insensitive.
server.start();
registerCleanupFunction(() => {
  server.stop();
});

/**
 * Test when alwaysSTARTTLS is set, but the server doesn't support STARTTLS,
 * should abort after CAPA response.
 */
add_task(async function testSTARTTLS() {
  server.resetTest();

  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  // Set to always use STARTTLS.
  incomingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  const urlListener = {
    OnStartRunningUrl() {},
    OnStopRunningUrl(url, result) {
      try {
        const transaction = server.playTransaction();
        do_check_transaction(transaction, ["AUTH", "CAPA"]);
        Assert.equal(result, Cr.NS_ERROR_FAILURE);
      } catch (e) {
      } finally {
        MailServices.accounts.removeIncomingServer(incomingServer, false);
        do_test_finished();
      }
    },
  };

  // Now get the mail.
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();

  do_test_pending();
});

/**
 * Test that depending on user prefs and message size, TOP or RETR should be used.
 *
 * @param {nsIMsgIncomingServer} incomingServer - A server instance.
 * @param {string[]} transaction - The commands sent to the server.
 */
async function testTopOrRetr(incomingServer, transaction) {
  server.resetTest();
  // Any message file larger than 50KB is good for this test.
  daemon.setMessages(["mailformed_subject.eml"]);

  const urlListener = {
    OnStartRunningUrl() {},
    OnStopRunningUrl(url, result) {
      try {
        do_check_transaction(server.playTransaction(), transaction);
        Assert.equal(result, 0);
      } catch (e) {
      } finally {
        MailServices.accounts.removeIncomingServer(incomingServer, false);
        do_test_finished();
      }
    },
  };

  // Now get the mail.
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();

  do_test_pending();
}

/**
 * Turn off server.limitOfflineMessageSize, test RETR is used.
 */
add_task(async function testNoOfflineMessageSizeLimit() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.limitOfflineMessageSize = false;
  incomingServer.maxMessageSize = 1;

  testTopOrRetr(incomingServer, [
    "AUTH",
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "RETR 1",
    "DELE 1",
  ]);
});

/**
 * Turn on server.limitOfflineMessageSize and set maxMessageSize to 1KB, test
 * TOP is used.
 */
add_task(async function testMaxMessageSize() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.limitOfflineMessageSize = true;
  incomingServer.maxMessageSize = 1;

  testTopOrRetr(incomingServer, [
    "AUTH",
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 20",
  ]);
});

/**
 * Turn on server.headersOnly, test TOP is used.
 */
add_task(async function testHeadersOnly() {
  const incomingServer = createPop3ServerAndLocalFolders(server.port);
  incomingServer.headersOnly = true;

  testTopOrRetr(incomingServer, [
    "AUTH",
    "CAPA",
    "AUTH PLAIN",
    "STAT",
    "LIST",
    "UIDL",
    "TOP 1 0",
  ]);
});
