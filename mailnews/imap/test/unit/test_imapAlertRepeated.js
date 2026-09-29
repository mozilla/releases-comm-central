/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the same [ALERT] sent repeatedly on a connection is only shown
 * once, while a different one is still shown.
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var server, incomingServer;
var alerts = [];

/* exported alertPS to alertTestUtils.js */
function alertPS(parent, title, text) {
  alerts.push(text);
}

add_setup(function () {
  registerAlertTestUtils();
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    // The client sends CAPABILITY before and after authenticating, so the
    // first alert is sent twice.
    CAPABILITY() {
      let response = "* OK [ALERT] Mailbox almost full\0";
      if (this._state != 0) {
        response += "* OK [ALERT] Mailbox full\0";
      }
      return response + IMAP_RFC3501_handler.prototype.CAPABILITY.call(this);
    },
  });
  incomingServer = createLocalIMAPServer(server.port);
});

add_task(function repeatedAlert() {
  incomingServer.performExpand(gDummyMsgWindow);
  server.performTest("LSUB");

  Assert.equal(alerts.length, 2, "two alerts should have been shown");
  Assert.ok(
    alerts[0].includes("Mailbox almost full"),
    "the repeated alert should have been shown once"
  );
  Assert.ok(
    alerts[1].includes("Mailbox full"),
    "the different alert should have been shown"
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
