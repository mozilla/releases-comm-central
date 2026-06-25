/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for NntpIncomingServer.removeExpiredArticles().
 */

var daemon;
var server;
var incomingServer;

add_setup(function () {
  daemon = setupNNTPDaemon();

  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  incomingServer = setupLocalServer(server.port);

  registerCleanupFunction(function () {
    server.stop();
  });
});

/**
 * Test that removeExpiredArticles sends a LISTGROUP command to the server.
 */
add_task(async function test_removeExpiredArticles() {
  // Call removeExpiredArticles and await completion.
  await incomingServer.wrappedJSObject.removeExpiredArticles("test.filter");

  // Verify LISTGROUP command was sent.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, ["MODE READER", "LISTGROUP test.filter"]);
});
