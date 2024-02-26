/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This file is mostly a copy of test_smime_decrypt.js
 * with the difference that pref
 * mail.smime.accept_insecure_sha1_message_signatures is set to true,
 * and tests using sha-1 are expected to pass.
 *
 * This file must not run in parallel with other s/mime tests.
 */

/**
 * Tests to ensure signed and/or encrypted S/MIME messages are
 * processed correctly, and the signature status is treated as good
 * or bad as expected.
 */

var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

registerCleanupFunction(() => {
  Services.prefs.clearUserPref(
    "mail.smime.accept_insecure_sha1_message_signatures"
  );
});

add_setup(function () {
  Services.prefs.setBoolPref(
    "mail.smime.accept_insecure_sha1_message_signatures",
    true
  );

  const messageInjection = new MessageInjection({ mode: "local" });
  gInbox = messageInjection.getInboxFolder();
  SmimeUtils.ensureNSS();

  SmimeUtils.loadPEMCertificate(
    do_get_file(smimeDataDirectory + "TestCA.pem"),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(smimeDataDirectory + "Alice.p12"),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(smimeDataDirectory + "Bob.p12"),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(smimeDataDirectory + "Dave.p12"),
    "nss"
  );
});

add_task(async function verifyTestCertsStillValid() {
  // implementation of nsIDoneFindCertForEmailCallback
  var doneFindCertForEmailCallback = {
    findCertDone(email, cert) {
      Assert.notEqual(cert, null);
      if (!cert) {
        Assert.ok(
          false,
          "The S/MIME test certificates are invalid today.\n" +
            "Please look at the expiration date in file comm/mailnews/test/data/smime/expiration.txt\n" +
            "If that date is in the past, new certificates need to be generated and committed.\n" +
            "Follow the instructions in comm/mailnews/test/data/smime/README.md\n" +
            "If that date is in the future, the test failure is unrelated to expiration and indicates " +
            "an error in certificate validation."
        );
      }
    },

    QueryInterface: ChromeUtils.generateQI(["nsIDoneFindCertForEmailCallback"]),
  };

  const composeSecure = Cc[
    "@mozilla.org/messengercompose/composesecure;1"
  ].createInstance(Ci.nsIMsgComposeSecure);
  composeSecure.asyncFindCertByEmailAddr(
    "Alice@example.com",
    doneFindCertForEmailCallback
  );
});

var gInbox;

var smimeDataDirectory = "../../../data/smime/";

const smimeSink = {
  expectResults(maxLen) {
    // dump("Restarting for next test\n");
    this._deferred = Promise.withResolvers();
    this._expectedEvents = maxLen;
    this.countReceived = 0;
    this._results = [];
    // Ensure checkFinished() only produces results once.
    this._resultsProduced = false;
    this.haveSignedBad = false;
    this.haveEncryptionBad = false;
    this.resultSig = null;
    this.resultEnc = null;
    this.resultSigFirst = undefined;
    return this._deferred.promise;
  },
  signedStatus(aNestingLevel, aSignedStatus, aSignerCert) {
    console.log("signedStatus " + aSignedStatus + " level " + aNestingLevel);
    // dump("Signed message\n");
    Assert.equal(aNestingLevel, 1);
    if (!this.haveSignedBad) {
      // override with newer allowed
      this.resultSig = {
        type: "signed",
        status: aSignedStatus,
        certificate: aSignerCert,
      };
      if (aSignedStatus != 0) {
        this.haveSignedBad = true;
      }
      if (this.resultSigFirst == undefined) {
        this.resultSigFirst = true;
      }
    }
    this.countReceived++;
    this.checkFinished();
  },
  encryptionStatus(aNestingLevel, aEncryptedStatus, aRecipientCert) {
    console.log(
      "encryptionStatus " + aEncryptedStatus + " level " + aNestingLevel
    );
    // dump("Encrypted message\n");
    Assert.equal(aNestingLevel, 1);
    if (!this.haveEncryptionBad) {
      // override with newer allowed
      this.resultEnc = {
        type: "encrypted",
        status: aEncryptedStatus,
        certificate: aRecipientCert,
      };
      if (aEncryptedStatus != 0) {
        this.haveEncryptionBad = true;
      }
      if (this.resultSigFirst == undefined) {
        this.resultSigFirst = false;
      }
    }
    this.countReceived++;
    this.checkFinished();
  },
  checkFinished() {
    if (!this._resultsProduced && this.countReceived == this._expectedEvents) {
      this._resultsProduced = true;
      if (this.resultSigFirst) {
        this._results.push(this.resultSig);
        if (this.resultEnc != null) {
          this._results.push(this.resultEnc);
        }
      } else {
        this._results.push(this.resultEnc);
        if (this.resultSig != null) {
          this._results.push(this.resultSig);
        }
      }
      this._deferred.resolve(this._results);
    }
  },
  QueryInterface: ChromeUtils.generateQI(["nsIMsgSMIMESink"]),
};

/**
 * Note on FILENAMES taken from the NSS test suite:
 * - env: CMS enveloped (encrypted)
 * - dsig: CMS detached signature (with multipart MIME)
 * - sig: CMS opaque signature (content embedded inside signature)
 * - bad: message text does not match signature
 * - mismatch: embedded content is different
 *
 * Control variables used for checking results:
 * - env: If true, we expect a report to encryptionStatus() that message
 *        is encrypted.
 * - sig: If true, we expect a report to signedStatus() that message
 *        is signed.
 * - sig_good: If true, we expect that the reported signature has a
 *             good status.
 *             If false, we expect a report of bad status.
 *             Because of the sequential processing caused by nested
 *             messages, additional calls to signedStatus() might
 *             override an earlier decision.
 *             (An earlier bad status report cannot be overridden by a
 *              later report of a good status.)
 * - extra: If set to a number > 0, we expect that nested processing of
 *          MIME parts will trigger the given number of additional
 *          status calls.
 *          (default is 0.)
 * - dave: If true, we expect that the outermost message was done by
 *         Dave's certificate.
 *         (default is false, which means we expect Alice's cert.)
 */

var gMessages = [
  {
    filename: "alice.env.eml",
    enc: true,
    sig: false,
    sig_good: false,
    check_text: true,
  },
  {
    filename: "alice.dsig.SHA1.multipart.bad.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA1.multipart.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
    check_text: true,
  },
  {
    filename: "alice.dsig.SHA1.multipart.eml",
    enc: false,
    sig: true,
    sig_good: true,
    check_text: true,
  },
  {
    filename: "alice.dsig.SHA1.multipart.mismatch-econtent.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA256.multipart.bad.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA256.multipart.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA256.multipart.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA256.multipart.mismatch-econtent.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA384.multipart.bad.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA384.multipart.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA384.multipart.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA384.multipart.mismatch-econtent.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA512.multipart.bad.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.dsig.SHA512.multipart.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA512.multipart.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.dsig.SHA512.multipart.mismatch-econtent.eml",
    enc: false,
    sig: true,
    sig_good: false,
  },
  {
    filename: "alice.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: true,
    check_text: true,
  },
  {
    filename: "alice.sig.SHA1.opaque.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
    check_text: true,
  },
  {
    filename: "alice.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.sig.SHA256.opaque.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.sig.SHA384.opaque.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: true,
  },
  {
    filename: "alice.sig.SHA512.opaque.env.eml",
    enc: true,
    sig: true,
    sig_good: true,
  },

  // encrypt-then-sign
  {
    filename: "alice.env.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA1.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA256.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA384.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA512.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    extra: 1,
  },

  // encrypt-then-sign, then sign again
  {
    filename: "alice.env.sig.SHA1.opaque.dave.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA1.multipart.dave.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA256.opaque.dave.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA256.multipart.dave.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA384.opaque.dave.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA384.multipart.dave.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.sig.SHA512.opaque.dave.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.env.dsig.SHA512.multipart.dave.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },

  // sign, then sign again
  {
    filename: "alice.plain.sig.SHA1.opaque.dave.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.dsig.SHA1.multipart.dave.sig.SHA1.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA256.opaque.dave.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.dsig.SHA256.multipart.dave.sig.SHA256.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA384.opaque.dave.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.dsig.SHA384.multipart.dave.sig.SHA384.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA512.opaque.dave.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.dsig.SHA512.multipart.dave.sig.SHA512.opaque.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },

  {
    filename: "alice.plain.sig.SHA1.opaque.dave.dsig.SHA1.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.dsig.SHA1.multipart.dave.dsig.SHA1.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA256.opaque.dave.dsig.SHA256.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename:
      "alice.plain.dsig.SHA256.multipart.dave.dsig.SHA256.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA384.opaque.dave.dsig.SHA384.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename:
      "alice.plain.dsig.SHA384.multipart.dave.dsig.SHA384.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename: "alice.plain.sig.SHA512.opaque.dave.dsig.SHA512.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
  {
    filename:
      "alice.plain.dsig.SHA512.multipart.dave.dsig.SHA512.multipart.eml",
    enc: false,
    sig: true,
    sig_good: false,
    dave: 1,
    extra: 1,
  },
];

const gCopyWaiter = Promise.withResolvers();

add_task(async function copy_messages() {
  for (const msg of gMessages) {
    let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();

    MailServices.copy.copyFileMessage(
      do_get_file(smimeDataDirectory + msg.filename),
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
  gCopyWaiter.resolve();
});

add_task(async function check_smime_message() {
  await gCopyWaiter.promise;

  let hdrIndex = 0;

  for (const msg of gMessages) {
    console.log("checking " + msg.filename);

    let numExpected = 1;
    if (msg.enc && msg.sig) {
      numExpected++;
    }

    let eventsExpected = numExpected;
    if ("extra" in msg) {
      eventsExpected += msg.extra;
    }

    const hdr = mailTestUtils.getMsgHdrN(gInbox, hdrIndex);
    const uri = hdr.folder.getUriForMsg(hdr);
    const sinkPromise = smimeSink.expectResults(eventsExpected);

    const conversion = apply_mime_conversion(uri, smimeSink);
    await conversion.promise;

    const contents = conversion._data;
    // dump("contents: " + contents + "\n");

    if (!msg.sig || msg.sig_good || "check_text" in msg) {
      const expected = "This is a test message from Alice to Bob.";
      Assert.ok(contents.includes(expected));
    }
    // Check that we're also using the display output.
    Assert.ok(contents.includes("<html>"));

    await sinkPromise;

    const r = smimeSink._results;
    Assert.equal(r.length, numExpected);

    let sigIndex = 0;

    if (msg.enc) {
      Assert.equal(r[0].type, "encrypted");
      Assert.equal(r[0].status, 0);
      Assert.equal(r[0].certificate, null);
      sigIndex = 1;
    }
    if (msg.sig) {
      Assert.equal(r[sigIndex].type, "signed");
      const cert = r[sigIndex].certificate;
      if (msg.sig_good) {
        Assert.notEqual(cert, null);
      }
      if (cert) {
        if ("dave" in msg) {
          Assert.equal(cert.emailAddress, "dave@example.com");
        } else {
          Assert.equal(cert.emailAddress, "alice@example.com");
        }
      }
      if (msg.sig_good) {
        Assert.equal(r[sigIndex].status, 0);
      } else {
        Assert.notEqual(r[sigIndex].status, 0);
      }
    }

    hdrIndex++;
  }
});
