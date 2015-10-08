/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that the charset decoding uses nsICharsetDecoder instead of
// TextDecoder, to get some extra charsets.

Components.utils.import("resource:///modules/jsmime.jsm");

var tests = [
  ["=?UTF-7?Q?+AKM-1?=", "\u00A31"],
  ["=?UTF-7?Q?+AK?= =?UTF-7?Q?M-1?=", "\u00A31"],
  ["=?UTF-8?Q?=C2?=", ""],
  ["=?NotARealCharset?Q?text?=", "=?NotARealCharset?Q?text?="],
  ["=?x-mac-croatian?Q?=E9?=", "\u00C8"],
  ["\xC2\xA31", "\u00A31", "ISO-8859-2"],
  ["\xA31", "\u01411", "ISO-8859-2"],
  ["\xC21", "\u00C21", "ISO-8859-1"],
];

function run_test() {
  for (let test of tests) {
    dump("Testing message " + test[0]);
    let value = test[0];
    if (test.length > 2)
      value = jsmime.headerparser.convert8BitHeader(value, test[2])
    do_check_eq(jsmime.headerparser.parseStructuredHeader("Subject", value),
      test[1]);
  }
}
