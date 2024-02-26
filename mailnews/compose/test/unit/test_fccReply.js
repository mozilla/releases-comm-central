/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that when nsIMsgIdentity.fccReplyFollowsParent is true, the reply mail
 * is copied to the same folder as the original mail.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var gServer;

/**
 * Send a reply to originalMsgURI.
 */
async function sendReply(identity, fields, originalMsgURI, compType) {
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = fields;
  params.originalMsgURI = originalMsgURI;
  const msgCompose = MailServices.compose.initCompose(params);
  msgCompose.type = compType;
  const progress = Cc["@mozilla.org/messenger/progress;1"].createInstance(
    Ci.nsIMsgProgress
  );
  const promise = new Promise((resolve, reject) => {
    progressListener.resolve = resolve;
    progressListener.reject = reject;
  });
  progress.registerListener(progressListener);
  msgCompose.sendMsg(
    Ci.nsIMsgSend.nsMsgDeliverNow,
    identity,
    "",
    null,
    progress
  );
  return promise;
}

/**
 * Load local mail account and start fake SMTP server.
 */
add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
  gServer = setupServerDaemon();
  gServer.start();
  registerCleanupFunction(() => {
    gServer.stop();
  });
});

/**
 * With fccReplyFollowsParent enabled, send a few replies then check the replies
 * exists in the Inbox folder.
 */
add_task(async function testFccReply() {
  // Turn on fccReplyFollowsParent.
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(gServer.port)
  );
  identity.fccReplyFollowsParent = true;

  // Copy a test mail into the Inbox.
  const file = do_get_file("data/message1.eml"); // mail to reply to
  const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    file,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    promiseCopyListener,
    null
  );
  await promiseCopyListener.promise;

  const CompFields = CC(
    "@mozilla.org/messengercompose/composefields;1",
    Ci.nsIMsgCompFields
  );
  const msgHdr = mailTestUtils.firstMsgHdr(localAccountUtils.inboxFolder);
  const originalMsgURI = msgHdr.folder.getUriForMsg(msgHdr);

  // Test nsIMsgCompFields.Reply.
  const fields = new CompFields();
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test fcc reply";
  await sendReply(identity, fields, originalMsgURI, Ci.nsIMsgCompType.Reply);
  await TestUtils.waitForCondition(() => gServer._daemon.post);
  let msgData = mailTestUtils.loadMessageToString(
    localAccountUtils.inboxFolder,
    mailTestUtils.getMsgHdrN(localAccountUtils.inboxFolder, 1)
  );
  Assert.ok(msgData.includes("Subject: Test fcc reply"));

  // Test nsIMsgCompFields.ReplyToGroup.
  gServer.resetTest();
  fields.subject = "Test fccReplyToGroup";
  await sendReply(
    identity,
    fields,
    originalMsgURI,
    Ci.nsIMsgCompType.ReplyToGroup
  );
  await TestUtils.waitForCondition(() => gServer._daemon.post);
  msgData = mailTestUtils.loadMessageToString(
    localAccountUtils.inboxFolder,
    mailTestUtils.getMsgHdrN(localAccountUtils.inboxFolder, 2)
  );
  Assert.ok(msgData.includes("Subject: Test fccReplyToGroup"));

  // Test nsIMsgCompFields.ReplyToList.
  gServer.resetTest();
  fields.subject = "Test fccReplyToList";
  await sendReply(
    identity,
    fields,
    originalMsgURI,
    Ci.nsIMsgCompType.ReplyToList
  );
  await TestUtils.waitForCondition(() => gServer._daemon.post);
  msgData = mailTestUtils.loadMessageToString(
    localAccountUtils.inboxFolder,
    mailTestUtils.getMsgHdrN(localAccountUtils.inboxFolder, 3)
  );
  Assert.ok(msgData.includes("Subject: Test fccReplyToList"));
});
