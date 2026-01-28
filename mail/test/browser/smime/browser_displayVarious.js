/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that a message containing two nested S/MIME signatures shows
 * the contents of the inner signed message.
 */

"use strict";

var { open_message_from_file, get_about_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

add_task(async function test_display_opaque() {
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
  const filenames = [
    "data/alice.html.sig.SHA256.opaque.eml",
    "data/alice.sig.SHA256.opaque.eml",
    "data/alice.sig.SHA256.opaque.env.eml",
    "data/alice.html.sig.SHA256.opaque.env.eml",
  ];
  for (const filename of filenames) {
    const msgc = await open_message_from_file(
      new FileUtils.File(getTestFilePath(filename))
    );

    const body = getMsgBodyTxt(msgc);

    Assert.ok(
      body.includes("This is a test message from Alice to Bob."),
      "Test message should be shown."
    );

    await BrowserTestUtils.closeWindow(msgc);
  }
});

registerCleanupFunction(() => {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();
});
