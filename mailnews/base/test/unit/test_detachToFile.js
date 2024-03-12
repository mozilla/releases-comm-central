/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests nsIMessenger's detachAttachmentsWOPrompts
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
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

add_setup(async function () {
  if (!localAccountUtils.inboxFolder) {
    localAccountUtils.loadLocalMailAccount();
  }
});

add_task(async function startCopy() {
  // Get a message into the local filestore.
  const mailFile = do_get_file("../../../data/external-attach-test");
  const listener = new PromiseTestUtils.PromiseCopyListener();
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
  const msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);

  MsgHdrToMimeMessage(
    msgHdr,
    gCallbackObject,
    gCallbackObject.callback,
    true // allowDownload
  );

  await gCallbackObject.promise;
});

// detach any found attachments
add_task(async function startDetach() {
  const msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);
  const msgURI = msgHdr.folder.generateMessageURI(msgHdr.messageKey);

  const messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  const attachment = gCallbackObject.attachments[0];
  const listener = new PromiseTestUtils.PromiseUrlListener();

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

/**
 * Test that the detachment was successful.
 */
add_task(async function testDetach() {
  // The message contained a file "check.pdf" which should
  //  now exist in the profile directory.
  const checkFile = do_get_profile().clone();
  checkFile.append("check.pdf");
  Assert.ok(checkFile.exists());

  // The message should now have a detached attachment. Read the message,
  //  and search for "AttachmentDetached" which is added on detachment.

  // Get the message header
  const msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);

  const messageContent = await getContentFromMessage(msgHdr);
  Assert.ok(messageContent.includes("AttachmentDetached"));
});

/**
 * Get the full message content.
 *
 * @param {nsIMsgDBHdr} aMsgHdr - Message whose text body will be read.
 * @returns {Promise<string>} full message contents.
 */
function getContentFromMessage(aMsgHdr) {
  const msgFolder = aMsgHdr.folder;
  const msgUri = msgFolder.getUriForMsg(aMsgHdr);

  return new Promise((resolve, reject) => {
    const streamListener = {
      QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
      sis: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
        Ci.nsIScriptableInputStream
      ),
      content: "",
      onDataAvailable(request, inputStream, offset, count) {
        this.sis.init(inputStream);
        this.content += this.sis.read(count);
      },
      onStartRequest(request) {},
      onStopRequest(request, statusCode) {
        this.sis.close();
        if (Components.isSuccessCode(statusCode)) {
          resolve(this.content);
        } else {
          reject(new Error(statusCode));
        }
      },
    };
    MailServices.messageServiceFromURI(msgUri).streamMessage(
      msgUri,
      streamListener,
      null,
      null,
      false,
      "",
      false
    );
  });
}
