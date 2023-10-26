/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests to ensure signed and/or encrypted OpenPGP messages are
 * processed correctly by mime.
 */

const { PromiseUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/PromiseUtils.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
const { EnigmailSingletons } = ChromeUtils.import(
  "chrome://openpgp/content/modules/singletons.jsm"
);
const { EnigmailVerify } = ChromeUtils.import(
  "chrome://openpgp/content/modules/mimeVerify.jsm"
);
const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);
const { EnigmailDecryption } = ChromeUtils.import(
  "chrome://openpgp/content/modules/decryption.jsm"
);

var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);

var messageInjection = new MessageInjection({ mode: "local" });
const gInbox = messageInjection.getInboxFolder();

const keyDir = "../../../../mail/test/browser/openpgp/data/keys/";
const browserEMLDir = "../../../../mail/test/browser/openpgp/data/eml/";

const contents = "Sundays are nothing without callaloo.";

/**
 * This implements some of the methods of Enigmail.hdrView.headerPane so we can
 * intercept and record the calls to updateSecurityStatus().
 */
const headerSink = {
  expectResults(maxLen) {
    this._deferred = PromiseUtils.defer();
    this.expectedCount = maxLen;
    this.countReceived = 0;
    this.results = [];
    EnigmailSingletons.messageReader = this;
    return this._deferred.promise;
  },
  isCurrentMessage() {
    return true;
  },
  isMultipartRelated() {
    return false;
  },
  displaySubPart() {
    return true;
  },
  hasUnauthenticatedParts() {
    return false;
  },
  processDecryptionResult() {},
  updateSecurityStatus(
    exitCode,
    statusFlags,
    extStatusFlags,
    keyId,
    userId,
    sigDetails,
    errorMsg,
    blockSeparation,
    uri,
    extraDetails,
    mimePartNumber
  ) {
    if (statusFlags & EnigmailConstants.PGP_MIME_SIGNED) {
      this.results.push({
        type: "signed",
        status: statusFlags,
        keyId,
      });
    } else if (statusFlags & EnigmailConstants.PGP_MIME_ENCRYPTED) {
      this.results.push({
        type: "encrypted",
        status: statusFlags,
        keyId,
      });
    }

    this.countReceived++;
    this.checkFinished();
  },
  modifyMessageHeaders() {},

  checkFinished() {
    if (this.countReceived == this.expectedCount) {
      this._deferred.resolve(this.results);
    }
  },
};

/**
 * @name Test
 * @property {string} filename - Name of the eml file found in ${browserEMLDir}.
 * @property {string} contents - Contents to expect in the file.
 * @property {string} from - The email address the message is from.
 * @property {string} [keyId] - The key id to expect the message from.
 * @property {boolean} sig - If true, indicates the message is signed.
 * @property {boolean} enc - If true, indicates the message is encrypted.
 * @property {string[]} flags - A list of flags corresponding to those found in
 *    EnigmailConstants that we should expect the processed message to posses.
 *    Prefix a flag with "-" to indicate it should not be present.
 * @property {boolean} [skip] - If true, the test will be skipped.
 */

/**
 * All the tests we are going to run.
 *
 * @type Test[]
 */
const tests = [
  {
    description:
      "signed, unencrypted message, with key attached, from verified sender",
    filename:
      "signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted-with-key.eml",
    contents,
    from: "bob@openpgp.example",
    keyId: OpenPGPTestUtils.BOB_KEY_ID,
    sig: true,
    flags: ["GOOD_SIGNATURE", "-DECRYPTION_OKAY"],
  },
  {
    description: "signed, unencrypted message, from verified sender",
    filename:
      "signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml",
    contents,
    from: "bob@openpgp.example",
    keyId: OpenPGPTestUtils.BOB_KEY_ID,
    sig: true,
    flags: ["GOOD_SIGNATURE", "-DECRYPTION_OKAY"],
  },
  {
    description:
      "unsigned, encrypted message, with key attached, from verified sender",
    filename:
      "unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330-with-key.eml",
    contents,
    from: "bob@openpgp.example",
    enc: true,
    flags: ["DECRYPTION_OKAY", "-GOOD_SIGNATURE"],
  },
  {
    description: "unsigned, encrypted message, from verified sender",
    filename:
      "unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml",
    contents,
    from: "bob@openpgp.example",
    enc: true,
    flags: ["DECRYPTION_OKAY", "-GOOD_SIGNATURE"],
  },
  {
    description:
      "signed, encrypted message, with key attached from verified sender",
    filename:
      "signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e-with-key.eml",
    from: "bob@openpgp.example",
    keyId: OpenPGPTestUtils.BOB_KEY_ID,
    contents,
    enc: true,
    sig: true,
    flags: ["DECRYPTION_OKAY", "GOOD_SIGNATURE"],
  },
  {
    description: "signed, encrypted message, from verified sender",
    filename:
      "signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml",
    from: "bob@openpgp.example",
    keyId: OpenPGPTestUtils.BOB_KEY_ID,
    contents,
    enc: true,
    sig: true,
    flags: ["DECRYPTION_OKAY", "GOOD_SIGNATURE"],
  },
  // Sender with no public key registered or accepted.
  {
    description:
      "signed, unencrypted message, with key attached from sender not in database",
    filename:
      "signed-by-0x3099ff1238852b9f-to-0xf231550c4f47e38e-unencrypted-with-key.eml",
    contents,
    from: "carol@openpgp.example",
    keyId: OpenPGPTestUtils.CAROL_KEY_ID,
    sig: true,
    flags: ["-GOOD_SIGNATURE", "UNCERTAIN_SIGNATURE", "NO_PUBKEY"],
  },
  {
    description: "signed, unencrypted message, from sender not in database",
    filename:
      "signed-by-0x3099ff1238852b9f-to-0xf231550c4f47e38e-unencrypted.eml",
    contents,
    from: "carol@openpgp.example",
    keyId: OpenPGPTestUtils.CAROL_KEY_ID,
    sig: true,
    flags: ["-GOOD_SIGNATURE", "UNCERTAIN_SIGNATURE", "NO_PUBKEY"],
  },
  {
    description:
      "unsigned, encrypted message, with key attached, from sender not in database",
    filename:
      "unsigned-encrypted-to-0xf231550c4f47e38e-from-0x3099ff1238852b9f-with-key.eml",
    contents,
    from: "carol@openpgp.example",
    enc: true,
    flags: ["DECRYPTION_OKAY", "-GOOD_SIGNATURE"],
  },
  {
    description: "unsigned, encrypted message, from sender not in database",
    filename:
      "unsigned-encrypted-to-0xf231550c4f47e38e-from-0x3099ff1238852b9f.eml",
    contents,
    from: "carol@openpgp.example",
    enc: true,
    flags: ["DECRYPTION_OKAY", "-GOOD_SIGNATURE"],
  },
  {
    description:
      "signed, encrypted message, with key attached, from sender not in database",
    filename:
      "signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e-with-key.eml",
    contents,
    from: "carol@openpgp.example",
    keyId: OpenPGPTestUtils.CAROL_KEY_ID,
    enc: true,
    sig: true,
    resultCount: 1,
    flags: ["-DECRYPTION_FAILED", "-GOOD_SIGNATURE", "UNCERTAIN_SIGNATURE"],
  },
  {
    description: "signed, encrypted message, from sender not in database",
    filename:
      "signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml",
    contents,
    from: "carol@openpgp.example",
    keyId: OpenPGPTestUtils.CAROL_KEY_ID,
    enc: true,
    sig: true,
    resultCount: 1,
    flags: ["-DECRYPTION_FAILED", "-GOOD_SIGNATURE", "UNCERTAIN_SIGNATURE"],
  },
  // Last two characters of signature swapped.
  {
    description: "signed message, signature damaged",
    filename: "bob-to-alice-signed-damaged-signature.eml",
    from: "bob@openpgp.example",
    contents,
    sig: true,
    flags: ["-GOOD_SIGNATURE", "BAD_SIGNATURE"],
  },
];

/**
 * Initialize OpenPGP, import Alice and Bob's keys, then install the messages
 * we are going to test.
 */
add_setup(async function () {
  await OpenPGPTestUtils.initOpenPGP();

  await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(`${keyDir}alice@openpgp.example-0xf231550c4f47e38e-secret.asc`)
  );

  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(`${keyDir}bob@openpgp.example-0xfbfcc82a015e7330-pub.asc`)
  );

  for (const test of tests) {
    let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();

    MailServices.copy.copyFileMessage(
      do_get_file(`${browserEMLDir}${test.filename}`),
      gInbox,
      null,
      true,
      0,
      "",
      promiseCopyListener,
      null
    );

    await promiseCopyListener.promise;
    promiseCopyListener = null;
  }
});

/**
 * This executes a test for each entry in the tests array. We test mostly
 * that the contents are correct and updateSecurityStatus() repoorts the
 * status flags the test specifies.
 */
add_task(async function testMimeDecryptOpenPGPMessages() {
  let hdrIndex = 0;
  for (const test of tests) {
    if (test.skip) {
      info(`Skipped test: ${test.description}`);
      continue;
    }

    info(`Running test: ${test.description}`);

    const testPrefix = `${test.filename}:`;
    const expectedResultCount =
      test.resultCount || (test.enc && test.sig) ? 2 : 1;
    const hdr = mailTestUtils.getMsgHdrN(gInbox, hdrIndex);
    const uri = hdr.folder.getUriForMsg(hdr);
    const sinkPromise = headerSink.expectResults(expectedResultCount);

    // Stub this function so verifyDetached() can get the correct email.
    EnigmailDecryption.getFromAddr = () => test.from;

    // Trigger the actual mime work.
    const conversion = apply_mime_conversion(uri, headerSink);

    await conversion.promise;

    const msgBody = conversion._data;

    if (!test.sig || test.flags.indexOf("GOOD_SIGNATURE")) {
      Assert.ok(
        msgBody.includes(test.contents),
        `${testPrefix} message contents match`
      );
    }

    // Check that we're also using the display output.
    Assert.ok(
      msgBody.includes("<html>"),
      `${testPrefix} message displayed as html`
    );
    await sinkPromise;

    let idx = 0;
    const { results } = headerSink;

    Assert.equal(
      results.length,
      expectedResultCount,
      `${testPrefix} updateSecurityStatus() called ${expectedResultCount} time(s)`
    );

    if (test.enc) {
      Assert.equal(
        results[idx].type,
        "encrypted",
        `${testPrefix} message recognized as encrypted`
      );

      if (expectedResultCount > 1) {
        idx++;
      }
    }

    if (test.sig) {
      Assert.equal(
        results[idx].type,
        "signed",
        `${testPrefix} message recognized as signed`
      );
    }

    if (test.keyId) {
      Assert.equal(
        results[idx].keyId,
        test.keyId,
        `${testPrefix}key ids match`
      );
    }

    // Test the expected message flags match the message status.
    // We combine the signed and encrypted flags via bitwise OR to
    // test in one place.
    if (test.flags) {
      for (let flag of test.flags) {
        const flags = results.reduce((prev, curr) => prev | curr.status, 0);
        const negative = flag[0] === "-";
        flag = negative ? flag.slice(1) : flag;

        if (negative) {
          Assert.ok(
            !(flags & EnigmailConstants[flag]),
            `${testPrefix} status flag "${flag}" not detected`
          );
        } else {
          Assert.ok(
            flags & EnigmailConstants[flag],
            `${testPrefix} status flag "${flag}" detected`
          );
        }
      }
    }

    hdrIndex++;
  }
});
