/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { VCardProperties, VCardUtils } = ChromeUtils.import(
  "resource:///modules/VCardUtils.jsm"
);

const ANY_UID = "UID:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

add_task(function testVCardToPropertyMap() {
  function check(vCardLine, expectedProps) {
    const vCard = `BEGIN:VCARD\r\n${vCardLine}\r\nEND:VCARD\r\n`;
    info(vCard);
    const properties = VCardProperties.fromVCard(vCard).toPropertyMap();
    // Check that every property in expectedProps is present in `properties`.
    // No other property can be present unless it is in `propWhitelist`.
    for (const [name, value] of properties) {
      if (name in expectedProps) {
        Assert.equal(value, expectedProps[name], `expected ${name}`);
        delete expectedProps[name];
      } else {
        Assert.ok(false, `card should not have property '${name}'`);
      }
    }

    for (const name of Object.keys(expectedProps)) {
      Assert.ok(false, `expected ${name} not found`);
    }
  }

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
  check("BDAY:--0415", { BirthDay: "15", BirthMonth: "4" });
  check("BDAY:2001", { BirthYear: "2001" });
  check("BDAY:2006-06", { BirthYear: "2006", BirthMonth: "6" });
  check("BDAY:--12", { BirthMonth: "12" });
  check("BDAY:---30", { BirthDay: "30" });
  // These are error cases, testing that it doesn't throw.
  check("BDAY;VALUE=DATE:NaN-NaN-NaN", {});
  check("BDAY;VALUE=TEXT:07/07/1949", {});

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

  // URL
  // If no type is given assume its WebPage1 (work).
  check("URL:https://www.thunderbird.net/", {
    WebPage1: "https://www.thunderbird.net/",
  });

  check("URL;TYPE=work:https://developer.thunderbird.net/", {
    WebPage1: "https://developer.thunderbird.net/",
  });

  check("URL;TYPE=home:https://addons.thunderbird.net/", {
    WebPage2: "https://addons.thunderbird.net/",
  });

  check(
    formatVCard`
      URL;TYPE=home:https://addons.thunderbird.net/
      URL;TYPE=work:https://developer.thunderbird.net/`,
    {
      WebPage1: "https://developer.thunderbird.net/",
      WebPage2: "https://addons.thunderbird.net/",
    }
  );

  // If a URL without a type is given and a Work Web Page do not import the URL without type.
  check(
    formatVCard`
      URL:https://www.thunderbird.net/
      URL;TYPE=home:https://addons.thunderbird.net/
      URL;TYPE=work:https://developer.thunderbird.net/`,
    {
      WebPage1: "https://developer.thunderbird.net/",
      WebPage2: "https://addons.thunderbird.net/",
    }
  );
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

add_task(function testAbCardToVCard() {
  function check(abCardProps, ...expectedLines) {
    const abCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    for (const [name, value] of Object.entries(abCardProps)) {
      if (name == "UID") {
        abCard.UID = abCardProps.UID;
        continue;
      }
      abCard.setProperty(name, value);
    }

    const vCard = VCardUtils.abCardToVCard(abCard);
    info(vCard);
    const vCardLines = vCard.split("\r\n");
    if (expectedLines.includes(ANY_UID)) {
      for (let i = 0; i < vCardLines.length; i++) {
        if (vCardLines[i].startsWith("UID:")) {
          vCardLines[i] = ANY_UID;
        }
      }
    }

    for (const line of expectedLines) {
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
  check(
    {
      BirthDay: "3",
      BirthMonth: "4",
      BirthYear: "", // No value.
    },
    "BDAY;VALUE=DATE:--0403",
    ANY_UID
  );
  check(
    {
      BirthDay: "3",
      BirthMonth: "4",
      // BirthYear missing altogether.
    },
    "BDAY;VALUE=DATE:--0403",
    ANY_UID
  );
  check(
    {
      BirthDay: "", // No value.
      BirthMonth: "", // No value.
      BirthYear: "1983",
    },
    "BDAY;VALUE=DATE:1983",
    ANY_UID
  );
  check(
    {
      BirthDay: "", // No value.
      BirthMonth: "", // No value.
      BirthYear: "", // No value.
    },
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
