/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests stripping keys.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);
const { MailStringUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailStringUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

/**
 * Initialize OpenPGP add testing keys.
 */
add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

add_task(async function testStripSignatures() {
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/heisenberg-signed-by-pinkman.asc`)
  );

  const heisenbergFpr = "8E3D32E652A254F05BEA9F66CF3EB4AFCAC29340";
  let foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);

  Assert.equal(foundKeys.length, 1);

  let sigs = RNP.getKeyObjSignatures(foundKeys[0]);

  // Signatures for one user ID
  Assert.equal(sigs.length, 1);

  // The key in the file has two signatures: one self signature,
  // plus one foreign certification signature.
  Assert.equal(sigs[0].sigList.length, 2);

  const reducedKey = RNP.getMultiplePublicKeys([], ["0x" + heisenbergFpr], []);

  // Delete the key we have previously imported
  await RNP.deleteKey(heisenbergFpr);
  foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);
  Assert.equal(foundKeys.length, 0);

  // Import the reduced key
  const errorObj = {};
  const fingerPrintObj = {};
  const result = await EnigmailKeyRing.importKeyAsync(
    null,
    false,
    reducedKey,
    false,
    null,
    errorObj,
    fingerPrintObj,
    false,
    [],
    false
  );
  Assert.equal(result, 0);

  foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);
  Assert.equal(foundKeys.length, 1);

  sigs = RNP.getKeyObjSignatures(foundKeys[0]);

  // The imported stripped key should have only the self signature.
  Assert.equal(sigs[0].sigList.length, 1);
});

add_task(async function testKeyWithUnicodeComment() {
  const keyFile = do_get_file(`${keyDir}/key-with-utf8-comment.asc`);
  const keyBlock = await IOUtils.readUTF8(keyFile.path);

  const errorObj = {};
  const fingerPrintObj = {};
  const result = await EnigmailKeyRing.importKeyAsync(
    null,
    false,
    keyBlock,
    false,
    null,
    errorObj,
    fingerPrintObj,
    false,
    [],
    false
  );
  Assert.equal(result, 0);

  const fpr = "72514F43D0060FC588E80238852C55E6D2AFD7EF";
  const foundKeys = await RNP.getKeys(["0x" + fpr]);

  Assert.equal(foundKeys.length, 1);
});

add_task(async function testBinaryKey() {
  const keyFile = do_get_file(`${keyDir}/key-binary.gpg`);
  const keyData = await IOUtils.read(keyFile.path);
  const keyBlock = MailStringUtils.uint8ArrayToByteString(keyData);

  const errorObj = {};
  const fingerPrintObj = {};
  const result = await EnigmailKeyRing.importKeyAsync(
    null,
    false,
    keyBlock,
    true,
    null,
    errorObj,
    fingerPrintObj,
    false,
    [],
    false
  );
  Assert.equal(result, 0);

  const fpr = "683F775BA2E5F0ADEBB29697A2D1B914F722004E";
  const foundKeys = await RNP.getKeys(["0x" + fpr]);

  Assert.equal(foundKeys.length, 1);
});
