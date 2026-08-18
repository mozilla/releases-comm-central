/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/signed parts are dispatched to the OpenPGP or to the
 * S/MIME implementation based on the protocol parameter of the part, and that
 * this works in a single MIME stream, no matter which of the two was
 * displayed before.
 */

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { EnigmailConstants } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/constants.sys.mjs"
);
const { EnigmailDecryption } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/decryption.sys.mjs"
);
const { EnigmailSingletons } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/singletons.sys.mjs"
);
const { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const smimeDataDir = "../../../data/smime/";
const openpgpDataDir = "../../../../mail/test/browser/openpgp/data/";

const gTextAliceBob = "This is a test message from Alice to Bob.";
const gTextBobAlice = "Sundays are nothing without callaloo.";

/**
 * @implements {nsIMsgSMIMESink}
 */
const smimeSink = {
  expectResults(expectedEvents) {
    this._expectedEvents = expectedEvents;
    this._deferred = Promise.withResolvers();
    this.countReceived = 0;
    this.signed = null;
    this.encrypted = null;
    return this._deferred.promise;
  },
  ignoreStatusFrom() {},
  signatureProcessingStarted() {},
  signedStatus(nestingLevel, signatureStatus) {
    this.signed = { nestingLevel, signatureStatus };
    this._received();
  },
  resetSignedStatus() {
    this.signed = null;
    this._received();
  },
  encryptionStatus(nestingLevel, encryptionStatus) {
    this.encrypted = { nestingLevel, encryptionStatus };
    this._received();
  },
  _received() {
    if (++this.countReceived == this._expectedEvents) {
      this._deferred.resolve();
    }
  },
};

/**
 * @implements {nsIMsgOpenPGPSink}
 */
const openpgpSink = {
  expectResults(expectedEvents) {
    this._expectedEvents = expectedEvents;
    this._deferred = Promise.withResolvers();
    this.countReceived = 0;
    this.statusFlags = 0;
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
  ignoreStatusFrom() {},
  modifyMessageHeaders() {},
  updateSecurityStatus(exitCode, statusFlags) {
    this.statusFlags |= statusFlags;
    if (++this.countReceived == this._expectedEvents) {
      this._deferred.resolve();
    }
  },
};

/**
 * @name Test
 * @property {string} description - What the message exercises.
 * @property {string} dir - Directory the eml file is found in.
 * @property {string} filename - Name of the eml file.
 * @property {string} text - Text the rendered body must contain.
 * @property {integer} smimeEvents - Number of expected S/MIME sink calls.
 * @property {integer} openpgpEvents - Number of expected OpenPGP sink calls.
 * @property {boolean} [smimeSigned] - Expect a good S/MIME signature.
 * @property {boolean} [smimeEncrypted] - Expect S/MIME encryption.
 * @property {string[]} [openpgpFlags] - EnigmailConstants flag names that must
 *   be set in the reported OpenPGP status.
 */

/** @type {Test[]} */
const tests = [
  {
    description: "S/MIME clear-signed, top level",
    dir: smimeDataDir,
    filename: "alice.dsig.SHA256.multipart.eml",
    text: gTextAliceBob,
    smimeEvents: 1,
    openpgpEvents: 0,
    smimeSigned: true,
  },
  {
    description: "OpenPGP signed, top level",
    dir: `${openpgpDataDir}eml/`,
    filename:
      "signed-by-0xfbfcc82a015e7330-to-0xf231550c4f47e38e-unencrypted.eml",
    text: gTextBobAlice,
    smimeEvents: 0,
    openpgpEvents: 1,
    openpgpFlags: ["GOOD_SIGNATURE"],
  },
  {
    description: "S/MIME clear-signed inside enveloped",
    dir: smimeDataDir,
    filename: "alice.dsig.SHA256.multipart.env.eml",
    text: gTextAliceBob,
    smimeEvents: 2,
    openpgpEvents: 0,
    smimeSigned: true,
    smimeEncrypted: true,
  },
  {
    description: "OpenPGP encrypted with inner signature",
    dir: `${openpgpDataDir}eml/`,
    filename:
      "signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml",
    text: gTextBobAlice,
    smimeEvents: 0,
    openpgpEvents: 2,
    openpgpFlags: ["GOOD_SIGNATURE", "DECRYPTION_OKAY"],
  },
];

const gInbox = new MessageInjection({ mode: "local" }).getInboxFolder();

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    do_get_file(`${smimeDataDir}TestCA.pem`),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(`${smimeDataDir}Alice.p12`),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(`${smimeDataDir}Bob.p12`),
    "nss"
  );

  await OpenPGPTestUtils.initOpenPGP();
  await OpenPGPTestUtils.importPrivateKey(
    null,
    do_get_file(
      `${openpgpDataDir}keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc`
    )
  );
  await OpenPGPTestUtils.importPublicKey(
    null,
    do_get_file(
      `${openpgpDataDir}keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc`
    )
  );

  for (const test of tests) {
    const promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyFileMessage(
      do_get_file(`${test.dir}${test.filename}`),
      gInbox,
      null,
      true,
      0,
      "",
      promiseCopyListener,
      null
    );
    await promiseCopyListener.promise;
  }
});

/**
 * The OpenPGP handler used to be registered for multipart/signed at runtime,
 * and unregistered again to let S/MIME work. Nothing may register a handler
 * for multipart/signed any more, the protocol parameter decides.
 */
add_task(function testNoMultipartSignedHandlerRegistered() {
  Assert.ok(
    !Components.manager.isContractIDRegistered(
      "@mozilla.org/mimecth;1?type=multipart/signed"
    ),
    "no content type handler is registered for multipart/signed"
  );
  Assert.ok(
    Components.manager.isContractIDRegistered(
      "@mozilla.org/mimecth;1?type=multipart/encrypted"
    ),
    "the OpenPGP content type handler for multipart/encrypted is registered"
  );
});

/**
 * Display each message, in both orders, and check that the body renders and
 * the correct sink is told about the crypto status. Each message is streamed
 * exactly once, so a message that needed a reload to be displayed would fail
 * here.
 */
add_task(async function testDispatchByProtocol() {
  for (const order of ["forward", "backward"]) {
    const indexes = tests.map((test, index) => index);
    if (order == "backward") {
      indexes.reverse();
    }

    for (const index of indexes) {
      const test = tests[index];
      info(`Running test: ${test.description} (${order})`);

      const hdr = mailTestUtils.getMsgHdrN(gInbox, index);
      const uri = hdr.folder.getUriForMsg(hdr);

      const smimePromise = smimeSink.expectResults(test.smimeEvents);
      const openpgpPromise = openpgpSink.expectResults(test.openpgpEvents);

      // Stub this function so verifyDetached() can get the correct email.
      EnigmailDecryption.getFromAddr = () => "bob@openpgp.example";

      const conversion = apply_mime_conversion(uri, smimeSink, openpgpSink);
      const body = await conversion.promise;

      Assert.ok(
        body.includes(test.text),
        `${test.filename}: body of the signed part is rendered`
      );

      if (test.smimeEvents) {
        await smimePromise;
      }
      if (test.openpgpEvents) {
        await openpgpPromise;
      }

      Assert.equal(
        smimeSink.countReceived,
        test.smimeEvents,
        `${test.filename}: number of S/MIME status reports`
      );
      Assert.equal(
        openpgpSink.countReceived,
        test.openpgpEvents,
        `${test.filename}: number of OpenPGP status reports`
      );

      if (test.smimeSigned) {
        Assert.equal(
          smimeSink.signed?.signatureStatus,
          0,
          `${test.filename}: S/MIME signature is good`
        );
      }
      if (test.smimeEncrypted) {
        Assert.equal(
          smimeSink.encrypted?.encryptionStatus,
          0,
          `${test.filename}: S/MIME decryption succeeded`
        );
      }
      for (const flag of test.openpgpFlags ?? []) {
        Assert.ok(
          openpgpSink.statusFlags & EnigmailConstants[flag],
          `${test.filename}: OpenPGP status flag "${flag}" is set`
        );
      }
    }
  }
});
