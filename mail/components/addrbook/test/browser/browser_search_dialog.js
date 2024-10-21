/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);

const cards = {};

add_setup(async function () {
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;

  for (const name of ["daniel", "jonathan", "nathan"]) {
    cards[name] = personalBook.addCard(createContact(name, "test"));
  }
  for (const name of ["danielle", "katherine", "natalie", "susanah"]) {
    cards[name] = historyBook.addCard(createContact(name, "test"));
  }

  registerCleanupFunction(async function () {
    MailServices.accounts.removeAccount(account, false);
    personalBook.deleteCards(personalBook.childCards);
    historyBook.deleteCards(historyBook.childCards);
  });
});

add_task(async function () {
  // Open the search window.

  const searchWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win =>
      win.location.href ==
      "chrome://messenger/content/addressbook/abSearchDialog.xhtml"
  );
  window.MsgSearchAddresses();
  const searchWindow = await searchWindowPromise;
  searchWindow.resizeBy(0, 200); // A bit larger so we don't have to scroll.

  const abMenulist = searchWindow.document.getElementById("abPopup");
  const searchButton = searchWindow.document.getElementById("search-button");
  const resetButton = searchWindow.document.getElementById("reset-button");
  const searchTermList = searchWindow.document.getElementById("searchTermList");
  const resultsTree = searchWindow.document.getElementById("abResultsTree");
  const nameColumn = searchWindow.document.getElementById("GeneratedName");
  const bookColumn = searchWindow.document.getElementById("addrbook");
  const propertiesButton = searchWindow.document.querySelector(
    `button[command="cmd_properties"]`
  );
  const composeButton = searchWindow.document.querySelector(
    `button[command="cmd_compose"]`
  );
  const deleteButton = searchWindow.document.querySelector(
    `button[command="cmd_deleteCard"]`
  );
  const statusText = searchWindow.document.getElementById("statusText");

  async function changeBook(bookURI) {
    EventUtils.synthesizeMouseAtCenter(abMenulist, {}, searchWindow);
    await BrowserTestUtils.waitForPopupEvent(abMenulist.menupopup, "shown");
    abMenulist.menupopup.activateItem(
      abMenulist.menupopup.querySelector(`menuitem[value="${bookURI}"]`)
    );
    await BrowserTestUtils.waitForPopupEvent(abMenulist.menupopup, "hidden");
  }

  function checkSearchResults(expectedCards) {
    Assert.equal(
      resultsTree.view.rowCount,
      expectedCards.length,
      "expected number of cards should be displayed"
    );
    for (let i = 0; i < expectedCards.length; i++) {
      Assert.equal(
        resultsTree.view.getCellText(i, "GeneratedName"),
        expectedCards[i].displayName
      );
    }
    if (expectedCards.length) {
      Assert.equal(
        statusText.value,
        `${expectedCards.length} matches found`,
        "status text should show the number of cards"
      );
    } else {
      Assert.equal(
        statusText.value,
        "No matches found",
        "status text should show there are no results"
      );
    }
  }

  // Check the initial state of the window.

  Assert.equal(abMenulist.value, "moz-abdirectory://?");
  Assert.ok(!resultsTree.view);

  // Search with no defined criteria. This should find everybody.

  EventUtils.synthesizeMouseAtCenter(searchButton, {}, searchWindow);
  checkSearchResults([
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah,
  ]);

  // Test sorting the results.

  EventUtils.synthesizeMouseAtCenter(bookColumn, {}, searchWindow);
  checkSearchResults([
    cards.danielle,
    cards.katherine,
    cards.natalie,
    cards.susanah,
    cards.daniel,
    cards.jonathan,
    cards.nathan,
  ]);
  EventUtils.synthesizeMouseAtCenter(bookColumn, {}, searchWindow);
  checkSearchResults([
    cards.daniel,
    cards.jonathan,
    cards.nathan,
    cards.danielle,
    cards.katherine,
    cards.natalie,
    cards.susanah,
  ]);
  EventUtils.synthesizeMouseAtCenter(nameColumn, {}, searchWindow);
  checkSearchResults([
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah,
  ]);

  // Now search with some criteria. We're not really trying to test the search
  // logic here, just prove it works in general.

  EventUtils.synthesizeMouseAtCenter(resetButton, {}, searchWindow);
  Assert.ok(!resultsTree.view);

  const searchTerm0 = searchTermList.getItemAtIndex(0);
  const input0 = searchTerm0.querySelector("search-value input");

  Assert.equal(input0.value, "", "search criteria input should be cleared");
  input0.select();
  EventUtils.sendString("daniel", searchWindow);
  EventUtils.synthesizeMouseAtCenter(searchButton, {}, searchWindow);
  checkSearchResults([cards.daniel, cards.danielle]);

  await changeBook(personalBook.URI);
  input0.select();
  EventUtils.sendString("nathan", searchWindow);
  EventUtils.synthesizeMouseAtCenter(searchButton, {}, searchWindow);
  checkSearchResults([cards.jonathan, cards.nathan]);

  await changeBook(historyBook.URI);
  checkSearchResults([cards.jonathan, cards.nathan]);
  EventUtils.synthesizeMouseAtCenter(searchButton, {}, searchWindow);
  checkSearchResults([]);

  // Pressing Enter from the criteria input should start a search.

  await changeBook("moz-abdirectory://?");
  input0.select();
  EventUtils.synthesizeKey("KEY_Backspace", {}, searchWindow);
  EventUtils.synthesizeKey("KEY_Enter", {}, searchWindow);
  checkSearchResults([
    cards.daniel,
    cards.danielle,
    cards.jonathan,
    cards.katherine,
    cards.natalie,
    cards.nathan,
    cards.susanah,
  ]);

  function clickOnRow(row, event = {}) {
    EventUtils.synthesizeMouseAtCenter(
      resultsTree.getRowAtIndex(row),
      event,
      searchWindow
    );
  }

  // Check the action buttons are enabled/disabled correctly.

  resultsTree.selectAll();
  Assert.ok(propertiesButton.disabled, "properties button should be disabled");
  Assert.ok(!composeButton.disabled, "compose button should not be disabled");
  Assert.ok(!deleteButton.disabled, "delete button should not be disabled");

  resultsTree.selectedIndices = [];
  Assert.ok(propertiesButton.disabled, "properties button should be disabled");
  Assert.ok(composeButton.disabled, "compose button should be disabled");
  Assert.ok(deleteButton.disabled, "delete button should be disabled");

  clickOnRow(3);
  Assert.ok(
    !propertiesButton.disabled,
    "properties button should not be disabled"
  );
  Assert.ok(!composeButton.disabled, "compose button should not be disabled");
  Assert.ok(!deleteButton.disabled, "delete button should not be disabled");

  // Check that selecting all by keyboard works.

  EventUtils.synthesizeKey(
    "A",
    {
      accelKey: AppConstants.platform == "macosx",
      ctrlKey: AppConstants.platform != "macosx",
    },
    searchWindow
  );
  Assert.equal(
    resultsTree.view.selection.count,
    7,
    "all search results should be selected"
  );

  // Check that the compose action button works.

  const composeWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win =>
      win.location.href ==
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
  );
  clickOnRow(0);
  EventUtils.synthesizeMouseAtCenter(composeButton, {}, searchWindow);
  const composeWindow = await composeWindowPromise;
  await checkComposeWindow(
    composeWindow,
    ["daniel test <daniel.test@invalid>"],
    searchWindow
  );

  // Check that deletion by keyboard and by action button works.

  let deletedPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  clickOnRow(3);
  EventUtils.synthesizeKey("KEY_Delete", {}, searchWindow);
  await promptPromise;
  let [deletedCard] = await deletedPromise;
  Assert.equal(
    deletedCard.displayName,
    "katherine test",
    "correct card should be deleted"
  );

  deletedPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  clickOnRow(2);
  EventUtils.synthesizeKey("KEY_Backspace", {}, searchWindow);
  await promptPromise;
  [deletedCard] = await deletedPromise;
  Assert.equal(
    deletedCard.displayName,
    "jonathan test",
    "correct card should be deleted"
  );

  checkSearchResults([
    cards.daniel,
    cards.danielle,
    cards.natalie,
    cards.nathan,
    cards.susanah,
  ]);
  Assert.equal(
    resultsTree.view.selection.count,
    0,
    "there should be no selection"
  );

  clickOnRow(0);
  clickOnRow(1, { shiftKey: true });
  deletedPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, searchWindow);
  await promptPromise;
  await deletedPromise;

  checkSearchResults([cards.natalie, cards.nathan, cards.susanah]);
  Assert.equal(
    resultsTree.view.selection.count,
    0,
    "there should be no selection"
  );

  // Check that the properties action button works. This should open the
  // Address Book tab and display the contact.

  clickOnRow(2);
  const tabmail = document.getElementById("tabmail");
  const abTabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  EventUtils.synthesizeMouseAtCenter(propertiesButton, {}, searchWindow);
  const {
    detail: { tabInfo: abTabInfo },
  } = await abTabPromise;
  await TestUtils.waitForCondition(
    () => document.hasFocus(),
    "waiting for focus"
  );

  await BrowserTestUtils.browserLoaded(abTabInfo.browser);
  const abWindow = abTabInfo.browser.contentWindow;
  const booksList = abWindow.booksList;
  const cardsList = abWindow.cardsPane.cardsList;
  const detailsPane = abWindow.detailsPane;
  await TestUtils.waitForCondition(
    () => detailsPane.currentCard.equals(cards.susanah),
    "waiting for the card to be displayed"
  );
  Assert.equal(
    cardsList.view.directory,
    historyBook,
    "cards list should display the book containing the card"
  );
  Assert.equal(
    booksList.selectedIndex,
    booksList.getIndexForUID(historyBook.UID),
    "books list should have the book containing the card selected"
  );

  // Without closing the Address Book tab, go back to the search window and
  // test that opening the properties by keyboard works. The existing Address
  // Book tab should be updated.

  await SimpleTest.promiseFocus(searchWindow);
  clickOnRow(1);
  EventUtils.synthesizeKey("KEY_Enter", {}, searchWindow);
  await TestUtils.waitForCondition(
    () => document.hasFocus(),
    "waiting for focus"
  );

  await TestUtils.waitForCondition(
    () => detailsPane.currentCard.equals(cards.nathan),
    "waiting for the card to be displayed"
  );
  Assert.equal(
    cardsList.view.directory,
    personalBook,
    "cards list should display the book containing the card"
  );
  Assert.equal(
    booksList.selectedIndex,
    booksList.getIndexForUID(personalBook.UID),
    "books list should have the book containing the card selected"
  );

  Assert.equal(tabmail.tabInfo.length, 2, "a new tab should not be opened");
  tabmail.closeTab(abTabInfo);

  await BrowserTestUtils.closeWindow(searchWindow);
});
