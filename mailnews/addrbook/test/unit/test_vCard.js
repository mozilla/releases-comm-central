/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

const ANY_UID = "UID:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

add_task(function testVCardToAbCard() {
  function check(vCardLine, expectedProps) {
    const propWhitelist = [
      "LastModifiedDate",
      "PopularityIndex",
      "PreferMailFormat",
    ];

    let vCard = `BEGIN:VCARD\r\n${vCardLine}\r\nEND:VCARD\r\n`;
    info(vCard);
    let abCard = VCardUtils.vCardToAbCard(vCard);
    // Check that every property in expectedProps is present in `abCard`.
    // No other property can be present unless it is in `propWhitelist`.
    for (let prop of abCard.properties) {
      if (prop.name in expectedProps) {
        equal(prop.value, expectedProps[prop.name], `expected ${prop.name}`);
        delete expectedProps[prop.name];
      } else if (!propWhitelist.includes(prop.name)) {
        ok(false, `card should not have property '${prop.name}'`);
      }
    }

    for (let name of Object.keys(expectedProps)) {
      ok(false, `expected ${name} not found`);
    }
  }

  // UID
  check("UID:12345678-1234-1234-1234-123456789012", {
    UID: "12345678-1234-1234-1234-123456789012",
  });

  // PreferMailFormat
  check("X-MOZILLA-HTML;VALUE=BOOLEAN:TRUE", {
    PreferMailFormat: Ci.nsIAbPreferMailFormat.html,
  });

  // PreferMailFormat
  check("X-MOZILLA-HTML;VALUE=BOOLEAN:FALSE", {
    PreferMailFormat: Ci.nsIAbPreferMailFormat.plaintext,
  });

  // Name
  check("N:Last;First", { FirstName: "First", LastName: "Last" });
  check("N:Last;First;;;", { FirstName: "First", LastName: "Last" });
  check("N:Last;First;Middle;Prefix;Suffix", {
    FirstName: "First",
    LastName: "Last",
    AdditionalNames: "Middle",
    NamePrefix: "Prefix",
    NameSuffix: "Suffix",
  });
  check("N:Stevenson;John;Philip,Paul;Dr.;Jr.,M.D.,A.C.P.", {
    FirstName: "John",
    LastName: "Stevenson",
    AdditionalNames: "Philip Paul",
    NamePrefix: "Dr.",
    NameSuffix: "Jr. M.D. A.C.P.",
  });

  // Address
  check(
    "ADR:PO Box 3.14;Apartment 4;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      WorkPOBox: "PO Box 3.14",
      WorkAddress2: "Apartment 4",
      WorkAddress: "123 Main Street",
      WorkCity: "Any Town",
      WorkState: "CA",
      WorkZipCode: "91921-1234",
      WorkCountry: "U.S.A.",
    }
  );
  check(
    "ADR;TYPE=work:PO Box 3.14;Apartment 4;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      WorkPOBox: "PO Box 3.14",
      WorkAddress2: "Apartment 4",
      WorkAddress: "123 Main Street",
      WorkCity: "Any Town",
      WorkState: "CA",
      WorkZipCode: "91921-1234",
      WorkCountry: "U.S.A.",
    }
  );
  check(
    "ADR;TYPE=home:PO Box 3.14;Apartment 4;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      HomePOBox: "PO Box 3.14",
      HomeAddress2: "Apartment 4",
      HomeAddress: "123 Main Street",
      HomeCity: "Any Town",
      HomeState: "CA",
      HomeZipCode: "91921-1234",
      HomeCountry: "U.S.A.",
    }
  );

  // Phone
  check("TEL:11-2358-13-21", { WorkPhone: "11-2358-13-21" });
  check("TEL;TYPE=work:11-2358-13-21", { WorkPhone: "11-2358-13-21" });
  check("TEL;TYPE=home:11-2358-13-21", { HomePhone: "11-2358-13-21" });
  check("TEL;TYPE=cell:11-2358-13-21", { CellularNumber: "11-2358-13-21" });
  check("TEL;TYPE=pager:11-2358-13-21", { PagerNumber: "11-2358-13-21" });
  check("TEL;TYPE=fax:11-2358-13-21", { FaxNumber: "11-2358-13-21" });

  check("TEL;TYPE=work;PREF:11-2358-13-21", { WorkPhone: "11-2358-13-21" });
  check("TEL;TYPE=work,cell:11-2358-13-21", { WorkPhone: "11-2358-13-21" });
  check("TEL;TYPE=work;TYPE=cell:11-2358-13-21", {
    WorkPhone: "11-2358-13-21",
  });
  check("TEL;TYPE=work;VALUE=TEXT:11-2358-13-21", {
    WorkPhone: "11-2358-13-21",
  });
  check("TEL;TYPE=home;VALUE=TEXT:011-2358-13-21", {
    HomePhone: "011-2358-13-21",
  });
  check(
    "TEL;TYPE=work;VALUE=TEXT:11-2358-13-21\r\nTEL;TYPE=home;VALUE=TEXT:011-2358-13-21",
    {
      WorkPhone: "11-2358-13-21",
      HomePhone: "011-2358-13-21",
    }
  );
  check("TEL;TYPE=cell:11-2358-13-21\r\nTEL;TYPE=cell:011-2358-13-21", {
    CellularNumber: "11-2358-13-21",
  });
  check("TEL;TYPE=cell;PREF=1:11-2358-13-21\r\nTEL;TYPE=cell:011-2358-13-21", {
    CellularNumber: "11-2358-13-21",
  });
  check("TEL;TYPE=cell:11-2358-13-21\r\nTEL;TYPE=cell;PREF=1:011-2358-13-21", {
    CellularNumber: "011-2358-13-21",
  });

  // Birthday
  check("BDAY;VALUE=DATE:19830403", {
    BirthDay: "3",
    BirthMonth: "4",
    BirthYear: "1983",
  });

  // Anniversary
  check("ANNIVERSARY;VALUE=DATE:20041207", {
    AnniversaryDay: "7",
    AnniversaryMonth: "12",
    AnniversaryYear: "2004",
  });

  // Organization: any number of values is valid here.
  check("ORG:Acme Widgets, Inc.", {
    Company: "Acme Widgets, Inc.",
  });
  check("ORG:Acme Widgets, Inc.;Manufacturing", {
    Company: "Acme Widgets, Inc.",
    Department: "Manufacturing",
  });
  check("ORG:Acme Widgets, Inc.;Manufacturing;Thingamies", {
    Company: "Acme Widgets, Inc.",
    Department: "Manufacturing",
  });

  // Email: just to be difficult, email is stored by priority, not type.
  check("EMAIL:first@invalid", { PrimaryEmail: "first@invalid" });
  check("EMAIL;PREF=1:first@invalid", { PrimaryEmail: "first@invalid" });

  check("EMAIL;PREF=1:first@invalid\r\nEMAIL:second@invalid", {
    PrimaryEmail: "first@invalid",
    SecondEmail: "second@invalid",
  });
  check("EMAIL:second@invalid\r\nEMAIL;PREF=1:first@invalid", {
    PrimaryEmail: "first@invalid",
    SecondEmail: "second@invalid",
  });

  check("EMAIL;PREF=1:first@invalid\r\nEMAIL;PREF=2:second@invalid", {
    PrimaryEmail: "first@invalid",
    SecondEmail: "second@invalid",
  });
  check("EMAIL;PREF=2:second@invalid\r\nEMAIL;PREF=1:first@invalid", {
    PrimaryEmail: "first@invalid",
    SecondEmail: "second@invalid",
  });

  check(
    "EMAIL;PREF=1:first@invalid\r\nEMAIL;PREF=2:second@invalid\r\nEMAIL;PREF=3:third@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );
  check(
    "EMAIL;PREF=2:second@invalid\r\nEMAIL;PREF=3:third@invalid\r\nEMAIL;PREF=1:first@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );
  check(
    "EMAIL;PREF=3:third@invalid\r\nEMAIL;PREF=1:first@invalid\r\nEMAIL;PREF=2:second@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );
  check(
    "EMAIL;PREF=3:third@invalid\r\nEMAIL;PREF=2:second@invalid\r\nEMAIL;PREF=1:first@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );
  check(
    "EMAIL;PREF=2:second@invalid\r\nEMAIL;PREF=1:first@invalid\r\nEMAIL;PREF=3:third@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );
  check(
    "EMAIL;PREF=1:first@invalid\r\nEMAIL;PREF=3:third@invalid\r\nEMAIL;PREF=2:second@invalid",
    {
      PrimaryEmail: "first@invalid",
      SecondEmail: "second@invalid",
    }
  );

  // Group-prefixed properties.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {
      PrimaryEmail: "first@invalid",
    }
  );
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First
      item2.EMAIL:second@invalid
      item2.X-ABLabel:Second`,
    { PrimaryEmail: "first@invalid", SecondEmail: "second@invalid" }
  );
  check(
    formatVCard`
      foo-bar.EMAIL:first@invalid
      foo-bar.X-ABLabel:First
      EMAIL:second@invalid`,
    { PrimaryEmail: "first@invalid", SecondEmail: "second@invalid" }
  );
  check(
    formatVCard`
      EMAIL:first@invalid
      abc.EMAIL:second@invalid
      abc.X-ABLabel:Second`,
    { PrimaryEmail: "first@invalid", SecondEmail: "second@invalid" }
  );
  check("xyz.TEL:11-2358-13-21", { WorkPhone: "11-2358-13-21" });
});

add_task(function testModifyVCard() {
  function check(
    inVCard,
    newProps,
    expectedLines = [],
    unexpectedPrefixes = []
  ) {
    inVCard = `BEGIN:VCARD\r\n${inVCard}\r\nEND:VCARD\r\n`;
    let abCard = VCardUtils.vCardToAbCard(inVCard);
    for (let [name, value] of Object.entries(newProps)) {
      if (value === null) {
        abCard.deleteProperty(name);
      } else {
        abCard.setProperty(name, value);
      }
    }

    let outVCard = VCardUtils.modifyVCard(inVCard, abCard);
    info(outVCard);

    let lineCounts = {};
    for (let line of expectedLines) {
      let [prefix] = line.split(":");
      if (prefix in lineCounts) {
        lineCounts[prefix]++;
      } else {
        lineCounts[prefix] = 1;
      }
    }

    // Check if `prefix` is expected. If it is expected, check that `line` is
    // exactly as specified. If it is unexpected, complain. Otherwise, ignore.
    for (let line of outVCard.split("\r\n")) {
      let [prefix] = line.split(":");
      if (prefix == "UID" && expectedLines.includes(ANY_UID)) {
        line = ANY_UID;
      }

      if (unexpectedPrefixes.includes(prefix)) {
        ok(false, `unexpected ${prefix} line`);
      } else if (prefix in lineCounts) {
        let index = expectedLines.indexOf(line);
        ok(index > -1, `line was expected: ${line}`);
        expectedLines.splice(index, 1);
        lineCounts[prefix]--;
      } else {
        ok(true, `line was ignored: ${line}`);
      }
    }

    // Check that all expected lines are in `outVCard`.
    for (let [prefix, count] of Object.entries(lineCounts)) {
      equal(count, 0, `${count} ${prefix} lines remain`);
    }
  }

  // Empty card, no modifications.
  check("", {}, [ANY_UID]);

  // Card with UID, no modifications.
  check("UID:12345678-1234-1234-1234-123456789012", {}, [
    "UID:12345678-1234-1234-1234-123456789012",
  ]);

  // Display name changed, notes removed, UID unchanged.
  check(
    formatVCard`
      FN:Original Full Name
      NOTE:This property will be removed.
      UID:12345678-1234-1234-1234-123456789012`,
    {
      DisplayName: "New Full Name",
      Notes: null,
    },
    ["FN:New Full Name", "UID:12345678-1234-1234-1234-123456789012"],
    ["NOTE"]
  );

  // Notes removed, URL removed. This ensures we don't remove the wrong properties.
  check(
    formatVCard`
      FN:Original Full Name
      NOTE:This property will be removed.
      UID:12345678-1234-1234-1234-123456789012
      URL:http://www.thunderbird.net/
      ORG:Thunderbird;Address Book`,
    {
      Notes: null,
      WebPage1: null,
    },
    [
      "FN:Original Full Name",
      "UID:12345678-1234-1234-1234-123456789012",
      "ORG:Thunderbird;Address Book",
    ],
    ["NOTE", "URL"]
  );

  // Last name changed.
  check(
    "N:Last;First;;Mr;",
    {
      LastName: "Changed",
    },
    ["N:Changed;First;;Mr;", ANY_UID]
  );
  // First and last name changed.
  check(
    "N:Last;First;;;Ph.D.",
    {
      LastName: "Changed",
      FirstName: "New",
    },
    ["N:Changed;New;;;Ph.D.", ANY_UID]
  );

  // Work address changed. Other address types should not appear.
  check(
    "ADR;TYPE=work:Box 42;;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      WorkAddress: "345 Main Street",
    },
    [
      "ADR;TYPE=work:Box 42;;345 Main Street;Any Town;CA;91921-1234;U.S.A.",
      ANY_UID,
    ],
    ["ADR", "ADR;TYPE=home"]
  );

  // Home address changed. Other address types should not appear.
  check(
    "ADR;TYPE=home:Box 42;;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      HomeAddress: "345 Main Street",
    },
    [
      "ADR;TYPE=home:Box 42;;345 Main Street;Any Town;CA;91921-1234;U.S.A.",
      ANY_UID,
    ],
    ["ADR", "ADR;TYPE=work"]
  );

  // Address changed. Other address types should not appear.
  check(
    "ADR:Box 42;;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    {
      WorkAddress: "345 Main Street",
    },
    ["ADR:Box 42;;345 Main Street;Any Town;CA;91921-1234;U.S.A.", ANY_UID],
    ["ADR;TYPE=work", "ADR;TYPE=home"]
  );

  // Various email properties with no changes.
  check("EMAIL:first@invalid", {}, ["EMAIL:first@invalid", ANY_UID]);
  check("EMAIL:first@invalid\r\nEMAIL:second@invalid", {}, [
    "EMAIL:first@invalid",
    "EMAIL:second@invalid",
    ANY_UID,
  ]);
  check(
    "EMAIL:first@invalid\r\nEMAIL:second@invalid\r\nEMAIL:third@invalid",
    {},
    [
      "EMAIL:first@invalid",
      "EMAIL:second@invalid",
      "EMAIL:third@invalid",
      ANY_UID,
    ]
  );

  // Changed primary email.
  check("EMAIL:first@invalid", { PrimaryEmail: "changed.first@invalid" }, [
    "EMAIL:changed.first@invalid",
    ANY_UID,
  ]);

  // Removed primary email, added secondary email.
  check(
    "EMAIL:first@invalid",
    { PrimaryEmail: null, SecondEmail: "second@invalid" },
    ["EMAIL:second@invalid", ANY_UID]
  );

  // Changed primary email, added secondary email.
  check(
    "EMAIL:first@invalid",
    {
      PrimaryEmail: "changed.first@invalid",
      SecondEmail: "second@invalid",
    },
    ["EMAIL:changed.first@invalid", "EMAIL:second@invalid", ANY_UID]
  );

  // Changed primary and secondary email.
  check(
    "EMAIL:first@invalid\r\nEMAIL:second@invalid",
    {
      PrimaryEmail: "changed.first@invalid",
      SecondEmail: "changed.second@invalid",
    },
    ["EMAIL:changed.first@invalid", "EMAIL:changed.second@invalid", ANY_UID]
  );

  // Removed an email address when there's more than two.
  check(
    "EMAIL:first@invalid\r\nEMAIL:second@invalid\r\nEMAIL:third@invalid",
    {
      PrimaryEmail: null,
    },
    ["EMAIL:second@invalid", "EMAIL:third@invalid", ANY_UID]
  );
  check(
    "EMAIL:first@invalid\r\nEMAIL:second@invalid\r\nEMAIL:third@invalid",
    {
      SecondEmail: null,
    },
    ["EMAIL:first@invalid", "EMAIL:third@invalid", ANY_UID]
  );

  // Group-prefixed properties.

  // No changes.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {},
    ["ITEM1.EMAIL:first@invalid", "ITEM1.X-ABLABEL:First"],
    ["EMAIL"]
  );

  // Set primary email to existing value.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {
      PrimaryEmail: "first@invalid",
    },
    ["ITEM1.EMAIL:first@invalid", "ITEM1.X-ABLABEL:First"],
    ["EMAIL"]
  );

  // Set primary email to a different value.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {
      PrimaryEmail: "second@invalid",
    },
    ["ITEM1.EMAIL:second@invalid", "ITEM1.X-ABLABEL:First"],
    ["EMAIL"]
  );

  // Add second email.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {
      SecondEmail: "second@invalid",
    },
    [
      "ITEM1.EMAIL:first@invalid",
      "ITEM1.X-ABLABEL:First",
      "EMAIL:second@invalid",
    ]
  );

  // Remove the email.
  check(
    formatVCard`
      item1.EMAIL:first@invalid
      item1.X-ABLabel:First`,
    {
      PrimaryEmail: null,
    },
    [],
    [
      "ITEM1.EMAIL",
      // We can't do much about this stray label. Just leave it behind.
      // "ITEM1.X-ABLABEL",
      "EMAIL",
    ]
  );

  // Card with properties we don't support. They should remain unchanged.
  check(
    formatVCard`
      X-FOO-BAR:foo bar
      X-BAZ;VALUE=URI:https://www.example.com/
      QUUX:This property is out of spec but we shouldn't touch it anyway.
      FN:My full name`,
    {
      DisplayName: "My other full name",
    },
    [
      "FN:My other full name",
      "X-FOO-BAR:foo bar",
      "X-BAZ;VALUE=URI:https://www.example.com/",
      "QUUX:This property is out of spec but we shouldn't touch it anyway.",
      ANY_UID,
    ]
  );
});

add_task(function testAbCardToVCard() {
  function check(abCardProps, ...expectedLines) {
    let abCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    for (let [name, value] of Object.entries(abCardProps)) {
      if (name == "UID") {
        abCard.UID = abCardProps.UID;
        continue;
      }
      abCard.setProperty(name, value);
    }

    let vCard = VCardUtils.abCardToVCard(abCard);
    info(vCard);
    let vCardLines = vCard.split("\r\n");
    if (expectedLines.includes(ANY_UID)) {
      for (let i = 0; i < vCardLines.length; i++) {
        if (vCardLines[i].startsWith("UID:")) {
          vCardLines[i] = ANY_UID;
        }
      }
    }

    for (let line of expectedLines) {
      Assert.ok(vCardLines.includes(line), line);
    }
  }

  // UID
  check(
    {
      UID: "12345678-1234-1234-1234-123456789012",
    },
    "UID:12345678-1234-1234-1234-123456789012"
  );

  // Name
  check(
    {
      FirstName: "First",
      LastName: "Last",
    },
    "N:Last;First;;;",
    ANY_UID
  );
  check(
    {
      FirstName: "First",
      LastName: "Last",
      AdditionalNames: "Middle",
      NamePrefix: "Prefix",
      NameSuffix: "Suffix",
    },
    "N:Last;First;Middle;Prefix;Suffix",
    ANY_UID
  );
  check(
    {
      FirstName: "First",
      LastName: "Last",
      NameSuffix: "Suffix",
    },
    "N:Last;First;;;Suffix",
    ANY_UID
  );

  // Address
  check(
    {
      WorkAddress: "123 Main Street",
      WorkCity: "Any Town",
      WorkState: "CA",
      WorkZipCode: "91921-1234",
      WorkCountry: "U.S.A.",
    },
    "ADR:;;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    ANY_UID
  );
  check(
    {
      HomeAddress: "123 Main Street",
      HomeCity: "Any Town",
      HomeState: "CA",
      HomeZipCode: "91921-1234",
      HomeCountry: "U.S.A.",
    },
    "ADR:;;123 Main Street;Any Town;CA;91921-1234;U.S.A.",
    ANY_UID
  );

  // Phone
  check(
    {
      WorkPhone: "11-2358-13-21",
    },
    "TEL;VALUE=TEXT:11-2358-13-21",
    ANY_UID
  );
  check(
    {
      HomePhone: "011-2358-13-21",
    },
    "TEL;VALUE=TEXT:011-2358-13-21",
    ANY_UID
  );
  check(
    {
      WorkPhone: "11-2358-13-21",
      HomePhone: "011-2358-13-21",
    },
    "TEL;TYPE=work;VALUE=TEXT:11-2358-13-21",
    "TEL;TYPE=home;VALUE=TEXT:011-2358-13-21",
    ANY_UID
  );

  // Birthday
  check(
    {
      BirthDay: "3",
      BirthMonth: "4",
      BirthYear: "1983",
    },
    "BDAY;VALUE=DATE:19830403",
    ANY_UID
  );

  // Anniversary
  check(
    {
      AnniversaryDay: "7",
      AnniversaryMonth: "12",
      AnniversaryYear: "2004",
    },
    "ANNIVERSARY;VALUE=DATE:20041207",
    ANY_UID
  );

  // Email
  check({ PrimaryEmail: "first@invalid" }, "EMAIL;PREF=1:first@invalid");
  check({ SecondEmail: "second@invalid" }, "EMAIL:second@invalid");
  check(
    { PrimaryEmail: "first@invalid", SecondEmail: "second@invalid" },
    "EMAIL;PREF=1:first@invalid",
    "EMAIL:second@invalid"
  );
});

add_task(function() {
  // Check that test_becky_addressbook.js won't fail, without being on Windows.
  let v = formatVCard`
    BEGIN:VCARD
    VERSION:3.0
    UID:4E4D17E8.0043655C
    FN:The first man
    ORG:Organization;Post;
    X-BECKY-IMAGE:0
    N:The nick name of the first man
    TEL;TYPE=HOME:11-1111-1111
    TEL;TYPE=WORK:22-2222-2222
    TEL;TYPE=CELL:333-3333-3333
    EMAIL;TYPE=INTERNET;PREF:first@host.invalid
    NOTE;ENCODING=QUOTED-PRINTABLE:This is a note.
    END:VCARD`;

  let a = VCardUtils.vCardToAbCard(v);
  Assert.equal(a.getProperty("DisplayName", "BAD"), "The first man");
  Assert.equal(a.getProperty("PrimaryEmail", "BAD"), "first@host.invalid");
  Assert.equal(a.getProperty("HomePhone", "BAD"), "11-1111-1111");
  Assert.equal(a.getProperty("WorkPhone", "BAD"), "22-2222-2222");
  Assert.equal(a.getProperty("CellularNumber", "BAD"), "333-3333-3333");
  Assert.equal(a.getProperty("Company", "BAD"), "Organization");
  Assert.equal(a.getProperty("Notes", "BAD"), "This is a note.");
});

function formatVCard([str]) {
  let lines = str.split("\n");
  let indent = lines[1].length - lines[1].trimLeft().length;
  let outLines = [];
  for (let line of lines) {
    if (line.length > 0) {
      outLines.push(line.substring(indent) + "\r\n");
    }
  }
  return outLines.join("");
}
