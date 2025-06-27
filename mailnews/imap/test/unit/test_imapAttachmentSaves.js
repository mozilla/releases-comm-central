/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests imap save and detach attachments.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// javascript mime emitter functions
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);

var kAttachFileName = "bob.txt";
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

add_setup(function () {
  setupIMAPPump();
});

// load and update a message in the imap fake server
add_task(async function loadImapMessage() {
  const gMessageGenerator = new MessageGenerator();
  // create a synthetic message with attachment
  const smsg = gMessageGenerator.makeMessage({
    attachments: [{ filename: kAttachFileName, body: "I like cheese!" }],
  });

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(smsg.toMessageString())
  );
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  const message = new ImapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
  Assert.equal(1, IMAPPump.inbox.getTotalMessages(false));
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);
});

// process the message through mime
add_task(async function startMime() {
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);

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
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
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

  // Now test that the detachment was successful.

  // Check that the file attached to the message now exists in the profile
  // directory.
  const checkFile = do_get_profile().clone();
  checkFile.append(kAttachFileName);
  Assert.ok(checkFile.exists());

  // The message should now have a detached attachment. Read the message,
  //  and search for "AttachmentDetached" which is added on detachment.

  // Get the message header - detached copy has UID 2.
  const msgHdr2 = IMAPPump.inbox.GetMessageHeader(2);
  Assert.notStrictEqual(msgHdr2, null);
  const messageContent = await getContentFromMessage(msgHdr2);
  Assert.ok(messageContent.includes("AttachmentDetached"));
});

// Cleanup
add_task(function endTest() {
  teardownIMAPPump();
});

/**
 * Get the full message content.
 *
 * @param {nsIMsgDBHdr} aMsgHdr - Header object whose text body will be read.
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
      onStartRequest() {},
      onStopRequest(request, statusCode) {
        this.sis.close();
        if (Components.isSuccessCode(statusCode)) {
          resolve(this.content);
        } else {
          reject(new Error(statusCode));
        }
      },
    };
    // Pass true for aLocalOnly since message should be in offline store.
    MailServices.messageServiceFromURI(msgUri).streamMessage(
      msgUri,
      streamListener,
      null,
      null,
      false,
      "",
      true
    );
  });
}
