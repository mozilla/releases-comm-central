/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const SEARCH_DIALOG_URL = "chrome://messenger/content/searchDialog.xhtml";
const searchWindows = new Set();

let testFolder;

add_setup(function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("searchDialog")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const generator = new MessageGenerator();
  for (let index = 0; index < 3; index++) {
    testFolder.addMessage(
      generator
        .makeMessage({ subject: `Search dialog result ${index}` })
        .toMessageString()
    );
  }
  Services.xulStore.removeDocument(SEARCH_DIALOG_URL);

  registerCleanupFunction(async () => {
    for (const win of searchWindows) {
      if (!win.closed) {
        win.document.getElementById("threadTree").selectedIndices = [];
        await BrowserTestUtils.closeWindow(win);
      }
    }
    Services.xulStore.removeDocument(SEARCH_DIALOG_URL);
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Opens the search dialog and tracks the window for cleanup.
 *
 * @returns {Promise<Window>} The loaded and focused search dialog.
 */
async function openSearchDialog() {
  const opened = BrowserTestUtils.domWindowOpenedAndLoaded(
    null,
    win => win.document.documentURI == SEARCH_DIALOG_URL
  );
  window.searchAllMessages();
  const win = await opened;
  searchWindows.add(win);
  await SimpleTest.promiseFocus(win);
  win.updateSearchFolderPicker(testFolder);
  return win;
}

/**
 * Searches for the fixture messages in the selected folder.
 *
 * @param {Window} win - The search dialog.
 * @param {number} [expectedCount=3] - The expected number of search results.
 * @returns {Promise<TreeView>} The populated results tree.
 */
async function searchMessages(win, expectedCount = 3) {
  const tree = win.document.getElementById("threadTree");
  const input = win.document.querySelector("search-value input");
  input.focus();
  EventUtils.sendString("Search dialog result", win);
  win.onSearch();
  await TestUtils.waitForCondition(
    () => !win.gViewWrapper.searching && tree.view.rowCount == expectedCount,
    "The search should return the fixture messages"
  );
  return tree;
}

add_task(async function test_defaultSort() {
  const win = await openSearchDialog();
  const view = win.document.getElementById("threadTree").view;
  Assert.equal(
    view.sortType,
    Ci.nsMsgViewSortType.byDate,
    "Search results should default to sorting by date"
  );
  Assert.equal(
    view.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "Search results should default to descending order"
  );
  Assert.equal(
    win.document.getElementById("dateCol").ariaSort,
    "descending",
    "The date header should show the default sort direction"
  );
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function test_persistedSort() {
  const win = await openSearchDialog();
  const subjectButton = win.document.getElementById("subjectColButton");
  EventUtils.synthesizeMouseAtCenter(subjectButton, {}, win);
  EventUtils.synthesizeMouseAtCenter(subjectButton, {}, win);
  await BrowserTestUtils.closeWindow(win);

  const reopened = await openSearchDialog();
  const view = reopened.document.getElementById("threadTree").view;
  Assert.equal(
    view.sortType,
    Ci.nsMsgViewSortType.bySubject,
    "Reopening should preserve the chosen sort column"
  );
  Assert.equal(
    view.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "Reopening should preserve the chosen sort direction"
  );
  Assert.equal(
    reopened.document.getElementById("subjectCol").ariaSort,
    "descending",
    "The subject header should show the restored sort direction"
  );
  await BrowserTestUtils.closeWindow(reopened);
});

add_task(async function test_dragMessageData() {
  const win = await openSearchDialog();
  const tree = await searchMessages(win);
  await TestUtils.waitForCondition(
    () => tree.getRowAtIndex(0),
    "The first result row should be rendered"
  );

  for (const indices of [[], [0], [0, 2]]) {
    tree.selectedIndices = indices;
    const messageUris = indices.map(index =>
      tree.view.getURIForViewIndex(index)
    );
    const payloads = [];
    const dataTransfer = {
      mozSetDataAt(format, value, index) {
        payloads[index] ??= {};
        payloads[index][format] = value;
      },
      addElement() {},
    };
    win.ThreadPaneOnDragStart({
      dataTransfer,
      target: tree.getRowAtIndex(0),
    });
    Assert.equal(
      payloads.length,
      indices.length,
      "The drag payload should contain each selected message"
    );
    for (const [index, uri] of messageUris.entries()) {
      Assert.equal(
        payloads[index]["text/x-moz-message"],
        uri,
        "The message flavor should contain the selected message URI"
      );
      Assert.ok(
        payloads[index]["application/x-moz-file-promise-url"],
        "The drag payload should support exporting the message to a file"
      );
      Assert.ok(
        payloads[index][
          "application/x-moz-file-promise-dest-filename"
        ].endsWith(".eml"),
        "The exported filename should have the message extension"
      );
    }
  }
  tree.selectedIndices = [0];
  const dataTransfer = new win.DataTransfer();
  tree
    .getRowAtIndex(0)
    .dispatchEvent(
      new win.DragEvent("dragstart", { bubbles: true, dataTransfer })
    );
  Assert.equal(
    dataTransfer.mozItemCount,
    1,
    "The row dragstart event should populate the message payload"
  );
  tree.selectedIndices = [];
  await BrowserTestUtils.closeWindow(win);
});
