/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Ensure an S/MIME message with outer encryption and inner signature
 * renders correctly, if the OpenPGP handler is the currently active
 * handler for multipart/signed.
 */

"use strict";

var { get_about_message, open_message_from_file } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);
var { EnigmailVerify } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/mimeVerify.sys.mjs"
);
var { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);

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
    const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
      Ci.nsIX509CertDB
    );
    for (const cert of certDB.getCerts()) {
      if (["NSS Test CA (RSA)", "Bob", "Alice"].includes(cert.commonName)) {
        certDB.deleteCertificate(cert);
      }
    }
  });
});

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

add_task(async function test_multipart_signed_in_encrypted_renders() {
  // Set the OpenPGP handler as the active handler.
  EnigmailVerify.registerPGPMimeHandler();
  Assert.equal(
    EnigmailVerify.currentCtHandler,
    EnigmailConstants.MIME_HANDLER_PGPMIME,
    "PGP/MIME handler should be registered before opening the message"
  );

  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/alice.dsig.SHA256.multipart.env.eml")
    )
  );

  const body = getMsgBodyTxt(msgc);
  Assert.ok(
    body.includes("This is a test message from Alice to Bob."),
    "Decrypted body of the clear-signed-then-enveloped message should be shown."
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
