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
add_task(async function() {
  function getPrefValue() {
    return Services.prefs.getIntPref("mail.displayname.version", -999);
  }

  /**
   * Effectively the same as the function of the same name in nsMsgDBView.cpp.
   * This proves the cardForEmailAddress cache in AddrBookManager is correctly
   * cleared when the preference changes.
   */
  function getDisplayNameInAddressBook() {
    let card = MailServices.ab.cardForEmailAddress("first.last@invalid");
    let preferDisplayName = true;
    try {
      preferDisplayName = card.getPropertyAsBool("PreferDisplayName");
    } catch {
      // An error will be logged here:
      // "NS_ERROR_NOT_AVAILABLE: PreferDisplayName: undefined - not a boolean"
      // This is expected and not a bug.
    }

    return preferDisplayName ? card.displayName : card.primaryEmail;
  }

  let book = MailServices.ab.getDirectory(kPABData.URI);

  let card = new AddrBookCard();
  card.firstName = "first";
  card.lastName = "last";
  card.displayName = "first last";
  card.primaryEmail = "first.last@invalid";
  book.addCard(card);

  Assert.equal(getPrefValue(), -999, "pref has no initial value");
  Assert.equal(getDisplayNameInAddressBook(), "first last", "");

  [card] = book.childCards;
  card.displayName = "display";
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 1, "pref created");
  Assert.equal(getDisplayNameInAddressBook(), "display", "");

  [card] = book.childCards;
  card.setPropertyAsBool("PreferDisplayName", true);
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 2, "");
  Assert.equal(getDisplayNameInAddressBook(), "display", "");

  [card] = book.childCards;
  card.displayName = "display name";
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 3, "");
  Assert.equal(getDisplayNameInAddressBook(), "display name", "");

  [card] = book.childCards;
  card.setPropertyAsBool("PreferDisplayName", false);
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 4, "");
  Assert.equal(getDisplayNameInAddressBook(), "first.last@invalid", "");
});
