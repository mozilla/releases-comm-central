/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  function checkBooksOrder(...expected) {
    function checkRow(index, { level, open, properties, text, uri }) {
      info(`Row ${index}`);
      Assert.equal(dirTree.view.getLevel(index), level);
      if (open === undefined) {
        Assert.ok(dirTree.view.isContainerEmpty(index));
      } else {
        Assert.equal(dirTree.view.isContainerOpen(index), open);
      }
      Assert.equal(dirTree.view.getRowProperties(index), properties);
      Assert.equal(
        dirTree.view.getCellText(index, dirTree.columns.DirCol),
        text
      );
      Assert.equal(dirView.getDirectoryAtIndex(index).URI, uri);
    }

    info("Checking books");
    Assert.equal(dirTree.view.rowCount, expected.length + 1, "row count");
    checkRow(0, {
      text: "All Address Books",
      level: 0,
      open: true,
      properties: "",
      uri: "moz-abdirectory://?",
    });
    for (let i = 0; i < expected.length; i++) {
      let dir = expected[i].directory;
      checkRow(i + 1, {
        ...expected[i],
        properties: dir.isMailList ? "IsMailList-true" : "",
        text: dir.dirName,
        uri: dir.URI,
      });
    }
  }

  let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  let historyBook = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.history"
  );

  let abWindow = await openAddressBookWindow();

  registerCleanupFunction(closeAddressBookWindow);

  // Check the initial order.

  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");
  let dirView = abWindow.gDirectoryTreeView;
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
  abDocument = abWindow.document;
  dirTree = abDocument.getElementById("dirTree");
  dirView = abWindow.gDirectoryTreeView;

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
