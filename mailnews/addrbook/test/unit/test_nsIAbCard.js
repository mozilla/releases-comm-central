/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for more complicated nsIAbCard functions.
 *
 * XXX At the moment these just check the functions basically work i.e. can set
 * up all the parameters correctly. We'll have to extend them as we develop
 * the address book more, especially looking towards standards etc.
 */

// Main function for the this test so we can check both personal and
// collected books work correctly in an easy manner.

function run_test() {
  loadABFile("data/cardForEmail", kPABData.fileName);

  // Test - Get the directory
  const AB = MailServices.ab.getDirectory(kPABData.URI);
  var fullCard = null;

  for (const tempCard of AB.childCards) {
    // We want the one with the right email...
    if (tempCard.primaryEmail == "PrimaryEmail1@test.invalid") {
      fullCard = tempCard;
    }
  }

  Assert.notEqual(fullCard, null);

  // Test - VCard.

  const actual = fullCard.toVCard();
  Assert.ok(actual.startsWith("BEGIN:VCARD\r\n"));
  Assert.ok(actual.endsWith("\r\nEND:VCARD\r\n"));

  const lines = decodeURIComponent(actual).split("\r\n");
  // The theory, the lines of the vCard are valid in any order, so just check
  // that they exist. In practice they are in this order.
  Assert.ok(lines.includes("EMAIL;PREF=1:PrimaryEmail1@test.invalid"), "EMAIL");
  Assert.ok(lines.includes("FN:DisplayName1"), "FN");
  Assert.ok(lines.includes("NICKNAME:NickName1"), "NICKNAME");
  Assert.ok(lines.includes("NOTE:Notes1"), "NOTE");
  Assert.ok(lines.includes("ORG:Organization1;Department1"), "ORG");
  Assert.ok(lines.includes("TITLE:JobTitle1"), "TITLE");
  Assert.ok(lines.includes("N:LastName1;FirstName1;;;"), "N");
  // These two lines wrap. If the wrapping width changes, this test will break.
  Assert.ok(
    lines.includes(
      "ADR;TYPE=home:;HomeAddress21;HomeAddress11;HomeCity1;HomeState1;HomeZipCode"
    ),
    "ADR;TYPE=home"
  );
  Assert.ok(
    lines.includes(
      "ADR;TYPE=work:;WorkAddress21;WorkAddress1;WorkCity1;WorkState1;WorkZipCode1"
    ),
    "ADR;TYPE=work"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=home;VALUE=TEXT:HomePhone1"),
    "TEL;TYPE=home"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=work;VALUE=TEXT:WorkPhone1"),
    "TEL;TYPE=work"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=fax;VALUE=TEXT:FaxNumber1"),
    "TEL;TYPE=fax"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=pager;VALUE=TEXT:PagerNumber1"),
    "TEL;TYPE=pager"
  );
  Assert.ok(
    lines.includes("TEL;TYPE=cell;VALUE=TEXT:CellularNumber1"),
    "TEL;TYPE=cell"
  );
  Assert.ok(lines.includes("URL;TYPE=work;VALUE=URL:http://WebPage21"), "URL");
  Assert.ok(lines.includes("URL;TYPE=home;VALUE=URL:http://WebPage11"), "URL");
  Assert.ok(lines.includes("UID:fdcb9131-38ec-4daf-a4a7-2ef115f562a7"), "UID");
}
