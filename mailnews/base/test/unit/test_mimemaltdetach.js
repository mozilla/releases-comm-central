/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests nsIMessenger's detachAttachmentsWOPrompts of Mime multi-part
 * alternative messages.
 */

// javascript mime emitter functions
var mimeMsg = {};
ChromeUtils.import("resource:///modules/gloda/MimeMessage.jsm", mimeMsg);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

function SaveAttachmentCallback() {
  this.attachments = null;
  this._promise = new Promise((resolve, reject) => {
    this._resolve = resolve;
    this._reject = reject;
  });
}

SaveAttachmentCallback.prototype = {
  callback: function saveAttachmentCallback_callback(aMsgHdr, aMimeMessage) {
    this.attachments = aMimeMessage.allAttachments;
    this._resolve();
  },
  get promise() {
    return this._promise;
  },
};
var gCallbackObject = new SaveAttachmentCallback();

add_task(async function setupTest() {
  if (!localAccountUtils.inboxFolder) {
    localAccountUtils.loadLocalMailAccount();
  }
});

add_task(async function startCopy() {
  // Get a message into the local filestore.
  let mailFile = do_get_file("../../../data/multipartmalt-detach");
  let listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    mailFile,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    listener,
    null
  );
  await listener.promise;
});

// process the message through mime
add_task(async function startMime() {
  let msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);

  mimeMsg.MsgHdrToMimeMessage(
    msgHdr,
    gCallbackObject,
    gCallbackObject.callback,
    true // allowDownload
  );

  await gCallbackObject.promise;
});

// detach any found attachments
add_task(async function startDetach() {
  let msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);
  let msgURI = msgHdr.folder.generateMessageURI(msgHdr.messageKey);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let attachment = gCallbackObject.attachments[0];
  let listener = new PromiseTestUtils.PromiseUrlListener();

  messenger.detachAttachmentsWOPrompts(
    do_get_profile(),
    [attachment.contentType],
    [attachment.url],
    [attachment.name],
    [msgURI],
    listener
  );
  await listener.promise;
});

// test that the detachment was successful
add_task(function testDetach() {
  // The message contained a file "head_update.txt" which should
  //  now exist in the profile directory.
  let checkFile = do_get_profile().clone();
  checkFile.append("head_update.txt");
  Assert.ok(checkFile.exists());
  Assert.ok(checkFile.fileSize > 0);

  // The message should now have a detached attachment. Read the message,
  //  and search for "AttachmentDetached" which is added on detachment.

  // Get the message header
  let msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);

  let messageContent = getContentFromMessage(msgHdr);
  Assert.ok(messageContent.includes("AttachmentDetached"));
  // Make sure the body survived the detach.
  Assert.ok(messageContent.includes("body hello"));
});

/*
 * Get the full message content.
 *
 * aMsgHdr: nsIMsgDBHdr object whose text body will be read
 *          returns: string with full message contents
 */
function getContentFromMessage(aMsgHdr) {
  const MAX_MESSAGE_LENGTH = 65536;
  let msgFolder = aMsgHdr.folder;
  let msgUri = msgFolder.getUriForMsg(aMsgHdr);

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let streamListener = Cc[
    "@mozilla.org/network/sync-stream-listener;1"
  ].createInstance(Ci.nsISyncStreamListener);
  messenger
    .messageServiceFromURI(msgUri)
    .streamMessage(msgUri, streamListener, null, null, false, "", false);
  let sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  sis.init(streamListener.inputStream);
  let content = sis.read(MAX_MESSAGE_LENGTH);
  sis.close();
  return content;
}
