// Bug 403242 stems from invalid message ids

const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_task(async function test403242() {
  let daemon = setupNNTPDaemon();
  daemon.addGroup("test1");
  daemon.addArticle(make_article(do_get_file("postings/bug403242.eml")));
  let server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  let localserver = setupLocalServer(server.port);
  localserver.subscribeToNewsgroup("test1");

  let folder = localserver.rootFolder.getChildNamed("test1");
  folder.getNewMessages(null, {
    OnStopRunningUrl() {
      localserver.closeCachedConnections();
    },
  });
  server.performTest();

  // Fetch the message
  let uri = folder.generateMessageURI(1);
  let msgService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=news"
  ].getService(Ci.nsIMsgMessageService);

  // Does the URL lie to us?
  let neckoUrl = msgService.getUrlForUri(uri).QueryInterface(Ci.nsINntpUrl);
  Assert.equal(neckoUrl.newsAction, Ci.nsINntpUrl.ActionFetchArticle);

  // Pretend to display the message
  let listener = new PromiseTestUtils.PromiseStreamListener();
  msgService.loadMessage(uri, listener, null, null, false);
  let msgText = await listener.promise;
  localserver.closeCachedConnections();
  server.stop();

  // Correct text? (original file uses LF only, so strip CR)
  Assert.equal(
    msgText.replaceAll("\r", ""),
    daemon.getGroup("test1")[1].fullText
  );

  // No illegal commands?
  test = "bug 403242";
  let transaction = server.playTransaction();
  do_check_transaction(transaction[transaction.length - 1], [
    "MODE READER",
    "GROUP test1",
    "ARTICLE 1",
  ]);
});
