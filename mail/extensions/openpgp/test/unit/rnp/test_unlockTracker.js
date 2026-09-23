/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for RnpPrivateKeyUnlockTracker, and for the operations that must
 * refuse to run on a key whose secret key material isn't available
 * locally. Such a key is tracked as "not locked", so that automatic
 * handle releasing works for code that sometimes tracks a secret key and
 * sometimes only a public key, which means isUnlocked() must additionally
 * require that the secret key material is available.
 */

"use strict";

const { RNP, RnpPrivateKeyUnlockTracker } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

// Ofelia's secret key was exported with "gpg --export-secret-subkeys",
// so the secret key material of the primary key is missing, while the
// secret key material of the subkeys is available.
const OFELIA_KEY_ID = "0x97DCDA5E56EBB822";

const BOB_KEY_ID = "0xFBFCC82A015E7330";

add_setup(async function () {
  do_get_profile();
  await OpenPGPTestUtils.initOpenPGP();

  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc`)
  );
  await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}/ofelia-secret-subkeys.asc`)
  );
});

add_task(async function testPublicKeyIsNeverUnlocked() {
  const keyObj = EnigmailKeyRing.getKeyById(BOB_KEY_ID);
  Assert.ok(keyObj, "should have found Bob's key");
  Assert.ok(!keyObj.secretAvailable, "should have Bob's public key only");

  const tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
    keyObj.fpr
  );
  try {
    Assert.ok(!tracker.isSecret(), "a public key isn't a secret key");
    Assert.ok(!tracker.available(), "a public key has no secret key material");
    Assert.ok(
      !tracker.isUnlocked(),
      "a public key must not report that it is unlocked"
    );
    await tracker.unlock();
    Assert.ok(
      !tracker.isUnlocked(),
      "a public key must not report that it is unlocked after unlock()"
    );
  } finally {
    tracker.release();
  }
});

add_task(async function testOfflinePrimaryKeyCannotBeUnlocked() {
  const keyObj = EnigmailKeyRing.getKeyById(OFELIA_KEY_ID);
  Assert.ok(keyObj, "should have found Ofelia's key");
  Assert.ok(keyObj.secretAvailable, "should be a secret key");
  Assert.ok(
    !keyObj.secretMaterial,
    "the primary key's secret key material should be missing"
  );

  const primaryKey = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
    keyObj.fpr
  );
  try {
    Assert.ok(primaryKey.isSecret(), "should be flagged as a secret key");
    Assert.ok(
      !primaryKey.available(),
      "the primary key's secret key material isn't available"
    );
    Assert.ok(
      !primaryKey.isUnlocked(),
      "a key that cannot be unlocked must not report that it is unlocked"
    );
    await primaryKey.unlock();
    Assert.ok(
      !primaryKey.isUnlocked(),
      "unlock() must not make it report that it is unlocked"
    );
  } finally {
    primaryKey.release();
  }

  Assert.greater(keyObj.subKeys.length, 0, "should have subkeys");
  for (const subKeyObj of keyObj.subKeys) {
    const subKey = RnpPrivateKeyUnlockTracker.constructFromFingerprint(
      subKeyObj.fpr
    );
    try {
      Assert.ok(
        subKey.available(),
        `secret key material of subkey ${subKeyObj.keyId} should be available`
      );
      await subKey.unlock();
      Assert.ok(
        subKey.isUnlocked(),
        `subkey ${subKeyObj.keyId} should be unlocked`
      );
    } finally {
      subKey.release();
    }
  }
});

add_task(async function testOfflinePrimaryKeyRefusesExpirationChange() {
  let keyObj = EnigmailKeyRing.getKeyById(OFELIA_KEY_ID);
  const originalExpiry = keyObj.expiryTime;

  const later = new Date();
  later.setDate(later.getDate() + 100);

  const changed = await RNP.changeKeyExpiration(keyObj, null, later);
  Assert.ok(
    !changed,
    "changing the expiration date should fail without the primary secret key material"
  );

  EnigmailKeyRing.clearCache();
  keyObj = EnigmailKeyRing.getKeyById(OFELIA_KEY_ID);
  Assert.equal(
    keyObj.expiryTime,
    originalExpiry,
    "the expiration date should be unchanged"
  );
});

add_task(async function testOfflinePrimaryKeyRefusesRevocation() {
  await Assert.rejects(
    RNP.unlockAndGetNewRevocation(OFELIA_KEY_ID, null),
    /Couldn't unlock key/,
    "creating a revocation should fail without the primary secret key material"
  );
});
