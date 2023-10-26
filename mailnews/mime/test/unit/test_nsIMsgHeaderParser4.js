/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Test suite for nsIMsgHeaderParser::makeFromDisplayAddress.
 * This is what is used to parse in the user input from addressing fields.
 */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function run_test() {
  const checks = [
    { displayString: "", addresses: [] },
    {
      displayString: "test@foo.invalid",
      addresses: [["", "test@foo.invalid"]],
    },
    {
      displayString: "test@foo.invalid, test2@foo.invalid",
      addresses: [
        ["", "test@foo.invalid"],
        ["", "test2@foo.invalid"],
      ],
    },
    {
      displayString: "John Doe <test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]],
    },
    // Trim spaces.
    {
      displayString: "  John Doe  <test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]],
    },
    // No space before the email address.
    {
      displayString: " John Doe<test@foo.invalid>",
      addresses: [["John Doe", "test@foo.invalid"]],
    },
    // Additional text after the email address to be ignored.
    {
      displayString: " John Doe<test@foo.invalid> Junior",
      addresses: [["John Doe", "test@foo.invalid"]],
    },
    {
      displayString: "Doe, John <test@foo.invalid>",
      addresses: [["Doe, John", "test@foo.invalid"]],
    },
    {
      displayString:
        "Doe, John <test@foo.invalid>, Bond, James <test2@foo.invalid>",
      addresses: [
        ["Doe, John", "test@foo.invalid"],
        ["Bond, James", "test2@foo.invalid"],
      ],
    },
    // Additional text after the email address to be ignored, multiple addresses.
    {
      displayString:
        "Doe, John <test@foo.invalid>Junior, Bond, James <test2@foo.invalid>007",
      addresses: [
        ["Doe, John", "test@foo.invalid"],
        ["Bond, James", "test2@foo.invalid"],
      ],
    },
    // Multiple commas
    {
      displayString:
        "Doe,, John <test@foo.invalid>,, Bond, James <test2@foo.invalid>, , Gold Finger <goldfinger@example.com> ,, ",
      addresses: [
        ["Doe,, John", "test@foo.invalid"],
        ["Bond, James", "test2@foo.invalid"],
        ["Gold Finger", "goldfinger@example.com"],
      ],
    },
    // More tests where the user forgot to close the quote or added extra quotes.
    {
      displayString: '"Yatter King1 <a@a.a.a>',
      addresses: [['"Yatter King1', "a@a.a.a"]],
    },
    {
      displayString: 'Yatter King2" <a@a.a.a>',
      addresses: [['Yatter King2"', "a@a.a.a"]],
    },
    {
      displayString: '"Yatter King3" <a@a.a.a>',
      addresses: [['"Yatter King3"', "a@a.a.a"]],
    },
    {
      displayString: 'Yatter "XXX" King4 <a@a.a.a>',
      addresses: [['Yatter "XXX" King4', "a@a.a.a"]],
    },
    {
      displayString: '"Yatter "XXX" King5" <a@a.a.a>',
      addresses: [['"Yatter "XXX" King5"', "a@a.a.a"]],
    },
    {
      displayString: '"Yatter King6 <a@a.a.a>"',
      addresses: [["Yatter King6", "a@a.a.a"]],
    },
    {
      displayString: '"Yatter King7 <a@a.a.a>" <b@b.b.b>',
      addresses: [['"Yatter King7 <a@a.a.a>"', "b@b.b.b"]],
    },
    // Handle invalid mailbox separation with semicolons gracefully.
    {
      displayString:
        'Bart <bart@example.com> ; lisa@example.com;  "Homer, J; President" <pres@example.com>, Marge <marge@example.com>; ',
      addresses: [
        ["Bart", "bart@example.com"],
        ["", "lisa@example.com"],
        ['"Homer, J; President"', "pres@example.com"],
        ["Marge", "marge@example.com"],
      ],
    },
    // Junk after a bracketed email address to be ignored.
    {
      displayString: "<attacker@example.com>friend@example.com",
      addresses: [["", "attacker@example.com"]],
    },
    {
      displayString:
        "<attacker2@example.com><friend2@example.com>,foo <attacker3@example.com><friend3@example.com>",
      addresses: [
        ["", "attacker2@example.com"],
        ["foo", "attacker3@example.com"],
      ],
    },
    {
      displayString:
        'jay "bad" ass <name@evil.com> <someone-else@bad.com> <name@evil.commercial.org>',
      addresses: [['jay "bad" ass', "name@evil.com"]],
    },

    {
      displayString:
        'me "you" (via foo@example.com) <attacker2@example.com> friend@example.com,',
      addresses: [['me "you" (via foo@example.com)', "attacker2@example.com"]],
    },

    // An uncompleted autocomplete...
    {
      displayString: "me >> test <joe@examp.com>",
      addresses: [["me >> test", "joe@examp.com"]],
    },

    // A mail list.
    {
      displayString: "Holmes and Watson <Tenants221B>, foo@example.com",
      addresses: [
        ["Holmes and Watson", "Tenants221B"],
        ["", "foo@example.com"],
      ],
    },

    // A mail list with a space in the name.
    {
      displayString: 'Watson and Holmes <"Quoted Tenants221B">',
      addresses: [["Watson and Holmes", '"Quoted Tenants221B"']],
    },

    // Mail Merge template
    {
      displayString: "{{PrimaryEmail}} <>",
      addresses: [["{{PrimaryEmail}}", ""]],
    },

    // Quoted heart.
    {
      displayString: 'Marge "<3" S <qheart@example.com>',
      addresses: [['Marge "<3" S', "qheart@example.com"]],
    },

    // Heart.
    {
      displayString: "Maggie <3 S <heart@example.com>",
      addresses: [["Maggie <3 S", "heart@example.com"]],
    },

    // Unbalanced quotes.
    {
      displayString: 'Homer <3 "B>" "J <unb@example.com>',
      addresses: [['Homer <3 "B>" "J', "unb@example.com"]],
    },
  ];

  // Test -  strings

  for (let i = 0; i < checks.length; ++i) {
    const addrs = MailServices.headerParser.makeFromDisplayAddress(
      checks[i].displayString
    );
    const checkaddrs = checks[i].addresses;
    Assert.equal(addrs.length, checkaddrs.length, "Number of parsed addresses");
    for (let j = 0; j < addrs.length; j++) {
      Assert.equal(addrs[j].name, checkaddrs[j][0], "Parsed name");
      Assert.equal(addrs[j].email, checkaddrs[j][1], "Parsed email");
    }
  }
}
