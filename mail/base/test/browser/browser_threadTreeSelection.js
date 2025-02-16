/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that the selection is saved and restored when switching folders.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const { dbViewWrapperListener, displayFolder, threadTree, threadPane } =
  about3Pane;

const generator = new MessageGenerator();
let testFolder1, testFolder2, virtualFolder;

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.scroll_to_new_message", false);
  Services.prefs.setIntPref("ui.prefersReducedMotion", 1);

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );

  testFolder1 = rootFolder
    .createLocalSubfolder("threadTreeSelection1")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder1.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  testFolder2 = rootFolder
    .createLocalSubfolder("threadTreeSelection2")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder2.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  virtualFolder = rootFolder
    .createLocalSubfolder("threadTreeSelectionVirtual")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  virtualFolder.setFlag(Ci.nsMsgFolderFlags.Virtual);
  const folderInfo = virtualFolder.msgDatabase.dBFolderInfo;
  folderInfo.setCharProperty("searchStr", "ALL");
  folderInfo.setCharProperty(
    "searchFolderUri",
    [testFolder1.URI, testFolder2.URI].join("|")
  );

  tabmail.currentAbout3Pane.restoreState({ messagePaneVisible: false });

  registerCleanupFunction(() => {
    threadPane.forgetSelection(testFolder1.URI);
    threadPane.forgetSelection(testFolder2.URI);
    threadPane.forgetSelection(virtualFolder.URI);
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mailnews.scroll_to_new_message");
    Services.prefs.clearUserPref("ui.prefersReducedMotion");
  });
});

/**
 * Tests that selection is remembered when leaving a folder and correctly
 * restored when returning.
 */
add_task(async function testSelectionRestoredOnReopen() {
  async function switchFolder(folder, expectedSelection, newSelection) {
    const allMessagesLoadedPromise = BrowserTestUtils.waitForEvent(
      about3Pane,
      "allMessagesLoaded"
    );
    displayFolder(folder);
    await allMessagesLoadedPromise;
    Assert.deepEqual(
      threadTree.selectedIndices,
      expectedSelection,
      "selected indices should be restored"
    );

    if (newSelection) {
      threadTree.selectedIndices = newSelection;
      Assert.deepEqual(
        threadTree.selectedIndices,
        newSelection,
        "new selection should be set"
      );
    }
  }

  const testMessages1 = [...testFolder1.messages];
  const testMessages2 = [...testFolder2.messages];

  await switchFolder(testFolder1, []);
  await switchFolder(testFolder2, []);
  await switchFolder(virtualFolder, []);
  await switchFolder(testFolder1, [], [5]);
  await switchFolder(testFolder2, []);
  await switchFolder(virtualFolder, []);
  await switchFolder(testFolder1, [5], [2, 3]);
  await switchFolder(testFolder2, [], [8]);
  await switchFolder(virtualFolder, [], [1]);
  await switchFolder(testFolder1, [2, 3], []);
  await switchFolder(testFolder2, [8], [4, 6]);
  await switchFolder(virtualFolder, [1], [3, 4, 5, 6, 7]);
  await switchFolder(testFolder1, []);
  await switchFolder(testFolder2, [4, 6], []);
  await switchFolder(virtualFolder, [3, 4, 5, 6, 7], []);
  await switchFolder(testFolder1, []);
  await switchFolder(testFolder2, []);
  await switchFolder(virtualFolder, []);

  // Test that selection is correctly restored if messages are deleted.

  await switchFolder(testFolder1, [], [2, 3, 4, 8]);
  await switchFolder(virtualFolder, [], [1, 3, 5, 7, 9, 11, 13, 15, 17, 19]);
  await switchFolder(testFolder2, []);
  const promise = PromiseTestUtils.promiseFolderEvent(
    testFolder1,
    "DeleteOrMoveMsgCompleted"
  );
  testFolder1.deleteMessages(
    [testMessages1[3], testMessages1[6]],
    null,
    true,
    false,
    null,
    false
  );
  await promise;
  await switchFolder(
    testFolder1,
    [
      2,
      // Selected message at 3 deleted. Rest of selection moves up.
      4 - 1,
      // Unselected message at 6 deleted. Rest of selection moves up.
      8 - 2,
    ],
    []
  );
  await switchFolder(virtualFolder, [
    1,
    // Selected message at 3 deleted. Rest of selection moves up.
    5 - 1,
    // Unselected message at 6 (- 1) deleted. Rest of selection moves up.
    7 - 2,
    9 - 2,
    11 - 2,
    13 - 2,
    15 - 2,
    17 - 2,
    19 - 2,
  ]);

  // Test that selection is correctly restored if messages are added.
  // If `mailnews.scroll_to_new_message` is true the selection is not restored.

  await switchFolder(testFolder2, [], [4, 5, 6, 9]);
  await switchFolder(testFolder1, []);
  // Before.
  testFolder2.addMessage(
    generator
      .makeMessage({ date: new Date(testMessages2[0].date / 1000 - 1800000) })
      .toMessageString()
  );
  // Between.
  testFolder2.addMessage(
    generator
      .makeMessage({ date: new Date(testMessages2[4].date / 1000 + 1800000) })
      .toMessageString()
  );
  // After.
  testFolder2.addMessage(generator.makeMessage({}).toMessageString());
  await switchFolder(testFolder2, [
    // Message inserted at 0.
    4 + 1,
    // Message inserted at 5 (+ 1). Rest of selection moves down.
    5 + 2,
    6 + 2,
    9 + 2,
    // Message inserted at 10 (+ 2). Rest of selection moves down.
  ]);
});

/**
 * Tests that selection is remembered when the context menu is opened (on a
 * selected row or an unselected row) and correctly restored when it closes.
 */
add_task(async function testSelectionRestoredOnContextClose() {
  async function switchFolder(folder) {
    displayFolder(folder);
    await TestUtils.waitForCondition(
      () => dbViewWrapperListener._allMessagesLoaded
    );
  }

  async function showContextAt(index) {
    threadTree.scrollToIndex(index);
    const row = await TestUtils.waitForCondition(() =>
      threadTree.getRowAtIndex(index)
    );
    EventUtils.synthesizeMouseAtCenter(
      row,
      { type: "contextmenu" },
      about3Pane
    );
    const mailContext = about3Pane.document.getElementById("mailContext");
    await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
    mailContext.hidePopup();
    await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
  }

  function assertSelectedMessages(expectedSelection, expectedCurrent) {
    Assert.deepEqual(
      threadTree.selectedIndices,
      expectedSelection,
      "selected indices should be restored"
    );
    Assert.deepEqual(
      Array.from(threadTree.querySelectorAll(".selected"), row => row.index),
      expectedSelection,
      `rows should have "selected" class iff selected`
    );
    Assert.equal(
      threadTree.currentIndex,
      expectedCurrent,
      "current index should be restored"
    );
    if (expectedCurrent == -1) {
      Assert.deepEqual(
        Array.from(threadTree.querySelectorAll(".current"), row => row.index),
        [],
        `no rows should have the "current" class`
      );
    } else {
      Assert.deepEqual(
        Array.from(threadTree.querySelectorAll(".current"), row => row.index),
        [expectedCurrent],
        `rows should have "current" class iff selected`
      );
    }
  }

  for (const folder of [testFolder1, virtualFolder]) {
    await switchFolder(folder);

    // No selection. No current row.
    threadTree.selectedIndex = -1;
    threadTree.currentIndex = -1;
    await showContextAt(7);
    assertSelectedMessages([], -1);

    // No selection, but a current row.
    threadTree.selectedIndex = -1;
    threadTree.currentIndex = 0;
    await showContextAt(0);
    assertSelectedMessages([], 0);

    await showContextAt(7);
    assertSelectedMessages([], 0);

    // Single selection.
    threadTree.selectedIndex = 1;
    threadTree.currentIndex = 1;
    await showContextAt(1);
    assertSelectedMessages([1], 1);

    await showContextAt(7);
    assertSelectedMessages([1], 1);

    // Multiple selection.
    threadTree.selectedIndices = [2, 3];
    threadTree.currentIndex = 3;
    await showContextAt(2);
    assertSelectedMessages([2, 3], 3);

    await showContextAt(7);
    assertSelectedMessages([2, 3], 3);

    // Single selection, but current is different.
    threadTree.selectedIndex = 3;
    threadTree.currentIndex = 4;
    await showContextAt(3);
    assertSelectedMessages([3], 4);

    await showContextAt(7);
    assertSelectedMessages([3], 4);

    // Multiple selection, not including current.
    threadTree.selectedIndices = [4, 5];
    threadTree.currentIndex = 6;
    await showContextAt(4);
    assertSelectedMessages([4, 5], 6);

    await showContextAt(7);
    assertSelectedMessages([4, 5], 6);
  }
});
