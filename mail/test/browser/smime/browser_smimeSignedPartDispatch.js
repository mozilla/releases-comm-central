/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Ensure S/MIME messages that contain a multipart/signed part render
 * correctly, no matter at which position in the MIME tree the signed part
 * is found. The handler is picked from the protocol parameter of the part,
 * so this must work on the first stream, without a reload.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const MSG_TEXT = "This is a test message from Alice to Bob.";

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    new FileUtils.File(getTestFilePath("data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Bob.p12")),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Alice.p12")),
    "nss"
  );

  registerCleanupFunction(function () {
    SmimeUtils.removeCertificates(["NSS Test CA (RSA)", "Bob", "Alice"]);
  });
});

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

add_task(async function test_multipart_signed_in_encrypted_renders() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/alice.dsig.SHA256.multipart.env.eml")
    )
  );

  const body = getMsgBodyTxt(msgc);
  Assert.ok(
    body.includes(MSG_TEXT),
    "Decrypted body of the clear-signed-then-enveloped message should be shown."
  );

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * A multipart/signed S/MIME part that isn't the top level part, but a child
 * of a multipart/mixed part, as produced by mailing list software that
 * appends a footer, must be rendered, too.
 */
add_task(async function test_multipart_signed_in_mixed_renders() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/alice.dsig.SHA256.multipart.in.mixed.eml")
    )
  );

  await TestUtils.waitForCondition(
    () => getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "body of the signed part should be shown"
  );
  Assert.ok(
    getMsgBodyTxt(msgc).includes("test-list mailing list"),
    "the unsigned mailing list footer should be shown"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Like the previous test, but the mailing list software has added a header
 * part, too, so the signed part is at MIME part number 1.2.
 */
add_task(async function test_multipart_signed_in_mixed_after_text_renders() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/alice.dsig.SHA256.multipart.in.mixed.with.header.eml"
      )
    )
  );

  await TestUtils.waitForCondition(
    () => getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "body of the signed part should be shown"
  );
  Assert.ok(
    getMsgBodyTxt(msgc).includes("Welcome to the test-list mailing list."),
    "the unsigned mailing list header should be shown"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

registerCleanupFunction(function () {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();
});
