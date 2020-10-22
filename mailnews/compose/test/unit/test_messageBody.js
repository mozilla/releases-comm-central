/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test suite for message body.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

add_task(async function setup() {
  localAccountUtils.loadLocalMailAccount();
});

/**
 * Test trailing whitespace is QP encoded.
 */
add_task(async function testQP() {
  // Together with fields.forceMsgEncoding, force quote-printable encoding.
  Services.prefs.setBoolPref("mail.strictly_mime", true);

  let identity = getSmtpIdentity(
    "from@tinderbox.invalid",
    getBasicSmtpServer()
  );
  let CompFields = CC(
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

  Services.prefs.clearUserPref("mail.strictly_mime");
});
