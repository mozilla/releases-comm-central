// Bug 37465 -- assertions with no accounts

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_task(async function textChannelAsync() {
  const daemon = setupNNTPDaemon();
  const server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();

  // Correct URI?
  const uri = Services.io.newURI(
    "news://localhost:" + server.port + "/1@regular.invalid"
  );
  const newsUri = uri.QueryInterface(Ci.nsIMsgMailNewsUrl);
  Assert.equal(uri.port, server.port);
  Assert.equal(newsUri.server, null);
  // GetFolder() is not implemented by the base nsMsgMailNewsUrl (only
  // by protocol-specific subclasses like nsImapUrl and nsMailboxUrl).
  Assert.throws(
    () => newsUri.folder,
    /NS_ERROR_NOT_IMPLEMENTED/,
    "GetFolder not implemented for generic news URL"
  );

  // Run the URI and make sure we get the message
  const channel = Services.io.newChannelFromURI(
    uri,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const listener = new PromiseTestUtils.PromiseStreamListener();
  channel.asyncOpen(listener, null);
  const msgText = await listener.promise;
  // Correct text? (original file uses LF only, so strip CR)
  Assert.equal(
    msgText.replaceAll("\r", ""),
    daemon.getArticle("<1@regular.invalid>").fullText
  );

  // Shut down connections
  MailServices.accounts.closeCachedConnections();
  server.stop();
});
