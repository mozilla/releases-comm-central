// Bug 170727 - Remove the escaped dot from body lines before saving in the offline store.

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Strip the extra X-Mozilla- headers which are slipped in to messages
// as they are written to local folders. Not exactly robust RFC5322 parsing,
// but enough to handle this test.
function strip_x_moz_headers(s) {
  // List to make sure headers show up when grepping codebase.
  for (const hdr of [
    "X-Mozilla-Status",
    "X-Mozilla-Status2",
    "X-Mozilla-Keys",
  ]) {
    s = s.replace(new RegExp("^" + hdr + ":.*?\r?\n", "gm"), "");
  }
  return s;
}

add_task(async function testloadMessage() {
  const daemon = setupNNTPDaemon();
  daemon.addGroup("dot.test");
  daemon.addArticle(make_article(do_get_file("postings/post3.eml")));

  const server = makeServer(NNTP_RFC2980_handler, daemon);
  server.start();
  const localserver = setupLocalServer(server.port);
  localserver.subscribeToNewsgroup("dot.test");

  const folder = localserver.rootFolder.getChildNamed("dot.test");
  folder.setFlag(Ci.nsMsgFolderFlags.Offline);
  folder.getNewMessages(null, {
    OnStopRunningUrl() {
      localserver.closeCachedConnections();
    },
  });
  server.performTest();

  const uri = folder.generateMessageURI(1);
  const msgService = Cc[
    "@mozilla.org/messenger/messageservice;1?type=news"
  ].getService(Ci.nsIMsgMessageService);

  // Stream the message: During the first run, the article is downloaded,
  // displayed directly and simultaneously saved in the offline storage.
  {
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    msgService.streamMessage(uri, streamListener, null, null, false, "", false);
    const msgText = await streamListener.promise;
    localserver.closeCachedConnections();

    // Correct text? (original file uses LF only, so strip CR)
    Assert.equal(
      msgText.replaceAll("\r", ""),
      daemon.getArticle("<2@dot.invalid>").fullText
    );
  }

  // In the second run, the offline store serves as the source of the article.
  {
    const streamListener = new PromiseTestUtils.PromiseStreamListener();
    msgService.streamMessage(uri, streamListener, null, null, false, "", false);
    let msgText = await streamListener.promise;
    localserver.closeCachedConnections();

    // To compare, need to massage what we got back from DisplayMessage():
    // - Remove any X-Mozilla-* headers (added to messages in offline store).
    // - Source test file uses LF only, so strip CRs.
    msgText = strip_x_moz_headers(msgText);
    msgText = msgText.replaceAll("\r", "");

    Assert.equal(msgText, daemon.getArticle("<2@dot.invalid>").fullText);
  }

  server.stop();
});
