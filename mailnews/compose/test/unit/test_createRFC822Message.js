/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test createRFC822Message creates a mail file.
 */

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const customSendListener = {
  ...copyListener,
  OnStopCopy() {},

  /**
   * Test a mail file is created and has correct content.
   */
  async onStopSending(msgId, status, msg, returnFile) {
    ok(returnFile.exists(), "createRFC822Message should create a mail file");
    let content = await IOUtils.read(returnFile.path);
    content = String.fromCharCode(...content);
    ok(
      content.includes("Subject: Test createRFC822Message\r\n"),
      "Mail file should contain correct subject line"
    );
    ok(
      content.includes(
        "createRFC822Message is used by nsImportService \xe4\xe9"
      ),
      "Mail file should contain correct body"
    );
    do_test_finished();
  },
};

/**
 * Call createRFC822Message, expect onStopSending to be called.
 */
add_task(async function testCreateRFC822Message() {
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );

  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.from = "Somebody <somebody@tinderbox.invalid>";
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test createRFC822Message";

  const msgSend = Cc["@mozilla.org/messengercompose/send;1"].createInstance(
    Ci.nsIMsgSend
  );
  msgSend.createRFC822Message(
    identity,
    fields,
    "text/plain",
    // The following parameter is the message body that can contain arbitrary
    // binary data, let's try some windows-1252 data (äé).
    "createRFC822Message is used by nsImportService \xe4\xe9",
    true, // isDraft
    [],
    [],
    customSendListener
  );
  do_test_pending();
});
