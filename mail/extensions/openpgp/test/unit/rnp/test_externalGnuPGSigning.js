/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests signing with a secret key that is managed by an external GnuPG
 * installation, which we drive through GPGME.
 *
 * A gpg executable and a loadable gpgme library are required. If either
 * is missing, the tasks are skipped. If both are present, the results
 * are checked strictly.
 *
 * The external GnuPG is configured for RFC 4880 compliance, tests must
 * not depend on LibrePGP extensions.
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { GPGME } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/GPGME.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { Subprocess } = ChromeUtils.importESModule(
  "resource://gre/modules/Subprocess.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";

// Bob's primary key is capable of signing, it has no signing subkey.
const BOB_PRIMARY_ID = "FBFCC82A015E7330";
const BOB_EMAIL = "bob@openpgp.example";
const BOB_SECRET_FILE = "bob@openpgp.example-0xfbfcc82a015e7330-secret.asc";

// This key's primary is certify-only, signatures must be made by its
// signing subkey.
const SUBKEY_ONLY_PRIMARY_ID = "5F97DC942D7D765E";
const SUBKEY_ONLY_SIGNING_ID = "616883D3C579E402";
const SUBKEY_ONLY_EMAIL = "sign-subkey-only@openpgp.example";

// Keep this on a single line, GPGME signs detached signatures in text
// mode, which canonicalizes line endings.
const PLAINTEXT = "External GnuPG signing test.";

let gpgPath = null;
let gnupgHome = null;
let externalGnuPGReady = false;

/**
 * Run the external gpg executable against our temporary GnuPG home.
 *
 * @param {string[]} args - Command line arguments.
 * @returns {Promise<{exitCode: integer, stderr: string}>}
 */
async function runGpg(args) {
  const process = await Subprocess.call({
    command: gpgPath,
    arguments: ["--batch", "--no-tty", "--yes", "--rfc4880", ...args],
    environment: { GNUPGHOME: gnupgHome.path },
    environmentAppend: true,
    stderr: "pipe",
  });
  const stderr = await process.stderr.readString();
  const { exitCode } = await process.wait();
  return { exitCode, stderr };
}

/**
 * Stop the gpg-agent that was started for our temporary GnuPG home,
 * otherwise it keeps running after the test has ended.
 */
async function killGnuPGAgent() {
  let gpgconfPath;
  try {
    gpgconfPath = await Subprocess.pathSearch("gpgconf");
  } catch (ex) {
    return;
  }
  const process = await Subprocess.call({
    command: gpgconfPath,
    arguments: ["--kill", "all"],
    environment: { GNUPGHOME: gnupgHome.path },
    environmentAppend: true,
    stderr: "pipe",
  });
  await process.stderr.readString();
  await process.wait();
}

/**
 * @param {string} sender - Key ID of the sender, prefixed with 0x.
 * @returns {object} arguments for RNP.encryptAndOrSign
 */
function detachedSignArgs(sender) {
  return {
    aliasKeys: new Map(),
    armor: true,
    bcc: [],
    encrypt: false,
    encryptToSender: false,
    sender,
    senderKeyIsExternal: true,
    sigTypeClear: false,
    sigTypeDetached: true,
    sign: true,
    signatureHash: "SHA256",
    to: [],
  };
}

add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();

  Services.prefs.setBoolPref("mail.openpgp.allow_external_gnupg", true);

  // Our own keyring gets Bob's secret key, which is used to decrypt the
  // combined encrypt+sign result, and the public key of the externally
  // managed key, which is all we would have in the external scenario.
  await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}/${BOB_SECRET_FILE}`)
  );
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/sign-subkey-only-pub.asc`)
  );

  try {
    gpgPath = await Subprocess.pathSearch("gpg");
  } catch (ex) {
    info("No gpg executable found");
    return;
  }
  info(`Using gpg executable ${gpgPath}`);

  // Not the profile directory, the path of the gpg-agent socket below
  // it must stay short enough for a unix domain socket.
  gnupgHome = do_get_tempdir();
  gnupgHome.append("gnupg");
  gnupgHome.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o700);

  const previousHome = Services.env.exists("GNUPGHOME")
    ? Services.env.get("GNUPGHOME")
    : "";
  Services.env.set("GNUPGHOME", gnupgHome.path);
  registerCleanupFunction(async function () {
    await killGnuPGAgent();
    Services.env.set("GNUPGHOME", previousHome);
    gnupgHome.remove(true);
  });

  // The digest must be pinned, otherwise the digest that gpg picks
  // depends on its version and on the key's preferences, and RNP
  // rejects a SHA-1 signature.
  await IOUtils.writeUTF8(
    PathUtils.join(gnupgHome.path, "gpg.conf"),
    "compliance rfc4880\ndigest-algo SHA256\n"
  );

  if (!GPGME.init()) {
    info("No usable gpgme library found");
    return;
  }

  for (const keyFile of [BOB_SECRET_FILE, "sign-subkey-only-secret.asc"]) {
    const { exitCode, stderr } = await runGpg([
      "--import",
      do_get_file(`${keyDir}/${keyFile}`).path,
    ]);
    Assert.equal(exitCode, 0, `gpg should import ${keyFile}, got: ${stderr}`);
  }

  externalGnuPGReady = true;
});

/**
 * Base roundtrip: have the external GnuPG produce a detached signature
 * with a signing capable primary key, and verify it with RNP.
 */
add_task(
  { skip_if: () => !externalGnuPGReady },
  async function testExternalDetachedSignature() {
    const args = detachedSignArgs(`0x${BOB_PRIMARY_ID}`);
    const resultStatus = {};
    const signature = await RNP.encryptAndOrSign(PLAINTEXT, args, resultStatus);

    Assert.equal(resultStatus.exitCode, 0, "external signing should succeed");
    Assert.ok(
      resultStatus.statusFlags & EnigmailConstants.SIG_CREATED,
      "a signature should have been created"
    );
    Assert.ok(
      signature.startsWith("-----BEGIN PGP SIGNATURE-----"),
      "result should be an armored detached signature"
    );
    Assert.equal(
      args.externalSenderSigningKeyID,
      BOB_PRIMARY_ID,
      "the primary key should be used, it's the only signing capable key"
    );

    const verified = await RNP.verifyDetached(
      PLAINTEXT,
      signature,
      BOB_EMAIL,
      null
    );
    Assert.equal(verified.exitCode, 0, "verification should succeed");
    Assert.ok(
      verified.statusFlags & EnigmailConstants.GOOD_SIGNATURE,
      "signature should be good"
    );
    Assert.equal(
      verified.keyId,
      BOB_PRIMARY_ID,
      "signature should have been made by the primary key"
    );
  }
);

/**
 * If the primary key of the externally managed key cannot sign, the
 * signing subkey must be used. GPGME cannot pick the subkey on its own,
 * we must give it the key ID of the subkey. (Bug 2026356)
 */
add_task(
  { skip_if: () => !externalGnuPGReady },
  async function testExternalSigningSubkey() {
    const args = detachedSignArgs(`0x${SUBKEY_ONLY_PRIMARY_ID}`);
    const resultStatus = {};
    const signature = await RNP.encryptAndOrSign(PLAINTEXT, args, resultStatus);

    Assert.equal(resultStatus.exitCode, 0, "external signing should succeed");
    Assert.equal(
      args.externalSenderSigningKeyID,
      SUBKEY_ONLY_SIGNING_ID,
      "the signing subkey should be used, the primary cannot sign"
    );

    const verified = await RNP.verifyDetached(
      PLAINTEXT,
      signature,
      SUBKEY_ONLY_EMAIL,
      null
    );
    Assert.equal(verified.exitCode, 0, "verification should succeed");
    Assert.ok(
      verified.statusFlags & EnigmailConstants.GOOD_SIGNATURE,
      "signature should be good"
    );
    Assert.equal(
      verified.keyId,
      SUBKEY_ONLY_SIGNING_ID,
      "signature should have been made by the signing subkey"
    );
  }
);

/**
 * Combined signing and encryption, the external GnuPG produces the
 * inner signed message, RNP encrypts it.
 */
add_task(
  { skip_if: () => !externalGnuPGReady },
  async function testExternalSignAndEncrypt() {
    const args = {
      aliasKeys: new Map(),
      armor: true,
      bcc: [],
      encrypt: true,
      encryptToSender: false,
      sender: `0x${SUBKEY_ONLY_PRIMARY_ID}`,
      senderKeyIsExternal: true,
      sigTypeClear: false,
      sigTypeDetached: false,
      sign: true,
      signatureHash: "SHA256",
      to: [`<${BOB_EMAIL}>`],
    };
    const resultStatus = {};
    const encrypted = await RNP.encryptAndOrSign(PLAINTEXT, args, resultStatus);

    Assert.equal(resultStatus.exitCode, 0, "encryption should succeed");
    Assert.equal(
      args.externalSenderSigningKeyID,
      SUBKEY_ONLY_SIGNING_ID,
      "the signing subkey should be used, the primary cannot sign"
    );

    const result = await RNP.decrypt(encrypted, {
      fromAddr: SUBKEY_ONLY_EMAIL,
      maxOutputLength: encrypted.length * 100,
      msgDate: null,
      noOutput: false,
      uiFlags: EnigmailConstants.UI_PGP_MIME,
      verifyOnly: false,
    });

    Assert.equal(result.exitCode, 0, "decryption should succeed");
    Assert.equal(result.decryptedData, PLAINTEXT, "text should roundtrip");
    Assert.ok(
      result.statusFlags & EnigmailConstants.GOOD_SIGNATURE,
      "signature should be good"
    );
    Assert.equal(
      result.keyId,
      SUBKEY_ONLY_SIGNING_ID,
      "signature should have been made by the signing subkey"
    );
  }
);
