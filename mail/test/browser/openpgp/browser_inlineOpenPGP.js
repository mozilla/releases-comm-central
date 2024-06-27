/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of inline OpenPGP.
 */

"use strict";

const {
  get_about_message,
  open_message_from_file,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { promise_new_window, wait_for_window_focused } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);

function getMsgBodyTxt(msgc) {
  const msgPane = get_about_message(msgc).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
}

/**
 * When testing a scenario that should automatically process the OpenPGP
 * contents (it's not suppressed e.g. because of a partial content),
 * then we need to wait for the automatic processing to complete.
 */
async function openpgpProcessed() {
  const [subject] = await TestUtils.topicObserved(
    "document-element-inserted",
    document => {
      return document.ownerGlobal?.location == "about:message";
    }
  );

  return BrowserTestUtils.waitForEvent(subject, "openpgpprocessed");
}

var aliceAcct;

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_setup(async function () {
  // This test assumes the standalone message window.
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.openMessageBehavior");
  });
});

const INLINE_SIGNED_TEXT = `
-----BEGIN PGP SIGNED MESSAGE-----
Hash: SHA512

àèìòù
-----BEGIN PGP SIGNATURE-----

iQEzBAEBCgAdFiEE0qdgEJpR3689Qr1MDieSjyQbTSAFAmZUSBkACgkQDieSjyQb
TSCUvQgA06lf3Xwhsa7iQrU7kK3COnnoGuRU2OBtLtwjMkV1HEtA/+xNYREqXQgJ
EmApeXgcBGxKRwnWMwkdDSX3q6++i2tXjiSci3dEmdrwsAqj8nAqFvilDfAAGdpX
dOnKawhwK8Lqld0va07Oe9zMeyOfTt/HLMKCnsqB1cORR5M9oj2gtmPz1jFbXGs1
RLP0bPrc1w24ouFM6lBH2lQz5Ldq7mJzc/zraVs4rqr6ddCHj2qmfP1dr4WVV6cz
QLpgDJR/hRbl5IfWJwv6A3Pry5JbfH+YG9caJWB0z8xm/eP6UetUGjbwvo5PYcgX
HPoJ0DZpsU867j+BVbGKshTlOfY2BA==
=zoKi
-----END PGP SIGNATURE-----
`;

/**
 * Test that an message in UTF-8, with inline OpenPGP signature shows
 * correctly. We do no have the key of the signer.
 */
add_task(async function testMessageUTF8() {
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/inline-signed-utf8.eml"))
  );
  const aboutMessage = get_about_message(msgc);

  const bodyText = getMsgBodyTxt(msgc);
  Assert.ok(
    bodyText.includes(INLINE_SIGNED_TEXT),
    "bodyText should be correct"
  );
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "should not show as signed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoEncryptedIconState(aboutMessage.document),
    "should not show as encrypted"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an message in Latin1, with inline OpenPGP signature shows
 * correctly. We do no have the key of the signer.
 */
add_task(async function testMessageUTF8() {
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/inline-signed-latin1.eml"))
  );
  const aboutMessage = get_about_message(msgc);

  const bodyText = getMsgBodyTxt(msgc);
  Assert.ok(
    bodyText.includes(INLINE_SIGNED_TEXT),
    "bodyText should be correct"
  );
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "should not show as signed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoEncryptedIconState(aboutMessage.document),
    "should not show as encrypted"
  );
  await BrowserTestUtils.closeWindow(msgc);
});
