/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests nsIMailAuthModule.getNextToken with server challenges that are not
 * valid base64.
 */

// An NTLM type 2 (challenge) message without target info.
const NTLM_CHALLENGE =
  "TlRMTVNTUAACAAAAAAAAAAAoAAABggAAASNFZ4mrze8AAAAAAAAAAAAAAAAAAAAA";

/**
 * Creates an NTLM auth module that has already produced its negotiate message.
 *
 * @returns {nsIMailAuthModule}
 */
function createNtlmModule() {
  const authModule = Cc["@mozilla.org/mail/auth-module;1"].createInstance(
    Ci.nsIMailAuthModule
  );
  authModule.init("ntlm", "", 0, "", "user", "password");
  Assert.ok(
    atob(authModule.getNextToken("")).startsWith("NTLMSSP\0\x01"),
    "first token should be an NTLM negotiate message"
  );
  return authModule;
}

add_setup(function () {
  // NTLMv2 requires target info in the challenge.
  Services.prefs.setBoolPref("network.auth.force-generic-ntlm-v1", true);
  registerCleanupFunction(() =>
    Services.prefs.clearUserPref("network.auth.force-generic-ntlm-v1")
  );
});

add_task(function testValidChallenge() {
  const authModule = createNtlmModule();
  Assert.ok(
    atob(authModule.getNextToken(NTLM_CHALLENGE)).startsWith("NTLMSSP\0\x03"),
    "answer to the challenge should be an NTLM authenticate message"
  );
});

add_task(function testPaddingOnlyChallenge() {
  for (const challenge of ["=", "===="]) {
    const authModule = createNtlmModule();
    Assert.throws(
      () => authModule.getNextToken(challenge),
      /NS_ERROR/,
      `challenge ${challenge} should be rejected`
    );
  }
});

add_task(function testInvalidChallenge() {
  for (const challenge of ["!!!!", "TlRMT"]) {
    const authModule = createNtlmModule();
    Assert.throws(
      () => authModule.getNextToken(challenge),
      /NS_ERROR_FAILURE/,
      `challenge ${challenge} should be rejected`
    );
  }
});

add_task(function testNotInitialized() {
  const authModule = Cc["@mozilla.org/mail/auth-module;1"].createInstance(
    Ci.nsIMailAuthModule
  );
  Assert.throws(
    () => authModule.getNextToken(""),
    /NS_ERROR_NOT_INITIALIZED/,
    "getNextToken should fail before init"
  );
});
