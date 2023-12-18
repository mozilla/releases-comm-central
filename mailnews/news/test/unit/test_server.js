// Protocol tests for NNTP. These actually aren't too important, but their main
// purpose is to make sure that maild is working properly and to provide
// examples for how using maild. They also help make sure that I coded Nntpd.jsm
// right, both logically and for RFC compliance.
// TODO:
// * We need to hook up mochitest,
// * TLS negotiation.

// The basic daemon to use for testing Nntpd.jsm implementations
var daemon = setupNNTPDaemon();

// NNTP SERVER TESTS
// -----------------
// Functions in order as defined in Nntpd.jsm. Each function tests the URLs
// that are located over the implementation of nsNNTPProtocol::LoadURL and
// added in bug 400331. Furthermore, they are tested in rough order as they
// would be expected to be used in a session. If more URL types are modified,
// please add a corresponding type to the following tests.
// When adding new servers, only test the commands that become different for
// each specified server, to keep down redudant tests.

function testRFC977() {
  var server = makeServer(NNTP_RFC977_handler, daemon);
  server.start(NNTP_PORT);

  try {
    var prefix = "news://localhost:" + NNTP_PORT + "/";
    var transaction;

    // Test - group subscribe listing
    test = "news:*";
    setupProtocolTest(NNTP_PORT, prefix + "*");
    server.performTest();
    transaction = server.playTransaction();
    do_check_transaction(transaction, ["MODE READER", "LIST"]);

    // Test - getting group headers
    test = "news:test.subscribe.empty";
    server.resetTest();
    setupProtocolTest(NNTP_PORT, prefix + "test.subscribe.empty");
    server.performTest();
    transaction = server.playTransaction();
    do_check_transaction(transaction, [
      "MODE READER",
      "GROUP test.subscribe.empty",
    ]);

    // Test - getting an article
    test = "news:MESSAGE_ID";
    server.resetTest();
    setupProtocolTest(NNTP_PORT, prefix + "TSS1@nntp.invalid");
    server.performTest();
    transaction = server.playTransaction();
    do_check_transaction(transaction, [
      "MODE READER",
      "ARTICLE <TSS1@nntp.invalid>",
    ]);
  } catch (e) {
    dump("NNTP Protocol test " + test + " failed for type RFC 977:\n");
    try {
      var trans = server.playTransaction();
      if (trans) {
        dump("Commands called: " + trans.them + "\n");
      }
    } catch (exp) {}
    do_throw(e);
  }
  server.stop();

  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

function testConnectionLimit() {
  var server = makeServer(NNTP_RFC977_handler, daemon);
  server.start(NNTP_PORT);
  // 1 is the default, but other tests do change it, so let's be explicit.
  _server.maximumConnectionsNumber = 1;

  var prefix = "news://localhost:" + NNTP_PORT + "/";

  // To test make connections limit, we run two URIs simultaneously.
  var url = Services.io.newURI(prefix + "*");
  _server.loadNewsUrl(url, null, null);
  setupProtocolTest(NNTP_PORT, prefix + "TSS1@nntp.invalid");
  server.performTest();
  // We should have length one... which means this must be a transaction object,
  // containing only us and them
  // (playTransactions() returns an array of transaction objects if there is
  // more than one of them, so this assert will fail in that case).
  Assert.ok("us" in server.playTransaction());
  server.stop();

  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

function testReentrantClose() {
  // What we are testing is that a CloseConnection that spins the event loop
  // does not cause a crash.
  var server = makeServer(NNTP_RFC977_handler, daemon);
  server.start(NNTP_PORT);

  var listener = {
    OnStartRunningUrl(url) {},
    OnStopRunningUrl(url, rv) {
      // Spin the event loop (entering nsNNTPProtocol::ProcessProtocolState)
      const thread = Services.tm.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(true);
      }
    },
  };
  // Nice multi-step command--we can close while executing this URL if we are
  // careful.
  var url = Services.io.newURI(
    "news://localhost:" + NNTP_PORT + "/test.filter"
  );
  url.QueryInterface(Ci.nsIMsgMailNewsUrl);
  url.RegisterListener(listener);

  _server.loadNewsUrl(url, null, {
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
    onStartRequest() {},
    onStopRequest() {},
  });
  server.performTest("GROUP");
  dump("Stopping server\n");
  Services.tm.currentThread.dispatch(
    {
      run() {
        _server.closeCachedConnections();
      },
    },
    Ci.nsIEventTarget.DISPATCH_NORMAL
  );
  server.performTest();
  server.stop();

  // Break refcnt loops
  listener = url = null;
}

function testManyConnections() {
  // Start up 2 connections at once and make sure that they don't conflict
  var server = makeServer(NNTP_RFC2980_handler, daemon);
  setupLocalServer(NNTP_PORT);
  server.start(NNTP_PORT);
  _server.maximumConnectionsNumber = 3;
  var listener = {
    ran: 0,
    OnStartRunningUrl(url) {},
    OnStopRunningUrl(url, rv) {
      if (--this.ran == 0) {
        _server.closeCachedConnections();
      }
    },
  };
  for (const group of _server.rootFolder.subFolders) {
    group.getNewMessages(null, listener);
    listener.ran++;
  }
  server.performTest();
  // The last one that is processed is test.filter, so make sure that
  // test.subscribed.simple is not retrieving the data meant for test.filter
  const folder = _server.rootFolder.getChildNamed("test.subscribe.simple");
  Assert.equal(folder.getTotalMessages(false), 1);
}

function run_test() {
  testRFC977();
  testConnectionLimit();
  testReentrantClose();
  testManyConnections();
}
