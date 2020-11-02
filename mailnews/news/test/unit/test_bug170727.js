// Bug 170727 - Remove the escaped dot from body lines before saving in the offline store.

var daemon, localserver, server;

function run_test() {
  daemon = setupNNTPDaemon();
  daemon.addGroup("dot.test");
  daemon.addArticle(make_article(do_get_file("postings/post3.eml")));

  server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);
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
  var msgService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=news"
  ].getService(Ci.nsIMsgMessageService);

  // Pretend to display the message: During the first run, the article is downloaded,
  // displayed directly and simultaneously saved in the offline storage.
  msgService.DisplayMessage(uri, articleTextListener, null, null, null, {});
  // Get the server to run
  var thread = gThreadManager.currentThread;
  while (!articleTextListener.finished) {
    thread.processNextEvent(true);
  }
  localserver.closeCachedConnections();

  // Correct text?
  Assert.equal(
    articleTextListener.data,
    daemon.getArticle("<2@dot.invalid>").fullText
  );

  articleTextListener.data = "";
  articleTextListener.finished = false;

  // In the second run, the offline store serves as the source of the article.
  msgService.DisplayMessage(uri, articleTextListener, null, null, null, {});
  // Get the server to run
  while (!articleTextListener.finished) {
    thread.processNextEvent(true);
  }
  localserver.closeCachedConnections();

  // Correct text?
  Assert.equal(
    articleTextListener.data,
    daemon.getArticle("<2@dot.invalid>").fullText
  );

  server.stop();
}
