/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests stripping keys.
 */

"use strict";

const { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");
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

add_task(async function testStripSignatures() {
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/heisenberg-signed-by-pinkman.asc`)
  );

  let heisenbergFpr = "8E3D32E652A254F05BEA9F66CF3EB4AFCAC29340";
  let foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);

  Assert.equal(foundKeys.length, 1);

  let sigs = RNP.getKeyObjSignatures(foundKeys[0]);

  // Signatures for one user ID
  Assert.equal(sigs.length, 1);

  // The key in the file has two signatures: one self signature,
  // plus one foreign certification signature.
  Assert.equal(sigs[0].sigList.length, 2);

  let reducedKey = RNP.getMultiplePublicKeys([], ["0x" + heisenbergFpr], []);

  // Delete the key we have previously imported
  await RNP.deleteKey(heisenbergFpr);
  foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);
  Assert.equal(foundKeys.length, 0);

  // Import the reduced key
  let errorObj = {};
  let fingerPrintObj = {};
  let result = await EnigmailKeyRing.importKeyAsync(
    null,
    false,
    reducedKey,
    false,
    null,
    errorObj,
    fingerPrintObj,
    false,
    [],
    false,
    false
  );
  Assert.equal(result, 0);

  foundKeys = await RNP.getKeys(["0x" + heisenbergFpr]);
  Assert.equal(foundKeys.length, 1);

  sigs = RNP.getKeyObjSignatures(foundKeys[0]);

  // The imported stripped key should have only the self signature.
  Assert.equal(sigs[0].sigList.length, 1);
});
