/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
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

const MSG_TEXT = "Sundays are nothing without callaloo.";

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
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  const aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);

  // Import and accept the public key for Bob, our verified sender.
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc"
      )
    )
  );
});

/**
 * Test that an unsigned unencrypted message do not show as signed nor encrypted.
 */
add_task(async function testOpenNoPGPSecurity() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unsigned-unencrypted-from-bob-to-alice.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that a signed (only) message, signed by a verified key, shows as such.
 */
add_task(async function testOpenSignedByVerifiedUnencrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that a signed (only) message, signed by a verified key,
 * but with an mismatching email date, is shown with invalid signature.
 */
add_task(async function testOpenSignedDateMismatch() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-mismatch-email-date.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "mismatch"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening an unsigned encrypted message shows as such.
 */
add_task(async function testOpenVerifiedUnsignedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening an attached encrypted message has no effect
 * on security status icons of the parent message window.
 */
add_task(async function testOpenForwardedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/fwd-unsigned-encrypted.eml"))
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(
    getMsgBodyTxt(msgc).includes("wrapper message with plain text"),
    "wrapper message text should be shown"
  );
  Assert.ok(
    !getMsgBodyTxt(msgc).includes(MSG_TEXT),
    "message text should not be shown"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );

  const newWindowPromise = promise_new_window("mail:messageWindow");
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    { clickCount: 1 },
    aboutMessage
  );
  const mc2 = await newWindowPromise;
  await wait_for_message_display_completion(mc2, true);
  await wait_for_window_focused(mc2);
  const aboutMessage2 = get_about_message(mc2);

  // Check properties of the opened attachment window.
  Assert.ok(
    getMsgBodyTxt(mc2).includes(MSG_TEXT),
    "message text should be shown"
  );
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage2.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage2.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(mc2);

  await wait_for_window_focused(msgc);

  // Ensure there were no side effects for the primary window.
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is still not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is still not displayed"
  );

  await BrowserTestUtils.closeWindow(msgc);
});

// TODO: the above tests that an encrypted .eml can be opened from an unencrypted message.
// We should also test/handle:
//  - other attachment (like .doc) in an encrypted message
//  - unencrypted .eml attachment in encrypted message (currently broken - bug 1926607)
//  - encrypted .eml in an encrypted message (currently broken - bug 1926608)

/**
 * Test that opening a message that is signed by a verified key shows as such.
 */
add_task(async function testOpenSignedByVerifiedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening a message that is signed by a verified key, but the From
 * is not what it should be due to multiple From headers, will show mismatch.
 * Here it's signed by Bob, but Eve inserted an From: Eve <eve@openpgp.example>
 * header first. Only first From is used. The second From should not
 * be used for verification.
 */
add_task(async function testOpenSignedEncryptedMultiFrom() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e-multi-from.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "mismatch"),
    "mismatch icon should be displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening a message signed (only) by an unverified key shows as such.
 */
add_task(async function testOpenSignedByUnverifiedUnencrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening a message signed (only) with extra outer layer
 * doesn't show signature state.
 */
add_task(async function testOpenSignedWithOuterLayer() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-with-mailman-footer.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening a message encrypted (only) shows as such.
 */
add_task(async function testOpenUnverifiedUnsignedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0x3099ff1238852b9f.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we decrypt a nested OpenPGP encrypted message
 * (with outer S/MIME signature that is ignored).
 */
add_task(async function testOuterSmimeSigInnerPgpUnverifiedUnsignedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-smime-bad-sig-inner-pgp-enc.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we decrypt a nested OpenPGP encrypted message
 * (with outer OpenPGP signature that is ignored).
 */
add_task(async function testOuterPgpSigInnerPgpUnverifiedUnsignedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we DO NOT decrypt a nested OpenPGP encrypted message
 * at MIME level 3, with an outer signature layer (level 1) and a
 * multipart/mixed in between (level 2).
 * We should not ignore the outer signature in this scenario.
 */
add_task(async function testOuterPgpSigInnerPgpEncryptedInsideMixed() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc-with-mixed.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(!getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening an encrypted message signed by an unverified key is shown
 * as it should.
 */
add_task(async function testOpenSignedByUnverifiedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we decrypt a nested OpenPGP encrypted+signed message
 * (with outer S/MIME signature that is ignored).
 */
add_task(async function testOuterSmimeSigInnerPgpSignedByUnverifiedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-smime-bad-sig-inner-pgp-enc-sig.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we DO NOT decrypt a nested OpenPGP encrypted message
 * at MIME level 3, with an outer signature layer (level 1) and a
 * multipart/mixed in between (level 2).
 * We should not ignore the outer signature in this scenario.
 */
add_task(async function testOuterSmimeSigInnerPgpEncryptedInsideMixed() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-smime-bad-sig-inner-pgp-enc-sig-with-mixed.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(!getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  // Note this is an S/MIME signature status, at the time of writing
  // this test, string "mismatch" is used for status "notok".
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "mismatch"),
    "signed icon with a mismatch status is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that we decrypt a nested OpenPGP encrypted+signed message
 * (with outer OpenPGP signature that is ignored).
 */
add_task(async function testOuterPgpSigOpenSignedByUnverifiedEncrypted() {
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc-sig.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);

  Assert.ok(getMsgBodyTxt(msgc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that the message is properly reloaded and the message security icon is
 * updated if the user changes the signature acceptance level.
 */
add_task(async function testUpdateMessageSignature() {
  // Setup the message.
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  const aboutMessage = get_about_message(msgc);

  // Verify current signature acceptance.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );

  const popupshown = BrowserTestUtils.waitForEvent(
    aboutMessage.document.getElementById("messageSecurityPanel"),
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("encryptionTechBtn"),
    { clickCount: 1 },
    aboutMessage
  );
  // Wait for the popup panel and signature button to become visible otherwise
  // we can't click on it.
  await popupshown;

  // Open the Key Properties dialog and change the signature acceptance.
  const dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");

    if (
      win.document.documentURI !=
      "chrome://openpgp/content/ui/keyDetailsDlg.xhtml"
    ) {
      return false;
    }

    if (Services.focus.activeWindow != win) {
      await BrowserTestUtils.waitForEvent(win, "focus");
    }

    EventUtils.synthesizeMouseAtCenter(
      win.document.querySelector("#acceptUnverified"),
      {},
      win
    );

    const closedPromise = BrowserTestUtils.domWindowClosed(win);
    win.document.documentElement.querySelector("dialog").acceptDialog();
    await closedPromise;
    return true;
  });

  // This will open the key details, the domWindowOpened handler
  // will catch it and execute the changes.
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("viewSignatureKey"),
    { clickCount: 1 },
    aboutMessage
  );

  // Wait until we are done with keyDetailsDlg.
  await dialogPromise;

  // Wait for the signedHdrIcon state to change.

  // Verify the new acceptance level is correct.
  await TestUtils.waitForCondition(
    () =>
      OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unverified"),
    "signed unverified icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

// After test testUpdateMessageSignature acceptance of Bob's key
// has changed from verified to unverified.

/**
 * Test that a signed (only) inline PGP message with UTF-8 characters
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithUTF8() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/alice-utf.eml"))
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(msgc).includes("£35.00"),
    "UTF-8 £35.00 should be found in message"
  );
  await TestUtils.waitForCondition(
    () =>
      OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unverified"),
    "signed unverified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that a signed (only) inline PGP message with leading whitespace
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithLeadingWS() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/signed-inline-indented.eml"))
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(msgc).includes("indent test with £"),
    "expected text 'indent test with £' should be found in message"
  );
  await TestUtils.waitForCondition(
    () =>
      OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unverified"),
    "signed unverified icon should display"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should not display"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an encrypted inline message, with nbsp encoded as qp
 * in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptInlineWithNBSPasQP() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-inline-nbsp-qp.eml"))
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(msgc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "Encrypted icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that an inline message, encoded as html message, with nbsp
 * encoded as qp in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptHtmlWithNBSP() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-html-nbsp.eml"))
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(msgc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "Encrypted icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that opening an encrypted (and signed) message with non-ascii subject
 * and body works.
 */
add_task(async function testOpenAliceToBobEncryptedNonASCII() {
  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/encrypted-and-signed-alice-to-bob-nonascii.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  // Check the subject was properly updated (from ...) in the message header.
  Assert.equal(
    aboutMessage.document.getElementById("expandedsubjectBox").textContent,
    "Subject:Re: kod blå",
    "Non-ascii subject should correct"
  );
  Assert.ok(getMsgBodyTxt(msgc).includes("Detta är krypterat!"));
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "signed verified icon should be displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
});

/**
 * Test that it's possible to decrypt an OpenPGP encrypted message
 * using a revoked key. (Also signed, unknown signer key.)
 */
add_task(async function testOpenEncryptedForRevokedKey() {
  await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/carol@pgp.icu-0xEF2FD01608AFD744-revoked-secret.asc"
      )
    )
  );

  const opengpgprocessed = openpgpProcessed();
  const msgc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/enc-to-carol@pgp.icu-revoked.eml")
    )
  );
  const aboutMessage = get_about_message(msgc);
  await opengpgprocessed;

  Assert.ok(
    getMsgBodyTxt(msgc).includes("billie-jean"),
    "message text is in body"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should be displayed"
  );
  await BrowserTestUtils.closeWindow(msgc);
  await OpenPGPTestUtils.removeKeyById("0xEF2FD01608AFD744", true);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
