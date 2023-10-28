/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for secret keys.
 */

"use strict";

const { RNP, RnpPrivateKeyUnlockTracker } = ChromeUtils.import(
  "chrome://openpgp/content/modules/RNP.jsm"
);
const { OpenPGPMasterpass } = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
const { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

/**
 * Initialize OpenPGP add testing keys.
 */
add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

add_task(async function testSecretKeys() {
  const pass = await OpenPGPMasterpass.retrieveOpenPGPPassword();
  const newKeyId = await RNP.genKey(
    "Erin <erin@example.com>",
    "ECC",
    0,
    30,
    pass
  );

  Assert.ok(
    newKeyId != null && typeof newKeyId == "string",
    "RNP.genKey() should return a non null string with a key ID"
  );

  let keyObj = EnigmailKeyRing.getKeyById(newKeyId);
  Assert.ok(
    keyObj && keyObj.secretAvailable,
    "EnigmailKeyRing.getKeyById should return an object with a secret key"
  );

  const fpr = keyObj.fpr;

  Assert.ok(
    keyObj.iSimpleOneSubkeySameExpiry(),
    "check iSimpleOneSubkeySameExpiry should succeed"
  );

  const allFingerprints = [fpr, keyObj.subKeys[0].fpr];

  const keyTrackers = [];
  for (const fp of allFingerprints) {
    const tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(fp);
    await tracker.unlock();
    keyTrackers.push(tracker);
  }

  const expiryChanged = await RNP.changeExpirationDate(
    allFingerprints,
    100 * 24 * 60 * 60
  );
  Assert.ok(expiryChanged, "changeExpirationDate should return success");

  for (const t of keyTrackers) {
    t.release();
  }

  const backupPassword = "new-password-1234";

  const backupKeyBlock = await RNP.backupSecretKeys([fpr], backupPassword);

  const expectedString = "END PGP PRIVATE KEY BLOCK";

  Assert.ok(
    backupKeyBlock.includes(expectedString),
    "backup of secret key should contain the string: " + expectedString
  );

  await RNP.deleteKey(fpr, true);

  EnigmailKeyRing.clearCache();

  keyObj = EnigmailKeyRing.getKeyById(newKeyId);
  Assert.ok(
    !keyObj,
    "after deleting the key we should be unable to find it in the keyring"
  );

  let alreadyProvidedWrongPassword = false;

  const getWrongPassword = function (win, keyId, resultFlags) {
    if (alreadyProvidedWrongPassword) {
      resultFlags.canceled = true;
      return "";
    }

    alreadyProvidedWrongPassword = true;
    return "wrong-password";
  };

  let importResult = await RNP.importSecKeyBlockImpl(
    null,
    getWrongPassword,
    false,
    backupKeyBlock
  );

  Assert.ok(importResult.exitCode != 0, "import should have failed");

  const getGoodPassword = function (win, keyId, resultFlags) {
    return backupPassword;
  };

  importResult = await RNP.importSecKeyBlockImpl(
    null,
    getGoodPassword,
    false,
    backupKeyBlock
  );

  Assert.ok(importResult.exitCode == 0, "import result code should be 0");

  keyObj = EnigmailKeyRing.getKeyById(newKeyId);

  Assert.ok(
    keyObj && keyObj.secretAvailable,
    "after import, EnigmailKeyRing.getKeyById should return an object with a secret key"
  );
});

add_task(async function testImportSecretKeyIsProtected() {
  const carolFile = do_get_file(
    `${keyDir}/carol@example.com-0x3099ff1238852b9f-secret.asc`
  );
  const carolSec = await IOUtils.readUTF8(carolFile.path);

  // Carol's secret key is protected with password "x".
  const getCarolPassword = function (win, keyId, resultFlags) {
    return "x";
  };

  let importResult = await RNP.importSecKeyBlockImpl(
    null,
    getCarolPassword,
    false,
    carolSec
  );

  Assert.equal(
    importResult.exitCode,
    0,
    "Should be able to import Carol's secret key"
  );

  const aliceFile = do_get_file(
    `${keyDir}/alice@openpgp.example-0xf231550c4f47e38e-secret.asc`
  );
  const aliceSec = await IOUtils.readUTF8(aliceFile.path);

  // Alice's secret key is unprotected.
  importResult = await RNP.importSecKeyBlockImpl(null, null, false, aliceSec);

  Assert.equal(
    importResult.exitCode,
    0,
    "Should be able to import Alice's secret key"
  );

  const [prot, unprot] = OpenPGPTestUtils.getProtectedKeysCount();
  Assert.notEqual(prot, 0, "Should have protected secret keys");
  Assert.equal(unprot, 0, "Should not have any unprotected secret keys");
});

add_task(async function testImportOfflinePrimaryKey() {
  const importResult = await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}/ofelia-secret-subkeys.asc`)
  );

  Assert.equal(
    importResult[0],
    "0x97DCDA5E56EBB822",
    "expected key id should have been reported"
  );

  const primaryKey = await RNP.findKeyByEmail(
    "<ofelia@openpgp.example>",
    false
  );

  const encSubKey = RNP.getSuitableSubkey(primaryKey, "encrypt");
  const keyId = RNP.getKeyIDFromHandle(encSubKey);
  Assert.equal(
    keyId,
    "31C31DF1DFB67601",
    "should obtain key ID of encryption subkey"
  );

  const sigSubKey = RNP.getSuitableSubkey(primaryKey, "sign");
  const keyIdSig = RNP.getKeyIDFromHandle(sigSubKey);
  Assert.equal(
    keyIdSig,
    "1BC8F5764D348FE1",
    "should obtain key ID of signing subkey"
  );

  // Test that we can sign with a signing subkey
  // (this ensures that our code can unlock the secret subkey).
  // Ofelia's key has no secret key for the primary key available,
  // which further ensures that signing used the subkey.

  const sourceText = "we-sign-this-text";
  const signResult = {};

  const signArgs = {
    aliasKeys: new Map(),
    armor: true,
    bcc: [],
    encrypt: false,
    encryptToSender: false,
    sender: "0x97DCDA5E56EBB822",
    senderKeyIsExternal: false,
    sigTypeClear: true,
    sigTypeDetached: false,
    sign: true,
    signatureHash: "SHA256",
    to: ["<alice@openpgp.example>"],
  };

  await RNP.encryptAndOrSign(sourceText, signArgs, signResult);

  Assert.ok(!signResult.exitCode, "signing with subkey should work");
});

add_task(async function testSecretForPreferredSignSubkeyIsMissing() {
  const secBlock = await IOUtils.readUTF8(
    do_get_file(
      `${keyDir}/secret-for-preferred-sign-subkey-is-missing--a-without-second-sub--sec.asc`
    ).path
  );

  const cancelPassword = function (win, keyId, resultFlags) {
    resultFlags.canceled = true;
    return "";
  };

  let importResult = await RNP.importSecKeyBlockImpl(
    null,
    cancelPassword,
    false,
    secBlock
  );

  Assert.ok(importResult.exitCode == 0);

  const pubBlock = await IOUtils.readUTF8(
    do_get_file(
      `${keyDir}/secret-for-preferred-sign-subkey-is-missing--b-with-second-sub--pub.asc`
    ).path
  );

  importResult = await RNP.importPubkeyBlockAutoAcceptImpl(
    null,
    pubBlock,
    null // acceptance
  );

  Assert.ok(importResult.exitCode == 0);

  const primaryKey = await RNP.findKeyByEmail(
    "<secret-for-preferred-sign-subkey-is-missing@example.com>",
    false
  );

  const signSubKey = RNP.getSuitableSubkey(primaryKey, "sign");
  const keyId = RNP.getKeyIDFromHandle(signSubKey);
  Assert.equal(
    keyId,
    "625D4819F02EE727",
    "should obtain key ID of older, non-preferred subkey that has the secret key available"
  );
});

// If we an existing public key, with multiple subkeys, and then we
// import the secret key, but one of the existing public subkeys is
// missing, test that we don't fail to import (bug 1795698).
add_task(async function testNoSecretForExistingPublicSubkey() {
  const pubBlock = await IOUtils.readUTF8(
    do_get_file(`${keyDir}/two-enc-subkeys-still-both.pub.asc`).path
  );

  let importResult = await RNP.importPubkeyBlockAutoAcceptImpl(
    null,
    pubBlock,
    null // acceptance
  );

  Assert.ok(importResult.exitCode == 0);

  const secBlock = await IOUtils.readUTF8(
    do_get_file(`${keyDir}/two-enc-subkeys-one-deleted.sec.asc`).path
  );

  const cancelPassword = function (win, keyId, resultFlags) {
    resultFlags.canceled = true;
    return "";
  };

  importResult = await RNP.importSecKeyBlockImpl(
    null,
    cancelPassword,
    false,
    secBlock
  );

  Assert.ok(importResult.exitCode == 0);
});

// Sanity check for bug 1790610 and bug 1792450, test that our passphrase
// reading code, which can run through repair code for corrupted profiles,
// will not replace our existing and good data.
// Ideally this test should restart the application, but is is difficult.
// We simulate a restart by erasing the cache and forcing it to read
// data again from disk (which will run the consistency checks and
// could potentially execute the repair code).
add_task(async function testRereadingPassphrase() {
  const pass1 = await OpenPGPMasterpass.retrieveOpenPGPPassword();
  OpenPGPMasterpass.cachedPassword = null;
  const pass2 = await OpenPGPMasterpass.retrieveOpenPGPPassword();
  Assert.equal(
    pass1,
    pass2,
    "openpgp passphrase should remain the same after cache invalidation"
  );
});
