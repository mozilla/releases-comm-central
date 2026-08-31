/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that searching an HKP keyserver downloads a key only if the search
 * result was unambiguous. The status flags of a search result are used to
 * skip keys the server reports as unusable, but an empty or absent status
 * doesn't confirm that a key is valid.
 */

var { EnigmailKeyServer } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyserver.sys.mjs"
);

const { HttpServer } = ChromeUtils.importESModule(
  "resource://testing-common/httpd.sys.mjs"
);

const KEY_A = "F231550C4F47E38EF231550C4F47E38EF231550C";
const KEY_B = "FBFCC82A015E7330FBFCC82A015E7330FBFCC82A";
const KEY_DATA =
  "-----BEGIN PGP PUBLIC KEY BLOCK-----\r\n\r\nnot-a-real-key\r\n" +
  "-----END PGP PUBLIC KEY BLOCK-----\r\n";

// The HTTP server used to simulate a keyserver.
var httpServer;
// The keyserver URL to search on.
var keyserver;
// The result lines that the server returns for the next index (search) request.
var indexLines = [];
// The search parameter of the most recent get (download) request, if any.
var downloadedSearch;

registerCleanupFunction(function () {
  httpServer.stop();
});

add_setup(async function () {
  httpServer = new HttpServer();
  httpServer.registerPathHandler("/pks/lookup", (request, response) => {
    const params = new URLSearchParams(request.queryString);
    if (params.get("op") == "index") {
      if (!indexLines.length) {
        response.setStatusLine(request.httpVersion, 404, "Not Found");
        return;
      }
      response.setHeader("Content-Type", "text/plain", false);
      response.write(
        [`info:1:${indexLines.length}`, ...indexLines].join("\r\n")
      );
      return;
    }
    downloadedSearch = params.get("search");
    response.setHeader("Content-Type", "application/pgp-keys", false);
    response.write(KEY_DATA);
  });
  httpServer.start(-1);
  keyserver = `hkp://127.0.0.1:${httpServer.identity.primaryPort}`;
});

/**
 * @param {string} keyId - Key ID to report.
 * @param {string} [flags] - Status flags to report, e.g. "r" for revoked.
 * @param {boolean} [omitFlagsField] - If true, don't send a flags field at all.
 * @returns {string} The lines of one search result entry.
 */
function entry(keyId, flags = "", omitFlagsField = false) {
  const pub = omitFlagsField
    ? `pub:${keyId}:1:4096:1500000000:`
    : `pub:${keyId}:1:4096:1500000000::${flags}`;
  return `${pub}\r\nuid:Alice <alice@openpgp.example>:1500000000::`;
}

/**
 * Search for a key, with the server returning the given result entries.
 *
 * @param {...string} entries - Result entries, as returned by entry().
 * @returns {?object} The result of the search.
 */
async function search(...entries) {
  indexLines = entries;
  downloadedSearch = undefined;
  return EnigmailKeyServer.searchAndDownloadSingleResultNoImport(
    "alice@openpgp.example",
    keyserver
  );
}

add_task(async function testNoKeyFound() {
  Assert.equal(await search(), null, "should not find a key");
  Assert.equal(downloadedSearch, undefined, "should not download a key");
});

add_task(async function testSingleKeyWithoutFlags() {
  const found = await search(entry(KEY_A));
  Assert.equal(found?.keyData, KEY_DATA, "should download the key");
  Assert.equal(downloadedSearch, `0x${KEY_A}`, "should download the found key");
});

add_task(async function testSingleKeyWithoutFlagsField() {
  const found = await search(entry(KEY_A, "", true));
  Assert.equal(found?.keyData, KEY_DATA, "should download the key");
  Assert.equal(downloadedSearch, `0x${KEY_A}`, "should download the found key");
});

add_task(async function testSingleRevokedKey() {
  Assert.equal(await search(entry(KEY_A, "r")), null, "should not use the key");
  Assert.equal(downloadedSearch, undefined, "should not download a key");
});

add_task(async function testSingleExpiredKey() {
  Assert.equal(await search(entry(KEY_A, "e")), null, "should not use the key");
  Assert.equal(downloadedSearch, undefined, "should not download a key");
});

add_task(async function testOneUsableAndOneRevokedKey() {
  const found = await search(entry(KEY_A, "r"), entry(KEY_B));
  Assert.equal(found?.keyData, KEY_DATA, "should download a key");
  Assert.equal(
    downloadedSearch,
    `0x${KEY_B}`,
    "should download the key that isn't revoked"
  );
});

add_task(async function testOneUsableAndOneRevokedAndExpiredKey() {
  const found = await search(entry(KEY_A, "er"), entry(KEY_B));
  Assert.equal(found?.keyData, KEY_DATA, "should download a key");
  Assert.equal(
    downloadedSearch,
    `0x${KEY_B}`,
    "should download the key without flags"
  );
});

add_task(async function testMultipleRevokedKeys() {
  Assert.equal(
    await search(entry(KEY_A, "r"), entry(KEY_B, "r")),
    null,
    "should not use any key"
  );
  Assert.equal(downloadedSearch, undefined, "should not download a key");
});

add_task(async function testMultipleKeysWithoutFlags() {
  Assert.equal(
    await search(entry(KEY_A), entry(KEY_B)),
    null,
    "should not use any key"
  );
  Assert.equal(downloadedSearch, undefined, "should not download a key");
});
