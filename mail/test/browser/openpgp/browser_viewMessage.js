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
const { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
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
    "example.com",
    "pop3"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@example.com";
  aliceAcct.addIdentity(aliceIdentity);

  // Set up the alice's private key.
  let [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@example.com-0xf2823b8f6c9a7553-secret.asc"
      )
    )
  );

  initialKeyIdPref = aliceIdentity.getUnicharAttribute("openpgp_key_id");
  aliceIdentity.setUnicharAttribute("openpgp_key_id", id);

  // Import and accept the public key for Bob, our verified sender.
  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath("data/keys/bob@example.com-0x4b6454a0c3cb51d0-pub.asc")
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
        "data/eml/signed-by-0x4b6454a0c3cb51d0-to-0xf2823b8f6c9a7553-unencrypted.eml"
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
        "data/eml/unsigned-encrypted-to-0xf2823b8f6c9a7553-from-0x4b6454a0c3cb51d0.eml"
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
        "data/eml/signed-by-0x4b6454a0c3cb51d0-encrypted-to-0xf2823b8f6c9a7553.eml"
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
        "data/eml/signed-by-0x3099ff1238852b9f-to-0xf2823b8f6c9a7553-unencrypted.eml"
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
        "data/eml/unsigned-encrypted-to-0xf2823b8f6c9a7553-from-0x3099ff1238852b9f.eml"
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
        "data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf2823b8f6c9a7553.eml"
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

registerCleanupFunction(function tearDown() {
  aliceIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  MailServices.accounts.removeIncomingServer(aliceAcct.incomingServer, true);
});
