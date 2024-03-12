/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgHeaderParser functions:
 *   parseDecodedHeader
 *   parseEncodedHeader
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function equalArrays(arr1, arr2) {
  Assert.equal(arr1.length, arr2.length);
  for (let i = 0; i < arr1.length; i++) {
    Assert.equal(arr1[i].name, arr2[i].name);
    Assert.equal(arr1[i].email, arr2[i].email);
  }
}

function run_test() {
  // In this array, the sub arrays consist of the following elements:
  // 0: input string
  // 1: expected output from parseDecodedHeader
  // 2: expected output from parseEncodedHeader
  const checks = [
    [
      "abc@foo.invalid",
      [{ name: "", email: "abc@foo.invalid" }],
      [{ name: "", email: "abc@foo.invalid" }],
    ],
    [
      "foo <ghj@foo.invalid>",
      [{ name: "foo", email: "ghj@foo.invalid" }],
      [{ name: "foo", email: "ghj@foo.invalid" }],
    ],
    [
      "abc@foo.invalid, foo <ghj@foo.invalid>",
      [
        { name: "", email: "abc@foo.invalid" },
        { name: "foo", email: "ghj@foo.invalid" },
      ],
      [
        { name: "", email: "abc@foo.invalid" },
        { name: "foo", email: "ghj@foo.invalid" },
      ],
    ],
    // UTF-8 names
    [
      "foo\u00D0 bar <foo@bar.invalid>, \u00C3\u00B6foo <ghj@foo.invalid>",
      [
        { name: "foo\u00D0 bar", email: "foo@bar.invalid" },
        { name: "\u00C3\u00B6foo", email: "ghj@foo.invalid" },
      ],
      [
        { name: "foo\uFFFD bar", email: "foo@bar.invalid" },
        { name: "\u00F6foo", email: "ghj@foo.invalid" },
      ],
    ],
    // Bug 961564
    [
      "someone <>",
      [{ name: "someone", email: "" }],
      [{ name: "someone", email: "" }],
    ],
    // Bug 1423432: Encoded strings with null bytes,
    // in base64 a single null byte can be encoded as AA== to AP==.
    // parseEncodedHeader will remove the nullbyte.
    [
      '"null=?UTF-8?Q?=00?=byte" <nullbyte@example.com>',
      [{ name: "null=?UTF-8?Q?=00?=byte", email: "nullbyte@example.com" }],
      [{ name: "nullbyte", email: "nullbyte@example.com" }],
    ],
    [
      '"null=?UTF-8?B?AA==?=byte" <nullbyte@example.com>',
      [{ name: "null=?UTF-8?B?AA==?=byte", email: "nullbyte@example.com" }],
      [{ name: "nullbyte", email: "nullbyte@example.com" }],
    ],
    ["", [], []],
    [" \r\n\t", [], []],
    [
      // This used to cause memory read overruns.
      '" "@a a;b',
      [
        { name: "", email: '" "@a a' },
        { name: "b", email: "" },
      ],
      [
        { name: "", email: "@a a" },
        { name: "b", email: "" },
      ],
    ],
  ];

  for (const check of checks) {
    equalArrays(
      MailServices.headerParser.parseDecodedHeader(check[0]),
      check[1]
    );
    equalArrays(
      MailServices.headerParser.parseEncodedHeader(check[0], "UTF-8"),
      check[2]
    );
  }
}
