/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the display of OpenPGP signed/encrypted state in opened messages.
 */

"use strict";

const { open_message_from_file } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const {
  close_window,
  plan_for_modal_dialog,
  wait_for_modal_dialog,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");
const {
  assert_notification_displayed,
  get_notification_button,
  wait_for_notification_to_show,
  wait_for_notification_to_stop,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/NotificationBoxHelpers.jsm"
);

const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
const { FileUtils } = ChromeUtils.import(
  "resource://gre/modules/FileUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

const MSG_TEXT = "Sundays are nothing without callaloo.";

function getMsgBodyTxt(mc) {
  let msgPane = mc.window.document.getElementById("messagepane");
  return msgPane.contentDocument.firstChild.textContent;
}

var aliceAcct;
var aliceIdentity;
var initialKeyIdPref = "";

/**
 * Set up the base account, identity and keys needed for the tests.
 */
add_task(async function setupTest() {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "pop3"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
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

  initialKeyIdPref = aliceIdentity.getUnicharAttribute("openpgp_key_id");
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
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/unsigned-unencrypted-from-bob-to-alice.eml")
    )
  );

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );
  close_window(mc);
});

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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    !OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is not displayed"
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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasNoSignedIconState(mc.window.document),
    "signed icon is not displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
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

  Assert.ok(getMsgBodyTxt(mc).includes(MSG_TEXT), "message text is in body");
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unknown"),
    "signed unknown icon is displayed"
  );
  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
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

  // Verify current signature acceptance.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "verified"),
    "signed verified icon is displayed"
  );

  let popupshown = BrowserTestUtils.waitForEvent(
    mc.e("messageSecurityPanel"),
    "popupshown"
  );
  mc.click(mc.eid("encryptionTechBtn"));
  // Wait for the popup panel and signature button to become visible otherwise
  // we can't click on it.
  await popupshown;

  // Open the Key Properties dialog and change the signature acceptance.
  plan_for_modal_dialog("KeyDetailsDialog", dlg => {
    dlg.click(dlg.eid("acceptUnverified"));
    // Wait for all the conditions to run on dialogaccept.
    dlg.waitFor(
      dlg.window.document.documentElement.querySelector("dialog").acceptDialog()
    );
  });

  mc.click(mc.eid("viewSignatureKey"));
  wait_for_modal_dialog("KeyDetailsDialog");

  // Wait for the icon to reload.
  await BrowserTestUtils.waitForAttribute(
    "signed",
    mc.window.document.getElementById("signedHdrIcon"),
    "unverified"
  );

  // Verify the new acceptance level is correct.
  Assert.ok(
    OpenPGPTestUtils.hasSignedIconState(mc.window.document, "unverified"),
    "signed unverified icon is displayed"
  );
  close_window(mc);
});

/**
 * Test the notification and decryption behavior for partially encrypted inline
 * PGP messages.
 */
add_task(async function testPartialInlinePGPDecrypt() {
  // Setup the message.
  let mc = await open_message_from_file(
    new FileUtils.File(
      getTestFilePath("data/eml/alice-partially-encrypted.eml")
    )
  );

  let notificationBox = "mail-notification-top";
  let notificationValue = "decryptInlinePG";

  // Assert the "partially encrypted notification" is visible.
  assert_notification_displayed(mc, notificationBox, notificationValue, true);

  // Click on the "decrypt" button.
  let decryptButton = get_notification_button(
    mc,
    notificationBox,
    notificationValue,
    {
      popup: null,
    }
  );
  EventUtils.synthesizeMouseAtCenter(decryptButton, {}, mc.window);

  // Assert that the message was decrypted and the partial decryption reminder
  // notification is visible.
  wait_for_notification_to_show(mc, notificationBox, "decryptInlinePGReminder");

  Assert.ok(
    OpenPGPTestUtils.hasEncryptedIconState(mc.window.document, "ok"),
    "encrypted icon is displayed"
  );

  close_window(mc);
});

registerCleanupFunction(function tearDown() {
  aliceIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  MailServices.accounts.removeIncomingServer(aliceAcct.incomingServer, true);
});
