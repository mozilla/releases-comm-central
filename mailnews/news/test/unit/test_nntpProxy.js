/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Tests that NNTP over a SOCKS proxy works.

Components.utils.import("resource://testing-common/mailnews/NetworkTestUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

const PORT = 119;

var daemon, localserver, server;

add_task(function* setup() {
  daemon = setupNNTPDaemon();
  server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  NetworkTestUtils.configureProxy("news.tinderbox.invalid", PORT, server.port);
  localserver = setupLocalServer(PORT, "news.tinderbox.invalid");
});

add_task(function* findMessages() {
  // This is a trivial check that makes sure that we actually do some network
  // traffic without caring about the exact network traffic.
  let folder = localserver.rootFolder.getChildNamed("test.filter");
  equal(folder.getTotalMessages(false), 0);
  let asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(null, asyncUrlListener);
  yield asyncUrlListener.promise;
  equal(folder.getTotalMessages(false), 8);
});

add_task(function* cleanUp() {
  NetworkTestUtils.shutdownServers();
  localserver.closeCachedConnections();
});

function run_test() {
  run_next_test();
}

