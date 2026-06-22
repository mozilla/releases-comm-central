/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test content length for the news protocol. This focuses on necko URLs
 * that are run externally.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The basic daemon to use for testing Nntpd.sys.mjs implementations
var daemon = setupNNTPDaemon();

var server;
var localserver;

add_setup(function () {
  server = makeServer(NNTP_RFC977_handler, daemon);
  server.start();
  localserver = setupLocalServer(server.port);
  registerCleanupFunction(() => {
    server.stop();
  });
});

add_task(async function verifyContentLength() {
  // Get the folder and new mail.
  const folder = localserver.rootFolder.getChildNamed("test.subscribe.simple");
  folder.clearFlag(Ci.nsMsgFolderFlags.Offline);

  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener({
    OnStopRunningUrl() {
      localserver.closeCachedConnections();
    },
  });
  folder.getNewMessages(null, promiseUrlListener);
  server.performTest();
  await promiseUrlListener.promise;

  Assert.equal(folder.getTotalMessages(false), 1);

  // Get the message URI and convert to a necko URL.
  const msgHdr = folder.firstNewMessage;
  const messageUri = folder.getUriForMsg(msgHdr);
  const messageService = MailServices.messageServiceFromURI(messageUri);
  const neckoURL = messageService.getUrlForUri(messageUri);
  const urlToRun = Services.io.newURI(neckoURL.spec);

  // Get a channel and read the data.
  const channel = Services.io.newChannelFromURI(
    urlToRun,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  const promiseStreamListener = new PromiseTestUtils.PromiseStreamListener();
  channel.asyncOpen(promiseStreamListener, null);
  const streamData = (await promiseStreamListener.promise).replace(
    /\r\n/g,
    "\n"
  );

  // Check that we received the expected article data.
  Assert.equal(kSimpleNewsArticle.length, streamData.length);
  Assert.equal(kSimpleNewsArticle, streamData);
});
