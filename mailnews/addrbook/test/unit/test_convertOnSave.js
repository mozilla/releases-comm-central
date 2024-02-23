/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Tests that any card added to an AddrBookDirectory is stored as a vCard.
// Some properties are also recorded outside the vCard for performance reasons
// and/or searching.

// Each type of card is saved and checked twice: once with its own UID and
// again with a new UID. This ensures that UIDs are appropriately stored.

var { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);
var { SQLiteDirectory } = ChromeUtils.importESModule(
  "resource:///modules/SQLiteDirectory.sys.mjs"
);
var { VCardPropertyEntry } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);

Services.prefs.setStringPref(
  "ldap_2.servers.conversion.filename",
  "conversion.sqlite"
);

var book = new SQLiteDirectory();
book.init("jsaddrbook://conversion.sqlite");

/** Tests an instance of nsAbCardProperty. */
add_task(function testCardProperty() {
  const cardProperty = Cc[
    "@mozilla.org/addressbook/cardproperty;1"
  ].createInstance(Ci.nsIAbCard);
  cardProperty.UID = "99999999-8888-7777-6666-555555555555";
  cardProperty.displayName = "display name";
  cardProperty.firstName = "first";
  cardProperty.lastName = "last";
  cardProperty.primaryEmail = "primary@email";
  cardProperty.setProperty("SecondEmail", "second@email");
  cardProperty.setProperty("NickName", "nick");
  cardProperty.setProperty("FaxNumber", "1234567");
  cardProperty.setProperty("BirthYear", 2001);
  cardProperty.setProperty("BirthMonth", 1);
  cardProperty.setProperty("BirthDay", 1);
  cardProperty.setProperty("FakeProperty", "fake value");

  saveCardAndTest(cardProperty, false);
  saveCardAndTest(cardProperty, true);
});

/**
 * Tests an instance of AddrBookCard, populated in the same way that card are
 * created from storage. This instance *doesn't* contain a vCard, and
 * is therefore the same as a card that hasn't yet been migrated to vCard.
 */
add_task(function testABCard() {
  const abCard = new AddrBookCard();
  abCard._uid = "99999999-8888-7777-6666-555555555555";
  abCard._properties = new Map([
    ["PopularityIndex", 0], // NO
    ["DisplayName", "display name"],
    ["FirstName", "first"],
    ["LastName", "last"],
    ["PrimaryEmail", "primary@email"],
    ["SecondEmail", "second@email"],
    ["NickName", "nick"],
    ["FaxNumber", "1234567"],
    ["BirthYear", 2001],
    ["BirthMonth", 1],
    ["BirthDay", 1],
    ["FakeProperty", "fake value"],
  ]);

  saveCardAndTest(abCard, false);
  saveCardAndTest(abCard, true);
});

/**
 * Tests an instance of AddrBookCard, populated in the same way that card are
 * created from storage. This instance *does* contain a vCard.
 */
add_task(function testABCardWithVCard() {
  const abCard = new AddrBookCard();
  abCard._uid = "99999999-8888-7777-6666-555555555555";
  abCard._properties = new Map([
    ["PopularityIndex", 0], // NO
    ["DisplayName", "display name"],
    ["FirstName", "first"],
    ["LastName", "last"],
    ["PrimaryEmail", "primary@email"],
    ["SecondEmail", "second@email"],
    ["NickName", "nick"],
    ["FakeProperty", "fake value"],
    [
      "_vCard",
      formatVCard`
      BEGIN:VCARD
      VERSION:4.0
      EMAIL;PREF=1:primary@email
      EMAIL:second@email
      FN:display name
      NICKNAME:nick
      BDAY;VALUE=DATE:20010101
      N:last;first;;;
      TEL;TYPE=fax;VALUE=TEXT:1234567
      UID:99999999-8888-7777-6666-555555555555
      END:VCARD
      `,
    ],
  ]);

  saveCardAndTest(abCard, false);
  saveCardAndTest(abCard, true);
});

/**
 * Tests an instance of AddrBookCard, populated in the same way that card are
 * created from storage. This instance *does* contain a vCard.
 */
add_task(function testABCardWithVCardOnly() {
  const abCard = new AddrBookCard();
  abCard._uid = "99999999-8888-7777-6666-555555555555";
  abCard._properties = new Map([
    ["FakeProperty", "fake value"], // NO
    ["PopularityIndex", 0], // NO
    [
      "_vCard",
      formatVCard`
      BEGIN:VCARD
      VERSION:4.0
      EMAIL;PREF=1:primary@email
      EMAIL:second@email
      FN:display name
      NICKNAME:nick
      BDAY;VALUE=DATE:20010101
      N:last;first;;;
      TEL;TYPE=fax;VALUE=TEXT:1234567
      UID:99999999-8888-7777-6666-555555555555
      END:VCARD
      `,
    ],
  ]);

  saveCardAndTest(abCard, false);
  saveCardAndTest(abCard, true);
});

/**
 * Tests an instance of AddrBookCard, populated in the same way that card are
 * created from storage. This instance *does* contain a vCard, but also some
 * properties that shouldn't exist because their value is stored in the vCard.
 */
add_task(function testABCardWithVCardAndExtraProps() {
  const abCard = new AddrBookCard();
  abCard._uid = "99999999-8888-7777-6666-555555555555";
  abCard._properties = new Map([
    ["PopularityIndex", 0], // NO
    ["DisplayName", "display name"],
    ["FirstName", "first"],
    ["LastName", "last"],
    ["PrimaryEmail", "primary@email"],
    ["SecondEmail", "second@email"],
    ["NickName", "nick"],
    ["FaxNumber", "1234567"],
    ["BirthYear", 2001],
    ["BirthMonth", 1],
    ["BirthDay", 1],
    ["FakeProperty", "fake value"],
    [
      "_vCard",
      formatVCard`
      BEGIN:VCARD
      VERSION:4.0
      EMAIL;PREF=1:primary@email
      EMAIL:second@email
      FN:display name
      NICKNAME:nick
      BDAY;VALUE=DATE:20010101
      N:last;first;;;
      TEL;TYPE=fax;VALUE=TEXT:1234567
      UID:99999999-8888-7777-6666-555555555555
      END:VCARD
      `,
    ],
  ]);

  saveCardAndTest(abCard, false);
  saveCardAndTest(abCard, true);
});

/** Tests an instance of AddrBookCard, created from scratch. */
add_task(function testABCardConstructed() {
  const abCard = new AddrBookCard();
  abCard.UID = "99999999-8888-7777-6666-555555555555";
  abCard.displayName = "display name";
  abCard.firstName = "first";
  abCard.lastName = "last";
  abCard.primaryEmail = "primary@email";
  abCard.vCardProperties.addValue("email", "second@email");
  abCard.vCardProperties.addValue("nickname", "nick");
  abCard.vCardProperties.addEntry(
    new VCardPropertyEntry("tel", { type: "fax" }, "text", "1234567")
  );
  abCard.vCardProperties.addEntry(
    new VCardPropertyEntry("bday", {}, "date", "20010101")
  );
  abCard.setProperty("FakeProperty", "fake value");

  saveCardAndTest(abCard, false);
  saveCardAndTest(abCard, true);
});

/** Tests an instance of AddrBookCard, created from scratch. */
add_task(function testABCardConstructionThrows() {
  const abCard = new AddrBookCard();
  abCard.UID = "99999999-8888-7777-6666-555555555555";
  abCard.displayName = "display name";
  abCard.firstName = "first";
  abCard.lastName = "last";
  abCard.primaryEmail = "primary@email";
  // these properties will be forgotten
  Assert.throws(
    () => abCard.setProperty("SecondEmail", "second@email"),
    /Unable to set SecondEmail as a property/
  );
  Assert.throws(
    () => abCard.setProperty("NickName", "nick"),
    /Unable to set NickName as a property/
  );
  Assert.throws(
    () => abCard.setProperty("FaxNumber", "1234567"),
    /Unable to set FaxNumber as a property/
  );
  Assert.throws(
    () => abCard.setProperty("BirthYear", 2001),
    /Unable to set BirthYear as a property/
  );
  Assert.throws(
    () => abCard.setProperty("BirthMonth", 1),
    /Unable to set BirthMonth as a property/
  );
  Assert.throws(
    () => abCard.setProperty("BirthDay", 1),
    /Unable to set BirthDay as a property/
  );
  abCard.setProperty("FakeProperty", "fake value");
});

function saveCardAndTest(card, useNewUID) {
  info(`Saving the card ${useNewUID ? "with" : "without"} a new UID`);

  Assert.equal(book.childCardCount, 0);

  const savedCard = book.dropCard(card, useNewUID);
  Assert.deepEqual(Array.from(savedCard.properties, p => p.name).sort(), [
    "DisplayName",
    "FakeProperty",
    "FirstName",
    "LastModifiedDate",
    "LastName",
    "NickName",
    "PopularityIndex",
    "PrimaryEmail",
    "SecondEmail",
    "_vCard",
  ]);

  if (useNewUID) {
    Assert.notEqual(savedCard.UID, "99999999-8888-7777-6666-555555555555");
  } else {
    Assert.equal(savedCard.UID, "99999999-8888-7777-6666-555555555555");
  }

  Assert.equal(savedCard.getProperty("DisplayName", "WRONG"), "display name");
  Assert.equal(savedCard.getProperty("FirstName", "WRONG"), "first");
  Assert.equal(savedCard.getProperty("LastName", "WRONG"), "last");
  Assert.equal(savedCard.getProperty("PrimaryEmail", "WRONG"), "primary@email");
  Assert.equal(savedCard.getProperty("SecondEmail", "WRONG"), "second@email");
  Assert.equal(savedCard.getProperty("NickName", "WRONG"), "nick");
  Assert.equal(savedCard.getProperty("FakeProperty", "WRONG"), "fake value");
  Assert.equal(savedCard.getProperty("PopularityIndex", "WRONG"), "0");

  const vCard = savedCard.getProperty("_vCard", "WRONG");
  Assert.stringContains(vCard, "\r\nEMAIL;PREF=1:primary@email\r\n");
  Assert.stringContains(vCard, "\r\nEMAIL:second@email\r\n");
  Assert.stringContains(vCard, "\r\nFN:display name\r\n");
  Assert.stringContains(vCard, "\r\nNICKNAME:nick\r\n");
  Assert.stringContains(vCard, "\r\nBDAY;VALUE=DATE:20010101\r\n");
  Assert.stringContains(vCard, "\r\nN:last;first;;;\r\n");
  Assert.stringContains(vCard, "\r\nTEL;TYPE=fax;VALUE=TEXT:1234567\r\n");
  Assert.stringContains(vCard, `\r\nUID:${savedCard.UID}\r\n`);

  const modifiedDate = parseInt(
    savedCard.getProperty("LastModifiedDate", ""),
    10
  );
  Assert.lessOrEqual(modifiedDate, Date.now() / 1000);
  Assert.greater(modifiedDate, Date.now() / 1000 - 10);

  Assert.equal(savedCard.displayName, "display name");
  Assert.equal(savedCard.firstName, "first");
  Assert.equal(savedCard.lastName, "last");
  Assert.equal(savedCard.primaryEmail, "primary@email");
  Assert.deepEqual(savedCard.emailAddresses, ["primary@email", "second@email"]);

  Assert.ok(savedCard.supportsVCard);
  Assert.ok(savedCard.vCardProperties);

  Assert.deepEqual(savedCard.vCardProperties.getAllValues("fn"), [
    "display name",
  ]);
  Assert.deepEqual(savedCard.vCardProperties.getAllValues("email"), [
    "primary@email",
    "second@email",
  ]);
  Assert.deepEqual(savedCard.vCardProperties.getAllValues("nickname"), [
    "nick",
  ]);
  Assert.deepEqual(savedCard.vCardProperties.getAllValues("bday"), [
    "2001-01-01",
  ]);
  Assert.deepEqual(savedCard.vCardProperties.getAllValues("n"), [
    ["last", "first", "", "", ""],
  ]);
  Assert.deepEqual(savedCard.vCardProperties.getAllValues("tel"), ["1234567"]);

  book.deleteCards(book.childCards);
}
