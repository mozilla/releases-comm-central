/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

registerCleanupFunction(async function() {
  Assert.equal(
    MailServices.ab.directories.length,
    2,
    "all test directories have been removed"
  );
  for (let directory of MailServices.ab.directories) {
    if (
      directory.dirPrefId != "ldap_2.servers.history" &&
      directory.dirPrefId != "ldap_2.servers.pab"
    ) {
      await promiseDirectoryRemoved(directory.URI);
    }
  }
  closeAddressBookWindow();
});

async function openAddressBookWindow() {
  let tab = window.openContentTab("about:addressbook");
  await BrowserTestUtils.browserLoaded(
    tab.browser,
    undefined,
    "about:addressbook"
  );
  await new Promise(r => tab.browser.contentWindow.setTimeout(r));
  return tab.browser.contentWindow;
}

function closeAddressBookWindow() {
  let abTab = getAddressBookTab();
  if (abTab) {
    let tabmail = document.getElementById("tabmail");
    tabmail.closeTab(abTab);
  }
}

function getAddressBookTab() {
  let tabmail = document.getElementById("tabmail");
  return tabmail.tabInfo.find(
    t => t.browser?.currentURI.spec == "about:addressbook"
  );
}

function getAddressBookWindow() {
  let tab = getAddressBookTab();
  return tab?.browser.contentWindow;
}

async function openAllAddressBooks() {
  let abWindow = getAddressBookWindow();
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.querySelector("#books > li"),
    {},
    abWindow
  );
  await new Promise(r => abWindow.setTimeout(r));
}

function openDirectory(directory) {
  let abWindow = getAddressBookWindow();
  let row = abWindow.booksList.getRowForUID(directory.UID);
  EventUtils.synthesizeMouseAtCenter(row.querySelector("span"), {}, abWindow);
}

function createAddressBook(dirName, type = Ci.nsIAbManager.JS_DIRECTORY_TYPE) {
  let prefName = MailServices.ab.newAddressBook(dirName, null, type);
  return MailServices.ab.getDirectoryFromId(prefName);
}

async function createAddressBookWithUI(abName) {
  let newAddressBookPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml"
  );

  let abWindow = getAddressBookWindow();
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("toolbarCreateBook"),
    {},
    abWindow
  );

  let abNameDialog = await newAddressBookPromise;
  EventUtils.sendString(abName, abNameDialog);
  abNameDialog.document
    .querySelector("dialog")
    .getButton("accept")
    .click();

  let addressBook = MailServices.ab.directories.find(
    directory => directory.dirName == abName
  );

  Assert.ok(addressBook, "a new address book was created");

  // At this point we need to wait for the UI to update.
  await new Promise(r => abWindow.setTimeout(r));

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
  openDirectory(mlParent);

  let newAddressBookPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  );

  let abWindow = getAddressBookWindow();
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("toolbarCreateList"),
    {},
    abWindow
  );

  let abListDialog = await newAddressBookPromise;
  let abListDocument = abListDialog.document;
  await new Promise(resolve => abListDialog.setTimeout(resolve));

  abListDocument.getElementById("abPopup").value = mlParent.URI;
  abListDocument.getElementById("ListName").value = mlName;
  abListDocument
    .querySelector("dialog")
    .getButton("accept")
    .click();

  let list = mlParent.childNodes.find(list => list.dirName == mlName);

  Assert.ok(list, "a new list was created");

  // At this point we need to wait for the UI to update.
  await new Promise(r => abWindow.setTimeout(r));

  return list;
}

function checkDirectoryDisplayed(directory) {
  let abWindow = getAddressBookWindow();
  let booksList = abWindow.document.getElementById("books");
  let cardsList = abWindow.document.getElementById("cards");

  if (directory) {
    Assert.equal(
      booksList.selectedIndex,
      booksList.getIndexForUID(directory.UID)
    );
    Assert.equal(cardsList.view.directory?.UID, directory.UID);
  } else {
    Assert.equal(booksList.selectedIndex, 0);
    Assert.ok(!cardsList.view.directory);
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
  let resultsTree = abWindow.document.getElementById("cards");
  let expectedCount = expectedNames.length;

  Assert.equal(
    resultsTree.view.rowCount,
    expectedCount,
    "Tree view has the right number of rows"
  );

  for (let i = 0; i < expectedCount; i++) {
    Assert.equal(
      resultsTree.view.getCellText(i, { id: "GeneratedName" }),
      expectedNames[i]
    );
  }
}

async function showSortMenu(name, value) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let sortButton = abDocument.getElementById("sortButton");
  let sortContext = abDocument.getElementById("sortContext");
  let shownPromise = BrowserTestUtils.waitForEvent(sortContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(sortButton, {}, abWindow);
  await shownPromise;
  let hiddenPromise = BrowserTestUtils.waitForEvent(sortContext, "popuphidden");
  sortContext.activateItem(
    sortContext.querySelector(`[name="${name}"][value="${value}"]`)
  );
  await hiddenPromise;
}

function promiseDirectoryRemoved(uri) {
  let removePromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(uri);
  return removePromise;
}

function promiseLoadSubDialog(url) {
  let abWindow = getAddressBookWindow();

  return new Promise((resolve, reject) => {
    abWindow.SubDialog._dialogStack.addEventListener(
      "dialogopen",
      function dialogopen(aEvent) {
        if (
          aEvent.detail.dialog._frame.contentWindow.location == "about:blank"
        ) {
          return;
        }
        abWindow.SubDialog._dialogStack.removeEventListener(
          "dialogopen",
          dialogopen
        );

        Assert.equal(
          aEvent.detail.dialog._frame.contentWindow.location.toString(),
          url,
          "Check the proper URL is loaded"
        );

        // Check visibility
        Assert.ok(
          BrowserTestUtils.is_visible(
            aEvent.detail.dialog._overlay,
            "Overlay is visible"
          )
        );

        // Check that stylesheets were injected
        let expectedStyleSheetURLs = aEvent.detail.dialog._injectedStyleSheets.slice(
          0
        );
        for (let styleSheet of aEvent.detail.dialog._frame.contentDocument
          .styleSheets) {
          let i = expectedStyleSheetURLs.indexOf(styleSheet.href);
          if (i >= 0) {
            info("found " + styleSheet.href);
            expectedStyleSheetURLs.splice(i, 1);
          }
        }
        Assert.equal(
          expectedStyleSheetURLs.length,
          0,
          "All expectedStyleSheetURLs should have been found"
        );

        // Wait for the next event tick to make sure the remaining part of the
        // testcase runs after the dialog gets ready for input.
        executeSoon(() => resolve(aEvent.detail.dialog._frame.contentWindow));
      }
    );
  });
}
