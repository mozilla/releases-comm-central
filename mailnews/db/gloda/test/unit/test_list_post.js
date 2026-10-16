/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test extraction of the mailing list address from the List-Post header.
 */

var { GlodaDatastore } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaDatastore.sys.mjs"
);
var { GlodaFundAttr } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaFundAttr.sys.mjs"
);

registerCleanupFunction(function () {
  GlodaDatastore.shutdown();
});

add_task(function test_list_post_regex() {
  const cases = [
    ["<mailto:list@example.com>", "list@example.com"],
    ["  <mailto:list@example.com> (Post)", "list@example.com"],
    [
      "<http://example.com/post>, <mailto:list@example.com>",
      "list@example.com",
    ],
    ["<mailto:>, <mailto:list@example.com>", "list@example.com"],
    ["<mailto:list@example.com", null],
    ["<mailto:a<mailto:list@example.com>", "list@example.com"],
    ["NO", null],
    ["", null],
  ];
  for (const [value, expected] of cases) {
    Assert.equal(
      GlodaFundAttr.RE_LIST_POST.exec(value)?.[1] ?? null,
      expected,
      `address extracted from "${value}" should be correct`
    );
  }
});

add_task(function test_list_post_regex_unterminated() {
  const value = "<mailto:a".repeat(500000);
  const start = Date.now();
  Assert.equal(
    GlodaFundAttr.RE_LIST_POST.exec(value)?.[1] ?? null,
    null,
    "unterminated <mailto: prefixes should yield no address"
  );
  Assert.less(
    Date.now() - start,
    1000,
    "unterminated <mailto: prefixes should be scanned quickly"
  );
});
