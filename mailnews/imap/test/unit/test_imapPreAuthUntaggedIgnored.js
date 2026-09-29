/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that untagged responses that don't apply before authentication are
 * ignored when sent before login.
 */

var server, incomingServer;

add_setup(function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    CAPABILITY() {
      // Only inject while not authenticated.
      if (this._state != 0) {
        return IMAP_RFC3501_handler.prototype.CAPABILITY.call(this);
      }
      return (
        '* LIST () "/" Injected\0' +
        "* 1 FETCH (UID 5 FLAGS (\\Deleted))\0" +
        "* OK [MYRIGHTS lrswipkxtecda] hi\0" +
        IMAP_RFC3501_handler.prototype.CAPABILITY.call(this)
      );
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
});

add_task(function preAuthListIgnored() {
  incomingServer.performExpand(null);
  server.performTest("LSUB");

  do_check_transaction(
    server.playTransaction(),
    ["capability", "authenticate PLAIN", "capability", "list", "lsub"],
    false
  );
  Assert.ok(
    incomingServer.rootFolder.containsChildNamed("INBOX"),
    "INBOX should have been discovered"
  );
  Assert.ok(
    !incomingServer.rootFolder.containsChildNamed("Injected"),
    "folder listed before authentication should not have been created"
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
