/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

async function openAddressBookWindow() {
  let addressBookWindowPromise = BrowserTestUtils.domWindowOpened(
    null,
    async win => {
      // This test function waits until the "load" event has happened.
      await BrowserTestUtils.waitForEvent(win, "load");

      return (
        win.document.documentURI ==
        "chrome://messenger/content/addressbook/addressbook.xhtml"
      );
    }
  );

  const addressBookButton = document.getElementById("button-address");
  EventUtils.synthesizeMouseAtCenter(addressBookButton, { clickCount: 1 });

  let abWindow = await addressBookWindowPromise;

  await new Promise(resolve => abWindow.setTimeout(resolve));

  Assert.ok(
    abWindow && abWindow instanceof Window,
    "address book window was opened"
  );
  if (Services.focus.activeWindow != abWindow) {
    await BrowserTestUtils.waitForEvent(abWindow, "focus");
  }
  Assert.equal(
    Services.focus.activeWindow,
    abWindow,
    "address book window has focus"
  );
  return abWindow;
}

function closeAddressBookWindow() {
  let abWindow = getAddressBookWindow();
  if (abWindow) {
    let closePromise = BrowserTestUtils.domWindowClosed();
    abWindow.close();
    return closePromise;
  }
  return Promise.resolve();
}

function getAddressBookWindow() {
  return Services.wm.getMostRecentWindow("mail:addressbook");
}

async function openRootDirectory() {
  let abWindow = getAddressBookWindow();
  let abDirTree = abWindow.gDirTree;
  mailTestUtils.treeClick(EventUtils, abWindow, abDirTree, 0, 0, {});
}

function openDirectory(directory) {
  let abWindow = getAddressBookWindow();
  let abDirTree = abWindow.gDirTree;
  for (let i = 0; i < abDirTree.view.rowCount; i++) {
    abDirTree.changeOpenState(i, true);
  }

  let row = abWindow.gDirectoryTreeView.getIndexForId(directory.URI);
  mailTestUtils.treeClick(EventUtils, abWindow, abDirTree, row, 0, {});
}

function createAddressBook(dirName) {
  let prefName = MailServices.ab.newAddressBook(
    dirName,
    null,
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  return MailServices.ab.getDirectoryFromId(prefName);
}

async function createAddressBookWithUI(abName) {
  let abWindow = getAddressBookWindow();
  let newAddressBookPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml",
    {
      callback(abNameDialog) {
        EventUtils.sendString(abName, abNameDialog);
        abNameDialog.document
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );

  // Using the UI was unreliable so just call the function.
  abWindow.AbNewAddressBook();

  await newAddressBookPromise;

  let addressBook = MailServices.ab.directories.find(
    directory => directory.dirName == abName
  );

  Assert.ok(addressBook, "a new address book was created");

  return addressBook;
}

function createContact(firstName, lastName, displayName) {
  let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = displayName || `${firstName} ${lastName}`;
  contact.firstName = firstName;
  contact.lastName = lastName;
  contact.primaryEmail = `${firstName}.${lastName}@invalid`;
  return contact;
}

function createMailingList(name) {
  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(
    Ci.nsIAbDirectory
  );
  list.isMailList = true;
  list.dirName = name;
  return list;
}

async function createMailingListWithUI(mlParent, mlName) {
  let abWindow = getAddressBookWindow();
  let newAddressBookPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml",
    {
      async callback(abListDialog) {
        let abListDocument = abListDialog.document;
        await new Promise(resolve => abListDialog.setTimeout(resolve));

        abListDocument.getElementById("abPopup").value = mlParent.URI;
        abListDocument.getElementById("ListName").value = mlName;
        abListDocument
          .querySelector("dialog")
          .getButton("accept")
          .click();
      },
    }
  );
  abWindow.AbNewList();
  await newAddressBookPromise;

  for (let list of mlParent.childNodes) {
    if (list.dirName == mlName) {
      return list;
    }
  }
  return null;
}

function checkDirectoryDisplayed(directory) {
  let abWindow = getAddressBookWindow();
  if (directory) {
    Assert.equal(
      abWindow.gDirectoryTreeView.selection.currentIndex,
      abWindow.gDirectoryTreeView.getIndexForId(directory.URI)
    );
    Assert.equal(abWindow.gAbView.directory.URI, directory.URI);
    Assert.equal(abWindow.getSelectedDirectoryURI(), directory.URI);
  } else {
    Assert.equal(abWindow.gDirectoryTreeView.selection.currentIndex, 0);
    Assert.ok(!abWindow.gAbView.directory);
    Assert.equal(abWindow.getSelectedDirectoryURI(), "moz-abdirectory://?");
  }
}

function checkCardsListed(...expectedCards) {
  checkNamesListed(
    ...expectedCards.map(card =>
      card.isMailList ? card.dirName : card.displayName
    )
  );
}

function checkNamesListed(...expectedNames) {
  let abWindow = getAddressBookWindow();
  let resultsTree = abWindow.document.getElementById("abResultsTree");
  let expectedCount = expectedNames.length;
  let treeTop = resultsTree.lastElementChild.getBoundingClientRect().top;

  // Checking how many rows the tree *actually has* is difficult. It may be
  // different from the view's row count, which is *bad*. We'll work it out
  // using the coordinates of the expected number of rows. This will fail if
  // there's more rows than can be displayed at once.

  Assert.equal(
    resultsTree.getRowAt(0, treeTop + resultsTree.rowHeight * expectedCount),
    -1,
    "Tree does not have too many rows"
  );
  if (expectedCount > 0) {
    Assert.equal(
      resultsTree.getRowAt(
        0,
        treeTop + resultsTree.rowHeight * expectedCount - 1
      ),
      expectedCount - 1,
      "Tree does not have too few rows"
    );
  }

  Assert.equal(
    resultsTree.view.rowCount,
    expectedCount,
    "Tree view has the right number of rows"
  );

  for (let i = 0; i < expectedCount; i++) {
    Assert.equal(
      resultsTree.view.getCellText(i, resultsTree.columns.GeneratedName),
      expectedNames[i]
    );
  }
}

function promiseDirectoryRemoved(uri) {
  let removePromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(uri);
  return removePromise;
}
