/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for secret keys.
 */

"use strict";

const { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");
const { OpenPGPMasterpass } = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
const { FileUtils } = ChromeUtils.import(
  "resource://gre/modules/FileUtils.jsm"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

/**
 * Initialize OpenPGP add testing keys.
 */
add_task(async function setUp() {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

add_task(async function testSecretKeys() {
  let pass = await OpenPGPMasterpass.retrieveOpenPGPPassword();
  let newKeyId = await RNP.genKey(
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

  let fpr = keyObj.fpr;

  let fprInfo = {};
  Assert.ok(
    keyObj.iSimpleOneSubkeySameExpiry(fprInfo),
    "check iSimpleOneSubkeySameExpiry should succeed"
  );

  Assert.ok(
    fprInfo.fingerprints.length == 2,
    "fprInfo.fingerprints should contain 2 elements"
  );

  let expiryChanged = await RNP.changeExpirationDate(
    fprInfo.fingerprints,
    100 * 24 * 60 * 60
  );
  Assert.ok(expiryChanged, "changeExpirationDate should return success");

  let backupPassword = "new-password-1234";

  let backupKeyBlock = await RNP.backupSecretKeys(["0x" + fpr], backupPassword);

  let expectedString = "END PGP PRIVATE KEY BLOCK";

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

  let getWrongPassword = function(win, keyId, resultFlags) {
    if (alreadyProvidedWrongPassword) {
      resultFlags.canceled = true;
      return "";
    }

    alreadyProvidedWrongPassword = true;
    return "wrong-password";
  };

  let importResult = await RNP.importKeyBlockImpl(
    null,
    getWrongPassword,
    backupKeyBlock,
    false,
    true
  );

  Assert.ok(importResult.exitCode != 0, "import should have failed");

  let getGoodPassword = function(win, keyId, resultFlags) {
    return backupPassword;
  };

  importResult = await RNP.importKeyBlockImpl(
    null,
    getGoodPassword,
    backupKeyBlock,
    false,
    true
  );

  Assert.ok(importResult.exitCode == 0, "import result code should be 0");

  keyObj = EnigmailKeyRing.getKeyById(newKeyId);

  Assert.ok(
    keyObj && keyObj.secretAvailable,
    "after import, EnigmailKeyRing.getKeyById should return an object with a secret key"
  );
});

add_task(async function testImportSecretKeyIsProtected() {
  let carolFile = do_get_file(
    `${keyDir}/carol@example.com-0x3099ff1238852b9f-secret.asc`
  );
  let carolSec = await IOUtils.readUTF8(carolFile.path);

  // Carol's secret key is protected with password "x".
  let getCarolPassword = function(win, keyId, resultFlags) {
    return "x";
  };

  let importResult = await RNP.importKeyBlockImpl(
    null,
    getCarolPassword,
    carolSec,
    false,
    true
  );

  Assert.equal(
    importResult.exitCode,
    0,
    "Should be able to import Carol's secret key"
  );

  let aliceFile = do_get_file(
    `${keyDir}/alice@openpgp.example-0xf231550c4f47e38e-secret.asc`
  );
  let aliceSec = await IOUtils.readUTF8(aliceFile.path);

  // Alice's secret key is unprotected.
  importResult = await RNP.importKeyBlockImpl(
    null,
    null,
    aliceSec,
    false,
    true
  );

  Assert.equal(
    importResult.exitCode,
    0,
    "Should be able to import Alice's secret key"
  );

  let [prot, unprot] = OpenPGPTestUtils.getProtectedKeysCount();
  Assert.notEqual(prot, 0, "Should have protected secret keys");
  Assert.equal(unprot, 0, "Should not have any unprotected secret keys");
});

add_task(async function testImportOfflinePrimaryKey() {
  let keyBlock = await IOUtils.readUTF8(
    do_get_file(`${keyDir}/ofelia-secret-subkeys.asc`).path
  );

  let cancelPassword = function(win, keyId, resultFlags) {
    resultFlags.canceled = true;
    return "";
  };

  let importResult = await RNP.importKeyBlockImpl(
    null,
    cancelPassword,
    keyBlock,
    false,
    true
  );

  Assert.ok(importResult.exitCode == 0);

  let primaryKey = await RNP.findKeyByEmail("<ofelia@openpgp.example>", false);

  let encSubKey = RNP.getSuitableSubkey(primaryKey, "encrypt");
  let keyId = RNP.getKeyIDFromHandle(encSubKey);
  Assert.equal(
    keyId,
    "31C31DF1DFB67601",
    "should obtain key ID of encryption subkey"
  );
});

add_task(async function testSecretForPreferredSignSubkeyIsMissing() {
  let secBlock = await IOUtils.readUTF8(
    do_get_file(
      `${keyDir}/secret-for-preferred-sign-subkey-is-missing--a-without-second-sub--sec.asc`
    ).path
  );

  let cancelPassword = function(win, keyId, resultFlags) {
    resultFlags.canceled = true;
    return "";
  };

  let importResult = await RNP.importKeyBlockImpl(
    null,
    cancelPassword,
    secBlock,
    false,
    true
  );

  Assert.ok(importResult.exitCode == 0);

  let pubBlock = await IOUtils.readUTF8(
    do_get_file(
      `${keyDir}/secret-for-preferred-sign-subkey-is-missing--b-with-second-sub--pub.asc`
    ).path
  );

  importResult = await RNP.importKeyBlockImpl(
    null,
    cancelPassword,
    pubBlock,
    true,
    false
  );

  Assert.ok(importResult.exitCode == 0);

  let primaryKey = await RNP.findKeyByEmail(
    "<secret-for-preferred-sign-subkey-is-missing@example.com>",
    false
  );

  let signSubKey = RNP.getSuitableSubkey(primaryKey, "sign");
  let keyId = RNP.getKeyIDFromHandle(signSubKey);
  Assert.equal(
    keyId,
    "625D4819F02EE727",
    "should obtain key ID of older, non-preferred subkey that has the secret key available"
  );
});
