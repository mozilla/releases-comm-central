/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that when fcc2 field is set, the mail is copied to the fcc2 folder.
 */

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

let fcc2Folder;

add_setup(async function () {
  localAccountUtils.loadLocalMailAccount();
  fcc2Folder = localAccountUtils.rootFolder.createLocalSubfolder("fcc2");
});

/**
 * Send a message with the fcc2 field set, then check the message in the fcc2
 * folder.
 */
add_task(async function testFcc2() {
  const CompFields = CC(
    "@mozilla.org/messengercompose/composefields;1",
    Ci.nsIMsgCompFields
  );
  const fields = new CompFields();
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test fcc2";
  fields.fcc2 = fcc2Folder.URI;
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  await richCreateMessage(fields, [], identity);

  // Check the message shows up correctly in the fcc2 folder.
  const msgData = mailTestUtils.loadMessageToString(
    fcc2Folder,
    mailTestUtils.firstMsgHdr(fcc2Folder)
  );
  Assert.ok(msgData.includes("Subject: Test fcc2"));
});

add_task(async function cleanup() {
  fcc2Folder.deleteSelf(null);
});
