/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the download URLs of WKD and mail provider key lookups.
 */

"use strict";

const { EnigmailWkdLookup } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/wkdLookup.sys.mjs"
);
const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

const _mx = DNS.mx;

registerCleanupFunction(function () {
  DNS.mx = _mx;
});

/**
 * Mock DNS MX lookups to return the given hosts.
 *
 * @param {string[]} hosts - MX hosts to return.
 */
function mockMX(hosts) {
  DNS.mx = async () => hosts.map((host, prio) => ({ prio, host }));
}

add_task(function testWkdUrl() {
  mockMX(["mail.protonmail.ch"]);
  Assert.equal(
    EnigmailWkdLookup.getDownloadUrlFromEmail("alice@pm.me", false),
    "https://pm.me/.well-known/openpgpkey/hu/kei1q4tipxxu1yj79k9kfukdhfy631xe?l=alice",
    "direct WKD URL should not depend on the mail provider"
  );
  Assert.equal(
    EnigmailWkdLookup.getDownloadUrlFromEmail("alice@pm.me", true),
    "https://openpgpkey.pm.me/.well-known/openpgpkey/pm.me/hu/kei1q4tipxxu1yj79k9kfukdhfy631xe?l=alice",
    "advanced WKD URL should not depend on the mail provider"
  );
});

add_task(async function testProtonMX() {
  for (const mxHost of ["mail.protonmail.ch", "mailsec.protonmail.ch"]) {
    mockMX(["mx.backup.example", mxHost]);
    Assert.equal(
      await EnigmailWkdLookup.getProviderUrlFromEmail("Alice@Example.com"),
      "https://api.protonmail.ch/pks/lookup?op=get&options=mr&search=alice@example.com",
      `domain with MX ${mxHost} should use the Proton keyserver`
    );
  }
});

add_task(async function testOtherMX() {
  mockMX(["mx.example.com"]);
  Assert.equal(
    await EnigmailWkdLookup.getProviderUrlFromEmail("alice@example.com"),
    null,
    "domain with non-Proton MX should have no provider keyserver"
  );

  mockMX([]);
  Assert.equal(
    await EnigmailWkdLookup.getProviderUrlFromEmail("alice@protonmail.com"),
    null,
    "provider keyserver should only be chosen by MX, not by domain name"
  );
});

add_task(async function testFailedMX() {
  DNS.mx = async () => {
    throw new Error("DNS failure");
  };
  Assert.equal(
    await EnigmailWkdLookup.getProviderUrlFromEmail("alice@example.com"),
    null,
    "failed MX lookup should result in no provider keyserver"
  );
});

add_task(function testShouldLookUpByDomain() {
  Assert.ok(
    !EnigmailWkdLookup.shouldLookUpByDomain("alice@Gmail.com"),
    "excluded domain should not be looked up"
  );
  for (const domain of [
    "example.com",
    "proton.me",
    "protonmail.com",
    "protonmail.ch",
    "pm.me",
  ]) {
    Assert.ok(
      EnigmailWkdLookup.shouldLookUpByDomain(`alice@${domain}`),
      `${domain} should be looked up`
    );
  }
});
