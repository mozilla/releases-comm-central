/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests adding a v4 post-quantum (ML-KEM-768+X25519) encryption subkey
 * to an existing key, and the preconditions that must be met.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { OpenPGPMasterpass } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/masterpass.sys.mjs"
);
const { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

const PQC_ALGO = "ML-KEM-768+X25519";

function reloadKey(keyId) {
  EnigmailKeyRing.clearCache();
  return EnigmailKeyRing.getKeyById(keyId);
}

async function generateEccKey(userId) {
  const pass = await OpenPGPMasterpass.retrieveOpenPGPPassword();
  const keyId = await RNP.genKey(userId, "ECC", 0, 0, pass);
  Assert.ok(keyId, `genKey() should return a key ID for ${userId}`);
  return keyId;
}

add_setup(async function () {
  do_get_profile();
  // Must be set before RNPLib is loaded, it decides which library to
  // load and which functions to declare.
  Services.prefs.setBoolPref("mail.openpgp.use_rnp_experimental", true);
  await OpenPGPTestUtils.initOpenPGP();
  Assert.ok(
    RNP.getRNPLibStatus().path.includes("rnp_experimental"),
    `the experimental RNP library should be loaded, got ${RNP.getRNPLibStatus().path}`
  );
});

/**
 * A classic ECC key with an opted-in email address accepts the PQC
 * subkey, and a second add is refused.
 */
add_task(async function testAddPqcSubkey() {
  const keyId = await generateEccKey(
    "Alice PQC Test <alice-pqc-test@example.com>"
  );

  let keyObj = reloadKey(keyId);
  Assert.ok(keyObj, "generated key should be in the keyring");
  Assert.equal(keyObj.version, 4, "primary key is v4");
  Assert.ok(
    ["ECDSA", "EDDSA", "ED25519"].includes(keyObj.algoSym),
    `primary should be an ECC signing key, got ${keyObj.algoSym}`
  );
  Assert.ok(
    keyObj.subKeys.some(s => /e/.test(s.keyUseFor)),
    "key has an ECC encryption subkey before adding PQC"
  );
  Assert.ok(
    !keyObj.subKeys.some(s => s.algoSym == PQC_ALGO),
    "no PQC subkey exists yet"
  );

  Assert.ok(
    RNP.canGenerateV4PQCEncryptionSubkeyByFpr(keyObj.fpr),
    "preconditions for adding a PQC subkey should be met"
  );

  Assert.ok(
    await RNP.addV4PQCEncryptionSubkey(keyObj.fpr, 0),
    "addV4PQCEncryptionSubkey() should succeed"
  );

  keyObj = reloadKey(keyId);
  const pqcSub = keyObj.subKeys.find(s => s.algoSym == PQC_ALGO);
  Assert.ok(pqcSub, `a new ${PQC_ALGO} subkey must exist`);
  Assert.equal(pqcSub.version, 4, "PQC subkey is v4");
  Assert.ok(/e/.test(pqcSub.keyUseFor), "PQC subkey is encryption-capable");
  Assert.equal(pqcSub.expiryTime, 0, "PQC subkey does not expire");

  // A second add must be refused, the key already has a PQC subkey.
  Assert.ok(
    !RNP.canGenerateV4PQCEncryptionSubkeyByFpr(keyObj.fpr),
    "a key that already has a PQC subkey must be rejected"
  );
  Assert.ok(
    !(await RNP.addV4PQCEncryptionSubkey(keyObj.fpr, 0)),
    "a second PQC subkey add must be refused"
  );
  Assert.equal(
    reloadKey(keyId).subKeys.filter(s => s.algoSym == PQC_ALGO).length,
    1,
    "still exactly one PQC subkey"
  );
});

/**
 * Without an opted-in email address the feature isn't offered.
 */
add_task(async function testRejectWithoutTestAddress() {
  const keyId = await generateEccKey("Bob Normal <bob@example.com>");
  const keyObj = reloadKey(keyId);

  Assert.ok(
    !RNP.canGenerateV4PQCEncryptionSubkeyByFpr(keyObj.fpr),
    "a key without a pqc-test email address must be rejected"
  );
  Assert.ok(
    !(await RNP.addV4PQCEncryptionSubkey(keyObj.fpr, 0)),
    "adding a PQC subkey without a pqc-test email address must be refused"
  );
  Assert.ok(
    !reloadKey(keyId).subKeys.some(s => s.algoSym == PQC_ALGO),
    "no PQC subkey was added"
  );
});

/**
 * An RSA primary key is not supported.
 */
add_task(async function testRejectRsaPrimary() {
  const [keyId] = await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc`)
  );
  Assert.ok(keyId, "RSA test key imported");

  const keyObj = reloadKey(keyId);
  Assert.ok(keyObj, "RSA key is in the keyring");
  Assert.ok(keyObj.algoSym.startsWith("RSA"), "primary is RSA");

  Assert.ok(
    !RNP.canGenerateV4PQCEncryptionSubkeyByFpr(keyObj.fpr),
    "an RSA primary key must be rejected"
  );
  Assert.ok(
    !(await RNP.addV4PQCEncryptionSubkey(keyObj.fpr, 0)),
    "adding a PQC subkey to an RSA primary key must be refused"
  );
  Assert.ok(
    !reloadKey(keyId).subKeys.some(s => s.algoSym == PQC_ALGO),
    "no PQC subkey was added"
  );
});

/**
 * A negative expiration is a programming error, not a silent overflow
 * of the unsigned value that RNP expects.
 */
add_task(async function testRejectNegativeExpiry() {
  const keyId = await generateEccKey(
    "Carol PQC Test <carol+pqc-test@example.com>"
  );
  const keyObj = reloadKey(keyId);

  await Assert.rejects(
    RNP.addV4PQCEncryptionSubkey(keyObj.fpr, -1),
    /invalid expirySeconds/,
    "a negative expiration must be rejected"
  );
});
