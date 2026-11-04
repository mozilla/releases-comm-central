/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * A server response line longer than mailnews.max_response_line_length must
 * fail the URL instead of growing the line buffer without bounds.
 */

const LIMIT = 64 * 1024;

add_setup(function () {
  // Read once per process, before the first connection.
  Services.prefs.setIntPref("mailnews.max_response_line_length", LIMIT);
});

/**
 * Runs folder discovery against a server that sends an untagged OK response
 * of the given length before the CAPABILITY response.
 *
 * @param {integer} length - The length of the OK response line.
 */
async function discoverWithLine(length) {
  const daemon = new ImapDaemon();
  const server = makeServer(daemon, "", {
    CAPABILITY() {
      return (
        "* OK " +
        "x".repeat(length - 5) +
        "\0" +
        IMAP_RFC3501_handler.prototype.CAPABILITY.call(this)
      );
    },
  });
  const incomingServer = createLocalIMAPServer(server.port);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.imap.discoverAllFolders(
    incomingServer.rootFolder,
    listener,
    null
  );
  try {
    await listener.promise;
  } finally {
    incomingServer.closeCachedConnections();
    server.stop();
    MailServices.accounts.removeIncomingServer(incomingServer, false);
  }
}

add_task(async function test_lineAtLimit() {
  await discoverWithLine(LIMIT);
});

add_task(async function test_lineOverLimit() {
  await Assert.rejects(
    discoverWithLine(LIMIT + 1),
    /./,
    "Discovery should fail on a response line over the limit"
  );
});
