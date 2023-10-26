/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgHeaderParser functions:
 *   extractHeaderAddressMailboxes
 *   extractFirstName
 *   parseDecodedHeader
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function run_test() {
  // In this array, the sub arrays consist of the following elements:
  // 0: input string (a comma separated list of recipients)
  // 1: expected output from extractHeaderAddressMailboxes
  // 2: list of recipient names in the string
  // 3: first recipient name in the string
  const checks = [
    [
      "abc@foo.invalid",
      "abc@foo.invalid",
      "abc@foo.invalid",
      "abc@foo.invalid",
    ],
    ["foo <ghj@foo.invalid>", "ghj@foo.invalid", "foo", "foo"],
    [
      "abc@foo.invalid, foo <ghj@foo.invalid>",
      "abc@foo.invalid, ghj@foo.invalid",
      "abc@foo.invalid, foo",
      "abc@foo.invalid",
    ],
    ["foo bar <foo@bar.invalid>", "foo@bar.invalid", "foo bar", "foo bar"],
    [
      "foo bar <foo@bar.invalid>, abc@foo.invalid, foo <ghj@foo.invalid>",
      "foo@bar.invalid, abc@foo.invalid, ghj@foo.invalid",
      "foo bar, abc@foo.invalid, foo",
      "foo bar",
    ],
    // UTF-8 names
    [
      "foo\u00D0 bar <foo@bar.invalid>, \u00F6foo <ghj@foo.invalid>",
      "foo@bar.invalid, ghj@foo.invalid",
      "foo\u00D0 bar, \u00F6foo",
      "foo\u00D0 bar",
    ],
    // More complicated examples drawn from RFC 2822
    [
      '"Joe Q. Public" <john.q.public@example.com>,Test <"abc!x.yz"@foo.invalid>, Test <test@[xyz!]>,"Giant; \\"Big\\" Box" <sysservices@example.net>',
      'john.q.public@example.com, "abc!x.yz"@foo.invalid, test@[xyz!], sysservices@example.net',
      'Joe Q. Public, Test, Test, Giant; "Big" Box',
      // extractFirstName returns unquoted names, hence the difference.
      "Joe Q. Public",
    ],
    // Bug 549931
    [
      "Undisclosed recipients:;",
      "", // Mailboxes
      "", // Address Names
      "",
    ], // Address Name
  ];

  // Test - empty strings

  Assert.equal(MailServices.headerParser.extractHeaderAddressMailboxes(""), "");
  Assert.equal(MailServices.headerParser.extractFirstName(""), "");

  // Test - extractHeaderAddressMailboxes

  for (let i = 0; i < checks.length; ++i) {
    Assert.equal(
      MailServices.headerParser.extractHeaderAddressMailboxes(checks[i][0]),
      checks[i][1]
    );
    const _names = MailServices.headerParser
      .parseDecodedHeader(checks[i][0])
      .map(addr => addr.name || addr.email)
      .join(", ");
    Assert.equal(_names, checks[i][2]);
    Assert.equal(
      MailServices.headerParser.extractFirstName(checks[i][0]),
      checks[i][3]
    );
  }
}
