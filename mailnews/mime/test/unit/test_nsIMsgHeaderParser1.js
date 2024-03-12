/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgHeaderParser functions.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function run_test() {
  var checks = [
    ["", "test@foo.invalid", "test@foo.invalid"],
    ["Test", "test@foo.invalid", "Test <test@foo.invalid>"],
    ["Test", '"abc!x.yz"@foo.invalid', 'Test <"abc!x.yz"@foo.invalid>'],
    ["Test", "test.user@foo.invalid", "Test <test.user@foo.invalid>"],
    ["Test", "test@[xyz!]", "Test <test@[xyz!]>"],
    // Based on RFC 2822 A.1.1
    ["John Doe", "jdoe@machine.example", "John Doe <jdoe@machine.example>"],
    // Next 2 tests Based on RFC 2822 A.1.2
    [
      "Joe Q. Public",
      "john.q.public@example.com",
      '"Joe Q. Public" <john.q.public@example.com>',
    ],
    [
      'Giant; "Big" Box',
      "sysservices@example.net",
      '"Giant; \\"Big\\" Box" <sysservices@example.net>',
    ],
    ["trailing", "t1@example.com ", "trailing <t1@example.com>"],
    ["leading", " t2@example.com", "leading <t2@example.com>"],
    [
      "leading trailing",
      " t3@example.com  ",
      "leading trailing <t3@example.com>",
    ],
    ["", " t4@example.com  ", "t4@example.com"],
  ];

  // Test - empty strings

  Assert.equal(MailServices.headerParser.makeMimeAddress("", ""), "");

  // Test - makeMimeAddress

  for (let i = 0; i < checks.length; ++i) {
    Assert.equal(
      MailServices.headerParser.makeMimeAddress(checks[i][0], checks[i][1]),
      checks[i][2]
    );
  }
}
