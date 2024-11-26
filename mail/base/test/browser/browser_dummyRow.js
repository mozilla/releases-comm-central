/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test for the UI implementation of the "dummy row", which is a placeholder row
 * for cards and table view when the list is grouped by sorting order.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const threadTree = about3Pane.threadTree;

let rootFolder, folderA, folderB;

add_setup(async function () {
  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  folderA = rootFolder
    .createLocalSubfolder("dummyRowFolderA")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  folderB = rootFolder.createLocalSubfolder("dummyRowFolderB");

  // Make some messages.
  const syntheticMessages = generator.makeMessages({
    count: 5,
    msgsPerThread: 1,
  });

  folderA.addMessageBatch(
    syntheticMessages.map(message => message.toMessageString())
  );

  about3Pane.restoreState({
    messagePaneVisible: true,
    folderURI: folderA.URI,
  });

  about3Pane.sortController.groupBySort();
  await BrowserTestUtils.waitForCondition(
    () => threadTree.dataset.showGroupedBySort == "true",
    "The tree view should be grouped by sort"
  );
  threadTree.scrollToIndex(0, true);

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
  });
});

add_task(async function test_dummy_row_in_table_view() {
  const folderAMessages = [...folderA.messages];

  about3Pane.threadPane.updateThreadView("table");
  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

  Assert.equal(
    threadTree.getRowAtIndex(0).querySelector(".subject-line span").textContent,
    `Older (${folderAMessages.length}/${folderAMessages.length})`,
    "The subject text with the unread and total counter should match"
  );

  // Mark each message as read, and check that the dummy row's content is
  // updated accordingly. We do this for each message *except* one (the very
  // first one), because the dummy row's content follows a slightly different
  // format when all the messages are marked as read, which we check separately
  // from this loop.
  for (let i = 1; i < folderAMessages.length; i++) {
    folderAMessages[i].markRead(true);
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
    Assert.equal(
      threadTree.getRowAtIndex(0).querySelector(".subject-line span")
        .textContent,
      `Older (${folderAMessages.length - i}/${folderAMessages.length})`
    );
  }

  folderAMessages[0].markRead(true);
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
  Assert.equal(
    threadTree.getRowAtIndex(0).querySelector(".subject-line span").textContent,
    `Older (${folderAMessages.length})`
  );
});

// TODO: Implement after bug 1894591.
// add_task(async function test_dummy_row_in_cards_view() {});
