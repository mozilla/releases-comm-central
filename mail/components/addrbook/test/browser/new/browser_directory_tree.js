/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function rightClickOnIndex(index) {
  let abWindow = getAddressBookWindow();
  let booksList = abWindow.booksList;
  let menu = abWindow.document.getElementById("bookContext");

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    booksList.getRowAtIndex(index),
    { type: "contextmenu" },
    abWindow
  );
  return shownPromise;
}

add_task(async function test_additions_and_removals() {
  function checkBooksOrder(...expected) {
    function checkRow(index, { level, open, isList, text, uid }) {
      info(`Row ${index}`);
      let row = rows[index];

      let containingList = row.closest("ul");
      if (level == 1) {
        Assert.equal(containingList.getAttribute("is"), "ab-tree-listbox");
      } else if (level == 2) {
        Assert.equal(containingList.parentNode.localName, "li");
        containingList = containingList.parentNode.closest("ul");
        Assert.equal(containingList.getAttribute("is"), "ab-tree-listbox");
      }

      let childList = row.querySelector("ul");
      if (open === undefined) {
        Assert.ok(!childList || BrowserTestUtils.is_hidden(childList));
      } else {
        Assert.equal(row.classList.contains("collapsed"), !open);
        Assert.equal(BrowserTestUtils.is_visible(childList), open);
      }

      Assert.equal(row.classList.contains("listRow"), isList);
      Assert.equal(row.querySelector("span").textContent, text);
      Assert.equal(row.getAttribute("aria-label"), text);
      Assert.equal(row.dataset.uid, uid);
    }

    let rows = abWindow.booksList.rows;
    Assert.equal(rows.length, expected.length + 1);
    for (let i = 0; i < expected.length; i++) {
      let dir = expected[i].directory;
      checkRow(i + 1, {
        ...expected[i],
        isList: dir.isMailList,
        text: dir.dirName,
        uid: dir.UID,
      });
    }
  }

  let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  let historyBook = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.history"
  );

  let abWindow = await openAddressBookWindow();

  // Check the initial order.

  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: historyBook }
  );

  // Add one book, *not* using the UI, and check that we don't move to it.

  let newBook1 = createAddressBook("New Book 1");
  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1 },
    { level: 1, directory: historyBook }
  );

  // Add another book, using the UI, and check that we move to the new book.

  let newBook2 = await createAddressBookWithUI("New Book 2");
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  // Add some lists, *not* using the UI, and check that we don't move to them.

  let list1 = newBook1.addMailList(createMailingList("New Book 1 - List 1"));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list1 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  let list3 = newBook1.addMailList(createMailingList("New Book 1 - List 3"));
  checkDirectoryDisplayed(newBook2);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list1 },
    { level: 2, directory: list3 },
    { level: 1, directory: newBook2 },
    { level: 1, directory: historyBook }
  );

  let list0 = newBook1.addMailList(createMailingList("New Book 1 - List 0"));
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

  let list2 = newBook1.addMailList(createMailingList("New Book 1 - List 2"));
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

  let list4 = newBook2.addMailList(createMailingList("New Book 2 - List 4"));
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

  let list5 = await createMailingListWithUI(newBook2, "New Book 2 - List 5");
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

  // Delete a list that isn't displayed, and check that we don't move.

  newBook1.deleteDirectory(list3);
  checkDirectoryDisplayed(list5);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: newBook2, open: true },
    { level: 2, directory: list4 },
    { level: 2, directory: list5 },
    { level: 1, directory: historyBook }
  );

  // Delete the displayed list, and check that we return to the parent book.

  newBook2.deleteDirectory(list5);
  checkDirectoryDisplayed(newBook2);
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

  // Delete the displayed book, and check that we return to "All Address Books".

  await promiseDirectoryRemoved(newBook2.URI);
  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: newBook1, open: true },
    { level: 2, directory: list0 },
    { level: 2, directory: list1 },
    { level: 2, directory: list2 },
    { level: 1, directory: historyBook }
  );

  // Select a list in the first book, then delete the book. Check that we
  // return to "All Address Books".

  openDirectory(list1);
  await promiseDirectoryRemoved(newBook1.URI);
  checkDirectoryDisplayed(null);
  checkBooksOrder(
    { level: 1, directory: personalBook },
    { level: 1, directory: historyBook }
  );
});

add_task(async function test_rename_and_delete() {
  let abWindow = await openAddressBookWindow();

  let abDocument = abWindow.document;
  let booksList = abWindow.booksList;
  let searchInput = abWindow.searchInput;
  Assert.equal(booksList.rowCount, 3);

  // Create a book.

  EventUtils.synthesizeMouseAtCenter(booksList, {}, abWindow);
  let newBook = await createAddressBookWithUI("New Book");
  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(newBook.UID), 2);
  Assert.equal(booksList.selectedIndex, 2);
  Assert.equal(abDocument.activeElement, booksList);

  let bookRow = booksList.getRowAtIndex(2);
  Assert.equal(bookRow.querySelector(".bookRow-name").textContent, "New Book");
  Assert.equal(bookRow.getAttribute("aria-label"), "New Book");

  await new Promise(r => abWindow.requestAnimationFrame(r)); // L10n.
  Assert.equal(searchInput.placeholder, "Search New Book");

  // Rename the book.

  let menu = abDocument.getElementById("bookContext");
  let propertiesMenuItem = abDocument.getElementById("bookContextProperties");

  await rightClickOnIndex(2);

  Assert.ok(BrowserTestUtils.is_visible(propertiesMenuItem));
  Assert.ok(!propertiesMenuItem.disabled);

  let dialogPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml"
  ).then(async function(dialogWindow) {
    let dialogDocument = dialogWindow.document;

    let nameInput = dialogDocument.getElementById("name");
    Assert.equal(nameInput.value, "New Book");
    nameInput.value = "Old Book";

    dialogDocument
      .querySelector("dialog")
      .getButton("accept")
      .click();
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

  await new Promise(r => abWindow.requestAnimationFrame(r)); // L10n.
  Assert.equal(searchInput.placeholder, "Search Old Book");

  // Create a list.

  let newList = await createMailingListWithUI(newBook, "New List");
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

  await new Promise(r => abWindow.requestAnimationFrame(r)); // L10n.
  Assert.equal(searchInput.placeholder, "Search New List");

  // Rename the list.

  await rightClickOnIndex(2);

  Assert.ok(BrowserTestUtils.is_visible(propertiesMenuItem));

  dialogPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abEditListDialog.xhtml"
  ).then(async function(dialogWindow) {
    let dialogDocument = dialogWindow.document;

    let nameInput = dialogDocument.getElementById("ListName");
    Assert.equal(nameInput.value, "New List");
    nameInput.value = "Old List";

    dialogDocument
      .querySelector("dialog")
      .getButton("accept")
      .click();
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

  await new Promise(r => abWindow.requestAnimationFrame(r)); // L10n.
  Assert.equal(searchInput.placeholder, "Search Old List");

  // Delete the list.

  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  let selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
  EventUtils.synthesizeKey("KEY_Delete", {}, abWindow);
  await promptPromise;
  await selectPromise;
  Assert.equal(newBook.childNodes.length, 0, "list was actually deleted");

  Assert.equal(booksList.rowCount, 4);
  Assert.equal(booksList.getIndexForUID(newBook.UID), 2);
  Assert.equal(booksList.getIndexForUID(newList.UID), -1);
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
  Assert.equal(booksList.selectedIndex, 0);
  Assert.equal(abDocument.activeElement, booksList);

  // Attempt to delete the All Address Books entry.
  // Synthesizing the delete key here does not throw immediately.

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

add_task(async function test_context_menu() {
  let book = createAddressBook("Ordinary Book");
  book.addMailList(createMailingList("Ordinary List"));
  createAddressBook("CardDAV Book", Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE);

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let booksList = abWindow.booksList;

  let menu = abWindow.document.getElementById("bookContext");
  let propertiesMenuItem = abDocument.getElementById("bookContextProperties");
  let synchronizeMenuItem = abDocument.getElementById("bookContextSynchronize");
  let deleteMenuItem = abDocument.getElementById("bookContextDelete");
  let removeMenuItem = abDocument.getElementById("bookContextRemove");

  Assert.equal(booksList.rowCount, 6);

  // Test that the menu does not show for All Address Books.

  EventUtils.synthesizeMouseAtCenter(
    booksList.getRowAtIndex(0),
    { type: "contextmenu" },
    abWindow
  );
  Assert.equal(booksList.selectedIndex, 0);
  await new Promise(r => abWindow.setTimeout(r, 500));
  Assert.equal(menu.state, "closed", "menu stayed closed as expected");
  Assert.equal(abDocument.activeElement, booksList);

  // Test directories that can't be deleted.

  for (let index of [1, booksList.rowCount - 1]) {
    await rightClickOnIndex(index);
    Assert.equal(booksList.selectedIndex, index);
    Assert.ok(BrowserTestUtils.is_visible(propertiesMenuItem));
    Assert.ok(!propertiesMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.is_visible(synchronizeMenuItem));
    Assert.ok(BrowserTestUtils.is_visible(deleteMenuItem));
    Assert.ok(deleteMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.is_visible(removeMenuItem));
    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
    Assert.equal(abDocument.activeElement, booksList);
  }

  // Test and delete CardDAV directory at index 4.

  await rightClickOnIndex(4);
  Assert.equal(booksList.selectedIndex, 4);
  Assert.ok(BrowserTestUtils.is_visible(propertiesMenuItem));
  Assert.ok(!propertiesMenuItem.disabled);
  Assert.ok(BrowserTestUtils.is_visible(synchronizeMenuItem));
  Assert.ok(!synchronizeMenuItem.disabled);
  Assert.ok(!BrowserTestUtils.is_visible(deleteMenuItem));
  Assert.ok(BrowserTestUtils.is_visible(removeMenuItem));
  Assert.ok(!removeMenuItem.disabled);
  let promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  let selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
  menu.activateItem(removeMenuItem);
  await promptPromise;
  await selectPromise;
  Assert.equal(abDocument.activeElement, booksList);

  Assert.equal(booksList.rowCount, 5);

  // Test and delete list at index 3, then directory at index 2.

  for (let index of [3, 2]) {
    await rightClickOnIndex(index);
    Assert.equal(booksList.selectedIndex, index);
    Assert.ok(BrowserTestUtils.is_visible(propertiesMenuItem));
    Assert.ok(!propertiesMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.is_visible(synchronizeMenuItem));
    Assert.ok(BrowserTestUtils.is_visible(deleteMenuItem));
    Assert.ok(!deleteMenuItem.disabled);
    Assert.ok(!BrowserTestUtils.is_visible(removeMenuItem));
    promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
    selectPromise = BrowserTestUtils.waitForEvent(booksList, "select");
    menu.activateItem(deleteMenuItem);
    await promptPromise;
    await selectPromise;
    Assert.equal(abDocument.activeElement, booksList);
  }

  Assert.equal(booksList.rowCount, 3);
  Assert.equal(booksList.selectedIndex, 0);

  // Test that the menu does not show beyond the last book.

  EventUtils.synthesizeMouseAtCenter(
    booksList,
    100,
    booksList.clientHeight - 10,
    { type: "contextmenu" },
    abWindow
  );
  Assert.equal(booksList.selectedIndex, 0);
  await new Promise(r => abWindow.setTimeout(r, 500));
  Assert.equal(menu.state, "closed", "menu stayed closed as expected");
  Assert.equal(abDocument.activeElement, booksList);

  await closeAddressBookWindow();
});
