/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test createRFC822Message creates a mail file.
 */

var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

let customSendListener = {
  ...copyListener,
  OnStopCopy() {},

  /**
   * Test a mail file is created and has correct content.
   */
  async onStopSending(msgId, status, msg, returnFile) {
    ok(returnFile.exists(), "createRFC822Message should create a mail file");
    let content = await IOUtils.readUTF8(returnFile.path);
    ok(
      content.includes("Subject: Test createRFC822Message\r\n"),
      "Mail file should contain correct subject line"
    );
    ok(
      content.includes("createRFC822Message is used by nsImportService"),
      "Mail file should contain correct body"
    );
    do_test_finished();
  },
};

/**
 * Call createRFC822Message, expect onStopSending to be called.
 */
add_task(async function testCreateRFC822Message() {
  let identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );

  let fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test createRFC822Message";

  let msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  msgSend.createRFC822Message(
    identity,
    fields,
    "text/plain",
    "createRFC822Message is used by nsImportService",
    true, // isDraft
    [],
    [],
    customSendListener
  );
  do_test_pending();
});
