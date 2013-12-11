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
    { displayString: "Doe, John <test@foo.invalid>",
      addresses: [["Doe, John", "test@foo.invalid"]] },
    { displayString: "Doe, John <test@foo.invalid>, Bond, James <test2@foo.invalid>",
      addresses: [["Doe, John", "test@foo.invalid"],
                  ["Bond, James", "test2@foo.invalid"]] },
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
