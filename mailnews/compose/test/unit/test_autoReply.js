/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests message headers generated from ReplyWithTemplate
 */

// make xpcshell-tests TEST_PATH=mailnews/compose/test/unit/test_autoReply.js

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/mimeParser.jsm");

load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

const kSender = "from@foo.invalid";

var gIncomingMailFile = do_get_file("../../../data/bugmail10"); // mail to reply to
var gTemplateMailFile = do_get_file("../../../data/draft1"); // template
var gTemplateFolder;

// nsIMsgCopyServiceListener implementation
var gCopyServiceListener = {
  OnStartCopy: function onStartCopy() {},
  OnProgress: function onProgress(aProgress, aProgressMax) {},
  SetMessageKey: function setMessageKey(aKey) {},
  GetMessageId: function getMessageId(aMessageId) {},
  OnStopCopy: function onStopCopy(aStatus) { do_check_false(aStatus); async_driver();},
};

function copyFileMessage(file, destFolder, isDraftOrTemplate)
{
  MailServices.copy.CopyFileMessage(file, destFolder, null, isDraftOrTemplate,
    0, "", gCopyServiceListener, null);
}

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  gTemplateFolder = localAccountUtils.rootFolder
                                     .createLocalSubfolder("Templates");
  run_next_test();
}

add_task(function testCopySourceMessage() {
  // Get the message to reply to into the inbox.
  copyFileMessage(gIncomingMailFile, localAccountUtils.inboxFolder, false);
});

add_task(function testCopyTemplateMessage() {
  // Get a template message into the Templates folder.
  copyFileMessage(gTemplateMailFile, gTemplateFolder, true);
});

add_task(function() {
  testReply();
});

/// Test reply with template.
function testReply() {
  // fake smtp server setup
  let server = setupServerDaemon();
  let smtpServer = getBasicSmtpServer();
  let identity = getSmtpIdentity(kSender, smtpServer);
  localAccountUtils.msgAccount.addIdentity(identity);
  server.start(SMTP_PORT);

  let msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);
  let templateHdr = mailTestUtils.getMsgHdrN(gTemplateFolder, 0);

  // See <method name="getTemplates"> in searchWidgets.xml
  let msgTemplateUri = gTemplateFolder.URI +
                       "?messageId=" + templateHdr.messageId +
                       "&subject=" + templateHdr.mime2DecodedSubject;

  MailServices.compose.replyWithTemplate(msgHdr, msgTemplateUri, null,
    localAccountUtils.incomingServer);

  server.performTest();
  let headers = MimeParser.extractHeaders(server._daemon.post);
  do_check_true(headers.get("Subject").startsWith("Auto: "));
  do_check_eq(headers.get("Auto-submitted"), "auto-replied");

  // fake server cleanup
  server.stop();

  var thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
}

