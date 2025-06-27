/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that when fcc2 field is set, the mail is copied to the fcc2 folder.
 */

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

let gServer;
let fcc2Folder;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();
  gServer = setupServerDaemon();
  gServer.start();
  fcc2Folder = localAccountUtils.rootFolder.createLocalSubfolder("fcc2");

  registerCleanupFunction(() => {
    gServer.stop();
    fcc2Folder.deleteSelf(null);
  });
});

/**
 * Send a message with the fcc2 field set, then check the message in the fcc2
 * folder.
 */
add_task(async function testFcc2() {
  gServer.resetTest();
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer(gServer.port)
  );

  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.fcc2 = fcc2Folder.URI;

  let msgHdrN = 0;
  const subTest = async (subject, deliverMode) => {
    fields.subject = subject;
    await richCreateMessage(fields, [], identity, null, deliverMode);

    // Check the message shows up correctly in the fcc2 folder.
    const msgData = mailTestUtils.loadMessageToString(
      fcc2Folder,
      mailTestUtils.getMsgHdrN(fcc2Folder, msgHdrN++)
    );
    Assert.ok(msgData.includes(`Subject: ${subject}`));
  };

  await subTest("Test fcc2 - deliver now", Ci.nsIMsgSend.nsMsgDeliverNow);
  await subTest(
    "Test fcc2 - queue for later",
    Ci.nsIMsgSend.nsMsgQueueForLater
  );
});
