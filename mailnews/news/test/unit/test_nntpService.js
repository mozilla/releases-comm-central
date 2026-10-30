/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test that fetchMessage passes an article failure to its stream listener
 * without delivering data and releases the connection.
 */
add_task(async function test_fetchMessageFailureStatus() {
  class ErrorHandler extends NNTP_RFC977_handler {
    ARTICLE() {
      return "501 ARTICLE failed";
    }
  }
  const server = makeServer(ErrorHandler, setupNNTPDaemon());
  server.start();
  const incomingServer = setupLocalServer(server.port);
  registerCleanupFunction(async () => {
    incomingServer.closeCachedConnections();
    await server.stop();
  });
  const folder = incomingServer.rootFolder.getChildNamed("test.filter");
  const stopped = Promise.withResolvers();
  let dataReceived = false;
  MailServices.nntp.fetchMessage(
    folder,
    1,
    false,
    {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      onStartRequest() {},
      onDataAvailable() {
        dataReceived = true;
      },
      onStopRequest(request, status) {
        stopped.resolve(status);
      },
    },
    null
  );
  Assert.equal(
    await stopped.promise,
    Cr.NS_ERROR_FAILURE,
    "the service stream listener should receive the article failure"
  );
  Assert.ok(!dataReceived, "a failed article should deliver no stream data");
  Assert.equal(
    incomingServer.wrappedJSObject._busyConnections.length,
    0,
    "the failed service request should release its connection"
  );
});
