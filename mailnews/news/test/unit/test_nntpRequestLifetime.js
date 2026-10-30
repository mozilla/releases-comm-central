/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { NntpClient } = ChromeUtils.importESModule(
  "resource:///modules/NntpClient.sys.mjs"
);
var { setTimeout } = ChromeUtils.importESModule(
  "resource://gre/modules/Timer.sys.mjs"
);

var server;
var incomingServer;

add_setup(function () {
  server = makeServer(NNTP_RFC2980_handler, setupNNTPDaemon());
  server.start();
  incomingServer = setupLocalServer(server.port);
  incomingServer.maximumConnectionsNumber = 1;
  registerCleanupFunction(() => {
    incomingServer.closeCachedConnections();
    server.stop();
  });
});

add_task(async function test_interruptedMultilineResponse() {
  incomingServer.closeCachedConnections();
  let requests = 0;
  class LargeListHandler extends NNTP_RFC2980_handler {
    LISTGROUP(group) {
      if (++requests == 1) {
        return (
          "211 Articles follow:\n" +
          Array.from({ length: 1001 }, (_, i) => `${i + 1}\n`).join("") +
          ".\n"
        );
      }
      return super.LISTGROUP(group);
    }
  }
  const raceServer = makeServer(LargeListHandler, setupNNTPDaemon());
  raceServer.start();
  incomingServer.port = raceServer.port;
  const pool = incomingServer.wrappedJSObject;
  let firstClient;
  let linesRead = 0;
  let oldRead;
  const reading = Promise.withResolvers();
  const interrupted = Promise.withResolvers();
  try {
    pool.withClient(client => {
      firstClient = client;
      client.startRunningUrl(null, false);
      const reader = client._lineReader;
      const read = reader.read.bind(reader);
      reader.read = (...args) => {
        const promise = read(...args);
        if (linesRead == 1000) {
          oldRead = promise;
          reading.resolve();
        }
        return promise;
      };
      client.onOpen = () => client.listgroup("test.filter");
      client.onData = () => {
        if (++linesRead == 1000) {
          setTimeout(() => client.quit(Cr.NS_ERROR_NET_RESET));
        }
      };
      client.onDone = status => {
        interrupted.resolve(status);
      };
    });
    const next = new Promise(resolve => {
      pool.withClient(client => {
        Assert.equal(
          client,
          firstClient,
          "the queued request should reuse the client"
        );
        client.startRunningUrl(null, false);
        const lines = [];
        client.onOpen = () => client.listgroup("test.filter");
        client.onData = line => lines.push(line.trim());
        client.onDone = status => resolve({ status, lines });
      });
    });
    await reading.promise;
    Assert.equal(
      await interrupted.promise,
      Cr.NS_ERROR_NET_RESET,
      "the interrupted request should retain its network failure"
    );
    await oldRead;
    const result = await next;
    Assert.equal(
      linesRead,
      1000,
      "the old request should receive no more data after completion"
    );
    Assert.equal(result.status, Cr.NS_OK, "the queued request should succeed");
    Assert.deepEqual(
      result.lines,
      ["1", "2", "3", "4", "5", "6", "7", "8"],
      "the queued request should receive only its own response"
    );
    Assert.equal(
      requests,
      2,
      "the queued request should complete its own server command"
    );
  } finally {
    incomingServer.closeCachedConnections();
    await raceServer.stop();
    incomingServer.port = server.port;
  }
});

add_task(async function test_staleReaderRejection() {
  const client = new NntpClient(incomingServer);
  const socket = () => ({
    readyState: "open",
    close() {
      this.readyState = "closed";
    },
  });
  client._socket = socket();
  client.connect();
  const pending = Promise.withResolvers();
  client._lineReader = { read: () => pending.promise };
  let oldCallbacks = 0;
  const processing = client._readResponse(
    "",
    () => oldCallbacks++,
    () => oldCallbacks++
  );
  client._actionDone(Cr.NS_ERROR_NET_RESET);

  client._socket = socket();
  client.connect();
  const reader = client._lineReader;
  let completions = 0;
  client.onDone = () => completions++;
  pending.reject(new Error("Old response failed after client reuse"));
  await processing;
  Assert.equal(oldCallbacks, 0, "stale response callbacks should not run");
  Assert.equal(
    client._lineReader,
    reader,
    "a stale rejection should not replace the current reader"
  );
  Assert.ok(
    !client._done,
    "a stale rejection should not complete the new request"
  );
  Assert.equal(
    completions,
    0,
    "a stale rejection should not notify the new request's observers"
  );
  client._actionDone();
});
