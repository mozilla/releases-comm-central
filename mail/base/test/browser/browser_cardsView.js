/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { click_through_appmenu } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

let tabmail = document.getElementById("tabmail");
let about3Pane = tabmail.currentAbout3Pane;
let { threadPane, threadTree } = about3Pane;
let rootFolder, testFolder, testMessages;

add_setup(async function() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;

  rootFolder.createSubfolder("threads", null);
  testFolder = rootFolder
    .getChildNamed("threads")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  let generator = new MessageGenerator();
  testFolder.addMessageBatch(
    generator.makeMessages({ count: 5 }).map(message => message.toMboxString())
  );
  testMessages = [...testFolder.messages];

  about3Pane.displayFolder(testFolder.URI);
  about3Pane.paneLayout.messagePaneVisible = false;

  registerCleanupFunction(() => {
    click_through_appmenu(
      [{ id: "appmenu_View" }, { id: "appmenu_MessagePaneLayout" }],
      { id: "appmenu_messagePaneClassic" },
      window
    );
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function testSwitchToVerticalView() {
  click_through_appmenu(
    [{ id: "appmenu_View" }, { id: "appmenu_MessagePaneLayout" }],
    { id: "appmenu_messagePaneVertical" },
    window
  );

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view switched to a card layout"
  );

  Assert.equal(
    threadTree.getAttribute("rows"),
    "thread-card",
    "tree view in cards layout"
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
});
