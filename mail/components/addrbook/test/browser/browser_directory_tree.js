/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async () => {
  function checkBooksOrder(...expected) {
    is(dirTree.view.rowCount, expected.length + 1);

    is(dirTree.view.getCellText(0, dirTree.columns[0]), "All Address Books");
    is(
      abWindow.gDirectoryTreeView.getDirectoryAtIndex(0).URI,
      "moz-abdirectory://?"
    );

    for (var i = 0; i < expected.length; i++) {
      is(abWindow.gDirectoryTreeView.getDirectoryAtIndex(i + 1), expected[i]);
      is(
        dirTree.view.getCellText(i + 1, dirTree.columns[0]),
        expected[i].dirName
      );
    }
  }

  let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  let historyBook = MailServices.ab.getDirectoryFromId(
    "ldap_2.servers.history"
  );

  let abWindow = await openAddressBookWindow();

  registerCleanupFunction(() => {
    abWindow.close();
  });

  let abDocument = abWindow.document;
  let dirTree = abDocument.getElementById("dirTree");
  checkBooksOrder(personalBook, historyBook);

  let newBook1PrefName = MailServices.ab.newAddressBook(
    "New Book 1",
    null,
    101
  );
  let newBook1 = MailServices.ab.getDirectoryFromId(newBook1PrefName);
  checkBooksOrder(personalBook, newBook1, historyBook);

  let newBook2PrefName = MailServices.ab.newAddressBook(
    "New Book 2",
    null,
    101
  );
  let newBook2 = MailServices.ab.getDirectoryFromId(newBook2PrefName);
  checkBooksOrder(personalBook, newBook1, newBook2, historyBook);

  let directoryRemoved = promiseDirectoryRemoved();
  MailServices.ab.deleteAddressBook(newBook1.URI);
  await directoryRemoved;
  checkBooksOrder(personalBook, newBook2, historyBook);

  directoryRemoved = promiseDirectoryRemoved();
  MailServices.ab.deleteAddressBook(newBook2.URI);
  await directoryRemoved;
  checkBooksOrder(personalBook, historyBook);
});
