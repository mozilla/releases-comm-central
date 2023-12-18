/**
 * Tests functions in mailnews/test/fakeserver/Auth.sys.mjs
 * which are responsible for the authentication in the
 * fakeserver.
 *
 * Do NOT essentially re-code the auth schemes here,
 * just check roundtrips, against static values etc..
 */

var { AuthPLAIN, AuthCRAM } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Auth.sys.mjs"
);

var kUsername = "fred1";
var kPassword = "wilma2";

function run_test() {
  authPLAIN();
  authCRAMMD5();
  return true;
}

/**
 * Test AUTH PLAIN
 */
function authPLAIN() {
  // roundtrip works
  var line = AuthPLAIN.encodeLine(kUsername, kPassword);
  var req = AuthPLAIN.decodeLine(line);
  Assert.equal(req.username, kUsername);
  Assert.equal(req.password, kPassword);

  // correct encoding
  Assert.equal(line, "AGZyZWQxAHdpbG1hMg==");
}

/**
 * Test AUTH CRAM-MD5
 */
function authCRAMMD5() {
  // AuthCRAM.createChallenge() creates a different challenge each time
  var hardcodedChallenge = btoa("<123@fake.invalid>");
  var hardcodedResponse =
    "ZnJlZDEgOTA5YjgwMmM3NTI5NTJlYzI2NjgyMTNmYTdjNWU0ZjQ=";

  // correct encoding
  var req = AuthCRAM.decodeLine(hardcodedResponse);
  Assert.equal(req.username, kUsername);
  var expectedDigest = AuthCRAM.encodeCRAMMD5(hardcodedChallenge, kPassword);
  Assert.equal(req.digest, expectedDigest);

  var challenge = AuthCRAM.createChallenge("fake.invalid");
  challenge = atob(challenge); // decode. function currently returns it already encoded
  var challengeSplit = challenge.split("@");
  Assert.equal(challengeSplit.length, 2);
  Assert.equal(challengeSplit[1], "fake.invalid>");
  Assert.equal(challengeSplit[0][0], "<");
}
