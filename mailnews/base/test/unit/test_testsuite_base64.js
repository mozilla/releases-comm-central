/**
 * Tests functions atob() and btoa() in mailnews/test/resources/MailTestUtils.sys.mjs.
 *
 * Note:
 * btoa() = base64 encode
 * atob() = base64 decode
 * (i.e. "binary" = plain, and "ascii" = encoded)
 */

function run_test() {
  var plain = "testtesttest";
  var encoded = "dGVzdHRlc3R0ZXN0";

  // correct encoding according to spec
  Assert.equal(btoa(plain), encoded); // encode
  Assert.equal(atob(encoded), plain); // decode

  // roundtrip works
  Assert.equal(atob(btoa(plain)), plain);
  Assert.equal(btoa(atob(encoded)), encoded);
  return true;
}
