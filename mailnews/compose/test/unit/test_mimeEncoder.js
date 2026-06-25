/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test the Content-Transfer-Encoding picked for the main body when
 * forceMsgEncoding is set. For an unobtrusive signature a 7-bit clean body is
 * kept unencoded; otherwise forceMsgEncoding still imposes base64.
 */

const { MimeMessage } = ChromeUtils.importESModule(
  "resource:///modules/MimeMessage.sys.mjs"
);

const UNOBTRUSIVE = {
  signMessage: true,
  requireEncryptMessage: false,
  signFormat: "unobtrusive",
};
const CLASSIC = {
  signMessage: true,
  requireEncryptMessage: false,
  signFormat: "multipart",
};

async function cteFor(bodyText, composeSecure) {
  const compFields = {
    composeSecure,
    forceMsgEncoding: true,
    forcePlainText: false,
    useMultipartAlternative: false,
  };
  const message = new MimeMessage(
    null,
    compFields,
    "",
    "text/plain",
    bodyText,
    0,
    null,
    0,
    [],
    null
  );
  const { plainPart } = message._gatherMainParts("");
  await plainPart.getEncodedBodyString();
  return plainPart
    .getHeaderString()
    .match(/content-transfer-encoding:\s*(\S+)/i)[1]
    .toLowerCase();
}

add_setup(function () {
  // forceMsgEncoding picks base64 for text/plain when flowed.
  Services.prefs.setBoolPref("mailnews.send_plaintext_flowed", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.send_plaintext_flowed");
  });
});

/**
 * For a classic multipart/signed message, forceMsgEncoding still imposes base64
 * even on a 7-bit clean body. This must not change.
 */
add_task(async function testClassicStaysBase64() {
  Assert.equal(
    await cteFor("A short clean ASCII line.\r\n", CLASSIC),
    "base64",
    "classic signature keeps base64 for a clean body"
  );
});

/**
 * For an unobtrusive signature, a 7-bit clean body with short lines stays 7bit,
 * even with trailing whitespace (tolerated by unobtrusive canonicalization).
 */
add_task(async function testUnobtrusiveCleanBodyStays7bit() {
  Assert.equal(
    await cteFor("A short clean ASCII line.\r\n", UNOBTRUSIVE),
    "7bit",
    "clean ASCII body is kept as 7bit"
  );

  Assert.equal(
    await cteFor(
      "A line with trailing whitespace \t\r\nsecond line\r\n",
      UNOBTRUSIVE
    ),
    "7bit",
    "trailing whitespace does not prevent 7bit"
  );
});

/**
 * The unobtrusive relaxation must not weaken protection for content that
 * genuinely needs encoding: non-ASCII, control characters and overlong lines
 * all still yield base64.
 */
add_task(async function testUnobtrusiveUncleanBodyStillEncoded() {
  Assert.equal(
    await cteFor("Non-ASCII: è\r\n", UNOBTRUSIVE),
    "base64",
    "non-ASCII body is still base64"
  );

  Assert.equal(
    await cteFor("Has a control char: \x01\r\n", UNOBTRUSIVE),
    "base64",
    "control character body is still base64"
  );

  Assert.equal(
    await cteFor("x".repeat(1000) + "\r\n", UNOBTRUSIVE),
    "base64",
    "overlong line is still base64"
  );
});
