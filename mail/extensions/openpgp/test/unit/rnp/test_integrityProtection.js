/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the integrity-protection signal RNP.decrypt() reports for bug
 * 1994709. Remote content may be permitted for an encrypted OpenPGP message
 * only when RNP confirms the message was integrity protected (MDC/SEIPD v1 or
 * AEAD/SEIPD v2); RNP signals this via
 * EnigmailConstants.EXT_INTEGRITY_PROTECTED in the result's extStatusFlags.
 *
 * These tests also cover security invariant #1 (verify before render): when
 * integrity verification fails, RNP must NOT return decrypted plaintext.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

add_setup(async function () {
  do_get_profile();
  await OpenPGPTestUtils.initOpenPGP();

  await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc`)
  );
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/alice@openpgp.example-0xf231550c4f47e38e-pub.asc`)
  );
});

function encryptToBob(sourceText, armor) {
  const encryptResult = {};
  const encryptArgs = {
    aliasKeys: new Map(),
    armor,
    bcc: [],
    encrypt: true,
    encryptToSender: true,
    sender: "0xFBFCC82A015E7330",
    senderKeyIsExternal: false,
    sigTypeClear: false,
    sigTypeDetached: false,
    sign: false,
    signatureHash: "SHA256",
    to: ["<alice@openpgp.example>"],
  };
  return RNP.encryptAndOrSign(sourceText, encryptArgs, encryptResult).then(
    encrypted => {
      Assert.ok(!encryptResult.exitCode, "encryptAndOrSign() exited ok");
      return encrypted;
    }
  );
}

function decryptOptions(len) {
  return {
    fromAddr: "bob@openpgp.example",
    maxOutputLength: len * 100,
    noOutput: false,
    uiFlags: EnigmailConstants.UI_PGP_MIME,
    verifyOnly: false,
    msgDate: null,
  };
}

/**
 * A normally encrypted (and therefore MDC/AEAD protected) message must decrypt
 * successfully AND report EXT_INTEGRITY_PROTECTED.
 */
add_task(async function test_integrity_protected_roundtrip() {
  const sourceText = "This is a secret, integrity-protected message.\n";
  const encrypted = await encryptToBob(sourceText, true);

  const result = await RNP.decrypt(encrypted, decryptOptions(encrypted.length));

  Assert.ok(!result.exitCode, "RNP.decrypt() exited ok");
  Assert.ok(
    result.statusFlags & EnigmailConstants.DECRYPTION_OKAY,
    "DECRYPTION_OKAY is set"
  );
  Assert.ok(
    result.extStatusFlags & EnigmailConstants.EXT_INTEGRITY_PROTECTED,
    "EXT_INTEGRITY_PROTECTED is set for a normally encrypted message"
  );
  Assert.stringContains(
    result.decryptedData,
    "integrity-protected message",
    "plaintext is returned"
  );
});

// Extract the binary OpenPGP data from an ASCII-armored message. We tolerate an
// optional CRC (=xxxx) line and armor headers.
function armorToBytes(armored) {
  const lines = armored.replace(/\r\n/g, "\n").split("\n");
  let i = lines.findIndex(l => l.startsWith("-----BEGIN PGP MESSAGE-----"));
  Assert.greaterOrEqual(i, 0, "armor header found");
  // Skip armor headers up to and including the blank separator line.
  i++;
  while (i < lines.length && lines[i].trim() !== "") {
    i++;
  }
  i++;
  let b64 = "";
  for (; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith("=") || l.startsWith("-----END")) {
      break;
    }
    b64 += l;
  }
  return atob(b64);
}

/**
 * A message whose ciphertext has been tampered with must fail integrity
 * verification: no EXT_INTEGRITY_PROTECTED, and -- most importantly for
 * invariant #1 -- NO decrypted plaintext returned.
 */
add_task(async function test_tampered_ciphertext_fails_closed() {
  // Long plaintext so a byte flip lands deep inside the SEIPD encrypted region
  // (breaking the MDC), not in a packet-length header.
  const sourceText = "SECRET-".repeat(200) + "\n";
  const encrypted = await encryptToBob(sourceText, true);

  const bin = armorToBytes(encrypted);
  const bytes = Array.from(bin, c => c.charCodeAt(0));
  const flipAt = Math.floor(bytes.length * 0.66);
  bytes[flipAt] ^= 0xff;
  // Feed the tampered binary directly; RNP auto-detects binary vs. armored.
  const tampered = String.fromCharCode(...bytes);

  const result = await RNP.decrypt(tampered, decryptOptions(bin.length));

  // The load-bearing security property (invariant #1): no plaintext escapes
  // when integrity verification fails.
  Assert.equal(
    result.decryptedData,
    "",
    "no plaintext is returned when integrity verification fails (invariant #1)"
  );
  Assert.ok(
    !(result.extStatusFlags & EnigmailConstants.EXT_INTEGRITY_PROTECTED),
    "EXT_INTEGRITY_PROTECTED must NOT be set for tampered ciphertext"
  );
  Assert.ok(
    !(result.statusFlags & EnigmailConstants.DECRYPTION_OKAY),
    "DECRYPTION_OKAY must NOT be set for tampered ciphertext"
  );
  // Depending on where the corruption lands, RNP may report the failure either
  // via MISSING_MDC/DECRYPTION_FAILED or -- when the corruption breaks packet
  // framing -- via a generic non-zero exit code. Either way decryption did not
  // succeed; the load-bearing property (no plaintext, asserted above) holds.
  Assert.notEqual(
    result.exitCode,
    0,
    "a decryption failure is signaled (non-zero exit code) for tampered ciphertext"
  );
});
