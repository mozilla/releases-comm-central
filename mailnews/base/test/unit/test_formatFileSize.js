/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for MailUtils.formatFileSize.
 */

const { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

const KB = 1024;
const MB = 1024 * KB;
const GB = 1024 * MB;
const TB = 1024 * GB;
const PB = 1024 * TB;

// The short form of the byte unit is not pluralized in en-US ("10 byte"),
// which looks like a CLDR/ICU issue. Sizes below 1 kB are rare in practice.
const testData = [
  { bytes: -1, useKB: false, expected: "0 byte" },
  { bytes: 0, useKB: false, expected: "0 byte" },
  { bytes: 1, useKB: false, expected: "1 byte" },
  { bytes: 10, useKB: false, expected: "10 byte" },
  { bytes: 999, useKB: false, expected: "999 byte" },
  { bytes: 1000, useKB: false, expected: "1.0 kB" },
  { bytes: KB, useKB: false, expected: "1.0 kB" },
  { bytes: 1280, useKB: false, expected: "1.3 kB" },
  { bytes: 10 * KB, useKB: false, expected: "10.0 kB" },
  { bytes: 99.94 * KB, useKB: false, expected: "99.9 kB" },
  { bytes: 99.96 * KB, useKB: false, expected: "100 kB" },
  { bytes: 999 * KB, useKB: false, expected: "999 kB" },
  { bytes: 1000 * KB, useKB: false, expected: "1.0 MB" },
  { bytes: MB, useKB: false, expected: "1.0 MB" },
  { bytes: 10 * MB, useKB: false, expected: "10.0 MB" },
  { bytes: 999 * MB, useKB: false, expected: "999 MB" },
  { bytes: 1000 * MB, useKB: false, expected: "1.0 GB" },
  { bytes: GB, useKB: false, expected: "1.0 GB" },
  { bytes: 10 * GB, useKB: false, expected: "10.0 GB" },
  { bytes: 999 * GB, useKB: false, expected: "999 GB" },
  { bytes: 1000 * GB, useKB: false, expected: "1.0 TB" },
  { bytes: TB, useKB: false, expected: "1.0 TB" },
  { bytes: 10 * TB, useKB: false, expected: "10.0 TB" },
  { bytes: 999 * TB, useKB: false, expected: "999 TB" },
  { bytes: 1000 * TB, useKB: false, expected: "1.0 PB" },
  { bytes: PB, useKB: false, expected: "1.0 PB" },
  { bytes: 10 * PB, useKB: false, expected: "10.0 PB" },
  { bytes: 999 * PB, useKB: false, expected: "999 PB" },
  { bytes: 1000 * PB, useKB: false, expected: "1,000 PB" },

  { bytes: 0, useKB: true, expected: "0 kB" },
  { bytes: 1, useKB: true, expected: "0.1 kB" },
  { bytes: 500, useKB: true, expected: "0.5 kB" },
  { bytes: 999, useKB: true, expected: "1.0 kB" },
  { bytes: 10 * MB, useKB: true, expected: "10.0 MB" },
];

add_task(function test_formatFileSize() {
  for (const { bytes, useKB, expected } of testData) {
    Assert.equal(
      MailUtils.formatFileSize(bytes, useKB),
      expected,
      `${bytes} bytes (useKB=${useKB}) should be formatted correctly`
    );
  }
});
