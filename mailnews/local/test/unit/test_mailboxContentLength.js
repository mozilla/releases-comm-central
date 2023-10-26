/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test content length for the mailbox protocol. This focuses on necko URLs
 * that are run externally.
 */

// Take a multipart message as we're testing attachment URLs as well
var gFile = do_get_file("../../../data/multipart-complex2");

function run_test() {
  do_test_pending();
  copyFileMessageInLocalFolder(gFile, 0, "", null, verifyContentLength);
}

function verifyContentLength(aMessageHeaderKeys, aStatus) {
  Assert.notEqual(aMessageHeaderKeys, null);
  // First get the message URI
  const msgHdr = localAccountUtils.inboxFolder.GetMessageHeader(
    aMessageHeaderKeys[0]
  );
  const messageUri = localAccountUtils.inboxFolder.getUriForMsg(msgHdr);
  // Convert this to a URI that necko can run
  const messageService = MailServices.messageServiceFromURI(messageUri);
  const neckoURL = messageService.getUrlForUri(messageUri);
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
  Assert.equal(channel.contentLength, gFile.fileSize);

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
  Assert.equal(channel.contentLength, gFile.fileSize);

  do_test_finished();
}
