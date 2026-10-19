/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var incomingServer;
var folder;

add_setup(function () {
  incomingServer = setupLocalServer(NNTP_PORT);
  folder = incomingServer.rootFolder.getChildNamed("test.filter");
});

/**
 * Populate local headers and run a test against a fresh server.
 *
 * @param {typeof NNTP_RFC977_handler} handler - The server handler class.
 * @param {function(nsMailServer): Promise<void>} testFn - The test to run.
 */
async function withServer(handler, testFn) {
  const server = makeServer(handler, setupNNTPDaemon());
  server.start();
  incomingServer.port = server.port;
  const db = folder.msgDatabase;
  for (const key of [1, 2, 3]) {
    const header = db.createNewHdrWithSpecificMsgKey(key);
    header.messageId = `${key}@expired.invalid`;
    db.attachHdr(header, true);
  }
  try {
    await testFn(server);
  } finally {
    incomingServer.closeCachedConnections();
    await server.stop();
    resetFolder(folder);
  }
}

add_task(async function test_removeExpiredArticles() {
  class ListHandler extends NNTP_RFC977_handler {
    LISTGROUP() {
      return "211 Articles follow:\n1\n3\n.\n";
    }
  }
  await withServer(ListHandler, async server => {
    await incomingServer.wrappedJSObject.removeExpiredArticles("test.filter");
    Assert.deepEqual(
      folder.msgDatabase.listAllKeys(),
      [1, 3],
      "a successful list should remove only articles absent from the server"
    );
    Assert.deepEqual(
      server.playTransaction().them,
      ["MODE READER", "LISTGROUP test.filter"],
      "expiration should request the server's article list"
    );
  });
});

add_task(async function test_failedListPreservesHeaders() {
  class ErrorHandler extends NNTP_RFC977_handler {
    LISTGROUP() {
      return "501 LISTGROUP failed";
    }
  }
  await withServer(ErrorHandler, async () => {
    await Assert.rejects(
      incomingServer.wrappedJSObject.removeExpiredArticles("test.filter"),
      /NS_ERROR_FAILURE/,
      "a failed list should reject with the request status"
    );
    Assert.deepEqual(
      folder.msgDatabase.listAllKeys(),
      [1, 2, 3],
      "a failed list should preserve every local header"
    );
  });
});

/**
 * Pause LISTGROUP before its terminator and interrupt the request.
 *
 * @param {function(NntpClient): void} interrupt - End the request.
 * @param {RegExp} expectedError - The expected rejection from the request.
 * @returns {Promise<{client: NntpClient, statuses: nsresult[]}>} The completed
 *   client and its completion notifications.
 */
async function interruptList(interrupt, expectedError) {
  const received = Promise.withResolvers();
  class PartialListHandler extends NNTP_RFC977_handler {
    LISTGROUP() {
      return "211 Articles follow:\n1\n";
    }
  }
  let client;
  const statuses = [];
  await withServer(PartialListHandler, async () => {
    const pool = incomingServer.wrappedJSObject;
    const withClient = pool.withClient;
    pool.withClient = handler =>
      withClient.call(pool, connection => {
        client = connection;
        handler(client);
        const reader = client._lineReader;
        const read = reader.read.bind(reader);
        reader.read = (...args) => {
          const result = read(...args);
          received.resolve();
          return result;
        };
        const onDone = client.onDone;
        client.onDone = status => {
          statuses.push(status);
          onDone(status);
        };
      });
    let operation;
    try {
      operation = pool.removeExpiredArticles("test.filter");
      await received.promise;
    } finally {
      pool.withClient = withClient;
    }
    interrupt(client);
    await Assert.rejects(
      operation,
      expectedError,
      "an interrupted list should reject with the request status"
    );
    Assert.deepEqual(
      folder.msgDatabase.listAllKeys(),
      [1, 2, 3],
      "an interrupted list should preserve every local header"
    );
    Assert.equal(
      pool._busyConnections.length,
      0,
      "the interrupted operation should release its busy connection"
    );
  });
  return { client, statuses };
}

add_task(async function test_connectionFailurePreservesHeaders() {
  const { statuses } = await interruptList(
    client =>
      client._onError({
        target: client._socket,
        errorCode: Cr.NS_ERROR_NET_RESET,
        name: "NetworkError",
        message: "Connection reset during LISTGROUP",
      }),
    /NS_ERROR_NET_RESET/
  );
  Assert.deepEqual(
    statuses,
    [Cr.NS_ERROR_NET_RESET],
    "a connection failure should complete once with the network error"
  );
});

add_task(async function test_shutdownPreservesHeaders() {
  let releases = 0;
  const { statuses } = await interruptList(client => {
    const onIdle = client.onIdle;
    client.onIdle = () => {
      releases++;
      onIdle();
    };
    incomingServer.closeCachedConnections();
    incomingServer.closeCachedConnections();
    Assert.notEqual(
      client._socket.readyState,
      "open",
      "shutdown should close the interrupted connection"
    );
  }, /NS_ERROR_ABORT/);
  Assert.deepEqual(
    statuses,
    [Cr.NS_ERROR_ABORT],
    "shutdown should complete the unfinished request once with an abort status"
  );
  Assert.equal(releases, 1, "shutdown should release the connection once");
  Assert.equal(
    incomingServer.wrappedJSObject._idleConnections.length,
    0,
    "shutdown should leave no cached connection"
  );
});
