/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test suite for message body.
 */

localAccountUtils.loadLocalMailAccount();

/**
 * Test trailing whitespace is QP encoded.
 */
add_task(async function testQP() {
  // Together with fields.forceMsgEncoding, force quote-printable encoding.
  Services.prefs.setBoolPref("mail.strictly_mime", true);

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  const CompFields = CC(
    "@mozilla.org/messengercompose/composefields;1",
    Ci.nsIMsgCompFields
  );

  // Test QP works for ascii text.

  let fields = new CompFields();
  fields.forceMsgEncoding = true;
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test QP encoding for trailing whitespace";
  fields.body = "A line with trailing whitespace\t ";
  await richCreateMessage(fields, [], identity);

  let msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.ok(
    msgData.includes("A line with trailing whitespace\t=20"),
    "QP for ascii should work"
  );

  // Test QP works for non-ascii text.

  fields = new CompFields();
  fields.forceMsgEncoding = true;
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test QP encoding for non-ascii and trailing tab";
  fields.body = "記: base64 is used if unprintable > 10% \t";
  await richCreateMessage(fields, [], identity);

  msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.ok(
    msgData.includes("=E8=A8=98: base64 is used if unprintable > 10% =09"),
    "QP for non-ascii should work"
  );

  // Test leading space is preserved.

  fields = new CompFields();
  fields.forceMsgEncoding = true;
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Leading space is valid in a quoted printable message";
  fields.body = "123456789" + " 123456789".repeat(6) + "1234 56789";
  await richCreateMessage(fields, [], identity);

  msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  const endOfHeaders = msgData.indexOf("\r\n\r\n");
  const body = msgData.slice(endOfHeaders + 4);

  Assert.equal(
    body.trimRight("\r\n"),
    "123456789 123456789 123456789 123456789 123456789 123456789 1234567891234=\r\n 56789"
  );

  Services.prefs.clearUserPref("mail.strictly_mime");
});

/**
 * Test QP is not used together with format=flowed.
 */
add_task(async function testNoQPWithFormatFlowed() {
  // Together with fields.forceMsgEncoding, force quote-printable encoding.
  Services.prefs.setBoolPref("mail.strictly_mime", true);

  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.forceMsgEncoding = true;
  fields.forcePlainText = true;
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test QP encoding for trailing whitespace";
  fields.body = "A line with trailing whitespace\t ";
  await richCreateMessage(fields, [], identity);

  const msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.ok(
    msgData.includes(
      "Content-Type: text/plain; charset=UTF-8; format=flowed\r\nContent-Transfer-Encoding: base64"
    ),
    "format=flowed should be used"
  );
  Assert.ok(
    !msgData.includes("quoted-printable"),
    "quoted-printable should not be used"
  );

  Services.prefs.clearUserPref("mail.strictly_mime");
});

/**
 * Test plain text body is wrapped correctly with different mailnews.wraplength
 * pref value.
 */
add_task(async function testWrapLength() {
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  const CompFields = CC(
    "@mozilla.org/messengercompose/composefields;1",
    Ci.nsIMsgCompFields
  );

  const word = "abcd ";
  const body = word.repeat(20);

  const fields = new CompFields();
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test text wrapping";
  fields.body = `<html><body>${body}</body></html>`;
  fields.forcePlainText = true;
  await richCreateMessage(fields, [], identity);

  let msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.equal(
    getMessageBody(msgData),
    // Default wrap length is 72.
    word.repeat(14) + "\r\n" + word.repeat(6).trim(),
    "Text wraps at 72 by default"
  );

  // 0 means no wrap.
  Services.prefs.setIntPref("mailnews.wraplength", 0);

  await richCreateMessage(fields, [], identity);

  msgData = mailTestUtils.loadMessageToString(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.equal(
    getMessageBody(msgData),
    body.trim(),
    "Should not wrap when wraplength is 0"
  );

  Services.prefs.clearUserPref("mailnews.wraplength");
});

/**
 * Test handling of trailing NBSP.
 */
add_task(async function testNBSP() {
  const identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  const fields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);
  fields.to = "Nobody <nobody@tinderbox.invalid>";
  fields.subject = "Test text wrapping";
  // The character after `test` is NBSP.
  fields.body = "<html><body>åäö test <br></body></html>";
  fields.forcePlainText = true;
  await richCreateMessage(fields, [], identity);

  const msgData = mailTestUtils.loadMessageToUTF16String(
    gDraftFolder,
    mailTestUtils.firstMsgHdr(gDraftFolder)
  );
  Assert.equal(
    getMessageBody(msgData),
    "åäö test",
    "Trailing NBSP should be removed"
  );
});
