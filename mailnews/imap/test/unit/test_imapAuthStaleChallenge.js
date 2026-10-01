/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for an auth method reusing the challenge of an earlier
 * failed method: CRAM-MD5 gets a challenge but is rejected, then NTLM gets a
 * tagged OK instead of a challenge. NTLM must fail instead of answering the
 * CRAM-MD5 challenge.
 *
 * server.performTest() runs until the client closes the connection, which it
 * does once both methods have failed, and the transaction then lists the
 * commands the client sent. The tokens sent in answer to a "+" continuation
 * are not recorded, but after the tagged OK the fake server no longer expects
 * any, so an NTLM answer to the old challenge is recorded as an extra command
 * after AUTHENTICATE NTLM, which fails the transaction check. Before the fix,
 * that is what happened.
 */

// An NTLM type 2 (challenge) message without target info, so that answering
// it by mistake produces an NTLM type 3 message.
const NTLM_CHALLENGE =
  "TlRMTVNTUAACAAAAAAAAAAAoAAABggAAASNFZ4mrze8AAAAAAAAAAAAAAAAAAAAA";

var server, incomingServer;

add_setup(function () {
  // NTLMv2 requires target info in the challenge.
  Services.prefs.setBoolPref("network.auth.force-generic-ntlm-v1", true);

  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    kAuthSchemes: ["CRAM-MD5", "NTLM"],
    AUTHENTICATE(args) {
      this._multiline = true;
      this._authScheme = args[0];
      return this._authScheme == "CRAM-MD5" ? "+ " + NTLM_CHALLENGE : "+";
    },
    onMultiline() {
      this._multiline = false;
      return this._tag + (this._authScheme == "CRAM-MD5" ? " NO" : " OK");
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.secure;
});

add_task(function loginWithStaleChallenge() {
  incomingServer.performExpand(null);
  // Runs until the client drops the connection after the failed login.
  server.performTest();

  do_check_transaction(
    server.playTransaction(),
    ["capability", "authenticate CRAM-MD5", "authenticate NTLM"],
    false
  );
});

registerCleanupFunction(function () {
  Services.prefs.clearUserPref("network.auth.force-generic-ntlm-v1");
  incomingServer.closeCachedConnections();
  server.stop();

  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
