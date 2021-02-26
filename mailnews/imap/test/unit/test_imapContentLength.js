/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* ***** BEGIN LICENSE BLOCK *****
 *
 * Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/licenses/publicdomain/
 *
 * ***** END LICENSE BLOCK ***** */

/*
 * Test content length for the IMAP protocol. This focuses on necko URLs
 * that are run externally.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
/* import-globals-from ../../../test/resources/asyncTestUtils.js */
load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var gMsgHdr = null;

// Take a multipart message as we're testing attachment URLs as well
var gFile = do_get_file("../../../data/multipart-complex2");

var tests = [setup, addMessageToServer, verifyContentLength, teardown];

// Adds some messages directly to a mailbox (eg new mail)
function* addMessageToServer() {
  let URI = Services.io.newFileURI(gFile).QueryInterface(Ci.nsIFileURL);
  IMAPPump.mailbox.addMessage(
    new imapMessage(URI.spec, IMAPPump.mailbox.uidnext++, [])
  );

  IMAPPump.inbox.updateFolder(null);
  yield false;
}

var msgFolderListener = {
  msgAdded(aMsgHdr) {
    gMsgHdr = aMsgHdr;
    executeSoon(async_driver);
  },
};

function setup() {
  setupIMAPPump();

  // Set up nsIMsgFolderListener to get the header when it's received
  MailServices.mfn.addListener(msgFolderListener, MailServices.mfn.msgAdded);

  IMAPPump.inbox.clearFlag(Ci.nsMsgFolderFlags.Offline);
}

function verifyContentLength() {
  let messageUri = IMAPPump.inbox.getUriForMsg(gMsgHdr);
  // Convert this to a URI that necko can run
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let messageService = messenger.messageServiceFromURI(messageUri);
  let neckoURL = messageService.getUrlForUri(messageUri);
  // Don't use the necko URL directly. Instead, get the spec and create a new
  // URL using the IO service
  let urlToRun = Services.io.newURI(neckoURL.spec);

  // Get a channel from this URI, and check its content length
  let channel = Services.io.newChannelFromURI(
    urlToRun,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  Assert.equal(channel.contentLength, gFile.fileSize);

  // Now try an attachment. &part=1.2
  let attachmentURL = Services.io.newURI(neckoURL.spec + "&part=1.2");
  let attachmentChannel = Services.io.newChannelFromURI(
    attachmentURL,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  // Currently attachments have their content length set to the length of the
  // entire message
  Assert.equal(attachmentChannel.contentLength, gFile.fileSize);
}

function teardown() {
  MailServices.mfn.removeListener(msgFolderListener);
  teardownIMAPPump();
}

function run_test() {
  async_run_tests(tests);
}
