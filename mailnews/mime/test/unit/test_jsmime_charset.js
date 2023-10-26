/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that the charset decoding uses nsICharsetDecoder instead of
// TextDecoder, to get some extra charsets.

const { jsmime } = ChromeUtils.import("resource:///modules/jsmime.jsm");

var tests = [
  ["=?UTF-7?Q?+AKM-1?=", "\u00A31"],
  ["=?UTF-7?Q?+AK?= =?UTF-7?Q?M-1?=", "\u00A31"],
  ["=?UTF-8?Q?=C2?=", "\uFFFD"], // Replacement character for invalid input.
  ["=?NotARealCharset?Q?text?=", "=?NotARealCharset?Q?text?="],
  ["\xC2\xA31", "\u00A31", "ISO-8859-2"],
  ["\xA31", "\u01411", "ISO-8859-2"],
  ["\xC21", "\u00C21", "ISO-8859-1"],
  // "Here comes the text." in Japanese encoded in Shift_JIS, also using Thunderbird's alias cp932.
  [
    "=?shift_jis?Q?=82=b1=82=b1=82=c9=96=7b=95=b6=82=aa=82=ab=82=dc=82=b7=81=42?=",
    "ここに本文がきます。",
  ],
  ["=?shift_jis?B?grGCsYLJlnuVtoKqgquC3IK3gUI=?=", "ここに本文がきます。"],
  [
    "=?cp932?Q?=82=b1=82=b1=82=c9=96=7b=95=b6=82=aa=82=ab=82=dc=82=b7=81=42?=",
    "ここに本文がきます。",
  ],
  ["=?cp932?B?grGCsYLJlnuVtoKqgquC3IK3gUI=?=", "ここに本文がきます。"],
];

function run_test() {
  for (const test of tests) {
    dump("Testing message " + test[0]);
    let value = test[0];
    if (test.length > 2) {
      value = jsmime.headerparser.convert8BitHeader(value, test[2]);
    }
    Assert.equal(
      jsmime.headerparser.parseStructuredHeader("Subject", value),
      test[1]
    );
  }
}
