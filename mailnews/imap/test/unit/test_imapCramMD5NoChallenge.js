/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for a server answering AUTHENTICATE CRAM-MD5 with a tagged
 * OK instead of a "+" challenge. The login must now just fail.
 */

var server, incomingServer;

add_setup(function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    kAuthSchemes: ["CRAM-MD5"],
    AUTHENTICATE() {
      return "OK";
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.passwordEncrypted;
});

add_task(function loginWithoutChallenge() {
  incomingServer.performExpand(null);
  // Runs until the client drops the connection after the failed login.
  server.performTest();

  do_check_transaction(
    server.playTransaction(),
    ["capability", "authenticate CRAM-MD5"],
    false
  );
});

registerCleanupFunction(function () {
  incomingServer.closeCachedConnections();
  server.stop();

  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
