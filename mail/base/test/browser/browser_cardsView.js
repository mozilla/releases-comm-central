/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { click_through_appmenu } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { threadPane, threadTree } = about3Pane;
let rootFolder, testFolder, testMessages, displayContext, displayButton;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("cardsView")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  const generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  about3Pane.displayFolder(testFolder.URI);
  about3Pane.paneLayout.messagePaneVisible = false;

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    about3Pane.paneLayout.messagePaneVisible = true;
    about3Pane.folderTree.focus();
  });
});

add_task(async function testSwitchToCardsView() {
  Assert.ok(
    threadTree.getAttribute("rows") == "thread-card",
    "The tree view should have a card layout"
  );

  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_MessagePaneLayout" }],
    { id: "appmenu_messagePaneClassic" },
    window
  );

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view should not switch to a table layout"
  );

  displayContext = about3Pane.document.getElementById(
    "threadPaneDisplayContext"
  );
  displayButton = about3Pane.document.getElementById("threadPaneDisplayButton");
  let shownPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, about3Pane);
  await shownPromise;

  Assert.ok(
    displayContext
      .querySelector("#threadPaneCardsView")
      .getAttribute("checked"),
    "The cards view menuitem should be checked"
  );

  let hiddenPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popuphidden"
  );
  displayContext.activateItem(
    displayContext.querySelector("#threadPaneTableView")
  );
  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
  EventUtils.synthesizeKey("KEY_Escape", {});
  await hiddenPromise;

  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_MessagePaneLayout" }],
    { id: "appmenu_messagePaneVertical" },
    window
  );

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view should not switch to a card layout"
  );

  Assert.equal(
    threadTree.table.body.getAttribute("role"),
    "treegrid",
    "The message list table should be presented as Tree Grid View"
  );
  Assert.equal(
    threadTree.getRowAtIndex(0).getAttribute("role"),
    "row",
    "The message row should be presented as Row Item"
  );

  displayContext = about3Pane.document.getElementById(
    "threadPaneDisplayContext"
  );
  displayButton = about3Pane.document.getElementById("threadPaneDisplayButton");
  shownPromise = BrowserTestUtils.waitForEvent(displayContext, "popupshown");
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, about3Pane);
  await shownPromise;

  Assert.ok(
    displayContext
      .querySelector("#threadPaneTableView")
      .getAttribute("checked"),
    "The table view menuitem should be checked"
  );

  hiddenPromise = BrowserTestUtils.waitForEvent(displayContext, "popuphidden");
  displayContext.activateItem(
    displayContext.querySelector("#threadPaneCardsView")
  );
  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view switched to a card layout"
  );
  EventUtils.synthesizeKey("KEY_Escape", {});
  await hiddenPromise;

  Assert.equal(
    threadTree.getAttribute("rows"),
    "thread-card",
    "tree view in cards layout"
  );
  Assert.equal(
    threadTree.table.body.getAttribute("role"),
    "treegrid",
    "The message list table should remain as Tree Grid View"
  );
  Assert.equal(
    threadTree.getRowAtIndex(0).getAttribute("role"),
    "row",
    "The message row should remain as Row Item"
  );

  const tableRow = threadTree.getRowAtIndex(1);
  const tableData = tableRow.querySelector(".thread-card-container");
  const rowHeight = getComputedStyle(tableRow).getPropertyValue("height");
  const containerHeight =
    getComputedStyle(tableData).getPropertyValue("height");
  Assert.equal(
    rowHeight,
    containerHeight,
    "The message and content container height should be the same"
  );

  const row = threadTree.getRowAtIndex(0);
  const star = row.querySelector(".button-star");
  Assert.ok(BrowserTestUtils.isVisible(star), "star icon should be visible");
  const tag = row.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.isHidden(tag), "tag icon should be hidden");
  const attachment = row.querySelector(".attachment-icon");
  Assert.ok(
    BrowserTestUtils.isHidden(attachment),
    "attachment icon should be hidden"
  );

  // Switching to horizontal view shouldn't affect the list layout.
  await click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_MessagePaneLayout" }],
    { id: "appmenu_messagePaneClassic" },
    window
  );

  Assert.equal(
    threadTree.getAttribute("rows"),
    "thread-card",
    "tree view in cards layout"
  );
  about3Pane.folderTree.focus();
});

add_task(async function testTagsInVerticalView() {
  const row = threadTree.getRowAtIndex(1);
  EventUtils.synthesizeMouseAtCenter(row, {}, about3Pane);
  Assert.ok(row.classList.contains("selected"), "the row should be selected");

  const tag = row.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.isHidden(tag), "tag icon should be hidden");

  // Set the important tag.
  EventUtils.synthesizeKey("1", {});
  Assert.ok(BrowserTestUtils.isVisible(tag), "tag icon should be visible");
  Assert.deepEqual(tag.title, "Important", "The important tag should be set");

  const row2 = threadTree.getRowAtIndex(2);
  EventUtils.synthesizeMouseAtCenter(row2, {}, about3Pane);
  Assert.ok(
    row2.classList.contains("selected"),
    "the third row should be selected"
  );

  const tag2 = row2.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.isHidden(tag2), "tag icon should be hidden");

  // Set the work tag.
  EventUtils.synthesizeKey("2", {});
  Assert.ok(BrowserTestUtils.isVisible(tag2), "tag icon should be visible");
  Assert.deepEqual(tag2.title, "Work", "The work tag should be set");

  // Switch back to a table layout and horizontal view.
  const shownPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(displayButton, {}, about3Pane);
  await shownPromise;

  Assert.ok(
    displayContext
      .querySelector("#threadPaneCardsView")
      .getAttribute("checked"),
    "The cards view menuitem should be checked"
  );

  const hiddenPromise = BrowserTestUtils.waitForEvent(
    displayContext,
    "popuphidden"
  );
  displayContext.activateItem(
    displayContext.querySelector("#threadPaneTableView")
  );
  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
  EventUtils.synthesizeKey("KEY_Escape", {});
  await hiddenPromise;

  Assert.equal(
    threadTree.getAttribute("rows"),
    "thread-row",
    "tree view in table layout"
  );

  await ensure_cards_view();
  about3Pane.folderTree.focus();
}).__skipMe = true; // To Do: update the test for tags on Bug 1860900.

/**
 * This test Checks that:
 * Clicking on the kebab button of a row selects that row.
 * If other rows are selected or multiselection, only the row clicked should be selected.
 * The menu popup opens.
 */
add_task(async function testMessageMenuButton() {
  const row1 = threadTree.getRowAtIndex(1);
  const row2 = threadTree.getRowAtIndex(2);
  const menuContext = about3Pane.document.getElementById("mailContext");
  const menuButton = row1.querySelector(".tree-button-more");
  EventUtils.synthesizeMouseAtCenter(row1, {}, about3Pane);
  EventUtils.synthesizeMouseAtCenter(row2, { shiftKey: true }, about3Pane);
  Assert.ok(row1.classList.contains("selected"), "Row 1 should be selected");
  Assert.ok(row2.classList.contains("selected"), "Row 2 should be selected");
  EventUtils.synthesizeMouseAtCenter(menuButton, {}, about3Pane);
  await BrowserTestUtils.waitForPopupEvent(menuContext, "shown");
  Assert.ok(
    BrowserTestUtils.isVisible(menuContext),
    "The message card's menu should be visible"
  );
  Assert.ok(
    row1.classList.contains("selected"),
    "The row that was clicked should be selected"
  );
  Assert.ok(
    !row2.classList.contains("selected"),
    "The row that wasn't clicked should be unselected"
  );
  menuContext.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(menuContext, "hidden");
  about3Pane.folderTree.focus();
});
