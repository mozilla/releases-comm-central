/*
 * Test that nsIMsgHeaderParser.parseHeadersWithArray returns
 * null instead of 0-length strings.
 */

var {MailServices} = ChromeUtils.import("resource:///modules/MailServices.jsm");

function run_test() {
  let addresses = {}, names = {}, fullAddresses = {};
  let n = MailServices.headerParser.parseHeadersWithArray("example@host.invalid",
                                                          addresses, names, fullAddresses);
  Assert.equal(1, n);
  Assert.equal("example@host.invalid", addresses.value[0]);
  Assert.equal(null, names.value[0]);
  Assert.equal("example@host.invalid", fullAddresses.value[0]);
}
