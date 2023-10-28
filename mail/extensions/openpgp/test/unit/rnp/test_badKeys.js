/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for bad OpenPGP keys.
 */

"use strict";

const { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
const { EnigmailEncryption } = ChromeUtils.import(
  "chrome://openpgp/content/modules/encryption.jsm"
);
const { OpenPGPAlias } = ChromeUtils.import(
  "chrome://openpgp/content/modules/OpenPGPAlias.jsm"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const KEY_DIR = "../../../../../test/browser/openpgp/data/keys";

add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

// Attempt to import a key with a single user ID, which is invalid,
// because it doesn't have a valid signature.
// Our code should reject the attempt to import the key.
add_task(async function testFailToImport() {
  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/invalid-pubkey-nosigs.pgp`),
    true
  );
  Assert.ok(!ids.length, "importKey should return empty list of imported keys");
});

// Import a key with two encryption subkeys. One is good, the other one
// has an invalid signature. When attempting to encrypt, our code should
// skip the bad subkey, and should use the expected good subkey.
add_task(async function testAvoidBadSubkey() {
  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/encryption-subkey-bad.pgp`),
    true
  );
  await OpenPGPTestUtils.updateKeyIdAcceptance(
    ids,
    OpenPGPTestUtils.ACCEPTANCE_VERIFIED
  );

  const primaryKey = await RNP.findKeyByEmail(
    "<encryption-subkey@example.org>",
    true
  );
  const encSubKey = RNP.getSuitableSubkey(primaryKey, "encrypt");
  const keyId = RNP.getKeyIDFromHandle(encSubKey);
  Assert.ok(keyId == "BC63472A109D5859", "should obtain key ID of good subkey");
});
