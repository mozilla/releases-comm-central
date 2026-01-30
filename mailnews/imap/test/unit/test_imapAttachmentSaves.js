/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests imap save and detach attachments.
 *
 * This should closely match
 * mailnews/protocols/ews/test/unit/test_ewsAttachmentSaves.js
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MsgHdrToMimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/gloda/MimeMessage.sys.mjs"
);
var { AttachmentInfo } = ChromeUtils.importESModule(
  "resource:///modules/AttachmentInfo.sys.mjs"
);

const kAttachFileName = "bob.txt";

class SaveAttachmentCallbackListener {
  constructor() {
    this.attachments = null;
    this.deferred = Promise.withResolvers();
  }

  callback(aMsgHdr, aMimeMessage) {
    this.attachments = aMimeMessage.allAttachments;
    this.deferred.resolve();
  }
}

const gCallbackObject = new SaveAttachmentCallbackListener();

add_setup(function () {
  setupIMAPPump();

  registerCleanupFunction(() => {
    teardownIMAPPump();
  });
});

add_task(async function testImapAttachmentDetac() {
  const messageGenerator = new MessageGenerator();
  // create a synthetic message with attachment
  const smsg = messageGenerator.makeMessage({
    attachments: [{ filename: kAttachFileName, body: "I like cheese!" }],
  });

  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");

  // load and update a message in the fake imap server
  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(smsg.toMessageString())
  );
  const message = new ImapMessage(msgURI.spec, imapInbox.uidnext++, []);
  IMAPPump.mailbox.addMessage(message);
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.equal(
    1,
    IMAPPump.inbox.getTotalMessages(false),
    "Inbox should have the one message we added"
  );
  const msgHdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  Assert.ok(msgHdr instanceof Ci.nsIMsgDBHdr);

  // process the message through mime
  MsgHdrToMimeMessage(
    msgHdr,
    gCallbackObject,
    gCallbackObject.callback,
    true // allowDownload
  );
  await gCallbackObject.deferred.promise;

  // detach any found attachments
  const attachment = new AttachmentInfo(gCallbackObject.attachments[0]);
  const profileDir = do_get_profile();
  await AttachmentInfo.detachAttachments(msgHdr, [attachment], profileDir.path);

  // Now test that the detachment was successful.
  const checkFile = do_get_profile().clone();
  checkFile.append(kAttachFileName);
  Assert.ok(
    checkFile.exists(),
    "Detached file should exist in the profile directory"
  );

  // The message should now have a detached attachment. Read the message,
  // and search for "AttachmentDetached" which is added on detachment.

  // Get the message header - detached copy has UID 2. The original should be
  // gone.
  Assert.equal(
    [...IMAPPump.inbox.messages].length,
    1,
    "Inbox should still have exactly one message after detach"
  );
  const msgHdr2 = IMAPPump.inbox.GetMessageHeader(2);
  Assert.ok(!!msgHdr2, "Should have a message header");

  const messageContent = await getContentFromMessage(msgHdr2);
  Assert.stringContains(
    messageContent,
    "AttachmentDetached",
    "Message content should indicate that an attachment was detached"
  );
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
      false, // aConvertData
      "",
      true // aLocalOnly
    );
  });
}
