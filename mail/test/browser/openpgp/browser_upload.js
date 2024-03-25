/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EnigmailKeyServer } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyserver.sys.mjs"
);

const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const { CommonUtils } = ChromeUtils.importESModule(
  "resource://services-common/utils.sys.mjs"
);

// The HTTP server used to check requests sent to key servers.
var httpServer;
// The ID of the key added to the keychain.
var keyID;

registerCleanupFunction(function () {
  httpServer.stop();
});

add_setup(async function () {
  // Import the private key, of which we'll later upload the public key.
  [keyID] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  // Create and start the HTTP server.
  httpServer = new HttpServer();
  httpServer.start(-1);
});

add_task(async function testHKPUpload() {
  // The result of the latest upload attempt.
  let latestHKPUploadAttempt = {
    contentType: null,
    content: null,
  };

  // Register a path handler on the server to handle HKP key upload.
  function addKey(request) {
    // Store the parts of the request we want to check later, i.e. its
    // content-type header and its body.
    latestHKPUploadAttempt = {
      contentType: request.getHeader("content-type"),
      content: CommonUtils.readBytesFromInputStream(request.bodyInputStream),
    };
  }

  httpServer.registerPathHandler("/pks/add", addKey);

  // Upload the key to the local server. OpenPGPTestUtils.importPrivateKey
  // (which we 've used in the setup) adds an "0x" at the start of the key,
  // which gets in the way of correctly processing the key ID, so we need to
  // remove it.
  const success = await EnigmailKeyServer.upload(
    keyID.replace(/^0x/, ""),
    "hkp://127.0.0.1:" + httpServer.identity.primaryPort
  );

  // Test that the upload succeeded.
  Assert.ok(success, "the key upload should succeed");
  // Test that the request was sent with the correct content-type header.
  Assert.equal(
    latestHKPUploadAttempt.contentType,
    "application/x-www-form-urlencoded",
    "the request should have the correct content-type header"
  );
  // Test that the request was sent with a correctly formatted body: it should
  // be URL-encoded form data with a "keytext" key which value is the armored
  // key (not surrounded by quotes).
  Assert.ok(
    latestHKPUploadAttempt.content.startsWith(
      "keytext=-----BEGIN%20PGP%20PUBLIC%20KEY%20BLOCK-----"
    ),
    "the start of the request body should be correctly formatted"
  );
  Assert.ok(
    latestHKPUploadAttempt.content.endsWith(
      "-----END%20PGP%20PUBLIC%20KEY%20BLOCK-----%0D%0A"
    ),
    "the end of the request body should be correctly formatted"
  );
});
