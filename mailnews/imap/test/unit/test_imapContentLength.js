/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test content length for the IMAP protocol. This focuses on necko URLs
 * that are run externally.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var gMsgHdr = null;

// Take a multipart message as we're testing attachment URLs as well
var gFile = do_get_file("../../../data/multipart-complex2");

add_setup(function () {
  setupIMAPPump();

  // Set up nsIMsgFolderListener to get the header when it's received
  MailServices.mfn.addListener(msgAddedListener, MailServices.mfn.msgAdded);

  IMAPPump.inbox.clearFlag(Ci.nsMsgFolderFlags.Offline);
});

// Adds some messages directly to a mailbox (eg new mail)
add_task(async function addMessageToServer() {
  const URI = Services.io.newFileURI(gFile).QueryInterface(Ci.nsIFileURL);
  IMAPPump.mailbox.addMessage(
    new ImapMessage(URI.spec, IMAPPump.mailbox.uidnext++, [])
  );

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

function MsgAddedListener() {
  this._promise = new Promise(resolve => {
    this._resolve = resolve;
  });
}
MsgAddedListener.prototype = {
  msgAdded(aMsgHdr) {
    gMsgHdr = aMsgHdr;
    this._resolve();
  },
  get promise() {
    return this._promise;
  },
};
var msgAddedListener = new MsgAddedListener();

add_task(async function verifyContentLength() {
  await msgAddedListener.promise;
  const messageUri = IMAPPump.inbox.getUriForMsg(gMsgHdr);
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
  const attachmentChannel = Services.io.newChannelFromURI(
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
});

add_task(function endTest() {
  MailServices.mfn.removeListener(msgAddedListener);
  teardownIMAPPump();
});
