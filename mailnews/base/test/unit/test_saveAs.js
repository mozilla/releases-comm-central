/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Invokes nsMessenger::saveAs with the bypass of the File Picker to check if
 * the saved file as .eml .html or .txt contains certain strings (header, body, ...).
 *
 * See `checkedContent` for the compared strings.
 */

var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { ImapMessage } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Imapd.sys.mjs"
);
var { IMAPPump, setupIMAPPump, teardownIMAPPump } = ChromeUtils.import(
  "resource://testing-common/mailnews/IMAPpump.jsm"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var { FileTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/FileTestUtils.sys.mjs"
);

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

setupIMAPPump();

registerCleanupFunction(function () {
  teardownIMAPPump();
});

/**
 * Creates a SyntheticMessage and prepares it for loading it
 * into a fake IMAP inbox.
 *
 * @returns {object[]}
 *   [0] is an {ImapMessage}
 *   [1] is an {SyntheticMessage}
 */
async function createMessage() {
  const gMessageGenerator = new MessageGenerator();
  const synthMessage = gMessageGenerator.makeMessage();

  const msgURI = Services.io.newURI(
    "data:text/plain;base64," + btoa(synthMessage.toMessageString())
  );
  const imapInbox = IMAPPump.daemon.getMailbox("INBOX");
  const ImapMessageFromSynthMsg = new ImapMessage(
    msgURI.spec,
    imapInbox.uidnext++,
    []
  );
  return [ImapMessageFromSynthMsg, synthMessage];
}

/**
 * Adds a fake msg to a fake IMAP.
 *
 * @param {ImapMessage} fooMessage
 */
async function addImapMessage(fooMessage) {
  IMAPPump.mailbox.addMessage(fooMessage);
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
}

/**
 * Saves the file and waits until its able to load.
 * nsMessenger doesn't have an event for the loaded File.
 *
 * @param {string} fileEnding
 * @returns {string}
 */
async function saveAndLoad(fileEnding) {
  // getTempFile guarantees that the file doesn't exist.
  const tmpFile = FileTestUtils.getTempFile(`someprefix${fileEnding}`);
  Assert.ok(
    tmpFile.path.endsWith(fileEnding),
    "Sanity check if the file ending is intact"
  );

  // Get the ImapMessage.
  const hdr = mailTestUtils.firstMsgHdr(IMAPPump.inbox);
  const uri = IMAPPump.inbox.getUriForMsg(hdr);

  // nsMessenger::saveAs
  messenger.saveAs(uri, true, null, tmpFile.path, true);
  info(`File saved at ${tmpFile.path}`);

  await TestUtils.waitForCondition(
    () => IOUtils.exists(tmpFile.path),
    "wait for nsMessenger::saveAs file exists"
  );
  const fileContent = await IOUtils.readUTF8(tmpFile.path);
  return fileContent;
}

/**
 * All of these strings must appear in the saved file.
 *
 * @param {SyntheticMessage} synthMessage
 *        This message is the original message.
 * @returns {object}
 */
function checkedContent(synthMessage) {
  return {
    // Skip dateCheck because of Formatting and Timezone.
    // date: synthMessage.date.toString(),
    fromName: synthMessage.from[0],
    fromEmail: synthMessage.from[1],
    subject: synthMessage.subject,
    toName: synthMessage.toName,
    toAddress: synthMessage.toAddress,
    body: synthMessage.bodyPart.body,
  };
}

async function emlTest(synthMessage) {
  const loadedFileContent = await saveAndLoad(".eml");
  const messageParts = checkedContent(synthMessage);
  for (const msgPart in messageParts) {
    Assert.stringContains(
      loadedFileContent,
      messageParts[msgPart],
      `nsMessenger::saveAs with .eml should contain ${msgPart}`
    );
  }
}

async function htmlTest(synthMessage) {
  const loadedFileContent = await saveAndLoad(".html");
  const messageParts = checkedContent(synthMessage);
  for (const msgPart in messageParts) {
    Assert.stringContains(
      loadedFileContent,
      messageParts[msgPart],
      `nsMessenger::saveAs with .html should contain ${msgPart}`
    );
  }
}

async function txtTest(synthMessage) {
  const loadedFileContent = await saveAndLoad(".txt");
  const messageParts = checkedContent(synthMessage);
  for (const msgPart in messageParts) {
    Assert.stringContains(
      loadedFileContent,
      messageParts[msgPart],
      `nsMessenger::saveAs with .txt should contain ${msgPart}`
    );
  }
}

add_task(async function test_saveAs() {
  const [fakedImapMessage, synthMessage] = await createMessage();
  await addImapMessage(fakedImapMessage);
  await emlTest(synthMessage);
  await txtTest(synthMessage);
  await htmlTest(synthMessage);
});
