/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for RNP.encryptAndOrSign().
 */

"use strict";

const { RNP } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/OpenPGPTestUtils.sys.mjs"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";
const mailNewsDir = "../../../../../../mailnews/test/data";

const tests = [
  // Base64 encoded bodies.
  {
    filename: `${mailNewsDir}/01-plaintext.eml`,
  },
  {
    filename: `${mailNewsDir}/02-plaintext+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/03-HTML.eml`,
  },
  {
    filename: `${mailNewsDir}/04-HTML+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/05-HTML+embedded-image.eml`,
  },
  {
    filename: `${mailNewsDir}/06-plaintext+HMTL.eml`,
  },
  {
    filename: `${mailNewsDir}/07-plaintext+(HTML+embedded-image).eml`,
  },
  {
    filename: `${mailNewsDir}/08-plaintext+HTML+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/09-(HTML+embedded-image)+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/10-plaintext+(HTML+embedded-image)+attachment.eml`,
  },

  // Bodies with non-ASCII characters in UTF-8 and other charsets.
  {
    filename: `${mailNewsDir}/11-plaintext.eml`,
    skip: true,
  },
  // using ISO-8859-7 (Greek)
  {
    filename: `${mailNewsDir}/12-plaintext+attachment.eml`,
    encoding: "iso-8859-7",
    skip: true,
  },
  {
    filename: `${mailNewsDir}/13-HTML.eml`,
    skip: true,
  },
  {
    filename: `${mailNewsDir}/14-HTML+attachment.eml`,
    skip: true,
  },
  {
    filename: `${mailNewsDir}/15-HTML+embedded-image.eml`,
    skip: true,
  },
  // text part is base64 encoded
  {
    filename: `${mailNewsDir}/16-plaintext+HMTL.eml`,
    skip: true,
  },
  // HTML part is base64 encoded
  {
    filename: `${mailNewsDir}/17-plaintext+(HTML+embedded-image).eml`,
    skip: true,
  },
  {
    filename: `${mailNewsDir}/18-plaintext+HTML+attachment.eml`,
    skip: true,
  },
  {
    filename: `${mailNewsDir}/19-(HTML+embedded-image)+attachment.eml`,
    skip: true,
  },
  // using windows-1252
  {
    filename: `${mailNewsDir}/20-plaintext+(HTML+embedded-image)+attachment.eml`,
    encoding: "windows-1252",
    skip: true,
  },

  // Bodies with non-ASCII characters in UTF-8 and other charsets, all encoded
  // with quoted printable.
  {
    filename: `${mailNewsDir}/21-plaintext.eml`,
  },
  // using ISO-8859-7 (Greek)
  {
    filename: `${mailNewsDir}/22-plaintext+attachment.eml`,
    encoding: "iso-8859-7",
  },
  {
    filename: `${mailNewsDir}/23-HTML.eml`,
  },
  {
    filename: `${mailNewsDir}/24-HTML+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/25-HTML+embedded-image.eml`,
  },
  // text part is base64 encoded
  {
    filename: `${mailNewsDir}/26-plaintext+HMTL.eml`,
  },
  // HTML part is base64 encoded
  {
    filename: `${mailNewsDir}/27-plaintext+(HTML+embedded-image).eml`,
  },
  {
    filename: `${mailNewsDir}/28-plaintext+HTML+attachment.eml`,
  },
  {
    filename: `${mailNewsDir}/29-(HTML+embedded-image)+attachment.eml`,
  },
  // using windows-1252
  {
    filename: `${mailNewsDir}/30-plaintext+(HTML+embedded-image)+attachment.eml`,
    encoding: "windows-1252",
  },

  // Bug 1669107
  {
    filename:
      "data/plaintext-with-key-and-windows-1252-encoded-eml-attachment.eml",
    encoding: "windows-1252",
    skip: true,
  },
  {
    filename: "data/plaintext-with-windows-1252-encoded-eml-attachment.eml",
    encoding: "windows-1252",
    skip: true,
  },
];

/**
 * Initialize OpenPGP add testing keys.
 */
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

/**
 * Test the decrypted output of RNP.encryptOrSign() against its source text
 * with various inputs.
 */
add_task(async function testEncryptAndOrSignResults() {
  for (const test of tests) {
    const chunks = test.filename.split("/");
    const filename = chunks[chunks.length - 1];
    if (test.skip) {
      info(`Skipped input from: ${filename}`);
      continue;
    }

    info(`Running test with input from: ${filename}`);

    const buffer = await IOUtils.read(do_get_file(test.filename).path);
    const textDecoder = new TextDecoder(test.encoding || "utf-8");

    const sourceText = textDecoder.decode(buffer);
    const encryptResult = {};

    const encryptArgs = {
      aliasKeys: new Map(),
      armor: true,
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

    const encrypted = await RNP.encryptAndOrSign(
      sourceText,
      encryptArgs,
      encryptResult
    );

    Assert.ok(
      !encryptResult.exitCode,
      `${filename}: RNP.encryptAndOrSign() exited ok`
    );

    const decryptOptions = {
      fromAddr: "bob@openpgp.example",
      maxOutputLength: encrypted.length * 100,
      noOutput: false,
      uiFlags: EnigmailConstants.UI_PGP_MIME,
      verifyOnly: false,
      msgDate: null,
    };

    const { exitCode, decryptedData } = await RNP.decrypt(
      encrypted,
      decryptOptions
    );

    Assert.ok(!exitCode, `${filename}: RNP.decrypt() exited ok`);

    Assert.equal(
      sourceText,
      decryptedData,
      `${filename}: source text and decrypted text should be the same`
    );
  }
});

/**
 * Test that we correctly produce binary files when decrypting,
 * for both binary OpenPGP input and ASCII armored OpenPGP input.
 *
 * Image source: openclipart.org (public domain)
 * https://openclipart.org/detail/191741/blue-bird
 */
add_task(async function testDecryptAttachment() {
  const expected = String.fromCharCode(
    ...(await IOUtils.read(do_get_file("data/bluebird50.jpg").path))
  );

  for (const filename of [
    "data/bluebird50.jpg.asc",
    "data/bluebird50.jpg.gpg",
  ]) {
    const encrypted = String.fromCharCode(
      ...(await IOUtils.read(do_get_file(filename).path))
    );
    const options = {};
    options.fromAddr = "";
    options.msgDate = null;
    const result = await RNP.decrypt(encrypted, options);

    Assert.ok(!result.exitCode, `${filename}: RNP.decrypt() exited ok`);

    // Don't use Assert.equal to avoid logging the raw binary data
    const isEqual = expected === result.decryptedData;

    Assert.ok(
      isEqual,
      `${filename}: decrypted data should match the expected binary file`
    );
  }
});
