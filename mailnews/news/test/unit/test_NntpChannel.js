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
var { ServerTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/ServerTestUtils.sys.mjs"
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

/**
 * A stream listener that records how many times data was delivered and
 * resolves with the status passed to onStopRequest.
 */
class StatusListener {
  QueryInterface = ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]);

  dataCount = 0;

  /**
   * @param {object} callbacks
   * @param {Function} [callbacks.onStart] - Called from onStartRequest.
   * @param {Function} [callbacks.onData] - Called from onDataAvailable.
   */
  constructor({ onStart, onData } = {}) {
    this._onStart = onStart;
    this._onData = onData;
    this.promise = new Promise(resolve => (this._resolve = resolve));
  }

  onStartRequest(request) {
    this._onStart?.(request);
  }

  onDataAvailable(request, stream, offset, count) {
    this.dataCount++;
    NetUtil.readInputStreamToString(stream, count);
    this._onData?.(request);
  }

  onStopRequest(request, status) {
    this._resolve(status);
  }
}

/**
 * Test that a server created for an snews: URI with no port uses TLS on the
 * default port.
 */
add_task(async function test_unknownServerSnews() {
  const tlsServer = await ServerTestUtils.createServer(
    ServerTestUtils.serverDefs.nntp.tls
  );
  tlsServer.daemon.addArticle(
    new NewsArticle(
      "Newsgroups: test.snews\nMessage-ID: <snews@nntp.invalid>\n\nThis article was fetched over TLS.\n"
    )
  );

  const channel = NetUtil.newChannel({
    uri: "snews://test.test/snews%40nntp.invalid",
    loadUsingSystemPrincipal: true,
  });
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  channel.asyncOpen(streamListener);
  const data = await streamListener.promise;
  Assert.stringContains(
    data,
    "This article was fetched over TLS.",
    "article should be fetched"
  );

  const newServer = NntpUtils.findServer("test.test");
  Assert.ok(newServer, "server should be created when opening the channel");
  Assert.equal(
    newServer.socketType,
    Ci.nsMsgSocketType.SSL,
    "server should use TLS"
  );
  Assert.equal(
    newServer.port,
    Ci.nsINntpIncomingServer.DEFAULT_NNTPS_PORT,
    "server should use the default NNTPS port"
  );
  newServer.closeCachedConnections();
  MailServices.accounts.removeIncomingServer(newServer, false);
  tlsServer.close();
});

/**
 * @param {string} messageId
 * @returns {nsIChannel}
 */
function newMessageIdChannel(messageId) {
  return NetUtil.newChannel({
    uri: `news://localhost:${NNTP_PORT}/${encodeURIComponent(messageId)}`,
    loadUsingSystemPrincipal: true,
  });
}

/**
 * @param {string} messageId
 * @returns {integer} How many times the article was requested from the server.
 */
function articleRequestCount(messageId) {
  return [server.playTransaction()]
    .flat()
    .flatMap(t => t.them)
    .filter(command => command == `ARTICLE <${messageId}>`).length;
}

/**
 * Test that the request is stopped with the listener's error if the listener
 * throws while reading from the server, and that the connection is released.
 */
add_task(async function test_listenerThrowsReadingFromServer() {
  const listener = new StatusListener({
    onData() {
      throw Components.Exception("Aborted", Cr.NS_BINDING_ABORTED);
    },
  });
  const channel = newMessageIdChannel("1@regular.invalid");
  channel.asyncOpen(listener);
  Assert.equal(
    await listener.promise,
    Cr.NS_BINDING_ABORTED,
    "request should stop with the listener's error"
  );
  Assert.equal(listener.dataCount, 1, "no data should follow the error");
  Assert.equal(channel.status, Cr.NS_BINDING_ABORTED);

  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  newMessageIdChannel("2@regular.invalid").asyncOpen(streamListener);
  await streamListener.promise;
});

/**
 * Test cancelling the request while reading from the server.
 */
add_task(async function test_cancelReadingFromServer() {
  const listener = new StatusListener({
    onStart(request) {
      request.cancel(Cr.NS_BINDING_ABORTED);
    },
  });
  const channel = newMessageIdChannel("3@regular.invalid");
  channel.asyncOpen(listener);
  Assert.equal(
    await listener.promise,
    Cr.NS_BINDING_ABORTED,
    "request should stop with the cancel status"
  );
  Assert.equal(listener.dataCount, 0, "no data should be delivered");
});

/**
 * Test cancelling the request while reading from the memory cache.
 */
add_task(async function test_cancelReadingFromCache() {
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  newMessageIdChannel("4@regular.invalid").asyncOpen(streamListener);
  await streamListener.promise;

  const listener = new StatusListener({
    onStart(request) {
      request.cancel(Cr.NS_BINDING_ABORTED);
    },
  });
  newMessageIdChannel("4@regular.invalid").asyncOpen(listener);
  Assert.equal(
    await listener.promise,
    Cr.NS_BINDING_ABORTED,
    "request should stop with the cancel status"
  );
  Assert.equal(listener.dataCount, 0, "no data should be delivered");
  Assert.equal(
    articleRequestCount("4@regular.invalid"),
    1,
    "second request should be served from the cache"
  );
});

/**
 * Test reading an article with a synchronous open().
 */
add_task(function test_open() {
  const stream = newMessageIdChannel("5@regular.invalid").open();
  const data = NetUtil.readInputStreamToString(stream, stream.available());
  Assert.stringContains(
    data,
    "Message-ID: <5@regular.invalid>",
    "article should be read"
  );
});

/**
 * @returns {string[]} All commands the server has received.
 */
function receivedCommands() {
  return [server.playTransaction()].flat().flatMap(t => t.them);
}

/**
 * Test that a news uri with line breaks in the message id, group or article
 * number is refused, so the rest of it can't be sent as separate commands.
 */
add_task(function test_lineBreakInUri() {
  _server.closeCachedConnections();
  for (const spec of [
    `news://localhost:${NNTP_PORT}/x%0D%0AINJECTED%3Ca%40b`,
    `news://localhost:${NNTP_PORT}/x%0AINJECTED%40b`,
    `news://localhost:${NNTP_PORT}/test.filter%0D%0AINJECTED`,
    `news://localhost:${NNTP_PORT}?group=test.filter%0D%0AINJECTED&key=1`,
    `news://localhost:${NNTP_PORT}?group=test.filter&key=1%0D%0AINJECTED`,
  ]) {
    const channel = NetUtil.newChannel({
      uri: spec,
      loadUsingSystemPrincipal: true,
    });
    Assert.throws(
      () => channel.asyncOpen(new PromiseTestUtils.PromiseStreamListener()),
      /NS_ERROR_MALFORMED_URI/,
      `opening ${spec} should fail`
    );
  }
});

/**
 * Test that NntpClient refuses to send a command containing line breaks.
 */
add_task(async function test_lineBreakInCommand() {
  _server.closeCachedConnections();
  const status = await new Promise(resolve => {
    _server.wrappedJSObject.withClient(client => {
      client.startRunningUrl(null, null);
      client.onOpen = () => {
        client._sendCommand("ARTICLE <x\r\nINJECTED@b>");
      };
      client.onDone = resolve;
    });
  });
  Assert.equal(
    status,
    Cr.NS_ERROR_ILLEGAL_VALUE,
    "request should fail with NS_ERROR_ILLEGAL_VALUE"
  );
  Assert.ok(
    !receivedCommands().some(command => command.includes("INJECTED")),
    "no part of the command should be sent"
  );

  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  newMessageIdChannel("7@regular.invalid").asyncOpen(streamListener);
  await streamListener.promise;
});

/**
 * Test that a url for an unknown server can't use a port reserved for another
 * service, but a configured server is used whatever port the url has.
 */
add_task(async function test_bannedPort() {
  Assert.ok(Services.io.allowPort(119, "news"), "news port should be allowed");
  Assert.ok(
    Services.io.allowPort(563, "snews"),
    "snews port should be allowed"
  );

  const channel = NetUtil.newChannel({
    uri: "news://127.0.0.1:110/3%40regular.invalid",
    loadUsingSystemPrincipal: true,
  });
  Assert.throws(
    () => channel.asyncOpen(new StatusListener()),
    /NS_ERROR_PORT_ACCESS_NOT_ALLOWED/,
    "unknown server on a pop3 port should be refused"
  );
  Assert.equal(
    NntpUtils.findServer("127.0.0.1"),
    null,
    "no server should be created"
  );

  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  NetUtil.newChannel({
    uri: "news://localhost:110/3%40regular.invalid",
    loadUsingSystemPrincipal: true,
  }).asyncOpen(streamListener);
  Assert.stringContains(
    await streamListener.promise,
    "Message-ID: <3@regular.invalid>",
    "configured server should be used"
  );
});
