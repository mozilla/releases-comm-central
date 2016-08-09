/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsIMsgHeaderParser::makeFromDisplayAddress
 */

Components.utils.import("resource:///modules/mailServices.js");

function run_test() {
  const checks =
  [
    { displayString: "",
      addresses: [] },
    { displayString: "test@foo.invalid",
      addresses: [["", "test@foo.invalid"]] },
    { displayString: "test@foo.invalid, test2@foo.invalid",
      addresses: [["", "test@foo.invalid"],
                  ["", "test2@foo.invalid"]] },
    { displayString: "John Doe <test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]] },
    // Trim spaces.
    { displayString: "  John Doe  <test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]] },
    // No space before the email address.
    { displayString: " John Doe<test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]] },
    // Additional text after the email address to be ignored.
    { displayString: " John Doe<test@foo.invalid> Junior",
      addresses: [["John Doe", "test@foo.invalid"]] },
    { displayString: "Doe, John <test@foo.invalid>",
      addresses: [["Doe, John", "test@foo.invalid"]] },
    { displayString: "Doe, John <test@foo.invalid>, Bond, James <test2@foo.invalid>",
      addresses: [["Doe, John", "test@foo.invalid"],
                  ["Bond, James", "test2@foo.invalid"]] },
    // Additional text after the email address to be ignored, multiple addresses.
    { displayString: "Doe, John <test@foo.invalid>Junior, Bond, James <test2@foo.invalid>007",
      addresses: [["Doe, John", "test@foo.invalid"],
                  ["Bond, James", "test2@foo.invalid"]] },
    // More tests where the user forgot to close the quote or added extra quotes.
    { displayString: "\"Yatter King1 <a@a.a.a>",
      addresses: [["\"Yatter King1", "a@a.a.a"]] },
    { displayString: "Yatter King2\" <a@a.a.a>",
      addresses: [["Yatter King2\"", "a@a.a.a"]] },
    { displayString: "\"Yatter King3\" <a@a.a.a>",
      addresses: [["\"Yatter King3\"", "a@a.a.a"]] },
    { displayString: "Yatter \"XXX\" King4 <a@a.a.a>",
      addresses: [["Yatter \"XXX\" King4", "a@a.a.a"]] },
    { displayString: "\"Yatter \"XXX\" King5\" <a@a.a.a>",
      addresses: [["\"Yatter \"XXX\" King5\"", "a@a.a.a"]] },
    { displayString: "\"Yatter King6 <a@a.a.a>\"",
      addresses: [["\"Yatter King6", "a@a.a.a"]] },
    { displayString: "\"Yatter King7 <a@a.a.a>\" <b@b.b.b>",
      addresses: [["\"Yatter King7 <a@a.a.a>\"", "b@b.b.b"]] },
  ];

  // Test -  strings

  for (let i = 0; i < checks.length; ++i) {
    dump("Test " + i + "\n");
    let addrs = MailServices.headerParser.makeFromDisplayAddress(checks[i].displayString, {});
    let checkaddrs = checks[i].addresses;
    do_check_eq(addrs.length, checkaddrs.length);
    for (let j = 0; j < addrs.length; j++) {
      do_check_eq(addrs[j].name, checkaddrs[j][0]);
      do_check_eq(addrs[j].email, checkaddrs[j][1]);
    }
  }
}
