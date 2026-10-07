/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the MIME stream converter survives the message load being
 * stopped while NSS shows a password prompt during S/MIME decryption.
 * The prompt spins a nested event loop while libmime and the NSS CMS decoder
 * are on the stack, so anything the load delivers meanwhile must be deferred.
 */

var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
var { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);

const smimeDataDirectory = "../../../data/smime/";
const PASSWORD = "password";

let gConverter;
let gListener;
let gRemainingInput;

const gPrompt = {
  QueryInterface: ChromeUtils.generateQI(["nsIPrompt"]),
  promptCount: 0,

  promptPassword(dialogTitle, text, password) {
    this.promptCount++;

    // Simulate the load delivering its last data and finishing while the
    // prompt is open.
    const remaining = stringToStream(gRemainingInput);
    gConverter.onDataAvailable(null, remaining, 0, remaining.available());
    gConverter.onStopRequest(null, Cr.NS_OK);
    Assert.ok(
      !gListener.stopped,
      "onStopRequest should not be forwarded while the converter is parsing"
    );

    password.value = PASSWORD;
    return true;
  },
};

const gPromptFactory = {
  QueryInterface: ChromeUtils.generateQI(["nsIPromptFactory"]),
  getPrompt: () => gPrompt,
};

function stringToStream(str) {
  const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
    Ci.nsIStringInputStream
  );
  stream.setByteStringData(str);
  return stream;
}

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    do_get_file(smimeDataDirectory + "TestCA.pem"),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    do_get_file(smimeDataDirectory + "Bob.p12"),
    "nss"
  );

  MockRegistrar.register("@mozilla.org/prompter;1", gPromptFactory);

  // Protect Bob's key with a primary password and log out, so decrypting
  // requires a password prompt.
  const token = Cc["@mozilla.org/security/internalkeytoken;1"].createInstance(
    Ci.nsIPKCS11Token
  );
  await token.changePassword("", PASSWORD);
  await token.logout();
});

add_task(async function testStopDuringPasswordPrompt() {
  const input = await IOUtils.readUTF8(
    do_get_file(smimeDataDirectory + "alice.env.eml").path
  );
  // Hold back the last line of the body, so the prompt (which comes up once
  // the recipient info has been parsed) happens while there is data left.
  const splitAt = input.trimEnd().lastIndexOf("\n") + 1;
  gRemainingInput = input.slice(splitAt);

  gListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
    output: "",
    stopped: false,
    onStartRequest() {},
    onDataAvailable(request, stream, offset, count) {
      this.output += NetUtil.readInputStreamToString(stream, count);
    },
    onStopRequest() {
      this.stopped = true;
    },
  };

  gConverter = Cc[
    "@mozilla.org/streamconv;1?from=message/rfc822&to=*/*"
  ].createInstance(Ci.nsIStreamConverter);
  gConverter.asyncConvertData(
    null,
    null,
    gListener,
    Services.io.newURI("file:///somewhere/alice.env.eml")
  );

  const first = stringToStream(input.slice(0, splitAt));
  gConverter.onStartRequest(null);
  gConverter.onDataAvailable(null, first, 0, first.available());

  Assert.equal(
    gPrompt.promptCount,
    1,
    "the password prompt should come up while parsing the first chunk"
  );
  Assert.ok(
    gListener.stopped,
    "the deferred onStopRequest should be forwarded once parsing unwinds"
  );
  Assert.ok(
    gListener.output.includes("This is a test message from Alice to Bob."),
    "the message should be decrypted, including the deferred data"
  );
});
