/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  async function doSearch(searchString, ...expectedCards) {
    let viewChangePromise = BrowserTestUtils.waitForEvent(
      cardsList,
      "viewchange"
    );
    EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
    if (searchString) {
      EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
      EventUtils.sendString(searchString, abWindow);
      EventUtils.synthesizeKey("VK_RETURN", {}, abWindow);
    } else {
      EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
    }

    await viewChangePromise;
    checkCardsListed(...expectedCards);
    checkPlaceholders(
      expectedCards.length ? [] : ["placeholderNoSearchResults"]
    );
  }

  let cards = {};
  let cardsToRemove = {
    personal: [],
    history: [],
  };
  for (let name of ["daniel", "jonathan", "nathan"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = personalBook.addCard(card);
    cards[name] = card;
    cardsToRemove.personal.push(card);
  }
  for (let name of ["danielle", "katherine", "natalie", "susanah"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = historyBook.addCard(card);
    cards[name] = card;
    cardsToRemove.history.push(card);
  }

  let abWindow = await openAddressBookWindow();

  registerCleanupFunction(() => {
    abWindow.close();
    personalBook.deleteCards(cardsToRemove.personal);
    historyBook.deleteCards(cardsToRemove.history);
  });

  let abDocument = abWindow.document;
  let searchBox = abDocument.getElementById("searchInput");
  let cardsList = abWindow.cardsPane.cardsList;

  Assert.equal(
    abDocument.activeElement,
    searchBox,
    "search box was focused when the page loaded"
  );

  // All address books.

  checkCardsListed(
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );
  checkPlaceholders();

  // Personal address book.

  openDirectory(personalBook);
  checkCardsListed(cards.daniel, cards.jonathan, cards.nathan);
  checkPlaceholders();

  await doSearch("daniel", cards.daniel);
  await doSearch("nathan", cards.jonathan, cards.nathan);

  // History address book.

  openDirectory(historyBook);
  checkCardsListed();
  checkPlaceholders(["placeholderNoSearchResults"]);

  await doSearch(
    null,
    cards.danielle,
    cards.katherine,
    cards.natalie,
    cards.susanah
  );

  await doSearch("daniel", cards.danielle);
  await doSearch("nathan");

  // All address books.

  openAllAddressBooks();
  checkCardsListed(cards.jonathan, cards.nathan);
  checkPlaceholders();

  await doSearch(
    null,
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );

  await doSearch("daniel", cards.daniel, cards.danielle);
  await doSearch("nathan", cards.jonathan, cards.nathan);
  await doSearch(
    null,
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah
  );
});
