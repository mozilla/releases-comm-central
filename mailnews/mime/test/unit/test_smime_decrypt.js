/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests to ensure signed and/or encrypted S/MIME messages are
 * processed correctly, and the signature status is treated as good
 * or bad as expected.
 */

var {PromiseTestUtils} = ChromeUtils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");
var {PromiseUtils } = ChromeUtils.import("resource://gre/modules/PromiseUtils.jsm");
var {localAccountUtils} = ChromeUtils.import("resource://testing-common/mailnews/localAccountUtils.js");
var {IOUtils} = ChromeUtils.import("resource:///modules/IOUtils.js");
var {SmimeUtils} = ChromeUtils.import("resource://testing-common/mailnews/smimeUtils.jsm");

load("../../../resources/logHelper.js");
load("../../../resources/asyncTestUtils.js");

load("../../../resources/messageGenerator.js");
load("../../../resources/messageModifier.js");
load("../../../resources/messageInjection.js");

var gInbox;

var smimeDataDirectory = "../../../data/smime/";

let smimeHeaderSink = {
  expectResults(maxLen) {
    //dump("Restarting for next test\n");
    this._deferred = PromiseUtils.defer();
    this._expectedLen = maxLen;
    this._results = [];
    return this._deferred.promise;
  },
  maxWantedNesting() { return 2; },
  signedStatus(aNestingLevel, aSignedStatus, aSignerCert) {
    //dump("Signed message\n");
    Assert.equal(aNestingLevel, 1);
    this._results.push({
      type: "signed",
      status: aSignedStatus,
      certificate: aSignerCert
    });
    if (this._results.length == this._expectedLen)
      this._deferred.resolve(this._results);
  },
  encryptionStatus(aNestingLevel, aEncryptedStatus, aRecipientCert) {
    //dump("Encrypted message\n");
    Assert.equal(aNestingLevel, 1);
    this._results.push({
      type: "encrypted",
      status: aEncryptedStatus,
      certificate: aRecipientCert
    });
    if (this._results.length == this._expectedLen)
      this._deferred.resolve(this._results);
  },
  QueryInterface: ChromeUtils.generateQI([Ci.nsIMsgSMIMEHeaderSink])
};

/**
 * Note on filenames taken from the NSS test suite:
 * - env: CMS enveloped (encrypted)
 * - dsig: CMS detached signature (with multipart MIME)
 * - sig: CMS opaque signature (content embedded inside signature)
 * - bad: message text does not match signature
 * - mismatch: embedded content is different
 */

var gMessages = [
  { filename: "alice.env.eml",
    enc: true, sig: false, sig_good: false },
  { filename: "alice.dsig.SHA1.multipart.bad.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA1.multipart.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA1.multipart.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA1.multipart.mismatch-econtent.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA256.multipart.bad.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA256.multipart.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA256.multipart.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA256.multipart.mismatch-econtent.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA384.multipart.bad.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA384.multipart.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA384.multipart.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA384.multipart.mismatch-econtent.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA512.multipart.bad.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.dsig.SHA512.multipart.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA512.multipart.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.dsig.SHA512.multipart.mismatch-econtent.eml",
    enc: false, sig: true, sig_good: false },
  { filename: "alice.sig.SHA1.opaque.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.sig.SHA1.opaque.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.sig.SHA256.opaque.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.sig.SHA256.opaque.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.sig.SHA384.opaque.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.sig.SHA384.opaque.env.eml",
    enc: true, sig: true, sig_good: true },
  { filename: "alice.sig.SHA512.opaque.eml",
    enc: false, sig: true, sig_good: true },
  { filename: "alice.sig.SHA512.opaque.env.eml",
    enc: true, sig: true, sig_good: true },
];

let gCopyWaiter = PromiseUtils.defer();

add_task(async function copy_messages() {
  for (let msg of gMessages) {
    let promiseCopyListener = new PromiseTestUtils.PromiseCopyListener();

    MailServices.copy.CopyFileMessage(
      do_get_file(smimeDataDirectory + msg.filename),
      gInbox, null, true, 0, "",
      promiseCopyListener, null);

    await promiseCopyListener.promise;
    promiseCopyListener = null;
  }
  gCopyWaiter.resolve();
});

add_task(async function check_smime_message() {
  await gCopyWaiter.promise;

  let hdrIndex = 0;

  for (let msg of gMessages) {
    let numExpected = 1;
    if (msg.enc && msg.sig) {
      numExpected++
    }

    let hdr = mailTestUtils.getMsgHdrN(gInbox, hdrIndex);
    let uri = hdr.folder.getUriForMsg(hdr);
    let sinkPromise = smimeHeaderSink.expectResults(numExpected);

    let conversion = apply_mime_conversion(uri, {securityInfo: smimeHeaderSink});
    await conversion.promise;

    let contents = conversion._data;
    //dump("contents: " + contents + "\n");

    if (!msg.sig || msg.sig_good) {
      // Check that the plaintext body is in there.
      Assert.ok(contents.includes("This is a test message from Alice to Bob."));
    }
    // Check that we're also using the display output.
    Assert.ok(contents.includes("<html>"));

    await sinkPromise;

    let r = smimeHeaderSink._results;
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
        Assert.equal(r[sigIndex].certificate.emailAddress, "alice@bogus.com");
        if (msg.sig_good) {
          Assert.equal(r[sigIndex].status, 0);
        } else {
          Assert.notEqual(r[sigIndex].status, 0);
        }
    }

    hdrIndex++;
  }
});

function run_test() {
  gInbox = configure_message_injection({mode: "local"});
  SmimeUtils.ensureNSS();

  SmimeUtils.loadPEMCertificate(do_get_file(smimeDataDirectory + "TestCA.pem"), Ci.nsIX509Cert.CA_CERT);
  SmimeUtils.loadCertificateAndKey(do_get_file(smimeDataDirectory + "Alice.p12"));
  SmimeUtils.loadCertificateAndKey(do_get_file(smimeDataDirectory + "Bob.p12"));

  let composeSecure = Cc["@mozilla.org/messengercompose/composesecure;1"]
                      .createInstance(Ci.nsIMsgComposeSecure);
  let cert = composeSecure.findCertByEmailAddress("Alice@bogus.com", false);
  Assert.notEqual(cert, null);

  run_next_test();
}
