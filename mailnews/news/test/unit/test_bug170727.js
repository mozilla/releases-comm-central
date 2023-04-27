// Bug 170727 - Remove the escaped dot from body lines before saving in the offline store.

const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_task(async function testloadMessage() {
  let daemon = setupNNTPDaemon();
  daemon.addGroup("dot.test");
  daemon.addArticle(make_article(do_get_file("postings/post3.eml")));

  let server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  let localserver = setupLocalServer(server.port);
  localserver.subscribeToNewsgroup("dot.test");

  let folder = localserver.rootFolder.getChildNamed("dot.test");
  folder.setFlag(Ci.nsMsgFolderFlags.Offline);
  folder.getNewMessages(null, {
    OnStopRunningUrl() {
      localserver.closeCachedConnections();
    },
  });
  server.performTest();

  let uri = folder.generateMessageURI(1);
  let msgService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=news"
  ].getService(Ci.nsIMsgMessageService);

  // Pretend to display the message: During the first run, the article is downloaded,
  // displayed directly and simultaneously saved in the offline storage.
  {
    let listener = new PromiseTestUtils.PromiseStreamListener();
    msgService.loadMessage(uri, listener, null, null, false);
    let msgText = await listener.promise;
    localserver.closeCachedConnections();

    // Correct text? (original file uses LF only, so strip CR)
    Assert.equal(
      msgText.replaceAll("\r", ""),
      daemon.getArticle("<2@dot.invalid>").fullText
    );
  }

  // In the second run, the offline store serves as the source of the article.
  {
    let listener = new PromiseTestUtils.PromiseStreamListener();
    msgService.loadMessage(uri, listener, null, null, false);
    let msgText = await listener.promise;
    localserver.closeCachedConnections();

    // Correct text? (original file uses LF only, so strip CR)
    Assert.equal(
      msgText.replaceAll("\r", ""),
      daemon.getArticle("<2@dot.invalid>").fullText
    );
  }

  server.stop();
});
