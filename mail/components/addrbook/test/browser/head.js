/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
const historyBook = MailServices.ab.getDirectoryFromId(
  "ldap_2.servers.history"
);

// We want to check that everything has been removed/reset, but if we register
// a cleanup function here, it will run before any other cleanup function has
// had a chance to run. Instead, when it runs register another cleanup
// function which will run last.
registerCleanupFunction(function () {
  registerCleanupFunction(async function () {
    await TestUtils.waitForTick();
    Assert.equal(
      MailServices.ab.directories.length,
      2,
      "Only Personal ab and Collected Addresses should be left."
    );
    for (const directory of MailServices.ab.directories) {
      if (
        directory.dirPrefId == "ldap_2.servers.history" ||
        directory.dirPrefId == "ldap_2.servers.pab"
      ) {
        Assert.equal(
          directory.childCardCount,
          0,
          `All contacts should have been removed from ${directory.dirName}`
        );
        if (directory.childCardCount) {
          directory.deleteCards(directory.childCards);
        }
      } else {
        await promiseDirectoryRemoved(directory.URI);
      }
    }
    closeAddressBookWindow();

    // TODO: convert this to UID.
    Services.prefs.clearUserPref("mail.addr_book.view.startupURI");
    Services.prefs.clearUserPref("mail.addr_book.view.startupURIisDefault");

    // Some tests that open new windows don't return focus to the main window
    // in a way that satisfies mochitest, and the test times out.
    Services.focus.focusedWindow = window;
    // Focus an element in the main window, then blur it again to avoid it
    // hijacking keypresses.
    const mainWindowElement = document.getElementById("button-appmenu");
    mainWindowElement.focus();
    mainWindowElement.blur();
  });
});

/**
 * @param {TreeView} list - The "cards" list.
 */
async function waitForCardsListReady(list) {
  Assert.ok(
    !!list,
    "The card list should exist after opening an address book."
  );
  if (list.isReady) {
    return;
  }
  const eventName = "_treerowbufferfillAbListReady";
  list._rowBufferReadyEvent = new CustomEvent(eventName);
  await BrowserTestUtils.waitForEvent(list, eventName);
  await new Promise(resolve => list.ownerGlobal.requestAnimationFrame(resolve));
}

async function openAddressBookWindow() {
  const abWindow = await new Promise(resolve => {
    window.openTab("addressBookTab", {
      onLoad(event, browser) {
        resolve(browser.contentWindow);
      },
    });
  });
  const cardsList = abWindow.cardsPane.cardsList;
  await waitForCardsListReady(cardsList);
  return abWindow;
}

function closeAddressBookWindow() {
  const abTab = getAddressBookTab();
  if (abTab) {
    const tabmail = document.getElementById("tabmail");
    tabmail.closeTab(abTab);
  }
}

function getAddressBookTab() {
  const tabmail = document.getElementById("tabmail");
  return tabmail.tabInfo.find(
    t => t.browser?.currentURI.spec == "about:addressbook"
  );
}

function getAddressBookWindow() {
  const tab = getAddressBookTab();
  return tab?.browser.contentWindow;
}

async function openAllAddressBooks() {
  const abWindow = getAddressBookWindow();
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.querySelector("#books > li"),
    {},
    abWindow
  );
  const cardsList = abWindow.cardsPane.cardsList;
  await waitForCardsListReady(cardsList);
}

async function openDirectory(directory) {
  const abWindow = getAddressBookWindow();
  const row = abWindow.booksList.getRowForUID(directory.UID);
  EventUtils.synthesizeMouseAtCenter(row.querySelector("span"), {}, abWindow);
  const cardsList = abWindow.cardsPane.cardsList;
  await waitForCardsListReady(cardsList);
}

function createAddressBook(dirName, type = Ci.nsIAbManager.JS_DIRECTORY_TYPE) {
  const prefName = MailServices.ab.newAddressBook(dirName, null, type);
  return MailServices.ab.getDirectoryFromId(prefName);
}

async function createAddressBookWithUI(abName) {
  const newAddressBookPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abAddressBookNameDialog.xhtml"
  );

  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const menu = abDocument.getElementById("booksPaneCreateBookContext");
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("booksPaneCreateBook"),
    {},
    abWindow
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  menu.activateItem(abDocument.getElementById("booksPaneContextCreateBook"));
  await BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  const abNameDialog = await newAddressBookPromise;
  EventUtils.sendString(abName, abNameDialog);
  abNameDialog.document.querySelector("dialog").getButton("accept").click();

  const addressBook = MailServices.ab.directories.find(
    directory => directory.dirName == abName
  );

  Assert.ok(addressBook, "a new address book was created");

  // At this point we need to wait for the UI to update.
  await new Promise(r => abWindow.setTimeout(r));

  return addressBook;
}

function createContact(firstName, lastName, displayName, primaryEmail) {
  const contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = displayName ?? `${firstName} ${lastName}`;
  contact.firstName = firstName;
  contact.lastName = lastName;
  contact.primaryEmail =
    primaryEmail ?? `${firstName}.${lastName}@invalid`.toLowerCase();
  return contact;
}

function createMailingList(name) {
  const list = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  list.isMailList = true;
  list.dirName = name;
  return list;
}

async function createMailingListWithUI(mlParent, mlName) {
  await openDirectory(mlParent);

  const newAddressBookPromise = promiseLoadSubDialog(
    "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
  );

  const abWindow = getAddressBookWindow();
  EventUtils.synthesizeMouseAtCenter(
    abWindow.document.getElementById("booksPaneCreateList"),
    {},
    abWindow
  );

  const abListDialog = await newAddressBookPromise;
  const abListDocument = abListDialog.document;
  await new Promise(resolve => abListDialog.setTimeout(resolve));

  abListDocument.getElementById("abPopup").value = mlParent.URI;
  abListDocument.getElementById("ListName").value = mlName;
  abListDocument.querySelector("dialog").getButton("accept").click();

  const list = mlParent.childNodes.find(child => child.dirName == mlName);

  Assert.ok(list, "a new list was created");

  // At this point we need to wait for the UI to update.
  await new Promise(r => abWindow.setTimeout(r));

  return list;
}

async function checkDirectoryDisplayed(directory) {
  const abWindow = getAddressBookWindow();
  const booksList = abWindow.document.getElementById("books");
  const cardsList = abWindow.cardsPane.cardsList;
  await waitForCardsListReady(cardsList);

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

async function checkCardsListed(...expectedCards) {
  await checkNamesListed(
    ...expectedCards.map(card =>
      card.isMailList ? card.dirName : card.displayName
    )
  );

  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");
  await waitForCardsListReady(cardsList);
  for (let i = 0; i < expectedCards.length; i++) {
    const row = cardsList.getRowAtIndex(i);
    const card = expectedCards[i];
    Assert.equal(
      row.classList.contains("mail-list-row"),
      card.isMailList,
      `row ${card.isMailList ? "should" : "should not"} be a mailing list row`
    );
    Assert.equal(
      row.address.textContent,
      card.primaryEmail ?? "",
      "correct address should be displayed"
    );
    if (card.isMailList) {
      Assert.ok(
        !row.avatar.shadowRoot.querySelector("img").hidden,
        "The avatar image should be visible"
      );
      Assert.equal(
        row.avatar.shadowRoot.querySelector("img").src,
        "chrome://messenger/skin/icons/new/compact/user-list-alt.svg",
        "The mailing list image should match"
      );
      Assert.ok(
        row.avatar.shadowRoot.querySelector("span").hidden,
        "The avatar placeholder letter should be hidden"
      );
    } else if (card.photoURL) {
      Assert.ok(
        !row.avatar.shadowRoot.querySelector("img").hidden,
        "The avatar image should be visible"
      );
      Assert.equal(
        row.avatar.shadowRoot.querySelector("img").src,
        card.photoURL,
        "The contact avatar image should match"
      );
      Assert.ok(
        row.avatar.shadowRoot.querySelector("span").hidden,
        "The avatar placeholder letter should be hidden"
      );
    } else {
      Assert.ok(
        row.avatar.shadowRoot.querySelector("img").hidden,
        "The avatar image should be hidden"
      );
      Assert.ok(
        !row.avatar.shadowRoot.querySelector("span").hidden,
        "The avatar placeholder letter should be visible"
      );
    }
  }
}

async function checkNamesListed(...expectedNames) {
  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");
  const expectedCount = expectedNames.length;
  await waitForCardsListReady(cardsList);

  Assert.equal(
    cardsList.view.rowCount,
    expectedCount,
    "Tree view has the right number of rows"
  );

  for (let i = 0; i < expectedCount; i++) {
    Assert.equal(
      cardsList.view.getCellText(i, "GeneratedName"),
      expectedNames[i],
      "view should give the correct name"
    );
    Assert.equal(
      cardsList.getRowAtIndex(i).querySelector(".generatedname-column, .name")
        .textContent,
      expectedNames[i],
      "correct name should be displayed"
    );
  }
}

async function checkPlaceholders(expectedVisible = []) {
  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");
  const placeholder = cardsList.placeholder;
  await waitForCardsListReady(cardsList);

  if (!expectedVisible.length) {
    Assert.ok(
      BrowserTestUtils.isHidden(placeholder),
      "placeholders are hidden"
    );
    return;
  }

  for (const element of placeholder.children) {
    const id = element.id;
    if (expectedVisible.includes(id)) {
      Assert.ok(BrowserTestUtils.isVisible(element), `${id} is visible`);
    } else {
      Assert.ok(BrowserTestUtils.isHidden(element), `${id} is hidden`);
    }
  }
}

/**
 * Simulate a right-click on an item in the books list.
 *
 * @param {integer} index - The index of the row to simulate a right-click on.
 * @param {string} [idToActivate] - If given, the ID of a menu item to activate
 *   when the menu opens. In this case the function will not return until the
 *   menu closes.
 */
async function showBooksContext(index, idToActivate) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;
  const booksList = abWindow.booksList;
  const menu = abDocument.getElementById("bookContext");

  EventUtils.synthesizeMouseAtCenter(
    booksList
      .getRowAtIndex(index)
      .querySelector(".bookRow-name, .listRow-name"),
    { type: "contextmenu" },
    abWindow
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");

  if (idToActivate) {
    menu.activateItem(abDocument.getElementById(idToActivate));
    await BrowserTestUtils.waitForPopupEvent(menu, "hidden");
    await new Promise(resolve => abWindow.setTimeout(resolve));
  }
}

/**
 * Simulate a right-click on an item in the cards list.
 *
 * @param {integer} index - The index of the row to simulate a right-click on.
 * @param {string} [idToActivate] - If given, the ID of a menu item to activate
 *   when the menu opens. In this case the function will not return until the
 *   menu closes.
 */
async function showCardsContext(index, idToActivate) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abWindow.cardsPane.cardsList;
  const menu = abDocument.getElementById("cardContext");

  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(index),
    { type: "contextmenu" },
    abWindow
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");

  if (idToActivate) {
    menu.activateItem(abDocument.getElementById(idToActivate));
    await BrowserTestUtils.waitForPopupEvent(menu, "hidden");
    await new Promise(resolve => abWindow.setTimeout(resolve));
  }
}

/**
 * Set or clear the value in the search box, and wait for the view to change.
 * Then check the list of cards or the placeholder is correct.
 *
 * @param {string} searchString - The value to enter in the search box. If
 *   falsy, clear the search box.
 * @param {nsIAbCard[]} expectedCards - The cards that should be displayed
 *   after this search. If no cards are given, checks the placeholder is shown.
 */
async function doSearch(searchString, ...expectedCards) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;
  const searchBox = abDocument.getElementById("searchInput");
  const cardsList = abWindow.cardsPane.cardsList;

  const viewChangePromise = BrowserTestUtils.waitForEvent(
    cardsList,
    "viewchange"
  );
  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  if (searchString) {
    EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
    EventUtils.sendString(searchString, abWindow);
  } else {
    EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  }

  await viewChangePromise;
  await checkCardsListed(...expectedCards);
  await checkPlaceholders(
    expectedCards.length ? [] : ["placeholderNoSearchResults"]
  );
}

/**
 * Opens the sort pop-up and activates one of the items.
 *
 * @param {string} name - The name attribute of the item to activate.
 * @param {string} value - The value attribute of the item to activate.
 */
async function showSortMenu(name, value) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const displayButton = abDocument.getElementById("displayButton");
  const sortContext = abDocument.getElementById("sortContext");
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, abWindow);
  await BrowserTestUtils.waitForPopupEvent(sortContext, "shown");
  sortContext.activateItem(
    sortContext.querySelector(`[name="${name}"][value="${value}"]`)
  );
  if (name == "toggle") {
    sortContext.hidePopup();
  }
  await BrowserTestUtils.waitForPopupEvent(sortContext, "hidden");
  await new Promise(resolve => abWindow.setTimeout(resolve));
}

/**
 * Opens the table header menu and activates one of the menu items.
 *
 * @param {string} name - The name attribute of the item to activate.
 * @param {string} value - The value attribute of the item to activate.
 */
async function showPickerMenu(name, value) {
  const abWindow = getAddressBookWindow();
  const cardsHeader = abWindow.cardsPane.table.header;
  const pickerButton = cardsHeader.querySelector(
    `th[is="tree-view-table-column-picker"] button`
  );
  const menupopup = cardsHeader.querySelector(
    `th[is="tree-view-table-column-picker"] menupopup`
  );
  EventUtils.synthesizeMouseAtCenter(pickerButton, {}, abWindow);
  await BrowserTestUtils.waitForPopupEvent(menupopup, "shown");
  menupopup.activateItem(
    menupopup.querySelector(`[name="${name}"][value="${value}"]`)
  );
  if (name == "toggle") {
    menupopup.hidePopup();
  }
  await BrowserTestUtils.waitForPopupEvent(menupopup, "hidden");
  await new Promise(resolve => abWindow.setTimeout(resolve));
}

async function toggleLayout() {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const displayButton = abDocument.getElementById("displayButton");
  const sortContext = abDocument.getElementById("sortContext");
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, abWindow);
  await BrowserTestUtils.waitForPopupEvent(sortContext, "shown");
  sortContext.activateItem(abDocument.getElementById("sortContextTableLayout"));
  await BrowserTestUtils.waitForPopupEvent(sortContext, "hidden");
  await new Promise(resolve => abWindow.setTimeout(resolve));
}

/**
 * Waits for a compose window to be ready, then checks the "To" addresses
 * match those given, then closes the window, waiting for focus to return to
 * the previous window.
 *
 * @param {Window} composeWindow - A just-opened compose window.
 * @param {string[]} expectedAddresses - An array of recipients that should
 *   appear in the To section of the window.
 * @param {Window} [nextWindow] - The window to return to after `composeWindow`
 *   closes. If not given, this is the main application window.
 */
async function checkComposeWindow(
  composeWindow,
  expectedAddresses,
  nextWindow = window
) {
  await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
  const composeDocument = composeWindow.document;
  const toAddrRow = composeDocument.getElementById("addressRowTo");

  const pills = toAddrRow.querySelectorAll("mail-address-pill");
  Assert.equal(pills.length, expectedAddresses.length);
  for (let i = 0; i < expectedAddresses.length; i++) {
    Assert.equal(pills[i].label, expectedAddresses[i]);
  }

  await Promise.all([
    BrowserTestUtils.closeWindow(composeWindow),
    BrowserTestUtils.waitForEvent(nextWindow, "activate"),
  ]);
}

function promiseDirectoryRemoved(uri) {
  const removePromise = TestUtils.topicObserved("addrbook-directory-deleted");
  MailServices.ab.deleteAddressBook(uri);
  return removePromise;
}

function promiseLoadSubDialog(url) {
  const abWindow = getAddressBookWindow();

  return new Promise(resolve => {
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
          BrowserTestUtils.isVisible(
            aEvent.detail.dialog._overlay,
            "Overlay is visible"
          )
        );

        // Check that stylesheets were injected
        const expectedStyleSheetURLs =
          aEvent.detail.dialog._injectedStyleSheets.slice(0);
        for (const styleSheet of aEvent.detail.dialog._frame.contentDocument
          .styleSheets) {
          const i = expectedStyleSheetURLs.indexOf(styleSheet.href);
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

function formatVCard(strings, ...values) {
  const arr = [];
  for (const str of strings) {
    arr.push(str);
    arr.push(values.shift());
  }
  const lines = arr.join("").split("\n");
  const indent = lines[1].length - lines[1].trimLeft().length;
  const outLines = [];
  for (const line of lines) {
    if (line.length > 0) {
      outLines.push(line.substring(indent) + "\r\n");
    }
  }
  return outLines.join("");
}
