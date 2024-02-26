/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

/*
 * Test content length for the mailbox protocol. This focuses on necko URLs
 * that are run externally.
 */

// Strip the extra X-Mozilla-* headers which are slipped in to messages
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

add_task(async function check_contentlength() {
  localAccountUtils.loadLocalMailAccount();

  // Take a multipart message as we're testing attachment URLs as well.
  const testFile = do_get_file("../../../data/multipart-complex2");

  // Load a message into the local folder.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    testFile,
    localAccountUtils.inboxFolder, // dstFolder
    null, // msgToReplace
    false, // isDraftOrTemplate
    0, // aMsgFlags,
    "", // aMsgKeywords
    copyListener,
    null // msgWindow
  );
  const copyResult = await copyListener.promise;
  const msgKey = copyResult.messageKeys[0];

  // First get the message URI
  const msgHdr = localAccountUtils.inboxFolder.GetMessageHeader(msgKey);
  const msgUri = localAccountUtils.inboxFolder.getUriForMsg(msgHdr);
  // Convert this to a URI that necko can run
  const messageService = MailServices.messageServiceFromURI(msgUri);
  const neckoURL = messageService.getUrlForUri(msgUri);
  // Don't use the necko URL directly. Instead, get the spec and create a new
  // URL using the IO service
  const urlToRun = Services.io.newURI(neckoURL.spec);

  // Get a channel from this URI, and check its content length
  const channel = Services.io.newChannelFromURI(
    urlToRun,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  const contentLength = channel.contentLength;
  // Read the full msg from the channel.
  const instream = channel.open();
  const sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sstream.init(instream);
  const raw = sstream.read(8192);

  // Sanity check - we read out contentLength bytes?
  Assert.equal(contentLength, raw.length);

  // Original file had no X-Mozilla- headers.
  const stripped = strip_x_moz_headers(raw);
  Assert.equal(testFile.fileSize, stripped.length);

  // Now try an attachment. &part=1.2
  const attachmentURL = Services.io.newURI(neckoURL.spec + "&part=1.2");
  Services.io.newChannelFromURI(
    attachmentURL,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  // Currently attachments have their content length set to the length of the
  // entire message
  Assert.equal(channel.contentLength, raw.length);
});
