/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NntpChannel } = ChromeUtils.import("resource:///modules/NntpChannel.jsm");
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var daemon = setupNNTPDaemon();

/**
 * Test a ?list-ids news url will trigger LISTGROUP request.
 */
add_task(async function test_listIds() {
  // Start NNTP fake server.
  let server = makeServer(NNTP_RFC977_handler, daemon);
  server.start(NNTP_PORT);
  registerCleanupFunction(() => {
    server.stop();
  });

  // Init the uri and streamListener.
  let uri = Services.io.newURI(
    `news://localhost:${NNTP_PORT}/test.filter?list-ids`
  );
  let streamListener = new PromiseTestUtils.PromiseStreamListener();

  // Run the uri with NntpChannel.
  let channel = new NntpChannel(uri, {
    QueryInterface: ChromeUtils.generateQI(["nsILoadInfo"]),
    loadingPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    securityFlags: Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    internalContentPolicy: Ci.nsIContentPolicy.TYPE_OTHER,
  });
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Test LISTGROUP request was sent correctly.
  let transaction = server.playTransaction();
  do_check_transaction(transaction, ["MODE READER", "LISTGROUP test.filter"]);
});
