/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { makeMozIconImageSet, makeMozIconSrcSet } = ChromeUtils.importESModule(
  "resource:///modules/MozIconUtils.mjs"
);

function assertSrcSetCandidates(srcset, expectedCandidates) {
  const candidates = srcset.split(", ");

  Assert.deepEqual(candidates, expectedCandidates, "Should format srcset");

  for (const candidate of candidates) {
    const [url, scale] = candidate.split(" ");
    Assert.ok(
      !/[,\s]/.test(url),
      `Should not leave srcset separators unescaped in ${url}`
    );
    Assert.ok(/^\d+x$/.test(scale), `Should have a scale descriptor: ${scale}`);
  }
}

add_task(function test_makeMozIconSrcSet_escapes_filename_spaces() {
  assertSrcSetCandidates(makeMozIconSrcSet("report final.txt", 16), [
    "moz-icon://report%20final.txt?size=16&scale=1 1x",
    "moz-icon://report%20final.txt?size=16&scale=2 2x",
    "moz-icon://report%20final.txt?size=16&scale=3 3x",
  ]);
});

add_task(function test_makeMozIconSrcSet_escapes_filename_commas() {
  assertSrcSetCandidates(
    makeMozIconSrcSet("report, final.txt", 16, {
      contentType: "text/plain",
    }),
    [
      "moz-icon://report%2C%20final.txt?size=16&contentType=text/plain&scale=1 1x",
      "moz-icon://report%2C%20final.txt?size=16&contentType=text/plain&scale=2 2x",
      "moz-icon://report%2C%20final.txt?size=16&contentType=text/plain&scale=3 3x",
    ]
  );
});

add_task(function test_makeMozIconSrcSet_preserves_escaped_file_urls() {
  assertSrcSetCandidates(
    makeMozIconSrcSet("file:///home/me/report%20final.txt", 32),
    [
      "moz-icon://file:///home/me/report%20final.txt?size=32&scale=1 1x",
      "moz-icon://file:///home/me/report%20final.txt?size=32&scale=2 2x",
      "moz-icon://file:///home/me/report%20final.txt?size=32&scale=3 3x",
    ]
  );
});

add_task(function test_makeMozIconSrcSet_appends_to_existing_query() {
  assertSrcSetCandidates(
    makeMozIconSrcSet("moz-icon://goat?contentType=text/plain", 16),
    [
      "moz-icon://goat?contentType=text/plain&size=16&scale=1 1x",
      "moz-icon://goat?contentType=text/plain&size=16&scale=2 2x",
      "moz-icon://goat?contentType=text/plain&size=16&scale=3 3x",
    ]
  );
});

add_task(function test_makeMozIconSrcSet_escapes_query_delimiters() {
  assertSrcSetCandidates(
    makeMozIconSrcSet("report.txt", 16, {
      contentType: "text/plain&scale=9?size=64#fragment",
    }),
    [
      "moz-icon://report.txt?size=16&contentType=text/plain%26scale=9%3Fsize=64%23fragment&scale=1 1x",
      "moz-icon://report.txt?size=16&contentType=text/plain%26scale=9%3Fsize=64%23fragment&scale=2 2x",
      "moz-icon://report.txt?size=16&contentType=text/plain%26scale=9%3Fsize=64%23fragment&scale=3 3x",
    ]
  );
});

add_task(function test_makeMozIconImageSet_escapes_filename_spaces() {
  Assert.equal(
    makeMozIconImageSet("report final.txt", 16),
    'image-set("moz-icon://report%20final.txt?size=16&scale=1" 1x, "moz-icon://report%20final.txt?size=16&scale=2" 2x, "moz-icon://report%20final.txt?size=16&scale=3" 3x)',
    "Should format escaped CSS image-set"
  );
});
