/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that complex names are correctly flattened when stored in the
 * database as FirstName/LastName, and when returned from the
 * firstName/lastName getters.
 */

var { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_task(async function testMultiValueLast() {
  // Multiple last names.
  const vCard = formatVCard`
    BEGIN:VCARD
    N:second-last,last;first;;;
    END:VCARD
  `;

  const book = MailServices.ab.getDirectory(kPABData.URI);
  const card = book.addCard(VCardUtils.vCardToAbCard(vCard));

  Assert.deepEqual(card.vCardProperties.getFirstValue("n"), [
    ["second-last", "last"],
    "first",
    "",
    "",
    "",
  ]);
  Assert.equal(card.firstName, "first");
  Assert.equal(card.getProperty("FirstName", "WRONG"), "first");
  Assert.equal(card.lastName, "second-last last");
  Assert.equal(card.getProperty("LastName", "WRONG"), "second-last last");
});

add_task(async function testMultiValueFirst() {
  // Multiple first names.
  const vCard = formatVCard`
    BEGIN:VCARD
    N:last;first,second;;;
    END:VCARD
  `;

  const book = MailServices.ab.getDirectory(kPABData.URI);
  const card = book.addCard(VCardUtils.vCardToAbCard(vCard));

  Assert.deepEqual(card.vCardProperties.getFirstValue("n"), [
    "last",
    ["first", "second"],
    "",
    "",
    "",
  ]);
  Assert.equal(card.firstName, "first second");
  Assert.equal(card.getProperty("FirstName", "WRONG"), "first second");
  Assert.equal(card.lastName, "last");
  Assert.equal(card.getProperty("LastName", "WRONG"), "last");
});

add_task(async function testNotEnoughValues() {
  // The name field doesn't have enough components. That's okay.
  const vCard = formatVCard`
    BEGIN:VCARD
    N:last;first
    END:VCARD
  `;

  const book = MailServices.ab.getDirectory(kPABData.URI);
  const card = book.addCard(VCardUtils.vCardToAbCard(vCard));

  Assert.deepEqual(card.vCardProperties.getFirstValue("n"), ["last", "first"]);
  Assert.equal(card.firstName, "first");
  Assert.equal(card.getProperty("FirstName", "WRONG"), "first");
  Assert.equal(card.lastName, "last");
  Assert.equal(card.getProperty("LastName", "WRONG"), "last");
});

add_task(async function testStringValue() {
  // This is a bad value. Let's just ignore it for first/last name purposes.
  const vCard = formatVCard`
    BEGIN:VCARD
    N:first last
    END:VCARD
  `;

  const book = MailServices.ab.getDirectory(kPABData.URI);
  const card = book.addCard(VCardUtils.vCardToAbCard(vCard));

  Assert.deepEqual(card.vCardProperties.getFirstValue("n"), "first last");
  Assert.equal(card.firstName, "");
  Assert.equal(card.getProperty("FirstName", "RIGHT"), "RIGHT");
  Assert.equal(card.lastName, "");
  Assert.equal(card.getProperty("LastName", "RIGHT"), "RIGHT");
});
