/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const generator = new MessageGenerator();
const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { multiMessageBrowser, threadTree } = about3Pane;

let testFolder, testMessages;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const localAccount = MailServices.accounts.createLocalMailAccount();
  const rootFolder = localAccount.incomingServer.rootFolder;

  testFolder = await rootFolder.createSubfolderAsync("edit menu");
  testFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  const synMessages = generator.makeMessages({});
  const thread3 = generator.makeMessages({
    inReplyTo: synMessages[3],
    count: 3,
    msgsPerThread: 3,
  });
  const thread7 = generator.makeMessages({
    inReplyTo: synMessages[7],
    count: 5,
    msgsPerThread: 3,
  });

  testFolder.addMessageBatch(
    [...synMessages, ...thread3, ...thread7].map(message =>
      message.toMessageString()
    )
  );
  testMessages = [...testFolder.messages];
  testMessages[2].markFlagged(true);
  testMessages[5].markFlagged(true);
  testMessages[8].markFlagged(true);

  registerCleanupFunction(async function () {
    about3Pane.sortController.sortThreaded();
    MailServices.accounts.removeAccount(localAccount, false);
  });
});

add_task(async function testSelectItems() {
  about3Pane.displayFolder(testFolder);
  Assert.equal(
    about3Pane.gDBView.rowCount,
    10,
    "the thread should be collapsed"
  );

  let selectEventCount = 0;
  threadTree.addEventListener("select", () => selectEventCount++);

  // Select all messages.

  await activateItem("menu_SelectAll");
  Assert.equal(selectEventCount, 1, "one select event should have fired");
  Assert.equal(
    about3Pane.gDBView.rowCount,
    10,
    "the thread should still be collapsed"
  );
  Assert.equal(
    threadTree.selectedIndices.length,
    10,
    "all messages should be selected"
  );
  assertDisplayed(testMessages);

  // Select messages in a thread.

  threadTree.selectedIndex = 8;
  selectEventCount = 0;

  await activateItem("menu_selectThread");
  Assert.equal(selectEventCount, 1, "one select event should have fired");
  Assert.equal(
    about3Pane.gDBView.rowCount,
    13,
    "the thread should be expanded"
  );
  Assert.deepEqual(
    threadTree.selectedIndices,
    [8, 9, 10, 11],
    "the messages in the thread should be selected"
  );
  assertDisplayed([
    testMessages[3],
    testMessages[10],
    testMessages[11],
    testMessages[12],
  ]);

  // Select flagged messages.

  threadTree.selectedIndex = -1;
  selectEventCount = 0;

  await activateItem("menu_selectFlagged");
  Assert.equal(selectEventCount, 1, "one select event should have fired");
  Assert.equal(
    about3Pane.gDBView.rowCount,
    13,
    "the thread should be expanded"
  );
  // The messages with threads are now at the end, so these indices don't
  // match those in testMessages.
  Assert.deepEqual(
    threadTree.selectedIndices,
    [2, 4, 6],
    "the flagged messages should be selected"
  );
  assertDisplayed([testMessages[2], testMessages[5], testMessages[8]]);

  // Switch to unthreaded mode.
  // select all messages.

  threadTree.selectedIndex = -1;
  selectEventCount = 0;

  about3Pane.sortController.sortUnthreaded();
  Assert.equal(about3Pane.gDBView.rowCount, 18, "all messages should be shown");

  await activateItem("menu_SelectAll");
  Assert.equal(selectEventCount, 1, "one select event should have fired");
  Assert.equal(
    threadTree.selectedIndices.length,
    18,
    "all messages should be selected"
  );
  assertDisplayed(testMessages);

  // Selecting messages in a thread doesn't work in unthreaded mode.
  // Maybe it should.

  // Select flagged messages.

  threadTree.selectedIndex = -1;
  selectEventCount = 0;

  await activateItem("menu_selectFlagged");
  Assert.equal(selectEventCount, 1, "one select event should have fired");
  Assert.deepEqual(
    threadTree.selectedIndices,
    [2, 5, 8],
    "the flagged messages should be selected"
  );
  assertDisplayed([testMessages[2], testMessages[5], testMessages[8]]);
});

/**
 * @param {string} itemId
 */
async function activateItem(itemId) {
  const editMenu = document.getElementById("menu_Edit");
  EventUtils.synthesizeMouseAtCenter(editMenu, {}, window);
  await BrowserTestUtils.waitForPopupEvent(editMenu.menupopup, "shown");

  const selectMenu = document.getElementById("menu_select");
  EventUtils.synthesizeMouseAtCenter(selectMenu, {}, window);
  await BrowserTestUtils.waitForPopupEvent(selectMenu.menupopup, "shown");

  selectMenu.menupopup.activateItem(document.getElementById(itemId));
  await BrowserTestUtils.waitForPopupEvent(selectMenu.menupopup, "hidden");
  await BrowserTestUtils.waitForPopupEvent(editMenu.menupopup, "hidden");
}

/**
 * @param {nsIMsgDBHdr[]} messages
 */
function assertDisplayed(messages) {
  Assert.ok(
    BrowserTestUtils.isVisible(multiMessageBrowser),
    "the multiMessageBrowser browser should be visible when multiple messages are selected"
  );
  const summary = multiMessageBrowser.contentWindow.gMessageSummary;

  Assert.deepEqual(
    messages.map(m => `${m.messageKey}${m.folder.URI}`).toSorted(),
    Object.keys(summary._msgNodes).toSorted(),
    "the selected messages should be summarised"
  );
}
