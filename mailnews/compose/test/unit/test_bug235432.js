/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * Test for bug 235432
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var testmail = do_get_file("data/message1.eml");
var expectedTemporaryFile;

var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

var msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
  Ci.nsIMsgSend
);

var gCopyListener = {
  callbackFunction: null,
  copiedMessageHeaderKeys: [],
  OnStartCopy() {},
  OnProgress(aProgress, aProgressMax) {},
  SetMessageKey(aKey) {
    try {
      this.copiedMessageHeaderKeys.push(aKey);
    } catch (ex) {
      dump(ex);
    }
  },
  GetMessageId(aMessageId) {},
  OnStopCopy(aStatus) {
    if (this.callbackFunction) {
      mailTestUtils.do_timeout_function(0, this.callbackFunction, null, [
        this.copiedMessageHeaderKeys,
        aStatus,
      ]);
    }
  },
};

/**
 * copyFileMessageInLocalFolder
 * A utility wrapper of nsIMsgCopyService.copyFileMessage to copy a message
 * into local inbox folder.
 *
 * @param aMessageFile     An instance of nsIFile to copy.
 * @param aMessageFlags    Message flags which will be set after message is
 *                         copied
 * @param aMessageKeyword  Keywords which will be set for newly copied
 *                         message
 * @param aMessageWindow   Window for notification callbacks, can be null
 * @param aCallback        Callback function which will be invoked after
 *                         message is copied
 */
function copyFileMessageInLocalFolder(
  aMessageFile,
  aMessageFlags,
  aMessageKeywords,
  aMessageWindow,
  aCallback
) {
  // Set up local folders
  localAccountUtils.loadLocalMailAccount();

  gCopyListener.callbackFunction = aCallback;
  // Copy a message into the local folder
  MailServices.copy.copyFileMessage(
    aMessageFile,
    localAccountUtils.inboxFolder,
    null,
    false,
    aMessageFlags,
    aMessageKeywords,
    gCopyListener,
    aMessageWindow
  );
}

// The attachment file can not be obtained from js test,
// so we have to generate the file name here.
function createExpectedTemporaryFile() {
  function createTemporaryFile() {
    let file = Services.dirsvc.get("TmpD", Ci.nsIFile);
    file.append("nsmail.tmp");
    file.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    return file;
  }

  let dummyFile = createTemporaryFile();
  registerCleanupFunction(function() {
    dummyFile.remove(false);
  });

  let expectedFile = createTemporaryFile();
  expectedFile.remove(false);

  return expectedFile;
}

/* exported OnStopCopy */
// for head_compose.js
function OnStopCopy(aStatus) {
  msgSend.abort();

  Assert.ok(!expectedTemporaryFile.exists());

  do_test_finished();
}

function run_test() {
  do_test_pending();
  copyFileMessageInLocalFolder(testmail, 0, "", null, send_message_later);
}

function send_message_later(aMessageHeaderKeys, aStatus) {
  let compFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = compFields;
  localAccountUtils.rootFolder.createLocalSubfolder("Drafts");

  let smtpServer = getBasicSmtpServer();
  let identity = getSmtpIdentity(kSender, smtpServer);

  compFields.from = identity.email;
  compFields.to = kTo;

  let msgHdr = localAccountUtils.inboxFolder.GetMessageHeader(
    aMessageHeaderKeys[0]
  );
  let messageUri = localAccountUtils.inboxFolder.getUriForMsg(msgHdr);

  let attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  attachment.url = messageUri;
  attachment.contentType = "message/rfc822";
  attachment.name = "Attachment e-mail";
  compFields.addAttachment(attachment);

  expectedTemporaryFile = createExpectedTemporaryFile();
  msgSend.createAndSendMessage(
    null,
    identity,
    "",
    compFields,
    false,
    false,
    Ci.nsIMsgSend.nsMsgQueueForLater,
    null,
    "text/plain",
    "bodyText\n",
    null,
    null,
    copyListener,
    null,
    "",
    Ci.nsIMsgCompType.New
  );
  Assert.ok(expectedTemporaryFile.exists());
}
