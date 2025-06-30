/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
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

    return card.displayName || card.primaryEmail;
  }

  Assert.equal(getPrefValue(), 0, "pref has an initial value of 0");
  Assert.equal(getDisplayNameInAddressBook(), null, "card doesn't exist yet");

  const dirPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  const book = MailServices.ab.getDirectoryFromId(dirPrefId);
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
  card.displayName = "display name";
  book.modifyCard(card);

  Assert.equal(getPrefValue(), 3, "pref updated by changing display name");
  Assert.equal(getDisplayNameInAddressBook(), "display name");

  book.deleteCards([card]);

  Assert.equal(getPrefValue(), 4, "pref updated by deleting card");
  Assert.equal(getDisplayNameInAddressBook(), null, "card no longer exists");

  book.addCard(card);

  Assert.equal(getPrefValue(), 5, "pref updated by adding card");
  Assert.equal(getDisplayNameInAddressBook(), "display name");

  await promiseDirectoryRemoved(book.URI);

  Assert.equal(getPrefValue(), 6, "pref updated by removing book");
  Assert.equal(getDisplayNameInAddressBook(), null, "card no longer exists");
});
