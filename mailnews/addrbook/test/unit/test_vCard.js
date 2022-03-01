/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

const ANY_UID = "UID:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx";

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
