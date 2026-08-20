/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for selecting a signing key when the secret key is managed
 * externally (e.g. by GnuPG), so that only the public key is available
 * in our own keyring.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();
});

/**
 * Ofelia's key has a dedicated signing subkey. Import the public key
 * only, which is the situation when the secret key is managed by an
 * external GnuPG configuration. findSuitableSigningKeyID must prefer the
 * signing subkey based on the public key usage attributes, without
 * requiring the secret key material to be available locally.
 */
add_task(async function testFindExternalSigningSubkey() {
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/ofelia-public.asc`)
  );

  const primaryKey = await RNP.findKeyByEmail(
    "<ofelia@openpgp.example>",
    false
  );
  Assert.ok(
    primaryKey && !primaryKey.isNull(),
    "should find Ofelia's public primary key"
  );

  const signingKeyID = RNP.findSuitableSigningKeyID(primaryKey);
  Assert.equal(
    signingKeyID,
    "1BC8F5764D348FE1",
    "should select the signing subkey, even though no secret key is available"
  );
});
