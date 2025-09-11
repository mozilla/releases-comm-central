/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EwsServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/EwsServer.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

const EWS_SERVER_VERSION_PREF = "mail.ews.server_versions";

var ewsServer;
var incomingServer;

/**
 * Instantiate an EWS client and use it to send a request to the mock EWS
 * server.
 *
 * The request is a connectivity check, because it's a simple request with no
 * parameters, but could be any operation, since we only care about the SOAP
 * headers (and not the SOAP body).
 */
async function send_request_and_wait_for_response() {
  await new Promise((resolve, reject) => {
    // A mock listener that waits for a response to have been processed.
    const listener = {
      QueryInterface: ChromeUtils.generateQI(["nsIUrlListener"]),
      OnStartRunningUrl() {},
      OnStopRunningUrl(_url, exitCode) {
        if (Components.isSuccessCode(exitCode)) {
          resolve();
        } else {
          reject(exitCode);
        }
      },
    };

    // Build an EWS client and send the request.
    const client = Cc["@mozilla.org/messenger/ews-client;1"].createInstance(
      Ci.IEwsClient
    );
    client.initialize(
      incomingServer.getStringValue("ews_url"),
      incomingServer,
      false,
      "",
      "",
      "",
      "",
      ""
    );

    client.checkConnectivity(listener);
  });
}

add_setup(() => {
  // Create a new mock EWS server, and start it.
  ewsServer = new EwsServer();
  ewsServer.start();

  // Create and configure the EWS incoming server.
  incomingServer = localAccountUtils.create_incoming_server(
    "ews",
    ewsServer.port,
    "user",
    "password"
  );
  incomingServer.setStringValue(
    "ews_url",
    `http://127.0.0.1:${ewsServer.port}/EWS/Exchange.asmx`
  );

  registerCleanupFunction(() => {
    ewsServer.stop();
    incomingServer.closeCachedConnections();
    Services.prefs.clearUserPref(EWS_SERVER_VERSION_PREF);
  });
});

/**
 * Test that versions stored in prefs are correctly read, and result in the
 * correct version being requested in EWS requests.
 */
add_task(async function test_send_with_version() {
  // If no version is stored for the current server, we should default to
  // Exchange2007_SP1.
  await store_version_and_verify(null, "Exchange2007_SP1");

  // All known identifiers should be read correctly.
  await store_version_and_verify("Exchange2007", "Exchange2007");
  await store_version_and_verify("Exchange2007_SP1", "Exchange2007_SP1");
  await store_version_and_verify("Exchange2010", "Exchange2010");
  await store_version_and_verify("Exchange2010_SP1", "Exchange2010_SP1");
  await store_version_and_verify("Exchange2010_SP2", "Exchange2010_SP2");
  await store_version_and_verify("Exchange2013", "Exchange2013");
  await store_version_and_verify("Exchange2013_SP1", "Exchange2013_SP1");

  // If an unknown version is stored for the current server, an error should be
  // propagated to the consumer.
  await Assert.rejects(
    store_version_and_verify("UnknownFutureVersion", "UnknownFutureVersion"),
    /NS_ERROR_UNEXPECTED/,
    "unknown versions should cause an error to be propagated"
  );

  // If the pref does not contain valid JSON, we should default to
  // Exchange2007_SP1.
  Services.prefs.setCharPref(EWS_SERVER_VERSION_PREF, "{");
  await send_request_and_wait_for_response();
  Assert.equal(
    ewsServer.lastRequestedVersion,
    "Exchange2007_SP1",
    "invalid JSON should result in using the default version"
  );

  // Reset the pref value to avoid side-effects in other tests.
  Services.prefs.clearUserPref(EWS_SERVER_VERSION_PREF);
});

/**
 * Store the given version identifier for the current server in the prefs, then
 * send an EWS request and verify it requests the correct version.
 *
 * @param {?string} version - The version to store in prefs for the current
 * server. `null` means we should replace the pref's value with an empty string.
 * @param {string} expected - The version identifier we expect to find in
 * request headers.
 */
async function store_version_and_verify(version, expected) {
  if (version) {
    Services.prefs.setCharPref(
      EWS_SERVER_VERSION_PREF,
      `{"${incomingServer.getStringValue("ews_url")}": "${version}"}`
    );
  } else {
    Services.prefs.clearUserPref(EWS_SERVER_VERSION_PREF);
  }

  await send_request_and_wait_for_response();

  // We don't use `Assert.stringMatches` here, because it performs the
  // check using a regexp based on the expected value. Some version
  // identifiers are substrings of others, and we don't want to
  // accidentally match e.g. "Exchange2013_SP1" when we expect
  // "Exchange2013".
  Assert.equal(
    ewsServer.lastRequestedVersion,
    expected,
    "stored version should match the expected identifier"
  );
}

/**
 * Test that versions are stored correctly in the dedicated pref.
 */
add_task(async function test_version_storage() {
  // A lack of a version identifier in responses should not result in a version
  // being stored.
  await set_version_and_verify(null, null);

  // All known versions identifiers should be stored. Since we don't clear the
  // pref between calls to `set_version_and_verify`, this also ensures the
  // stored version is updated accordingly when the server starts responding
  // with a different identifier.
  await set_version_and_verify("Exchange2007", "Exchange2007");
  await set_version_and_verify("Exchange2007_SP1", "Exchange2007_SP1");
  await set_version_and_verify("Exchange2010", "Exchange2010");
  await set_version_and_verify("Exchange2010_SP1", "Exchange2010_SP1");
  await set_version_and_verify("Exchange2010_SP2", "Exchange2010_SP2");
  await set_version_and_verify("Exchange2013", "Exchange2013");
  await set_version_and_verify("Exchange2013_SP1", "Exchange2013_SP1");

  // A version identifier that is present in responses but isn't known should be
  // stored as the most recent known version.
  await set_version_and_verify("UnknownFutureVersion", "Exchange2013_SP1");

  // A lack of a version identifier in a response, when we already know a
  // version for the current server, should not result in the known version to
  // be overwritten.
  await set_version_and_verify("Exchange2010", "Exchange2010");
  await set_version_and_verify(null, "Exchange2010");

  // Reset the pref value to avoid side-effects in other tests.
  Services.prefs.clearUserPref(EWS_SERVER_VERSION_PREF);
});

/**
 * Sets the provided version on the mock EWS server, perform an EWS request, and
 * verifies that the version that's been stored as a result matches the one we
 * expect.
 *
 * @param {?string} version - The version identifier the mock EWS server should
 * use in responses. `null` tells the server not to include a version identifier
 * in responses.
 * @param {?string} expected - The version identifier we expect to be stored
 * after processing a response. `null` (or any falsy value) means we don't
 * expect any version to be stored for the incoming server.
 *
 * @throws if the server responded with an error.
 */
async function set_version_and_verify(version, expected) {
  // Set the version on the server.
  ewsServer.version = version;

  await send_request_and_wait_for_response();

  // Compare the Exchange Server version stored for the server in prefs with the
  // expected value.
  const knownVersions = JSON.parse(
    Services.prefs.getCharPref(EWS_SERVER_VERSION_PREF, "{}")
  );
  const storedVersion = knownVersions[incomingServer.getStringValue("ews_url")];

  if (!expected) {
    Assert.ok(!storedVersion, "should not have a version stored");
  } else {
    // We don't use `Assert.stringMatches` here, because it performs the
    // check using a regexp based on the expected value. Some version
    // identifiers are substrings of others, and we don't want to
    // accidentally match e.g. "Exchange2013_SP1" when we expect
    // "Exchange2013".
    Assert.equal(
      storedVersion,
      expected,
      "stored version should match the expected identifier"
    );
  }
}
