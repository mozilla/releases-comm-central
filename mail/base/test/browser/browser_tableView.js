/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { ensure_table_view } = ChromeUtils.importESModule(
  "resource://testing-common/MailViewHelpers.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let rootFolder, testFolder, testMessages;

add_setup(async function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder;
  testFolder = await rootFolder.createSubfolderAsync("tableView");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

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
    MailServices.junk.resetTrainingData();
    MailServices.accounts.removeAccount(account, false);
    about3Pane.paneLayout.messagePaneVisible = true;
    about3Pane.folderTree.focus();
  });
});

add_task(async function testButtons() {
  await ensure_table_view(document);
  const threadTree = about3Pane.threadTree;
  // .rows is a live collection.
  const rows = threadTree.table.body.rows;

  // Check the initial state.
  Assert.ok(!testMessages[1].isRead, "message 1 should be not marked as read");
  Assert.ok(!testMessages[2].isFlagged, "message 2 should not be flagged");
  Assert.equal(
    testMessages[3].getStringProperty("junkscore"),
    "",
    "message 3 should not be marked as spam"
  );
  Assert.equal(rows.length, 5, "there should be five rows");
  Assert.ok(
    rows[1].dataset.properties.split(" ").includes("unread"),
    "row 1 properties should include 'unread'"
  );
  Assert.ok(
    !rows[2].dataset.properties.split(" ").includes("flagged"),
    "row 2 properties should not include 'flagged'"
  );
  Assert.ok(
    !rows[3].dataset.properties.split(" ").includes("junk"),
    "row 3 properties should not include 'junk'"
  );

  // Click all the buttons.
  let classificationPromise = PromiseTestUtils.promiseFolderNotification(
    testFolder,
    "msgsJunkStatusChanged"
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[1].querySelector("button.tree-button-unread"),
    {},
    about3Pane
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[2].querySelector("button.tree-button-flag"),
    {},
    about3Pane
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[3].querySelector("button.tree-button-spam"),
    {},
    about3Pane
  );
  Assert.ok(testMessages[1].isRead, "message 1 should be marked as read");
  Assert.ok(testMessages[2].isFlagged, "message 2 should be flagged");
  Assert.equal(
    testMessages[3].getStringProperty("junkscore"),
    "100",
    "message 3 should be marked as spam"
  );

  // Wait for the tree to update.
  await classificationPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(rows.length, 5, "there should be five rows");
  Assert.ok(
    !rows[1].dataset.properties.split(" ").includes("unread"),
    "row 1 properties should not include 'unread'"
  );
  Assert.ok(
    rows[2].dataset.properties.split(" ").includes("flagged"),
    "row 2 properties should include 'flagged'"
  );
  Assert.ok(
    rows[3].dataset.properties.split(" ").includes("junk"),
    "row 3 properties should include 'junk'"
  );

  // Click all the buttons again.
  classificationPromise = PromiseTestUtils.promiseFolderNotification(
    testFolder,
    "msgsJunkStatusChanged"
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[1].querySelector("button.tree-button-unread"),
    {},
    about3Pane
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[2].querySelector("button.tree-button-flag"),
    {},
    about3Pane
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[3].querySelector("button.tree-button-spam"),
    {},
    about3Pane
  );
  Assert.ok(!testMessages[1].isRead, "message 1 should be not marked as read");
  Assert.ok(!testMessages[2].isFlagged, "message 2 should not be flagged");
  Assert.equal(
    testMessages[3].getStringProperty("junkscore"),
    "0",
    "message 3 should not be marked as spam"
  );

  // Wait for the tree to update.
  await classificationPromise;
  await new Promise(resolve => requestAnimationFrame(resolve));
  await new Promise(resolve => setTimeout(resolve));
  Assert.equal(rows.length, 5, "there should be five rows");
  Assert.ok(
    rows[1].dataset.properties.split(" ").includes("unread"),
    "row 1 properties should include 'unread'"
  );
  Assert.ok(
    !rows[2].dataset.properties.split(" ").includes("flagged"),
    "row 2 properties should not include 'flagged'"
  );
  Assert.ok(
    !rows[3].dataset.properties.split(" ").includes("junk"),
    "row 3 properties should not include 'junk'"
  );

  // Show the delete button column.
  EventUtils.synthesizeMouseAtCenter(
    threadTree.querySelector("th.last-column button.button-column-picker"),
    {},
    about3Pane
  );
  const pickerPopup = threadTree.querySelector(
    "menupopup.menupopup-column-picker"
  );
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "shown");
  pickerPopup.activateItem(
    pickerPopup.querySelector(`menuitem[value="deleteCol"]`)
  );
  pickerPopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(pickerPopup, "hidden");

  await BrowserTestUtils.waitForMutationCondition(
    threadTree,
    { attributes: true, subtree: true },
    () =>
      BrowserTestUtils.isVisible(
        rows[4].querySelector("button.tree-button-delete")
      ),
    { msg: "waiting for the delete button column to be visible" }
  );

  // Test the delete button.
  const deletionPromise = PromiseTestUtils.promiseFolderEvent(
    testFolder,
    "DeleteOrMoveMsgCompleted"
  );
  EventUtils.synthesizeMouseAtCenter(
    rows[4].querySelector("button.tree-button-delete"),
    {},
    about3Pane
  );
  await deletionPromise;
  Assert.equal(rows.length, 4, "there should be four rows");
});
