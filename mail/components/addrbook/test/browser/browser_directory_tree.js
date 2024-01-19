/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that additions and removals are accurately displayed.
 */
add_task(async function test_additions_and_removals() {
  function checkBooksOrder(...expected) {
    function checkRow(index, { level, open, isList, text, uid }) {
      info(`Row ${index}`);
      const row = rows[index];

      let containingList = row.closest("ul");
      if (level == 1) {
        Assert.equal(containingList.getAttribute("is"), "ab-tree-listbox");
      } else if (level == 2) {
        Assert.equal(containingList.parentNode.localName, "li");
        containingList = containingList.parentNode.closest("ul");
        Assert.equal(containingList.getAttribute("is"), "ab-tree-listbox");
      }

      const childList = row.querySelector("ul");
      // NOTE: We're not explicitly handling open === false because no test
      // needed it.
      if (open) {
        // Ancestor shouldn't have the collapsed class and the UL child list
        // should be expanded and visible.
        Assert.ok(!row.classList.contains("collapsed"));
        Assert.greater(childList.clientHeight, 0);
      } else if (childList) {
        if (row.classList.contains("collapsed")) {
          // If we have a UL child list and the ancestor element has a collapsed
          // class, the child list shouldn't be visible.
          Assert.equal(childList.clientHeight, 0);
        } else if (childList.childNodes.length) {
          // If the ancestor doesn't have the collapsed class, and the UL child
          // list has at least one child node, the child list should be visible.
          Assert.greater(childList.clientHeight, 0);
        }
      }

      Assert.equal(row.classList.contains("listRow"), isList);
      Assert.equal(row.querySelector("span").textContent, text);
      Assert.equal(row.getAttribute("aria-label"), text);
      Assert.equal(row.dataset.uid, uid);
    }

    const rows = abWindow.booksList.rows;
    Assert.equal(rows.length, expected.length + 1);
    for (let i = 0; i < expected.length; i++) {
      const dir = expected[i].directory;
      checkRow(i + 1, {
        ...expected[i],
        isList: dir.isMailList,
        text: dir.dirName,
        uid: dir.UID,
      });
    }
  }

  let abWindow = await openAddressBookWindow();

  // Check the initial order.

  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: historyBook }
  );

  // Add one book, *not* using the UI, and check that we don't move to it.

  const newBook1 = createAddressBook("New Book 1");
  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1 },
    { level: 1, directory: historyBook }
  );

  // Add another book, using the UI, and check that we move to the new book.

  const newBook2 = await createAddressBookWithUI("New Book 2");
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  // Add some lists, *not* using the UI, and check that we don't move to them.

  const list1 = newBook1.addMailList(createMailingList("New Book 1 - List 1"));
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list1 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  const list3 = newBook1.addMailList(createMailingList("New Book 1 - List 3"));
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list1 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  const list0 = newBook1.addMailList(createMailingList("New Book 1 - List 0"));
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  const list2 = newBook1.addMailList(createMailingList("New Book 1 - List 2"));
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  // Close the window and open it again. The tree should be as it was before.

  await closeAddressBookWindow();
  abWindow = await openAddressBookWindow();

  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  openDirectory(newBook2);

  const list4 = newBook2.addMailList(createMailingList("New Book 2 - List 4"));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 1, directory: historyBook }
  );

  // Add a new list, using the UI, and check that we move to it.

  const list5 = await createMailingListWithUI(newBook2, "New Book 2 - List 5");
  checkDirectoryDisplayed(list5);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 2, directory: list5 },
    { level: 1, directory: historyBook }
  );

  const list6 = await createMailingListWithUI(newBook2, "New Book 2 - List 6");
  checkDirectoryDisplayed(list6);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 2, directory: list5 },
    { level: 2, directory: list6 },
    { level: 1, directory: historyBook }
  );
  // Delete a list that isn't displayed, and check that we don't move.

  newBook1.deleteDirectory(list3);
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(list6);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 2, directory: list5 },
    { level: 2, directory: list6 },
    { level: 1, directory: historyBook }
  );

  // Select list5
  const list5Row = abWindow.booksList.getRowForUID(list5.UID);
  EventUtils.synthesizeMouseAtCenter(
    list5Row.querySelector("span"),
    {},
    abWindow
  );
  checkDirectoryDisplayed(list5);

  // Delete the displayed list, and check that we move to the next list under
  // the same book.

  newBook2.deleteDirectory(list5);
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(list6);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 2, directory: list6 },
    { level: 1, directory: historyBook }
  );

  // Delete the last list, and check we move to the previous list under the same
  // book.
  newBook2.deleteDirectory(list6);
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(list4);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 1, directory: historyBook }
  );

  // Delete the displayed book, and check that we move to the next book.

  await promiseDirectoryRemoved(newBook2.URI);
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(historyBook);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: historyBook }
  );

  // Select a list in the first book, then delete the book. Check that we
  // move to the next book.

  openDirectory(list1);
  await promiseDirectoryRemoved(newBook1.URI);
  await new Promise(r => abWindow.setTimeout(r));
  checkDirectoryDisplayed(historyBook);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: historyBook }
  );

  await closeAddressBookWindow();
});

/**
 * Tests that renaming or deleting books or lists is reflected in the UI.
 */
add_task(async function test_rename_and_delete() {
  const abWindow = await openAddressBookWindow();

  const abDocument = abWindow.document;
  const booksList = abWindow.booksList;
  const searchInput = abWindow.searchInput;
  Assert.equal(booksList.rowCount, 3);

  // Create a book.

  EventUtils.synthesizeMouseAtCenter(booksList, {}, abWindow);
  const newBook = await createAddressBookWithUI("New Book");
  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(newBook.UID), 2);
  Assert.equal(booksList.selectedIndex, 2);
  Assert.equal(abDocument.activeElement, booksList);

  let bookRow = booksList.getRowAtIndex(2);
  Assert.equal(bookRow.querySelector(".bookRow-name").textContent, "New Book");
  Assert.equal(bookRow.getAttribute("aria-label"), "New Book");

  await TestUtils.waitForCondition(
    () => searchInput.placeholder == "Search New Book",
    "search placeholder updated"
  );

  // Rename the book.

  const menu = abDocument.getElementById("bookContext");
  const propertiesMenuItem = abDocument.getElementById("bookContextProperties");

  await showBooksContext(2);

  Assert.ok(BrowserTestUtils.isVisible(propertiesMenuItem));
  Assert.ok(!propertiesMenuItem.disabled);
  Assert.deepEqual(document.l10n.getAttributes(propertiesMenuItem), {
    id: "about-addressbook-books-context-properties",
    args: null,
  });

  let dialogPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml"
  ).then(async function (dialogWindow) {
    const dialogDocument = dialogWindow.document;

    const nameInput = dialogDocument.getElementById("name");
    Assert.equal(nameInput.value, "New Book");
    nameInput.value = "Old Book";

    dialogDocument.querySelector("dialog").getButton("accept").click();
  });
  menu.activateItem(propertiesMenuItem);
  await dialogPromise;

  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(newBook.UID), 2);
  Assert.equal(booksList.selectedIndex, 2);
  Assert.equal(abDocument.activeElement, booksList);

  bookRow = booksList.getRowAtIndex(2);
  Assert.equal(bookRow.querySelector(".bookRow-name").textContent, "Old Book");
  Assert.equal(bookRow.getAttribute("aria-label"), "Old Book");

  await TestUtils.waitForCondition(
    () => searchInput.placeholder == "Search Old Book",
    "search placeholder updated"
  );

  // Create a list.

  const newList = await createMailingListWithUI(newBook, "New List");
  Assert.equal(booksList.rowCount, 5);
  Assert.equal(booksList.getIndexForUID(newList.UID), 3);
  Assert.equal(booksList.selectedIndex, 3);
  Assert.equal(abDocument.activeElement, booksList);

  let listRow = booksList.getRowAtIndex(3);
  Assert.equal(
    listRow.compareDocumentPosition(bookRow),
    Node.DOCUMENT_POSITION_CONTAINS | Node.DOCUMENT_POSITION_PRECEDING
  );
  Assert.equal(listRow.querySelector(".listRow-name").textContent, "New List");
  Assert.equal(listRow.getAttribute("aria-label"), "New List");

  await TestUtils.waitForCondition(
    () => searchInput.placeholder == "Search New List",
    "search placeholder updated"
  );

  // Rename the list.

  await showBooksContext(3);

  Assert.ok(BrowserTestUtils.isVisible(propertiesMenuItem));
  Assert.deepEqual(document.l10n.getAttributes(propertiesMenuItem), {
    id: "about-addressbook-books-context-edit-list",
    args: null,
  });

  dialogPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  ).then(async function (dialogWindow) {
    const dialogDocument = dialogWindow.document;

    const nameInput = dialogDocument.getElementById("ListName");
    Assert.equal(nameInput.value, "New List");
    nameInput.value = "Old List";

    dialogDocument.querySelector("dialog").getButton("accept").click();
  });
  menu.activateItem(propertiesMenuItem);
  await dialogPromise;

  Assert.equal(booksList.rowCount, 5);
  Assert.equal(booksList.getIndexForUID(newList.UID), 3);
  Assert.equal(booksList.selectedIndex, 3);
  Assert.equal(abDocument.activeElement, booksList);

  listRow = booksList.getRowAtIndex(3);
  Assert.equal(listRow.querySelector(".listRow-name").textContent, "Old List");
  Assert.equal(listRow.getAttribute("aria-label"), "Old List");

  await TestUtils.waitForCondition(
    () => searchInput.placeholder == "Search Old List",
    "search placeholder updated"
  );

  // Delete the list.

  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  let selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
  EventUtils.synthesizeKey("KEY_Delete", {}, abWindow);
  await promptPromise;
  await selectPromise;
  Assert.equal(newBook.childNodes.length, 0, "list was actually deleted");
  await new Promise(r => abWindow.setTimeout(r));

  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(newBook.UID), 2);
  Assert.equal(booksList.getIndexForUID(newList.UID), -1);
  // Moves to parent when last list is deleted.
  Assert.equal(booksList.selectedIndex, 2);
  Assert.equal(abDocument.activeElement, booksList);

  bookRow = booksList.getRowAtIndex(2);
  Assert.ok(!bookRow.classList.contains("children"));
  Assert.ok(!bookRow.querySelector("ul, li"));

  // Delete the book.

  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
  EventUtils.synthesizeKey("KEY_Delete", {}, abWindow);
  await promptPromise;
  await selectPromise;
  Assert.equal(
    MailServices.ab.directories.length,
    2,
    "book was actually deleted"
  );

  Assert.equal(booksList.rowCount, 3);
  Assert.equal(booksList.getIndexForUID(newBook.UID), -1);
  Assert.equal(booksList.selectedIndex, 2);
  Assert.equal(abDocument.activeElement, booksList);

  // Attempt to delete the All Address Books entry.
  // Synthesizing the delete key here does not throw immediately.

  booksList.selectedIndex = 0;
  await Assert.rejects(
    booksList.deleteSelected(),
    /Cannot delete the All Address Books item/,
    "Attempting to delete All Address Books should fail."
  );

  // Attempt to delete Personal Address Book.
  // Synthesizing the delete key here does not throw immediately.

  booksList.selectedIndex = 1;
  await Assert.rejects(
    booksList.deleteSelected(),
    /Refusing to delete a built-in address book/,
    "Attempting to delete Personal Address Book should fail."
  );

  // Attempt to delete Collected Addresses.
  // Synthesizing the delete key here does not throw immediately.

  booksList.selectedIndex = 2;
  await Assert.rejects(
    booksList.deleteSelected(),
    /Refusing to delete a built-in address book/,
    "Attempting to delete Collected Addresses should fail."
  );

  await closeAddressBookWindow();
});

/**
 * Tests the context menu of the list.
 */
add_task(async function test_context_menu() {
  const book = createAddressBook("Ordinary Book");
  book.addMailList(createMailingList("Ordinary List"));
  createAddressBook("CardDAV Book", Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const booksList = abWindow.booksList;

  const menu = abWindow.document.getElementById("bookContext");
  const propertiesMenuItem = abDocument.getElementById("bookContextProperties");
  const synchronizeMenuItem = abDocument.getElementById(
    "bookContextSynchronize"
  );
  const printMenuItem = abDocument.getElementById("bookContextPrint");
  const deleteMenuItem = abDocument.getElementById("bookContextDelete");
  const removeMenuItem = abDocument.getElementById("bookContextRemove");
  const startupDefaultItem = abDocument.getElementById(
    "bookContextStartupDefault"
  );

  Assert.equal(booksList.rowCount, 6);

  // Test that the menu does not show for All Address Books.

  await showBooksContext(0);
  Assert.equal(booksList.selectedIndex, 0);
  Assert.equal(abDocument.activeElement, booksList);

  const visibleItems = [...menu.children].filter(BrowserTestUtils.isVisible);
  Assert.equal(visibleItems.length, 1);
  Assert.equal(
    visibleItems[0],
    startupDefaultItem,
    "only the startup default item should be visible"
  );
  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.hidePopup();

  // Test directories that can't be deleted.

  for (const index of [1, booksList.rowCount - 1]) {
    await showBooksContext(index);
    Assert.equal(booksList.selectedIndex, index);
    Assert.ok(BrowserTestUtils.isVisible(propertiesMenuItem));
    Assert.ok(!propertiesMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.isVisible(synchronizeMenuItem));
    Assert.ok(BrowserTestUtils.isVisible(printMenuItem));
    Assert.ok(!printMenuItem.disabled);
    Assert.ok(BrowserTestUtils.isVisible(deleteMenuItem));
    Assert.ok(deleteMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.isVisible(removeMenuItem));
    hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
    Assert.equal(abDocument.activeElement, booksList);
  }

  // Test and delete CardDAV directory at index 4.

  await showBooksContext(4);
  Assert.equal(booksList.selectedIndex, 4);
  Assert.ok(BrowserTestUtils.isVisible(propertiesMenuItem));
  Assert.ok(!propertiesMenuItem.disabled);
  Assert.ok(BrowserTestUtils.isVisible(synchronizeMenuItem));
  Assert.ok(!synchronizeMenuItem.disabled);
  Assert.ok(BrowserTestUtils.isVisible(printMenuItem));
  Assert.ok(!printMenuItem.disabled);
  Assert.ok(!BrowserTestUtils.isVisible(deleteMenuItem));
  Assert.ok(BrowserTestUtils.isVisible(removeMenuItem));
  Assert.ok(!removeMenuItem.disabled);
  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  let selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
  hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.activateItem(removeMenuItem);
  await promptPromise;
  await selectPromise;
  await hiddenPromise;
  Assert.equal(abDocument.activeElement, booksList);

  Assert.equal(booksList.rowCount, 5);
  Assert.equal(booksList.selectedIndex, 4);
  Assert.equal(menu.state, "closed");

  // Test and delete list at index 3, then directory at index 2.

  for (const index of [3, 2]) {
    await new Promise(r => abWindow.setTimeout(r, 250));
    await showBooksContext(index);
    Assert.equal(booksList.selectedIndex, index);
    Assert.ok(BrowserTestUtils.isVisible(propertiesMenuItem));
    Assert.ok(!propertiesMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.isVisible(synchronizeMenuItem));
    Assert.ok(BrowserTestUtils.isVisible(printMenuItem));
    Assert.ok(!printMenuItem.disabled);
    Assert.ok(BrowserTestUtils.isVisible(deleteMenuItem));
    Assert.ok(!deleteMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.isVisible(removeMenuItem));
    promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
    selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
    hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.activateItem(deleteMenuItem);
    await promptPromise;
    await selectPromise;
    await hiddenPromise;
    Assert.equal(abDocument.activeElement, booksList);

    if (index == 3) {
      Assert.equal(booksList.rowCount, 4);
      // Moves to parent when last list is deleted.
      Assert.equal(booksList.selectedIndex, 2);
    } else {
      Assert.equal(booksList.rowCount, 3);
      Assert.equal(booksList.selectedIndex, 2);
    }
    Assert.equal(menu.state, "closed");
  }

  // Test that the menu does not show beyond the last book.

  EventUtils.synthesizeMouseAtCenter(
    booksList,
    100,
    booksList.clientHeight - 10,
    { type: "contextmenu" },
    abWindow
  );
  Assert.equal(booksList.selectedIndex, 2);
  await new Promise(r => abWindow.setTimeout(r, 500));
  Assert.equal(menu.state, "closed", "menu stayed closed as expected");
  Assert.equal(abDocument.activeElement, booksList);

  await closeAddressBookWindow();
});

/**
 * Tests the menu button on each item.
 */
add_task(async function test_context_menu_button() {
  const book = createAddressBook("Ordinary Book");
  book.addMailList(createMailingList("Ordinary List"));

  const abWindow = await openAddressBookWindow();
  const booksList = abWindow.booksList;
  const menu = abWindow.document.getElementById("bookContext");

  for (const row of booksList.rows) {
    info(row.querySelector(".bookRow-name, .listRow-name").textContent);
    const button = row.querySelector(".bookRow-menu, .listRow-menu");
    Assert.ok(BrowserTestUtils.isHidden(button), "menu button is hidden");

    EventUtils.synthesizeMouse(row, 100, 5, { type: "mousemove" }, abWindow);
    Assert.ok(BrowserTestUtils.isVisible(button), "menu button is visible");

    const shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
    EventUtils.synthesizeMouseAtCenter(button, {}, abWindow);
    await shownPromise;

    const buttonRect = button.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    Assert.less(
      Math.abs(menuRect.top - buttonRect.bottom),
      13,
      "menu appeared near the button vertically"
    );
    Assert.less(
      Math.abs(menuRect.left - buttonRect.left),
      20,
      "menu appeared near the button horizontally"
    );

    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(book.URI);
});

/**
 * Tests that the collapsed state of books survives a reload of the page.
 */
add_task(async function test_collapse_expand() {
  Services.xulStore.removeDocument("about:addressbook");

  personalBook.addMailList(createMailingList("Personal List 1"));
  personalBook.addMailList(createMailingList("Personal List 2"));

  historyBook.addMailList(createMailingList("History List 1"));

  const book1 = createAddressBook("Book 1");
  book1.addMailList(createMailingList("Book 1 List 1"));
  book1.addMailList(createMailingList("Book 1 List 2"));

  const book2 = createAddressBook("Book 2");
  book2.addMailList(createMailingList("Book 2 List 1"));
  book2.addMailList(createMailingList("Book 2 List 2"));
  book2.addMailList(createMailingList("Book 2 List 3"));

  function getRowForBook(book) {
    return abDocument.getElementById(`book-${book.UID}`);
  }

  function checkCollapsedState(book, expectedCollapsed) {
    Assert.equal(
      getRowForBook(book).classList.contains("collapsed"),
      expectedCollapsed,
      `${book.dirName} is ${expectedCollapsed ? "collapsed" : "expanded"}`
    );
  }

  function toggleCollapsedState(book) {
    const twisty = getRowForBook(book).querySelector(".twisty");
    Assert.ok(
      BrowserTestUtils.isVisible(twisty),
      `twisty for ${book.dirName} is visible`
    );
    EventUtils.synthesizeMouseAtCenter(twisty, {}, abWindow);
  }

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  checkCollapsedState(personalBook, false);
  checkCollapsedState(book1, false);
  checkCollapsedState(book2, false);
  checkCollapsedState(historyBook, false);

  toggleCollapsedState(personalBook);
  toggleCollapsedState(book1);

  info("Closing and re-opening");
  await closeAddressBookWindow();
  abWindow = await openAddressBookWindow();
  abDocument = abWindow.document;

  checkCollapsedState(personalBook, true);
  checkCollapsedState(book1, true);
  checkCollapsedState(book2, false);
  checkCollapsedState(historyBook, false);

  toggleCollapsedState(book1);
  toggleCollapsedState(book2);
  toggleCollapsedState(historyBook);

  info("Closing and re-opening");
  await closeAddressBookWindow();
  abWindow = await openAddressBookWindow();
  abDocument = abWindow.document;

  checkCollapsedState(personalBook, true);
  checkCollapsedState(book1, false);
  checkCollapsedState(book2, true);
  checkCollapsedState(historyBook, true);

  toggleCollapsedState(personalBook);

  info("Closing and re-opening");
  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book2.URI);
  abWindow = await openAddressBookWindow();
  abDocument = abWindow.document;

  checkCollapsedState(personalBook, false);
  checkCollapsedState(book1, false);
  checkCollapsedState(historyBook, true);

  await closeAddressBookWindow();

  personalBook.childNodes.forEach(list => personalBook.deleteDirectory(list));
  historyBook.childNodes.forEach(list => historyBook.deleteDirectory(list));
  await promiseDirectoryRemoved(book1.URI);
  Services.xulStore.removeDocument("about:addressbook");
});

/**
 * Tests that the chosen default directory (or lack thereof) is opened when
 * the page opens.
 */
add_task(async function test_startup_directory() {
  const URI_PREF = "mail.addr_book.view.startupURI";
  const DEFAULT_PREF = "mail.addr_book.view.startupURIisDefault";

  Services.prefs.clearUserPref(URI_PREF);
  Services.prefs.clearUserPref(DEFAULT_PREF);

  async function checkMenuItem(index, expectChecked, toggle = false) {
    await showBooksContext(index);

    const menu = abWindow.document.getElementById("bookContext");
    const item = abWindow.document.getElementById("bookContextStartupDefault");
    Assert.equal(
      item.hasAttribute("checked"),
      expectChecked,
      `directory at index ${index} is the default?`
    );

    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    if (toggle) {
      menu.activateItem(item);
    } else {
      menu.hidePopup();
    }
    await hiddenPromise;
  }

  // With the defaults, All Address Books should open.
  // No changes should be made to the prefs.

  let abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed();
  await checkMenuItem(0, true);
  await checkMenuItem(1, false);
  await checkMenuItem(2, false);
  openDirectory(personalBook);
  await closeAddressBookWindow();
  Assert.ok(!Services.prefs.prefHasUserValue(URI_PREF));

  // Now we'll set the default to "last-used".
  // The last-used book should be saved.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed();
  await checkMenuItem(0, true);
  await checkMenuItem(1, false);
  await checkMenuItem(2, false);
  Services.prefs.setBoolPref(DEFAULT_PREF, false);
  openDirectory(personalBook);
  await closeAddressBookWindow();
  Assert.equal(Services.prefs.getStringPref(URI_PREF), personalBook.URI);

  // The last-used book should open.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed(personalBook);
  await checkMenuItem(0, false);
  await checkMenuItem(1, false);
  await checkMenuItem(2, false);
  openDirectory(historyBook);
  await closeAddressBookWindow();
  Assert.equal(Services.prefs.getStringPref(URI_PREF), historyBook.URI);

  // The last-used book should open.
  // We'll set a default directory again.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed(historyBook);
  await checkMenuItem(0, false);
  await checkMenuItem(1, false);
  await checkMenuItem(2, false, true);
  openDirectory(personalBook);
  await closeAddressBookWindow();
  Assert.ok(Services.prefs.getBoolPref(DEFAULT_PREF));
  Assert.equal(Services.prefs.getStringPref(URI_PREF), historyBook.URI);

  // Check that the saved default opens. Change the default.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed(historyBook);
  await checkMenuItem(0, false);
  await checkMenuItem(2, true);
  await checkMenuItem(1, false, true);
  await closeAddressBookWindow();
  Assert.ok(Services.prefs.getBoolPref(DEFAULT_PREF));
  Assert.equal(Services.prefs.getStringPref(URI_PREF), personalBook.URI);

  // Check that the saved default opens. Change the default to All Address Books.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed(personalBook);
  await checkMenuItem(1, true);
  await checkMenuItem(2, false);
  await checkMenuItem(0, false, true);
  await closeAddressBookWindow();
  Assert.ok(Services.prefs.getBoolPref(DEFAULT_PREF));
  Assert.ok(!Services.prefs.prefHasUserValue(URI_PREF));

  // Check that the saved default opens. Clear the default.

  abWindow = await openAddressBookWindow();
  checkDirectoryDisplayed();
  await checkMenuItem(1, false);
  await checkMenuItem(2, false);
  await checkMenuItem(0, true, true);
  await closeAddressBookWindow();
  Assert.ok(!Services.prefs.getBoolPref(DEFAULT_PREF));
  Assert.ok(!Services.prefs.prefHasUserValue(URI_PREF));
});

add_task(async function test_total_address_book_count() {
  const book1 = createAddressBook("First Book");
  const book2 = createAddressBook("Second Book");
  book1.addMailList(createMailingList("Ordinary List"));

  book1.addCard(createContact("contact1", "book 1"));
  book1.addCard(createContact("contact2", "book 1"));
  book1.addCard(createContact("contact3", "book 1"));

  book2.addCard(createContact("contact1", "book 2"));

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const booksList = abWindow.booksList;
  const cardCount = abDocument.getElementById("cardCount");

  await openAllAddressBooks();
  Assert.deepEqual(abDocument.l10n.getAttributes(cardCount), {
    id: "about-addressbook-card-count-all",
    args: {
      count: 5,
    },
  });

  for (const [index, [name, count]] of [
    ["Personal Address Book", 0],
    ["First Book", 4],
    ["Ordinary List", 0],
    ["Second Book", 1],
  ].entries()) {
    booksList.getRowAtIndex(index + 1).click();
    Assert.deepEqual(abDocument.l10n.getAttributes(cardCount), {
      id: "about-addressbook-card-count",
      args: { name, count },
    });
  }

  // Create a contact and check that the count updates.
  // Select second book.
  booksList.getRowAtIndex(4).click();
  const createdPromise = TestUtils.topicObserved("addrbook-contact-created");
  book2.addCard(createContact("contact2", "book 2"));
  await createdPromise;
  Assert.deepEqual(
    abDocument.l10n.getAttributes(cardCount),
    {
      id: "about-addressbook-card-count",
      args: { name: "Second Book", count: 2 },
    },
    "Address Book count is updated on contact creation."
  );

  // Delete a contact an check that the count updates.
  const promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  const deletedPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  const cards = abWindow.cardsPane.cardsList;
  EventUtils.synthesizeMouseAtCenter(cards.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
  await promptPromise;
  await deletedPromise;
  Assert.deepEqual(
    abDocument.l10n.getAttributes(cardCount),
    {
      id: "about-addressbook-card-count",
      args: { name: "Second Book", count: 1 },
    },
    "Address Book count is updated on contact deletion."
  );

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book1.URI);
  await promiseDirectoryRemoved(book2.URI);
});
