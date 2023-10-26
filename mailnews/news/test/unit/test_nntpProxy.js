/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Tests that NNTP over a SOCKS proxy works.

const { NetworkTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/NetworkTestUtils.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

const PORT = 119;

var daemon, localserver, server;

add_setup(async function () {
  daemon = setupNNTPDaemon();
  server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  NetworkTestUtils.configureProxy("news.tinderbox.invalid", PORT, server.port);
  localserver = setupLocalServer(PORT, "news.tinderbox.invalid");
});

add_task(async function findMessages() {
  // This is a trivial check that makes sure that we actually do some network
  // traffic without caring about the exact network traffic.
  const folder = localserver.rootFolder.getChildNamed("test.filter");
  equal(folder.getTotalMessages(false), 0);
  const asyncUrlListener = new PromiseTestUtils.PromiseUrlListener();
  folder.getNewMessages(null, asyncUrlListener);
  await asyncUrlListener.promise;
  equal(folder.getTotalMessages(false), 8);
});

add_task(async function cleanUp() {
  NetworkTestUtils.shutdownServers();
  localserver.closeCachedConnections();
});
