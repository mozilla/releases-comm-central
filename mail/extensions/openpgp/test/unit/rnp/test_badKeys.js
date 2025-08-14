/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for bad OpenPGP keys.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);
const { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
const { EnigmailEncryption } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/encryption.sys.mjs"
);
const { OpenPGPAlias } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/OpenPGPAlias.sys.mjs"
);
const { PgpSqliteDb2 } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/sqliteDb.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const KEY_DIR = "../../../../../test/browser/openpgp/data/keys";

add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

/**
 * Attempt to import a key with a single user ID, which is invalid,
 * because it doesn't have a valid signature.
 * Our code should reject the attempt to import the key.
 */
add_task(async function testFailToImport() {
  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/invalid-pubkey-nosigs.pgp`),
    true
  );
  Assert.ok(!ids.length, "importKey should return empty list of imported keys");
});

/**
 * Import a key with two encryption subkeys. One is good, the other one
 * has an invalid signature. When attempting to encrypt, our code should
 * skip the bad subkey, and should use the expected good subkey.
 */
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
  Assert.equal(
    keyId,
    "BC63472A109D5859",
    "should obtain key ID of good subkey"
  );
});

/**
 * Test importing key with comment and empty line after the checksum.
 */
add_task(async function testImportApple() {
  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/apple-pub.asc`),
    true
  );
  Assert.equal(ids.length, 1, "should have imported the key");
  await OpenPGPTestUtils.updateKeyIdAcceptance(
    ids,
    OpenPGPTestUtils.ACCEPTANCE_VERIFIED
  );

  // Note: the key we're testing has expired in Aug 2025.
  const primaryKeyId = EnigmailKeyRing.getKeysByEmail(
    "product-security@apple.com",
    true,
    true
  )[0].keyId;
  Assert.equal(primaryKeyId, "5FEE5DD535DA22FA", "should find primary key");
});

/**
 * Test importing binary key that ends with a whitespace.
 */
add_task(async function testImportBinaryPubSpace() {
  // Note: This key artifact includes subpacket 39 (v6 preferred AEAD
  // ciphersuites), which support is defined only in RFC 9580.

  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(
      `${KEY_DIR}/DC1A523730F62AE8-pub-does_not_expire-ends_with_whitespace.pgp`
    ),
    true
  );
  Assert.equal(ids.length, 1, "should have imported the key");
  Assert.equal(ids[0], "0xDC1A523730F62AE8", "should be the correct key");
  await OpenPGPTestUtils.updateKeyIdAcceptance(
    ids,
    OpenPGPTestUtils.ACCEPTANCE_VERIFIED
  );

  const primaryKey = await RNP.findKeyByEmail("<test@example.com>", true);
  Assert.ok(primaryKey, "should find primary key");
  const encSubKey = RNP.getSuitableSubkey(primaryKey, "encrypt");
  const keyId = RNP.getKeyIDFromHandle(encSubKey);
  Assert.equal(
    keyId,
    "653B0BC4ADE0A239",
    "should find correct encryption subkey"
  );
});

/**
 * Import a key with the "Accepted (unverified)" option, then import a newer
 * version of that key that contains a new identity with the "Accepted
 * (unverified)" option.
 * After these operations, the new email address should be accepted.
 */
add_task(async function testImportUnverifiedWithNewIdentity() {
  const keyId = "D4ED849BCD779DFC";
  const newEmail = "<test2@example.com>";

  const idsBefore = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/D4ED849BCD779DFC-before-new-identity.asc`),
    false,
    OpenPGPTestUtils.ACCEPTANCE_UNVERIFIED
  );
  Assert.equal(
    idsBefore[0],
    `0x${keyId}`,
    "should be the correct key at initial import"
  );
  const foundKeyBefore = await RNP.findKeyByEmail(newEmail, true);
  Assert.equal(
    foundKeyBefore,
    null,
    "should not find a key for the new identity before the second import"
  );

  const idsAfter = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/D4ED849BCD779DFC-after-new-identity.asc`),
    false,
    OpenPGPTestUtils.ACCEPTANCE_UNVERIFIED
  );
  Assert.equal(
    idsAfter[0],
    `0x${keyId}`,
    "should be the correct key at second import"
  );
  const foundKeyAfter = await RNP.findKeyByEmail(newEmail, true);
  Assert.ok(
    foundKeyAfter,
    "should find a key for the new identity after the second import"
  );
  const foundKeyId = RNP.getKeyIDFromHandle(foundKeyAfter);
  Assert.equal(foundKeyId, keyId, "should be the correct key");
});

/**
 * After importing a newer version of an existing key non-interactively,
 * the new email addresses on the key should be undecided.
 */
add_task(async function testImportNewEmailNonInteractively() {
  const keyId = "D4ED849BCD779DFC";
  const newEmail = "<test2@example.com>";
  const acceptanceTypes = [
    OpenPGPTestUtils.ACCEPTANCE_REJECTED,
    OpenPGPTestUtils.ACCEPTANCE_UNVERIFIED,
    OpenPGPTestUtils.ACCEPTANCE_VERIFIED,
  ];

  for (const acceptance of acceptanceTypes) {
    const idsBefore = await OpenPGPTestUtils.importKey(
      null,
      do_get_file(`${KEY_DIR}/D4ED849BCD779DFC-before-new-identity.asc`),
      false,
      acceptance
    );
    Assert.equal(
      idsBefore[0],
      `0x${keyId}`,
      `should be the correct key at initial import (acceptance: ${acceptance})`
    );

    const data = await IOUtils.read(
      do_get_file(`${KEY_DIR}/D4ED849BCD779DFC-after-new-identity.asc`).path
    );
    const importResult = await EnigmailKeyRing.importKeyDataSilent(
      null,
      MailStringUtils.uint8ArrayToByteString(data),
      false
    );
    Assert.ok(
      importResult,
      `second import should succeed (initial acceptance: ${acceptance})`
    );
    const foundKeyAfter = await RNP.findKeyByEmail(newEmail, false);
    Assert.ok(
      foundKeyAfter,
      `should find a key for the new identity after the second import (initial acceptance: ${acceptance})`
    );

    const fingerprint = RNP.getFingerprintFromHandle(foundKeyAfter);
    const acceptanceObj = {};
    await PgpSqliteDb2.getAcceptance(fingerprint, newEmail, acceptanceObj);
    const decided = acceptanceObj.emailDecided;
    Assert.ok(
      !decided,
      `new identity should be undecided after the second import (initial acceptance: ${acceptance})`
    );

    await RNP.deleteKey(fingerprint, false);
  }
});
