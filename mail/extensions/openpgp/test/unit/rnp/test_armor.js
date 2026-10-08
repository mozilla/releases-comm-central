/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests parsing of the Charset armor header.
 */

"use strict";

const { EnigmailArmor } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/armor.sys.mjs"
);

/**
 * Build an armored message where every line is prefixed with the indent.
 *
 * @param {string} indent - The text before each line.
 * @param {string[]} headers - The armor header lines.
 * @returns {string} the armored message.
 */
function armored(indent, headers) {
  return [
    "-----BEGIN PGP MESSAGE-----",
    ...headers,
    "",
    "data",
    "-----END PGP MESSAGE-----",
    "",
  ]
    .map(line => indent + line)
    .join("\n");
}

add_task(function testCharset() {
  Assert.equal(
    EnigmailArmor.getArmorCharset(
      armored("", ["Comment: hi", "Charset: ISO-8859-1"])
    ),
    "ISO-8859-1",
    "the charset should be found"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(armored("", ["charset: utf-8"])),
    "utf-8",
    "the header name should be case-insensitive"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(armored("", ["Charset:  UTF-8 "])),
    "UTF-8",
    "the charset should be trimmed"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(armored("", ["Charset: "])),
    null,
    "there should be no charset for an empty header"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(armored("", ["Comment: hi"])),
    null,
    "there should be no charset without the header"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(
      armored("", ["Charset: UTF-8"]).replace("\n\n", "\n")
    ),
    null,
    "there should be no charset without the end of the headers"
  );
});

add_task(function testQuotedCharset() {
  Assert.equal(
    EnigmailArmor.getArmorCharset("x\n" + armored("> ", ["Charset: UTF-8"])),
    "UTF-8",
    "the charset should be found when the block is indented"
  );
});

add_task(function testIndentWithRegExpChars() {
  Assert.equal(
    EnigmailArmor.getArmorCharset(
      "x\n" + armored("(", ["Charset: UTF-8", "a".repeat(40)])
    ),
    "UTF-8",
    "an indent of regexp syntax should be matched literally"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(
      "x\n" +
        armored("(a+)+b", ["Charset: UTF-8", "Comment: hi"]).replace(
          "(a+)+bComment: hi",
          "a".repeat(40)
        )
    ),
    "UTF-8",
    "an indent of a slow regexp should be matched literally"
  );
  Assert.equal(
    EnigmailArmor.getArmorCharset(
      "x\n" + armored(".", ["Charset: UTF-8"]).replace(".Charset", "xCharset")
    ),
    null,
    "a header without the indent should not be used"
  );
});
