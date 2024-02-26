/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let rootFolder, testFolder, otherFolder;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder = rootFolder.createLocalSubfolder("searchMessagesFolder");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const messageStrings = generator
    .makeMessages({ count: 20 })
    .map(message => message.toMessageString());
  testFolder.addMessageBatch(messageStrings);
  otherFolder = rootFolder.createLocalSubfolder("searchMessagesOtherFolder");

  tabmail.currentAbout3Pane.paneLayout.messagePaneVisible = true;
  Services.xulStore.removeDocument(
    "chrome://messenger/content/SearchDialog.xhtml"
  );

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function () {
  const windowOpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  goDoCommand("cmd_searchMessages");
  const win = await windowOpenedPromise;
  const doc = win.document;

  await SimpleTest.promiseFocus(win);

  const searchButton = doc.getElementById("search-button");
  const clearButton = doc.querySelector(
    "#searchTerms > vbox > hbox:nth-child(2) > button"
  );
  const searchTermList = doc.getElementById("searchTermList");
  const threadTree = doc.getElementById("threadTree");
  const columns = threadTree.columns;
  const picker = threadTree.querySelector("treecolpicker");
  const popup = picker.querySelector("menupopup");
  const openButton = doc.getElementById("openButton");
  const deleteButton = doc.getElementById("deleteButton");
  const fileMessageButton = doc.getElementById("fileMessageButton");
  const fileMessagePopup = fileMessageButton.querySelector("menupopup");
  const openInFolderButton = doc.getElementById("openInFolderButton");
  const saveAsVFButton = doc.getElementById("saveAsVFButton");
  const statusText = doc.getElementById("statusText");

  const treeClick = mailTestUtils.treeClick.bind(
    null,
    EventUtils,
    win,
    threadTree
  );

  // Test search criteria. The search results are deterministic unless
  // MessageGenerator is changed.

  await TestUtils.waitForCondition(
    () => searchTermList.itemCount == 1,
    "waiting for a search term to exist"
  );
  const searchTerm0 = searchTermList.getItemAtIndex(0);
  const input0 = searchTerm0.querySelector("search-value input");
  const button0 = searchTerm0.querySelector("button.small-button:first-child");

  // Row 0 will look for subjects including "hovercraft".
  Assert.equal(input0.value, "");
  input0.focus();
  EventUtils.sendString("hovercraft", win);

  // Add another row.
  EventUtils.synthesizeMouseAtCenter(button0, {}, win);
  await TestUtils.waitForCondition(
    () => searchTermList.itemCount == 2,
    "waiting for a second search term to exist"
  );

  const searchTerm1 = searchTermList.getItemAtIndex(1);
  const menulist = searchTerm1.querySelector("search-attribute menulist");
  const menuitem = menulist.querySelector(`menuitem[value="1"]`);
  const input1 = searchTerm1.querySelector("search-value input");

  // Change row 1's search attribute.
  EventUtils.synthesizeMouseAtCenter(menulist, {}, win);
  await BrowserTestUtils.waitForPopupEvent(menulist, "shown");
  menulist.menupopup.activateItem(menuitem);
  await BrowserTestUtils.waitForPopupEvent(menulist, "hidden");

  // Row 1 will look for the sender Emily Ekberg.
  Assert.equal(input1.value, "");
  EventUtils.synthesizeMouseAtCenter(input1, {}, win);
  EventUtils.sendString("emily@ekberg.invalid", win);

  // Search. Emily didn't send a message about hovercraft, so no results.
  EventUtils.synthesizeMouseAtCenter(searchButton, {}, win);
  // Allows 5 seconds for expected statusText to appear.
  await TestUtils.waitForCondition(
    () => statusText.value == "No matches found",
    "waiting for status text to update"
  );

  // Change the search from AND to OR.
  EventUtils.synthesizeMouseAtCenter(
    doc.querySelector(`#booleanAndGroup > radio[value="or"]`),
    {},
    win
  );
  // Change the subject search to something more common.
  input0.select();
  EventUtils.sendString("in", win);

  // Search. 10 messages should be found.
  EventUtils.synthesizeMouseAtCenter(searchButton, {}, win);
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 10,
    "waiting for tree view to be filled"
  );
  // statusText changes on 500 ms time base.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  await TestUtils.waitForCondition(
    () => statusText.value == "10 matches found",
    "waiting for status text to update"
  );

  // Test tree sort column and direction.

  EventUtils.synthesizeMouseAtCenter(columns.subjectCol.element, {}, win);
  Assert.equal(
    columns.subjectCol.element.getAttribute("sortDirection"),
    "ascending"
  );
  EventUtils.synthesizeMouseAtCenter(columns.dateCol.element, {}, win);
  Assert.equal(
    columns.dateCol.element.getAttribute("sortDirection"),
    "ascending"
  );
  EventUtils.synthesizeMouseAtCenter(columns.dateCol.element, {}, win);
  Assert.equal(
    columns.dateCol.element.getAttribute("sortDirection"),
    "descending"
  );

  // Test tree column visibility and order.

  checkTreeColumnsInOrder(threadTree, [
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    "correspondentCol",
    "junkStatusCol",
    "dateCol",
    "locationCol",
  ]);
  EventUtils.synthesizeMouseAtCenter(picker, {}, win);
  await BrowserTestUtils.waitForPopupEvent(popup, "shown");
  popup.activateItem(
    popup.querySelector(`[colindex="${columns.selectCol.index}"]`)
  );
  popup.activateItem(
    popup.querySelector(`[colindex="${columns.deleteCol.index}"]`)
  );
  popup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  // Wait for macOS to catch up.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  checkTreeColumnsInOrder(threadTree, [
    "selectCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    "correspondentCol",
    "junkStatusCol",
    "dateCol",
    "locationCol",
    "deleteCol",
  ]);

  threadTree._reorderColumn(
    columns.deleteCol.element,
    columns.selectCol.element,
    false
  );
  threadTree.invalidate();
  // Wait for macOS to catch up.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 500));
  checkTreeColumnsInOrder(threadTree, [
    "selectCol",
    "deleteCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    "correspondentCol",
    "junkStatusCol",
    "dateCol",
    "locationCol",
  ]);

  // Test message selection with the select column.

  treeClick(0, "subjectCol", {});
  await TestUtils.waitForCondition(
    () => threadTree.view.selection.count == 1,
    "waiting for first message to be selected"
  );
  Assert.ok(!openButton.disabled);
  Assert.ok(!deleteButton.disabled);
  Assert.ok(!fileMessageButton.disabled);
  Assert.ok(!openInFolderButton.disabled);
  treeClick(1, "selectCol", {});
  await TestUtils.waitForCondition(
    () => threadTree.view.selection.count == 2,
    "waiting for second message to be selected"
  );
  Assert.ok(!openButton.disabled);
  Assert.ok(!deleteButton.disabled);
  Assert.ok(!fileMessageButton.disabled);
  Assert.ok(openInFolderButton.disabled);
  treeClick(1, "selectCol", {});
  await TestUtils.waitForCondition(
    () => threadTree.view.selection.count == 1,
    "waiting for second message to be unselected"
  );
  Assert.ok(!openButton.disabled);
  Assert.ok(!deleteButton.disabled);
  Assert.ok(!fileMessageButton.disabled);
  Assert.ok(!openInFolderButton.disabled);
  treeClick(0, "selectCol", {});
  await TestUtils.waitForCondition(
    () => threadTree.view.selection.count == 0,
    "waiting for first message to be selected"
  );
  Assert.ok(openButton.disabled);
  Assert.ok(deleteButton.disabled);
  Assert.ok(fileMessageButton.disabled);
  Assert.ok(openInFolderButton.disabled);

  // Opening messages.

  // Test opening a message with the "Open" button.
  treeClick(0, "subjectCol", {});
  let tabOpenPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
  EventUtils.synthesizeMouseAtCenter(openButton, {}, win);
  const {
    detail: { tabInfo: tab1 },
  } = await tabOpenPromise;
  await BrowserTestUtils.waitForEvent(tab1.chromeBrowser, "MsgLoaded");
  Assert.equal(tab1.mode.name, "mailMessageTab");

  await SimpleTest.promiseFocus(win);

  // Test opening a message with a double click.
  tabOpenPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
  treeClick(0, "subjectCol", { clickCount: 2 });
  const {
    detail: { tabInfo: tab2 },
  } = await tabOpenPromise;
  await BrowserTestUtils.waitForEvent(tab2.chromeBrowser, "MsgLoaded");
  Assert.equal(tab2.mode.name, "mailMessageTab");

  await SimpleTest.promiseFocus(win);

  // Test opening a message with the keyboard.
  tabOpenPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
  threadTree.focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, win);
  const {
    detail: { tabInfo: tab3 },
  } = await tabOpenPromise;
  await BrowserTestUtils.waitForEvent(tab3.chromeBrowser, "MsgLoaded");
  Assert.equal(tab3.mode.name, "mailMessageTab");

  await SimpleTest.promiseFocus(win);

  // Test opening a message with the "Open in Folder" button.
  const tabSelectPromise = BrowserTestUtils.waitForEvent(window, "TabSelect");
  EventUtils.synthesizeMouseAtCenter(openInFolderButton, {}, win);
  const {
    detail: { tabInfo: tab0 },
  } = await tabSelectPromise;
  await BrowserTestUtils.waitForEvent(tab0.chromeBrowser, "MsgLoaded");
  Assert.equal(tab0, tabmail.tabInfo[0]);

  tabmail.closeOtherTabs(tab0);

  await SimpleTest.promiseFocus(win);

  // Deleting messages.

  // Test deleting a message with the delete column.
  let deletePromise = PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );
  treeClick(0, "deleteCol", {});
  await deletePromise;
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 9,
    "waiting for row to be removed from tree view"
  );

  // Test deleting a message with the "Delete" button.
  deletePromise = PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, win);
  await deletePromise;
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 8,
    "waiting for row to be removed from tree view"
  );

  // Test deleting a message with the keyboard.
  treeClick(0, "subjectCol", {});
  deletePromise = PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeKey("VK_DELETE", { shiftKey: true }, win);
  await deletePromise;
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 7,
    "waiting for row to be removed from tree view"
  );

  // Moving messages.

  // Test moving a message to another folder with the "Move To" button.
  treeClick(0, "subjectCol", {});
  const movePromise = PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );

  EventUtils.synthesizeMouseAtCenter(fileMessageButton, {}, win);
  await BrowserTestUtils.waitForPopupEvent(fileMessagePopup, "shown");
  const rootFolderMenu = [...fileMessagePopup.children].find(
    i => i._folder == rootFolder
  );
  rootFolderMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(rootFolderMenu.menupopup, "shown");
  const otherFolderItem = [...rootFolderMenu.menupopup.children].find(
    i => i._folder == otherFolder
  );
  rootFolderMenu.menupopup.activateItem(otherFolderItem);
  await BrowserTestUtils.waitForPopupEvent(fileMessagePopup, "hidden");

  await movePromise;
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 6,
    "waiting for row to be removed from tree view"
  );

  // TODO: Test dragging a message to another folder.

  // Test the "Save as Search Folder" button.

  const virtualFolderDialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/virtualFolderProperties.xhtml",
    {
      async callback(vfWin) {
        await SimpleTest.promiseFocus(vfWin);
        await BrowserTestUtils.closeWindow(vfWin);
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(saveAsVFButton, {}, win);
  await virtualFolderDialogPromise;

  await SimpleTest.promiseFocus(win);

  // Test clearing the search.

  EventUtils.synthesizeMouseAtCenter(clearButton, {}, win);
  await TestUtils.waitForCondition(
    () => searchTermList.itemCount == 1,
    "waiting for search term list to be cleared"
  );
  await TestUtils.waitForCondition(
    () => threadTree.view.rowCount == 0,
    "waiting for tree view to be cleared"
  );

  const newSearchTerm0 = searchTermList.getItemAtIndex(0);
  Assert.notEqual(newSearchTerm0, searchTerm0);
  const newInput0 = newSearchTerm0.querySelector("search-value input");
  Assert.equal(newInput0.value, "");

  await BrowserTestUtils.closeWindow(win);

  // Open the window again, and check the tree columns are as we left them.

  const window2OpenedPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    w =>
      w.document.documentURI == "chrome://messenger/content/SearchDialog.xhtml"
  );
  goDoCommand("cmd_searchMessages");
  const win2 = await window2OpenedPromise;
  const doc2 = win.document;
  await SimpleTest.promiseFocus(win2);

  const threadTree2 = doc2.getElementById("threadTree");

  checkTreeColumnsInOrder(threadTree2, [
    "selectCol",
    "deleteCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    "correspondentCol",
    "junkStatusCol",
    "dateCol",
    "locationCol",
  ]);

  await BrowserTestUtils.closeWindow(win2);
});

function checkTreeColumnsInOrder(tree, expectedOrder) {
  Assert.deepEqual(
    Array.from(tree.querySelectorAll("treecol:not([hidden])"))
      .sort((a, b) => a.ordinal - b.ordinal)
      .map(c => c.id),
    expectedOrder
  );
}
