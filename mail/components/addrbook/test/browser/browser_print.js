/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests printing of address books and contacts.
 */

let book, list, contactA, contactB, contactC;

add_setup(async function () {
  book = createAddressBook("book");
  contactA = book.addCard(createContact("contact", "A"));
  contactB = book.addCard(createContact("contact", "B"));
  contactC = book.addCard(createContact("contact", "C"));

  list = book.addMailList(createMailingList("list"));
  list.addCard(contactB);
  list.addCard(contactC);

  await openAddressBookWindow();

  registerCleanupFunction(async function () {
    await closeAddressBookWindow();
    await promiseDirectoryRemoved(book.URI);
  });
});

/**
 * Tests that File > Print (and therefore Ctrl+P) prints the selected address
 * book if the books list has focus.
 */
add_task(async function testFileMenuBooks() {
  const abWindow = getAddressBookWindow();

  openAllAddressBooks();
  abWindow.booksList.focus();

  await printFromFileMenu();
  await checkPrintPreview(contactA, contactB, contactC);
}).skip(AppConstants.platform == "macosx");

/**
 * Tests that the books list context menu prints the selected address book.
 */
add_task(async function testBooksContext() {
  const abWindow = getAddressBookWindow();
  const booksList = abWindow.booksList;

  await showBooksContext(
    booksList.getIndexForUID(book.UID),
    "bookContextPrint"
  );
  await checkPrintPreview(contactA, contactB, contactC);

  await showBooksContext(
    booksList.getIndexForUID(list.UID),
    "bookContextPrint"
  );
  await checkPrintPreview(contactB, contactC);
});

/**
 * Tests that File > Print (and therefore Ctrl+P) prints the selected cards
 * if the cards list has focus.
 */
add_task(async function testFileMenuCards() {
  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;

  openAllAddressBooks();
  cardsList.focus();

  await printFromFileMenu();
  await checkPrintPreview(contactA, contactB, contactC);

  await doSearch("act B", contactB);
  await printFromFileMenu();
  await checkPrintPreview(contactB);

  await doSearch("", contactA, contactB, contactC, list);
}).skip(AppConstants.platform == "macosx");

/**
 * Tests that the cards list context menu prints the selected cards.
 */
add_task(async function testCardsContext() {
  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;

  openAllAddressBooks();

  await showCardsContext(0, "cardContextPrint");
  await checkPrintPreview(contactA);

  await showCardsContext(3, "cardContextPrint");
  // Printing a list from here doesn't really print anything. Bug 1851725.
  await checkPrintPreview();

  cardsList.selectedIndices = [0, 2];
  await showCardsContext(0, "cardContextPrint");
  await checkPrintPreview(contactA, contactC);

  cardsList.selectedIndices = [];
});

async function printFromFileMenu() {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const fileMenu = document.getElementById("menu_File");
  const printMenuItem = document.getElementById("printMenuItem");

  const shownPromise = BrowserTestUtils.waitForPopupEvent(fileMenu, "shown");
  EventUtils.synthesizeMouseAtCenter(fileMenu, {});
  await shownPromise;

  fileMenu.menupopup.activateItem(printMenuItem);
}

async function checkPrintPreview(...expectedContacts) {
  await waitForPreviewVisible();

  const previewBrowser = document.querySelector(".printPreviewBrowser");
  SpecialPowers.spawn(
    previewBrowser,
    [expectedContacts.map(c => c.displayName)],
    function (expectedNames) {
      const names = Array.from(
        content.document.querySelectorAll(".contact-heading-name"),
        n => n.textContent
      );
      Assert.deepEqual(names, expectedNames);
    }
  );

  PrintUtils.getTabDialogBox(PrintUtils.printBrowser)
    .getTabDialogManager()
    ._dialogs[0].close();
  await waitForPreviewHidden();

  // Linux has some problems running this test if we move on immediately.
  await new Promise(resolve => getAddressBookWindow().setTimeout(resolve, 500));
}

async function waitForPreviewVisible() {
  await TestUtils.waitForCondition(function () {
    const preview = document.querySelector(".printPreviewBrowser");
    return preview && BrowserTestUtils.isVisible(preview);
  }, "waiting for print preview to appear");
}

async function waitForPreviewHidden() {
  await TestUtils.waitForCondition(function () {
    return !document.querySelector(".printPreviewBrowser");
  }, "waiting for print preview to disappear");
}
