/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for secret keys.
 */

"use strict";

const { OS } = ChromeUtils.import("resource://gre/modules/osfile.jsm");
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
