// Tests that the news can correctly post messages

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/**
 * Test dot is stuffed correctly when posting an article.
 */
add_task(async function test_nntpPost() {
  // Setup test server.
  const daemon = setupNNTPDaemon();
  const handler = new NNTP_RFC977_handler(daemon);
  const server = new nsMailServer(() => handler, daemon);
  server.start();
  registerCleanupFunction(() => server.stop());

  // Send post3.eml to the server.
  const localServer = setupLocalServer(server.port);
  const testFile = do_get_file("postings/post3.eml");
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.nntp.postMessage(
    testFile,
    "test.empty",
    localServer.key,
    urlListener,
    null
  );
  await urlListener.promise;

  // Because Nntpd.sys.mjs undone the dot-stuffing, handler.post should be the same
  // as the original post.
  equal(handler.post, await IOUtils.readUTF8(testFile.path));
});
