/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests parsing of res_search() responses in DNS.worker.mjs.
 */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

let results;

add_setup(async function () {
  Services.io
    .getProtocolHandler("resource")
    .QueryInterface(Ci.nsIResProtocolHandler)
    .setSubstitution(
      "dnstest",
      Services.io.newFileURI(do_get_file("resources/"))
    );
  const worker = new ChromeWorker(
    `resource://dnstest/dnsParserWorker.mjs?${AppConstants.unixstyle}`,
    { type: "module" }
  );
  results = await new Promise((resolve, reject) => {
    worker.onmessage = event => resolve(event.data);
    worker.onerror = event => reject(new Error(event.message));
  });
  worker.terminate();
});

function checkMXRecords(result, count) {
  Assert.equal(result.error, undefined, "Lookup should not fail");
  Assert.equal(result.records.length, count, "Should get all MX records");
  for (const [i, record] of result.records.entries()) {
    Assert.equal(record.prio, 10 + i, "MX priority should be parsed");
    Assert.equal(
      record.host,
      `mx${10 + i}.example.com`,
      "MX host should be parsed"
    );
  }
}

add_task(function test_largeResponse() {
  checkMXRecords(results.large, 40);
});

add_task(function test_responseFillingBuffer() {
  checkMXRecords(results.exactBuffer, 30);
});

add_task(function test_truncatedResponse() {
  checkMXRecords(results.truncated, 30);
});

add_task(function test_shortRecords() {
  Assert.equal(
    results.shortMX.error,
    "Invalid MX record data length 2.",
    "MX record without a host should be rejected"
  );
  Assert.equal(
    results.shortSRV.error,
    "Invalid SRV record data length 6.",
    "SRV record without a host should be rejected"
  );
});
