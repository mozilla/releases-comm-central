/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
 */

"use strict";

/*
 * This file contains S/MIME tests that should be enabled once
 * bug 1806161 gets fixed.
 */

const {
  get_about_message,
  open_message_from_file,
  wait_for_message_display_completion,
  // TODO: Enable for S/MIME test
  //  smimeUtils_ensureNSS,
  //  smimeUtils_loadCertificateAndKey,
  //  smimeUtils_loadPEMCertificate,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { async_plan_for_new_window, close_window, wait_for_window_focused } =
  ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");
const { waitForCondition } = ChromeUtils.import(
  "resource://testing-common/mozmill/utils.jsm"
);
const { get_notification_button, wait_for_notification_to_show } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
  );

const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");

const MSG_TEXT = "Sundays are nothing without callaloo.";
// TODO: Enable for S/MIME test
//const MSG_TEXT_SMIME = "This is a test message from Alice to Bob.";

function getMsgBodyTxt(mc) {
  let msgPane = get_about_message(mc.window).getMessagePaneBrowser();
  return msgPane.contentDocument.documentElement.textContent;
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
  let aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  let [id] = await OpenPGPTestUtils.importPrivateKey(
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

  // TODO: Enable for S/MIME test
  /*
  smimeUtils_ensureNSS();
  smimeUtils_loadPEMCertificate(
    new FileUtils.File(getTestFilePath("../smime/data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  smimeUtils_loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("../smime/data/Bob.p12"))
  );
*/
});

/**
 * Test that an unsigned unencrypted message do not show as signed nor encrypted.
 */
add_task(async function testOpenNoPGPSecurity() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unsigned-unencrypted-from-bob-to-alice.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that a signed (only) message, signed by a verified key, shows as such.
 */
add_task(async function testOpenSignedByVerifiedUnencrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that a signed (only) message, signed by a verified key,
 * but with an mismatching email date, is shown with invalid signature.
 */
add_task(async function testOpenSignedDateMismatch() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-mismatch-email-date.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "mismatch"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an unsigned encrypted message shows as such.
 */
add_task(async function testOpenVerifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an attached encrypted message has no effect
 * on security status icons of the parent message window.
 */
add_task(async function testOpenForwardedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/fwd-unsigned-encrypted.eml"))
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(
    getMsgBodyTxt(mc).includes("wrapper message with plain text"),
    "wrapper message text should be shown"
  );
  Assert.ok(
    !getMsgBodyTxt(mc).includes(MSG_TEXT),
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

  let newWindowPromise = async_plan_for_new_window("mail:messageWindow");
  EventUtils.synthesizeMouseAtCenter(
    aboutMessage.document.getElementById("attachmentName"),
    { clickCount: 1 },
    aboutMessage
  );
  let mc2 = await newWindowPromise;
  wait_for_message_display_completion(mc2, true);
  wait_for_window_focused(mc2.window);
  let aboutMessage2 = get_about_message(mc2.window);

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
  close_window(mc2);

  wait_for_window_focused(mc.window);

  // Ensure there were no side effects for the primary window.
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is still not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is still not displayed"
  );

  close_window(mc);
}).skip(); // TODO: broken functionality - bug 1837247

/**
 * Test that opening a message that is signed by a verified key shows as such.
 */
add_task(async function testOpenSignedByVerifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message that is signed by a verified key, but the From
 * is not what it should be due to multiple From headers, will show mismatch.
 * Here it's signed by Bob, but Eve inserted an From: Eve <eve@openpgp.example>
 * header first. Only first From is used. The second From should not
 * be used for verification.
 */
add_task(async function testOpenSignedEncryptedMultiFrom() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e-multi-from.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "mismatch"),
    "mismatch icon should be displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon should be displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message signed (only) by an unverified key shows as such.
 */
add_task(async function testOpenSignedByUnverifiedUnencrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message signed (only) with extra outer layer
 * doesn't show signature state.
 */
add_task(async function testOpenSignedWithOuterLayer() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/signed-with-mailman-footer.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening a message encrypted (only) shows as such.
 */
add_task(async function testOpenUnverifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0x3099ff1238852b9f.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * -- FUNCTIONALITY NOT YET IMPLEMENTED --
 * Test that we decrypt a nested S/MIME encrypted message
 * (with outer S/MIME signature that is ignored).
 */
/*
add_task(async function testOuterSmimeSigInnerSmimeUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-smime-bad-sig-inner-smime-enc.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT_SMIME), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});
*/

/**
 * Test that we decrypt a nested OpenPGP encrypted message
 * (with outer S/MIME signature that is ignored).
 */
add_task(async function testOuterSmimeSigInnerPgpUnverifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-smime-bad-sig-inner-pgp-enc.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * -- FUNCTIONALITY NOT YET IMPLEMENTED --
 * Test that we decrypt a nested S/MIME encrypted message
 * (with outer OpenPGP signature that is ignored).
 */
/*
add_task(async function testOuterPgpSigInnerSmimeUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-pgp-sig-inner-smime-enc.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT_SMIME), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});
*/

/**
 * Test that we decrypt a nested OpenPGP encrypted message
 * (with outer OpenPGP signature that is ignored).
 */
add_task(async function testOuterPgpSigInnerPgpUnverifiedUnsignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that we DO NOT decrypt a nested OpenPGP encrypted message
 * at MIME level 3, with an outer signature layer (level 1) and a
 * multipart/mixed in between (level 2).
 * We should not ignore the outer signature in this scenario.
 */
add_task(async function testOuterPgpSigInnerPgpEncryptedInsideMixed() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc-with-mixed.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(!getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an encrypted message signed by an unverified key is shown
 * as it should.
 */
add_task(async function testOpenSignedByUnverifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * -- FUNCTIONALITY NOT YET IMPLEMENTED --
 * Test that we decrypt a nested S/MIME encrypted+signed message
 * (with outer S/MIME signature that is ignored).
 */
/*
add_task(async function testOuterSmimeSigInnerSmimeSignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-smime-bad-sig-inner-smime-enc-sig.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT_SMIME), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});
*/

/**
 * Test that we decrypt a nested OpenPGP encrypted+signed message
 * (with outer S/MIME signature that is ignored).
 */
add_task(async function testOuterSmimeSigInnerPgpSignedByUnverifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-smime-bad-sig-inner-pgp-enc-sig.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that we DO NOT decrypt a nested OpenPGP encrypted message
 * at MIME level 3, with an outer signature layer (level 1) and a
 * multipart/mixed in between (level 2).
 * We should not ignore the outer signature in this scenario.
 */
add_task(async function testOuterSmimeSigInnerPgpEncryptedInsideMixed() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-smime-bad-sig-inner-pgp-enc-sig-with-mixed.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(!getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(aboutMessage.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is not displayed"
  );
  close_window(mc);
});

/**
 * -- FUNCTIONALITY NOT YET IMPLEMENTED --
 * Test that we decrypt a nested S/MIME encrypted+signed message
 * (with outer OpenPGP signature that is ignored).
 */
/*
add_task(async function testOuterPgpSigInnerSmimeSignedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/outer-pgp-sig-inner-smime-enc-sig.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT_SMIME), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});
*/

/**
 * Test that we decrypt a nested OpenPGP encrypted+signed message
 * (with outer OpenPGP signature that is ignored).
 */
add_task(async function testOuterPgpSigOpenSignedByUnverifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/outer-pgp-sig-inner-pgp-enc-sig.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

/**
 * Test that the message is properly reloaded and the message security icon is
 * updated if the user changes the signature acceptance level.
 */
add_task(async function testUpdateMessageSignature() {
  // Setup the message.
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml"
      )
    )
  );
  let aboutMessage = get_about_message(mc.window);

  // Verify current signature acceptance.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "verified"),
    "signed verified icon is displayed"
  );

  let popupshown = BrowserTestUtils.waitForEvent(
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
  let dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
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

    let closedPromise = BrowserTestUtils.domWindowClosed(win);
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
  close_window(mc);
});

// After test testUpdateMessageSignature acceptance of Bob's key
// has changed from verified to unverified.

/**
 * Test that a signed (only) inline PGP message with UTF-8 characters
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithUTF8() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/alice-utf.eml"))
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(
    getMsgBodyTxt(mc).includes("£35.00"),
    "UTF-8 character found in message"
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
  close_window(mc);
});

/**
 * Test that a signed (only) inline PGP message with leading whitespace
 * can be correctly verified.
 */
add_task(async function testOpenSignedInlineWithLeadingWS() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/signed-inline-indented.eml"))
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(
    getMsgBodyTxt(mc).includes("indent test with £"),
    "expected text should be found in message"
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
  close_window(mc);
}).skip(); // TODO: broken functionality, the message shows invalid sig

/**
 * Test that an encrypted inline message, with nbsp encoded as qp
 * in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptInlineWithNBSPasQP() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-inline-nbsp-qp.eml"))
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(
    getMsgBodyTxt(mc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "Encrypted icon should be displayed"
  );
  close_window(mc);
});

/**
 * Test that an inline message, encoded as html message, with nbsp
 * encoded as qp in the PGP separator line, is trimmed and decrypted.
 */
add_task(async function testDecryptHtmlWithNBSP() {
  let mc = await open_message_from_file(
    new FileUtils.File(getTestFilePath("data/eml/bob-enc-html-nbsp.eml"))
  );
  let aboutMessage = get_about_message(mc.window);

  Assert.ok(
    getMsgBodyTxt(mc).includes("My real name is not Bob."),
    "Secret text should be contained in message"
  );
  await TestUtils.waitForCondition(
    () => OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "Encrypted icon should be displayed"
  );
  close_window(mc);
});

/**
 * Test that opening an encrypted (and signed) message with non-ascii subject
 * and body works.
 */
add_task(async function testOpenSignedByUnverifiedEncrypted() {
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/encrypted-and-signed-alice-to-bob-nonascii.eml")
    )
  );
  let aboutMessage = get_about_message(mc.window);

  // Check the subject was properly updated (from ...) in the message header.
  Assert.equal(
    aboutMessage.document.getElementById("expandedsubjectBox").textContent,
    "Subject:Re: kod blå",
    "Non-ascii subject should correct"
  );
  Assert.ok(getMsgBodyTxt(mc).includes("Detta är krypterat!"));
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(aboutMessage.document, "ok"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(aboutMessage.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

registerCleanupFunction(async function tearDown() {
  MailServices.accounts.removeAccount(aliceAcct, true);
  await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
});
