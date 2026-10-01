/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for a server answering AUTHENTICATE NTLM without a usable
 * challenge on the second leg, either with a tagged OK or with a challenge
 * that is only base64 padding. The login must just fail.
 *
 * server.performTest() runs until the client closes the connection, which it
 * does once the login has failed, and the transaction then lists the commands
 * the client sent. A failed login shows up as nothing after AUTHENTICATE NTLM:
 * - after a successful login the client would go on to list the folders;
 * - a client that neither logs in nor gives up makes the fake server time
 *   out, which playTransaction() reports as an error;
 * - before the fix, the client crashed while answering the second leg.
 * The NTLM tokens are sent as continuation lines, which the fake server
 * doesn't record, so they are not part of the transaction.
 */

/**
 * Attempts an NTLM login against a server giving the specified replies.
 *
 * @param {string} firstReply - Reply to the AUTHENTICATE command.
 * @param {Function} secondReply - Returns the reply to the client's NTLM
 *   negotiate message, given the handler.
 */
function loginWithReplies(firstReply, secondReply) {
  const daemon = new ImapDaemon();
  const server = makeServer(daemon, "", {
    kAuthSchemes: ["NTLM"],
    AUTHENTICATE() {
      this._multiline = true;
      return firstReply;
    },
    onMultiline() {
      this._multiline = false;
      return secondReply(this);
    },
  });
  const incomingServer = createLocalIMAPServer(server.port);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.NTLM;

  incomingServer.performExpand(null);
  // Runs until the client drops the connection after the failed login.
  server.performTest();

  do_check_transaction(
    server.playTransaction(),
    ["capability", "authenticate NTLM"],
    false
  );

  incomingServer.closeCachedConnections();
  server.stop();

  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

add_task(function loginWithoutChallenge() {
  loginWithReplies("OK", handler => handler._tag + " OK");
});

add_task(function loginWithPaddingOnlyChallenge() {
  loginWithReplies("+", () => "+ ====");
});
