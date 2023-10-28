/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for OpenPGP encryption alias rules.
 */

"use strict";

const { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
const { EnigmailEncryption } = ChromeUtils.import(
  "chrome://openpgp/content/modules/encryption.jsm"
);
const { OpenPGPAlias } = ChromeUtils.import(
  "chrome://openpgp/content/modules/OpenPGPAlias.jsm"
);

const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);

const keyDir = "../../../../../test/browser/openpgp/data/keys";
const mailNewsDir = "../../../../../../mailnews/test/data";

// Alice's key: EB85BB5FA33A75E15E944E63F231550C4F47E38E
// Bob's key:   D1A66E1A23B182C9980F788CFBFCC82A015E7330
// Carol's key: B8F2F6F4BD3AD3F82DC446833099FF1238852B9F

const tests = [
  {
    info: "Should find Alice's key directly",
    filename: undefined,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: null,
  },
  {
    info: "Key absent, no alias defined for address",
    filename: `${mailNewsDir}/alias-1.json`,
    to: "nobody@openpgp.example",
    expectedMissing: true,
    expectedAliasKeys: null,
  },
  {
    info: "File maps Alice's address to Bob's (id) and Carol's (fingerprint) keys",
    filename: `${mailNewsDir}/alias-1.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: [
      "D1A66E1A23B182C9980F788CFBFCC82A015E7330",
      "B8F2F6F4BD3AD3F82DC446833099FF1238852B9F",
    ],
  },
  {
    info: "File maps Alice's address to an absent key",
    filename: `${mailNewsDir}/alias-2.json`,
    to: "alice@openpgp.example",
    expectedMissing: true,
    expectedAliasKeys: null,
  },
  {
    info: "File maps Alice's address to Alice's key (unnecessary alias)",
    filename: `${mailNewsDir}/alias-3.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: ["EB85BB5FA33A75E15E944E63F231550C4F47E38E"],
  },
  {
    info: "File maps an address to several keys, all available",
    filename: `${mailNewsDir}/alias-4.json`,
    to: "nobody@example.com",
    expectedMissing: false,
    expectedAliasKeys: [
      "EB85BB5FA33A75E15E944E63F231550C4F47E38E",
      "D1A66E1A23B182C9980F788CFBFCC82A015E7330",
      "B8F2F6F4BD3AD3F82DC446833099FF1238852B9F",
    ],
  },
  {
    info: "File maps an address to several keys, one not available",
    filename: `${mailNewsDir}/alias-5.json`,
    to: "nobody@example.com",
    expectedMissing: true,
    expectedAliasKeys: null,
  },
  {
    info: "File maps the domain to Carol's key",
    filename: `${mailNewsDir}/alias-6.json`,
    to: "someone@example.com",
    expectedMissing: false,
    expectedAliasKeys: ["B8F2F6F4BD3AD3F82DC446833099FF1238852B9F"],
  },
  {
    info: "Multiple rules, should match domain1 rule",
    filename: `${mailNewsDir}/alias-7.json`,
    to: "someone@domain1.example.com",
    expectedMissing: false,
    expectedAliasKeys: ["EB85BB5FA33A75E15E944E63F231550C4F47E38E"],
  },
  {
    info: "Multiple rules, should match domain2 rule",
    filename: `${mailNewsDir}/alias-7.json`,
    to: "contact@domain2.example.com",
    expectedMissing: false,
    expectedAliasKeys: ["D1A66E1A23B182C9980F788CFBFCC82A015E7330"],
  },
  {
    info: "Multiple rules, should match email contact@domain1 rule",
    filename: `${mailNewsDir}/alias-7.json`,
    to: "contact@domain1.example.com",
    expectedMissing: false,
    expectedAliasKeys: [
      "D1A66E1A23B182C9980F788CFBFCC82A015E7330",
      "EB85BB5FA33A75E15E944E63F231550C4F47E38E",
    ],
  },
  {
    info: "Multiple rules, shouldn't match",
    filename: `${mailNewsDir}/alias-7.json`,
    to: "contact@domain2.example",
    expectedMissing: true,
    expectedAliasKeys: null,
  },
  {
    info: "Mixed case test a",
    filename: `${mailNewsDir}/alias-8.json`,
    to: "a@UPPERDOM.EXAMPLE",
    expectedMissing: false,
    expectedAliasKeys: ["EB85BB5FA33A75E15E944E63F231550C4F47E38E"],
  },
  {
    info: "Mixed case test b",
    filename: `${mailNewsDir}/alias-8.json`,
    to: "b@lowerdom.example",
    expectedMissing: false,
    expectedAliasKeys: ["D1A66E1A23B182C9980F788CFBFCC82A015E7330"],
  },
  {
    info: "Mixed case test c",
    filename: `${mailNewsDir}/alias-8.json`,
    to: "C@MIXed.EXample",
    expectedMissing: false,
    expectedAliasKeys: ["B8F2F6F4BD3AD3F82DC446833099FF1238852B9F"],
  },
  {
    info: "Mixed case test d",
    filename: `${mailNewsDir}/alias-13.json`,
    to: "NAME@DOMAIN.NET",
    expectedMissing: false,
    expectedAliasKeys: ["D1A66E1A23B182C9980F788CFBFCC82A015E7330"],
  },
  {
    info: "Mixed case test e",
    filename: `${mailNewsDir}/alias-14.json`,
    to: "name@domain.net",
    expectedMissing: false,
    expectedAliasKeys: ["D1A66E1A23B182C9980F788CFBFCC82A015E7330"],
  },
  {
    info: "Mixed case test f",
    filename: `${mailNewsDir}/alias-15.json`,
    to: "name@domain.net",
    expectedMissing: false,
    expectedAliasKeys: ["D1A66E1A23B182C9980F788CFBFCC82A015E7330"],
  },
  {
    info: "JSON with bad syntax, should find Alice's key directly",
    filename: `${mailNewsDir}/alias-9.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: null,
    expectException: true,
  },
  {
    info: "JSON with missing keys entry, should find Alice's key directly",
    filename: `${mailNewsDir}/alias-10.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: null,
  },
  {
    info: "JSON with empty keys entry, should find Alice's key directly",
    filename: `${mailNewsDir}/alias-11.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: null,
  },
  {
    info: "JSON with bad type keys entry, should find Alice's key directly",
    filename: `${mailNewsDir}/alias-12.json`,
    to: "alice@openpgp.example",
    expectedMissing: false,
    expectedAliasKeys: null,
  },
];

/**
 * Initialize OpenPGP add testing keys.
 */
add_setup(async function () {
  do_get_profile();

  await OpenPGPTestUtils.initOpenPGP();

  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/alice@openpgp.example-0xf231550c4f47e38e-pub.asc`)
  );

  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc`)
  );

  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}/carol@example.com-0x3099ff1238852b9f-pub.asc`)
  );
});

add_task(async function testAlias() {
  const aliasFilename = "openpgp-alias-rules.json";
  const profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);

  for (const test of tests) {
    if (test.filename) {
      info(`Running alias test with rules from: ${test.filename}`);

      // Copy test file to profile directory (which is a relative path),
      // because load function only works with simple filenames
      // or absolute file URLs.

      const inFile = do_get_file(test.filename);
      inFile.copyTo(profileDir, aliasFilename);

      try {
        await OpenPGPAlias._loadFromFile(aliasFilename);
        Assert.ok(
          !("expectException" in test) || !test.expectException,
          "expected no load exception"
        );
      } catch (ex) {
        console.log(
          "exception when loading alias file " + aliasFilename + " : " + ex
        );
        Assert.ok(
          "expectException" in test && test.expectException,
          "expected load exception"
        );
      }
    } else {
      info(`Running alias test without rules`);
      OpenPGPAlias._clear();
    }
    info(test.info);

    const addresses = [test.to];
    const resultDetails = {};

    const isMissing = await EnigmailKeyRing.getValidKeysForAllRecipients(
      addresses,
      resultDetails
    );

    Assert.ok(
      (isMissing && test.expectedMissing) ||
        (!isMissing && !test.expectedMissing),
      "Should have the expected result from getValidKeysForAllRecipients"
    );

    if (isMissing || test.expectedMissing) {
      continue;
    }

    const errorMsgObj = { value: "" };
    const logFileObj = {};
    const encryptArgs = EnigmailEncryption.getCryptParams(
      "",
      test.to,
      "",
      "SHA256",
      EnigmailConstants.SEND_ENCRYPTED,
      0,
      errorMsgObj,
      logFileObj
    );

    const foundAliasKeys = encryptArgs.aliasKeys.get(test.to.toLowerCase());

    if (!test.expectedAliasKeys) {
      Assert.ok(!foundAliasKeys, "foundAliasKeys should be empty");
    } else {
      Assert.equal(foundAliasKeys.length, test.expectedAliasKeys.length);

      test.expectedAliasKeys.forEach((val, i) => {
        Assert.ok(foundAliasKeys.includes(val));
      });

      const encryptResult = {};
      const encrypted = await RNP.encryptAndOrSign(
        "plaintext",
        encryptArgs,
        encryptResult
      );

      Assert.ok(
        !encryptResult.exitCode,
        "RNP.encryptAndOrSign() should exit ok"
      );

      Assert.ok(encrypted.includes("END PGP MESSAGE"));
    }
  }
});
