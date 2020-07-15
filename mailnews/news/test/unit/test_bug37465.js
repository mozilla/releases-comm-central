// Bug 37465 -- assertions with no accounts

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function run_test() {
  var daemon = setupNNTPDaemon();
  var server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();

  // Correct URI?
  let uri = Services.io.newURI(
    "news://localhost:" + server.port + "/1@regular.invalid"
  );
  let newsUri = uri
    .QueryInterface(Ci.nsINntpUrl)
    .QueryInterface(Ci.nsIMsgMailNewsUrl);
  Assert.equal(uri.port, server.port);
  Assert.equal(newsUri.server, null);
  Assert.equal(newsUri.messageID, "1@regular.invalid");
  Assert.equal(newsUri.folder, null);

  // Run the URI and make sure we get the message
  let channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  channel.asyncOpen(articleTextListener, null);

  // Run the server
  var thread = gThreadManager.currentThread;
  while (!articleTextListener.finished) {
    thread.processNextEvent(true);
  }

  Assert.equal(
    articleTextListener.data,
    daemon.getArticle("<1@regular.invalid>").fullText
  );

  // Shut down connections
  MailServices.accounts.closeCachedConnections();
  server.stop();
}
