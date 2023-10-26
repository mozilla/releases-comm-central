/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddrBookCard } = ChromeUtils.import(
  "resource:///modules/AddrBookCard.jsm"
);

/**
 * Tests that the mail.displayname.version preference is correctly incremented
 * if a card's DisplayName or PreferDisplayName properties change.
 */
add_task(async function () {
  function getPrefValue() {
    return Services.prefs.getIntPref("mail.displayname.version", -999);
  }

  /**
   * Effectively the same as the function of the same name in nsMsgDBView.cpp.
   * This proves the cardForEmailAddress cache in AddrBookManager is correctly
   * cleared when the preference changes.
   */
  function getDisplayNameInAddressBook() {
    const card = MailServices.ab.cardForEmailAddress("first.last@invalid");
    if (!card) {
      return null;
    }

    const preferDisplayName = card.getPropertyAsBool("PreferDisplayName", true);
    return preferDisplayName ? card.displayName : card.primaryEmail;
  }

  Assert.equal(getPrefValue(), -999, "pref has no initial value");
  Assert.equal(getDisplayNameInAddressBook(), null, "card doesn't exist yet");

  const book = MailServices.ab.getDirectory(kPABData.URI);
  let card = new AddrBookCard();
  card.firstName = "first";
  card.lastName = "last";
  card.displayName = "first last";
  card.primaryEmail = "first.last@invalid";
  book.addCard(card);

  Assert.equal(getPrefValue(), 1, "pref created by adding card");
  Assert.equal(getDisplayNameInAddressBook(), "first last");

  [card] = book.childCards;
  card.displayName = "display";
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 2, "pref updated by changing display name");
  Assert.equal(getDisplayNameInAddressBook(), "display");

  [card] = book.childCards;
  card.setPropertyAsBool("PreferDisplayName", true);
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 3, "pref updated by adding flag");
  Assert.equal(getDisplayNameInAddressBook(), "display");

  [card] = book.childCards;
  card.displayName = "display name";
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 4, "pref updated by changing display name");
  Assert.equal(getDisplayNameInAddressBook(), "display name");

  [card] = book.childCards;
  card.setPropertyAsBool("PreferDisplayName", false);
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 5, "pref updated by clearing flag");
  Assert.equal(getDisplayNameInAddressBook(), "first.last@invalid");

  book.deleteCards([card]);

  Assert.equal(getPrefValue(), 6, "pref updated by deleting card");
  Assert.equal(getDisplayNameInAddressBook(), null, "card no longer exists");
});
