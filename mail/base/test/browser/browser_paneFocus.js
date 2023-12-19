/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);

const mailButton = document.getElementById("mailButton");
const globalSearch = document.querySelector(
  "#unifiedToolbar global-search-bar"
);
const addressBookButton = document.getElementById("addressBookButton");
const calendarButton = document.getElementById("calendarButton");
const tasksButton = document.getElementById("tasksButton");
const tabmail = document.getElementById("tabmail");

let rootFolder, testFolder, testMessages, addressBook;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  // Quick Filter Bar needs to be toggled on for F6 focus shift to be accurate.
  goDoCommand("cmd_showQuickFilterBar");

  testFolder = rootFolder
    .createLocalSubfolder("paneFocus")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  const prefName = MailServices.ab.newAddressBook(
    "paneFocus",
    null,
    Ci.nsIAbManager.JS_DIRECTORY_TYPE
  );
  addressBook = MailServices.ab.getDirectoryFromId(prefName);
  const contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  contact.displayName = "contact 1";
  contact.firstName = "contact";
  contact.lastName = "1";
  contact.primaryEmail = "contact.1@invalid";
  addressBook.addCard(contact);

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
    const removePromise = TestUtils.topicObserved("addrbook-directory-deleted");
    MailServices.ab.deleteAddressBook(addressBook.URI);
    await removePromise;
  });
});

add_task(async function testMail3PaneTab() {
  document.body.focus();

  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: true,
  });
  const {
    folderTree,
    threadTree,
    webBrowser,
    messageBrowser,
    multiMessageBrowser,
    accountCentralBrowser,
  } = about3Pane;

  // Reset focus to accountCentralBrowser because QFB was toggled on.
  accountCentralBrowser.focus();
  info("Displaying the root folder");
  about3Pane.displayFolder(rootFolder.URI);
  cycle(
    mailButton,
    globalSearch,
    folderTree,
    accountCentralBrowser,
    mailButton
  );

  info("Displaying the test folder");
  about3Pane.displayFolder(testFolder.URI);
  threadTree.selectedIndex = 0;
  cycle(
    globalSearch,
    folderTree,
    threadTree.table.body,
    messageBrowser.contentWindow.getMessagePaneBrowser(),
    mailButton,
    globalSearch
  );

  info("Hiding the folder pane");
  about3Pane.restoreState({ folderPaneVisible: false });
  cycle(
    threadTree.table.body,
    messageBrowser.contentWindow.getMessagePaneBrowser(),
    mailButton,
    globalSearch,
    threadTree.table.body
  );

  info("Showing the folder pane, hiding the message pane");
  about3Pane.restoreState({
    folderPaneVisible: true,
    messagePaneVisible: false,
  });
  cycle(
    mailButton,
    globalSearch,
    folderTree,
    threadTree.table.body,
    mailButton
  );

  info("Showing the message pane, selecting multiple messages");
  about3Pane.restoreState({ messagePaneVisible: true });
  threadTree.selectedIndices = [1, 2];
  cycle(
    globalSearch,
    folderTree,
    threadTree.table.body,
    multiMessageBrowser,
    mailButton,
    globalSearch
  );

  info("Showing a web page");
  about3Pane.messagePane.displayWebPage("https://example.com/");
  cycle(
    folderTree,
    threadTree.table.body,
    webBrowser,
    mailButton,
    globalSearch,
    folderTree
  );

  info("Testing focus from secondary focus targets");
  about3Pane.document.getElementById("folderPaneMoreButton").focus();
  EventUtils.synthesizeKey("KEY_F6", {}, about3Pane);
  Assert.equal(
    getActiveElement(),
    folderTree,
    "F6 moved the focus to the folder tree"
  );

  about3Pane.document.getElementById("folderPaneMoreButton").focus();
  EventUtils.synthesizeKey("KEY_F6", { shiftKey: true }, about3Pane);
  Assert.equal(
    getActiveElement().id,
    globalSearch.id,
    "Shift+F6 moved the focus to the toolbar"
  );

  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  EventUtils.synthesizeKey("KEY_F6", {}, about3Pane);
  Assert.equal(
    getActiveElement(),
    threadTree.table.body,
    "F6 moved the focus to the threadTree"
  );

  about3Pane.document.getElementById("qfb-qs-textbox").focus();
  EventUtils.synthesizeKey("KEY_F6", { shiftKey: true }, about3Pane);
  Assert.equal(
    getActiveElement(),
    folderTree,
    "Shift+F6 moved the focus to the folder tree"
  );
});

add_task(async function testMailMessageTab() {
  document.body.focus();

  window.OpenMessageInNewTab(testMessages[0], { background: false });
  await BrowserTestUtils.waitForEvent(
    tabmail.tabInfo[1].chromeBrowser,
    "MsgLoaded"
  );
  cycle(mailButton, globalSearch, tabmail.tabInfo[1].browser, mailButton);

  tabmail.closeOtherTabs(0);
});

add_task(async function testAddressBookTab() {
  EventUtils.synthesizeMouseAtCenter(addressBookButton, {});
  await BrowserTestUtils.browserLoaded(tabmail.currentTabInfo.browser);

  const abWindow = tabmail.currentTabInfo.browser.contentWindow;
  const abDocument = abWindow.document;
  const booksList = abDocument.getElementById("books");
  const searchInput = abDocument.getElementById("searchInput");
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const editButton = abDocument.getElementById("editButton");

  // Switch to the table view so the edit button isn't falling off the window.
  abWindow.cardsPane.toggleLayout(true);

  // Check what happens with a contact selected.
  const row = booksList.getRowForUID(addressBook.UID);
  EventUtils.synthesizeMouseAtCenter(row.querySelector("span"), {}, abWindow);

  Assert.ok(BrowserTestUtils.is_hidden(detailsPane));
  // Select first contact.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  Assert.equal(getActiveElement(), cardsList.table.body);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  cycle(
    editButton,
    addressBookButton,
    globalSearch,
    booksList,
    searchInput,
    cardsList.table.body,
    editButton
  );
  // Still visible.
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  // Check with no selection.
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(0),
    { accelKey: true },
    abWindow
  );
  Assert.equal(getActiveElement(), cardsList.table.body);
  Assert.ok(BrowserTestUtils.is_hidden(detailsPane));
  cycle(
    addressBookButton,
    globalSearch,
    booksList,
    searchInput,
    cardsList.table.body,
    addressBookButton
  );
  // Still hidden.
  Assert.ok(BrowserTestUtils.is_hidden(detailsPane));

  // Check what happens while editing. It should be nothing.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  Assert.equal(getActiveElement(), cardsList.table.body);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  editButton.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  Assert.equal(abDocument.activeElement.id, "vcard-n-firstname");
  EventUtils.synthesizeKey("KEY_F6", {}, abWindow);
  Assert.equal(
    abDocument.activeElement.id,
    "vcard-n-firstname",
    "F6 did nothing"
  );
  EventUtils.synthesizeKey("KEY_F6", { shiftKey: true }, abWindow);
  Assert.equal(
    abDocument.activeElement.id,
    "vcard-n-firstname",
    "Shift+F6 did nothing"
  );

  tabmail.closeOtherTabs(0);
});

add_task(async function testCalendarTab() {
  EventUtils.synthesizeMouseAtCenter(calendarButton, {});

  cycle(calendarButton, globalSearch, calendarButton);

  tabmail.closeOtherTabs(0);
});

add_task(async function testTasksTab() {
  EventUtils.synthesizeMouseAtCenter(tasksButton, {});

  cycle(tasksButton, globalSearch, tasksButton);

  tabmail.closeOtherTabs(0);
});

add_task(async function testContentTab() {
  document.body.focus();

  window.openTab("contentTab", {
    url: "https://example.com/",
    background: false,
  });
  await BrowserTestUtils.browserLoaded(
    tabmail.currentTabInfo.browser,
    undefined,
    "https://example.com/"
  );
  cycle(mailButton, globalSearch, tabmail.currentTabInfo.browser, mailButton);

  document.body.focus();

  window.openTab("contentTab", { url: "about:mozilla", background: false });
  await BrowserTestUtils.browserLoaded(
    tabmail.currentTabInfo.browser,
    undefined,
    "about:mozilla"
  );
  cycle(
    globalSearch,
    tabmail.currentTabInfo.browser.contentDocument.body,
    mailButton,
    globalSearch
  );

  tabmail.closeOtherTabs(0);
});

/**
 * Gets the active element. If it is a browser, returns the browser in some
 * special cases we're interested in, or the browser's active element.
 *
 * @returns {Element}
 */
function getActiveElement() {
  let activeElement = document.activeElement;
  if (globalSearch.contains(activeElement)) {
    return globalSearch;
  }
  if (activeElement.localName == "browser" && !activeElement.isRemoteBrowser) {
    activeElement = activeElement.contentDocument.activeElement;
  }
  if (
    activeElement.localName == "browser" &&
    activeElement.id == "messageBrowser"
  ) {
    activeElement = activeElement.contentDocument.activeElement;
  }
  return activeElement;
}

/**
 * Presses F6 for each element in `elements`, and checks the element has focus.
 * Then presses Shift+F6 to go back through the elements.
 * Note that the currently selected element should *not* be the first element.
 *
 * @param {Element[]}
 */
function cycle(...elements) {
  let activeElement = getActiveElement();

  for (let i = 0; i < elements.length; i++) {
    EventUtils.synthesizeKey("KEY_F6", {}, activeElement.ownerGlobal);
    activeElement = getActiveElement();
    Assert.equal(
      activeElement.id || activeElement.localName,
      elements[i].id || elements[i].localName,
      "F6 moved the focus"
    );
  }

  for (let i = elements.length - 2; i >= 0; i--) {
    EventUtils.synthesizeKey(
      "KEY_F6",
      { shiftKey: true },
      activeElement.ownerGlobal
    );
    activeElement = getActiveElement();
    Assert.equal(
      activeElement.id || activeElement.localName,
      elements[i].id || elements[i].localName,
      "Shift+F6 moved the focus"
    );
  }
}
