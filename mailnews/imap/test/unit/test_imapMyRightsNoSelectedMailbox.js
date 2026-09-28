/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for an unsolicited MYRIGHTS response code arriving before
 * any mailbox has been selected:
 *
 *   * OK [MYRIGHTS lrswipkxtecda] hi<CR><LF>
 *
 * The response code must now be ignored, leaving the connection usable.
 */

var server, incomingServer;

add_setup(function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    CAPABILITY() {
      return (
        "* OK [MYRIGHTS lrswipkxtecda] hi\0" +
        IMAP_RFC3501_handler.prototype.CAPABILITY.call(this)
      );
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
});

add_task(function connectWithUnsolicitedMyRights() {
  incomingServer.performExpand(null);
  server.performTest("LSUB");

  do_check_transaction(
    server.playTransaction(),
    ["capability", "authenticate PLAIN", "capability", "list", "lsub"],
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
