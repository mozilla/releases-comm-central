/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that when NTLM fails while the server is still waiting for an
 * AUTHENTICATE continuation, the client cancels the exchange with "*" before
 * trying the next auth method on the same connection.
 *
 * The continuation lines are not recorded in the fake server transaction, so
 * the handler records the lines it gets during the NTLM exchange itself.
 * Without the cancellation, the client's next command (AUTHENTICATE PLAIN)
 * arrives as an NTLM continuation line instead.
 */

var server, incomingServer;
const ntlmLines = [];

add_setup(function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    kAuthSchemes: ["NTLM", "PLAIN"],
    AUTHENTICATE(args) {
      if (args[0] != "NTLM") {
        return IMAP_RFC3501_handler.prototype.AUTHENTICATE.call(this, args);
      }
      this._inNtlm = true;
      this._multiline = true;
      return "+";
    },
    onMultiline(line) {
      if (!this._inNtlm) {
        return IMAP_RFC3501_handler.prototype.onMultiline.call(this, line);
      }
      ntlmLines.push(line);
      if (ntlmLines.length == 1) {
        // A challenge that is only padding, which the client can't answer.
        return "+ ====";
      }
      this._inNtlm = false;
      this._multiline = false;
      return this._tag + (line == "*" ? " BAD Cancelled" : " NO Bad response");
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
  incomingServer.authMethod = Ci.nsMsgAuthMethod.anything;
});

add_task(function cancelNtlmAndFallBackToPlain() {
  incomingServer.performExpand(false);
  server.performTest("LIST");

  Assert.equal(
    ntlmLines.length,
    2,
    "the NTLM exchange should get the negotiate message and one more line"
  );
  Assert.equal(ntlmLines[1], "*", "the NTLM exchange should be cancelled");
  do_check_transaction(
    server.playTransaction(),
    [
      "capability",
      "authenticate NTLM",
      "authenticate PLAIN",
      "capability",
      "list",
    ],
    false
  );
});

registerCleanupFunction(function () {
  incomingServer.closeCachedConnections();
  server.stop();

  const thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
