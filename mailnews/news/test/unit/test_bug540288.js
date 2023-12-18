/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* Tests that an empty cache entry doesn't return an empty message for news. */

// The basic daemon to use for testing Nntpd.sys.mjs implementations
var daemon = setupNNTPDaemon();

var server;
var localserver;

var streamListener = {
  _data: "",

  QueryInterface: ChromeUtils.generateQI([
    "nsIStreamListener",
    "nsIRequestObserver",
  ]),

  // nsIRequestObserver
  onStartRequest(aRequest) {},
  onStopRequest(aRequest, aStatusCode) {
    Assert.equal(aStatusCode, 0);

    // Reduce any \r\n to just \n so we can do a good comparison on any
    // platform.
    var reduced = this._data.replace(/\r\n/g, "\n");
    Assert.equal(reduced, kSimpleNewsArticle);

    // We must finish closing connections and tidying up after a timeout
    // so that the thread has time to unwrap itself.
    do_timeout(0, doTestFinished);
  },

  // nsIStreamListener
  onDataAvailable(aRequest, aInputStream, aOffset, aCount) {
    const scriptStream = Cc[
      "@mozilla.org/scriptableinputstream;1"
    ].createInstance(Ci.nsIScriptableInputStream);

    scriptStream.init(aInputStream);

    this._data += scriptStream.read(aCount);
  },
};

function doTestFinished() {
  localserver.closeCachedConnections();

  server.stop();

  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }

  do_test_finished();
}

function run_test() {
  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);
  var uri = Services.io.newURI(
    "news://localhost:" + server.port + "/TSS1%40nntp.test"
  );

  try {
    // Add an empty message to the cache
    MailServices.nntp.cacheStorage.asyncOpenURI(
      uri,
      "",
      Ci.nsICacheStorage.OPEN_NORMALLY,
      {
        onCacheEntryAvailable(cacheEntry, isNew, status) {
          Assert.equal(status, Cr.NS_OK);

          cacheEntry.markValid();

          // Get the folder and new mail
          var folder = localserver.rootFolder.getChildNamed(
            "test.subscribe.simple"
          );
          folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
          folder.getNewMessages(null, {
            OnStopRunningUrl() {
              localserver.closeCachedConnections();
            },
          });
          server.performTest();

          Assert.equal(folder.getTotalMessages(false), 1);
          Assert.ok(folder.hasNewMessages);

          server.resetTest();

          var message = folder.firstNewMessage;

          var messageUri = folder.getUriForMsg(message);

          Cc["@mozilla.org/messenger/messageservice;1?type=news"]
            .getService(Ci.nsIMsgMessageService)
            .loadMessage(messageUri, streamListener, null, null, false);

          // Get the server to run
          server.performTest();
        },
      }
    );

    do_test_pending();
  } catch (e) {
    server.stop();
    do_throw(e);
  }
}
