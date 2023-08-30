/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { click_through_appmenu } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

let tabmail = document.getElementById("tabmail");
let about3Pane = tabmail.currentAbout3Pane;
let { threadPane, threadTree } = about3Pane;
let rootFolder, testFolder, testMessages, displayContext, displayButton;

add_setup(async function () {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("cardsView", null);
  testFolder = rootFolder
    .getChildNamed("cardsView")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  let generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
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

  click_through_appmenu(
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

  click_through_appmenu(
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
    "tree",
    "The message list table should be presented as Tree View"
  );
  Assert.equal(
    threadTree.getRowAtIndex(0).getAttribute("role"),
    "treeitem",
    "The message row should be presented as Tree Item"
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
    "tree",
    "The message list table should remain as Tree View"
  );
  Assert.equal(
    threadTree.getRowAtIndex(0).getAttribute("role"),
    "treeitem",
    "The message row should remain as Tree Item"
  );

  let row = threadTree.getRowAtIndex(0);
  let star = row.querySelector(".button-star");
  Assert.ok(BrowserTestUtils.is_visible(star), "star icon should be visible");
  let tag = row.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.is_hidden(tag), "tag icon should be hidden");
  let attachment = row.querySelector(".attachment-icon");
  Assert.ok(
    BrowserTestUtils.is_hidden(attachment),
    "attachment icon should be hidden"
  );

  // Switching to horizontal view shouldn't affect the list layout.
  click_through_appmenu(
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
  let row = threadTree.getRowAtIndex(1);
  EventUtils.synthesizeMouseAtCenter(row, {}, about3Pane);
  Assert.ok(row.classList.contains("selected"), "the row should be selected");

  let tag = row.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.is_hidden(tag), "tag icon should be hidden");

  // Set the important tag.
  EventUtils.synthesizeKey("1", {});
  Assert.ok(BrowserTestUtils.is_visible(tag), "tag icon should be visible");
  Assert.deepEqual(tag.title, "Important", "The important tag should be set");

  let row2 = threadTree.getRowAtIndex(2);
  EventUtils.synthesizeMouseAtCenter(row2, {}, about3Pane);
  Assert.ok(
    row2.classList.contains("selected"),
    "the third row should be selected"
  );

  let tag2 = row2.querySelector(".tag-icon");
  Assert.ok(BrowserTestUtils.is_hidden(tag2), "tag icon should be hidden");

  // Set the work tag.
  EventUtils.synthesizeKey("2", {});
  Assert.ok(BrowserTestUtils.is_visible(tag2), "tag icon should be visible");
  Assert.deepEqual(tag2.title, "Work", "The work tag should be set");

  // Switch back to a table layout and horizontal view.
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

  Assert.equal(
    threadTree.getAttribute("rows"),
    "thread-row",
    "tree view in table layout"
  );

  await ensure_cards_view();
  about3Pane.folderTree.focus();
});
