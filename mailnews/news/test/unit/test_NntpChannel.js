/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NntpChannel } = ChromeUtils.import("resource:///modules/NntpChannel.jsm");
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

let server;

add_setup(function setup() {
  let daemon = setupNNTPDaemon();
  server = new nsMailServer(() => {
    let handler = new NNTP_RFC977_handler(daemon);
    // Test NntpClient works with 201 response.
    handler.onStartup = () => {
      return "201 posting prohibited";
    };
    return handler;
  }, daemon);
  server.start(NNTP_PORT);
  registerCleanupFunction(() => {
    server.stop();
  });

  setupLocalServer(NNTP_PORT);
});

/**
 * Test a ?list-ids news url will trigger LISTGROUP request.
 */
add_task(async function test_listIds() {
  // Init the uri and streamListener.
  let uri = Services.io.newURI(
    `news://localhost:${NNTP_PORT}/test.filter?list-ids`
  );
  let streamListener = new PromiseTestUtils.PromiseStreamListener();

  // Run the uri with NntpChannel.
  let channel = new NntpChannel(uri);
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Test LISTGROUP request was sent correctly.
  let transaction = server.playTransaction();
  do_check_transaction(transaction, ["MODE READER", "LISTGROUP test.filter"]);
});

/**
 * Test a ?group=name&key=x news url will trigger ARTICLE request.
 */
add_task(async function test_fetchArticle() {
  _server.closeCachedConnections();

  // Init the uri and streamListener.
  let uri = Services.io.newURI(
    `news://localhost:${NNTP_PORT}?group=test.filter&key=1`
  );
  let streamListener = new PromiseTestUtils.PromiseStreamListener();

  // Run the uri with NntpChannel.
  let channel = new NntpChannel(uri);
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Test ARTICLE request was sent correctly.
  let transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "MODE READER",
    "GROUP test.filter",
    "ARTICLE 1",
  ]);
});
