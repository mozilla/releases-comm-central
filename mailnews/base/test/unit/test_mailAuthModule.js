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

add_task(function testValidChallenge() {
  // NTLMv2 requires target info in the challenge.
  Services.prefs.setBoolPref("network.auth.force-generic-ntlm-v1", true);
  try {
    const authModule = createNtlmModule();
    Assert.ok(
      atob(authModule.getNextToken(NTLM_CHALLENGE)).startsWith("NTLMSSP\0\x03"),
      "answer to the challenge should be an NTLM authenticate message"
    );
  } finally {
    Services.prefs.clearUserPref("network.auth.force-generic-ntlm-v1");
  }
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

/**
 * Creates an NTLM type 2 message whose target info follows the header.
 *
 * @param {number} targetInfoLength - The length claimed for the target info.
 * @param {string} targetInfo - The base64 appended to the header, which may
 *   not be valid.
 * @returns {string} The base64 encoded message.
 */
function createNtlmChallengeWithTargetInfo(targetInfoLength, targetInfo) {
  const header = new Uint8Array(48);
  header.set([..."NTLMSSP\0\x02"].map(c => c.charCodeAt(0)));
  // Flags: NTLMSSP_NEGOTIATE_UNICODE and NTLMSSP_NEGOTIATE_NTLM.
  header.set([0x01, 0x82], 20);
  header.set([1, 2, 3, 4, 5, 6, 7, 8], 24);
  const view = new DataView(header.buffer);
  view.setUint16(40, targetInfoLength, true);
  view.setUint16(42, targetInfoLength, true);
  view.setUint32(44, header.length, true);
  return btoa(String.fromCharCode(...header)) + targetInfo;
}

add_task(function testUndecodedTargetInfo() {
  // NTLMv2, the default, echoes the target info back to the server.
  const authModule = createNtlmModule();
  Assert.ok(
    atob(
      authModule.getNextToken(
        createNtlmChallengeWithTargetInfo(1024, "A".repeat(1400))
      )
    ).startsWith("NTLMSSP\0\x03"),
    "answer to a decodable challenge should be an NTLM authenticate message"
  );

  // Decoding stops at the "!", so the target info would be undecoded memory.
  const leakingAuthModule = createNtlmModule();
  Assert.throws(
    () =>
      leakingAuthModule.getNextToken(
        createNtlmChallengeWithTargetInfo(1024, "!" + "A".repeat(1399))
      ),
    /NS_ERROR_FAILURE/,
    "challenge with undecodable target info should be rejected"
  );
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
