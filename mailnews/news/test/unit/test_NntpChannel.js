/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);
var { NntpUtils } = ChromeUtils.importESModule(
  "resource:///modules/NntpUtils.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let server;

add_setup(function setup() {
  const daemon = setupNNTPDaemon();
  server = new nsMailServer(() => {
    const handler = new NNTP_RFC977_handler(daemon);
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
 * Test a ?group=name&key=x news url will trigger ARTICLE request.
 */
add_task(async function test_fetchArticle() {
  _server.closeCachedConnections();

  // Init the uri and streamListener.
  const uri = Services.io.newURI(
    `news://localhost:${NNTP_PORT}?group=test.filter&key=1`
  );
  const streamListener = new PromiseTestUtils.PromiseStreamListener();

  // Run the uri with NntpChannel.
  const channel = NetUtil.newChannel({ uri, loadUsingSystemPrincipal: true });
  channel.asyncOpen(streamListener);
  await streamListener.promise;

  // Test ARTICLE request was sent correctly.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, [
    "MODE READER",
    "GROUP test.filter",
    "ARTICLE 1",
  ]);
});

/**
 * Test that a server for an unknown host is only created when the channel is
 * opened, not when it's constructed.
 */
add_task(async function test_unknownServerCreatedOnOpen() {
  const uri = Services.io.newURI(
    `news://127.0.0.1:${NNTP_PORT}/TSS1%40nntp.invalid`
  );
  const channel = NetUtil.newChannel({ uri, loadUsingSystemPrincipal: true });
  Assert.equal(
    NntpUtils.findServer("127.0.0.1"),
    null,
    "no server should be created when constructing the channel"
  );

  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  channel.asyncOpen(streamListener);
  const data = await streamListener.promise;
  Assert.stringContains(
    data,
    "What does the acronym H2G2 stand for?",
    "article should be fetched"
  );

  const newServer = NntpUtils.findServer("127.0.0.1");
  Assert.ok(newServer, "server should be created when opening the channel");
  Assert.equal(newServer.port, NNTP_PORT, "server should use the uri port");
  MailServices.accounts.removeIncomingServer(newServer, false);
});
