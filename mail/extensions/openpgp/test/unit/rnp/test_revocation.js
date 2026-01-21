/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests regarding revocations of OpenPGP keys.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
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
 * Test revocation reason.
 */
add_task(async function testRevocationReason() {
  const ids = await OpenPGPTestUtils.importKey(
    null,
    do_get_file(`${KEY_DIR}/revoked-then-signed.pgp`),
    true
  );
  Assert.equal(ids.length, 1, "should have imported a key");

  const { code, reason } = RNP.getKeyRevocationReasonByKeyId(ids[0]);
  Assert.equal(code, "compromised");
  Assert.equal(reason, "It was the maid :/");
});
