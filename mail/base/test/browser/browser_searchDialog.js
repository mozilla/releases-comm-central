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

add_task(async function test_customizeHeaders() {
  const header = "X-Search-Dialog";
  const customHeadersURL = "chrome://messenger/content/CustomHeaders.xhtml";
  await SpecialPowers.pushPrefEnv({
    set: [["mailnews.customHeaders", ""]],
  });
  const win = await openSearchDialog();
  EventUtils.synthesizeMouseAtCenter(
    win.document.querySelector('[data-l10n-id="search-add-rule-button"]'),
    {},
    win
  );
  const attributes = win.document.querySelectorAll("search-attribute");
  Assert.equal(
    attributes.length,
    2,
    "The dialog should have two search criteria"
  );

  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    customHeadersURL,
    {
      async callback(dialogWin) {
        await SimpleTest.promiseFocus(dialogWin);
        const doc = dialogWin.document;
        const list = doc.getElementById("headerList");
        Assert.equal(list.itemCount, 0, "The header list should start empty");
        doc.getElementById("headerInput").focus();
        EventUtils.sendString(header, dialogWin);
        EventUtils.synthesizeMouseAtCenter(
          doc.getElementById("addButton"),
          {},
          dialogWin
        );
        await BrowserTestUtils.waitForMutationCondition(
          list,
          { childList: true },
          () => list.itemCount == 1
        );
        Assert.equal(
          list.selectedItem.label,
          header,
          "Adding a header should select it in the editor"
        );
        doc.querySelector("dialog").getButton("accept").click();
      },
    }
  );
  let shown = BrowserTestUtils.waitForPopupEvent(
    attributes[0].menupopup,
    "shown"
  );
  EventUtils.synthesizeMouseAtCenter(attributes[0].menulist, {}, win);
  await shown;
  attributes[0].menupopup.activateItem(
    attributes[0].menupopup.querySelector(
      `[value="${Ci.nsMsgSearchAttrib.OtherHeader}"]`
    )
  );
  await dialogPromise;
  await TestUtils.waitForCondition(
    () => attributes[0].menulist.selectedItem?.label == header,
    "The criterion should select the chosen custom header"
  );
  Assert.equal(
    Services.prefs.getCharPref("mailnews.customHeaders"),
    header,
    "Accepting the editor should save the new custom header"
  );
  for (const attribute of attributes) {
    Assert.ok(
      attribute.menulist.querySelector(`[label="${header}"]`),
      "Every criterion should offer the new custom header"
    );
  }

  await SimpleTest.promiseFocus(win);
  dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    customHeadersURL,
    {
      async callback(dialogWin) {
        await SimpleTest.promiseFocus(dialogWin);
        const doc = dialogWin.document;
        const list = doc.getElementById("headerList");
        Assert.equal(
          list.itemCount,
          1,
          "The editor should show the saved header"
        );
        list.selectedIndex = 0;
        EventUtils.synthesizeMouseAtCenter(
          doc.getElementById("removeButton"),
          {},
          dialogWin
        );
        Assert.equal(
          list.itemCount,
          0,
          "Removing the header should empty the list"
        );
        doc.querySelector("dialog").getButton("cancel").click();
      },
    }
  );
  shown = BrowserTestUtils.waitForPopupEvent(attributes[0].menupopup, "shown");
  EventUtils.synthesizeMouseAtCenter(attributes[0].menulist, {}, win);
  await shown;
  attributes[0].menupopup.activateItem(
    attributes[0].menupopup.querySelector(
      `[value="${Ci.nsMsgSearchAttrib.OtherHeader}"]`
    )
  );
  await dialogPromise;
  await TestUtils.waitForCondition(
    () => attributes[0].value == Ci.nsMsgSearchAttrib.Subject,
    "Cancelling Customize should select a valid default attribute"
  );
  Assert.equal(
    Services.prefs.getCharPref("mailnews.customHeaders"),
    header,
    "Cancelling the editor should preserve the saved custom header"
  );
  for (const attribute of attributes) {
    Assert.ok(
      attribute.menulist.querySelector(`[label="${header}"]`),
      "Every criterion should still offer the saved custom header"
    );
  }
  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_deleteColumnConfirmation() {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.warn_on_delete_from_trash", true]],
  });
  const trashFolder = testFolder.parent
    .getFolderWithFlags(Ci.nsMsgFolderFlags.Trash)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  trashFolder.addMessage(
    new MessageGenerator()
      .makeMessage({ subject: "Search dialog result in Trash" })
      .toMessageString()
  );

  const win = await openSearchDialog();
  win.updateSearchFolderPicker(testFolder.parent);
  const tree = await searchMessages(win, 4);
  win.threadPane.columns.find(column => column.id == "deleteCol").hidden =
    false;
  win.threadPane.updateColumns();
  tree.reset();
  const headers = Array.from({ length: tree.view.rowCount }, (_, index) =>
    tree.view.getMsgHdrAt(index)
  );
  const trashIndex = headers.findIndex(header => header.folder == trashFolder);
  const selectedIndex = headers.findIndex(
    header => header.folder == testFolder
  );
  Assert.notEqual(
    trashIndex,
    -1,
    "The search should include the Trash message"
  );
  Assert.notEqual(
    selectedIndex,
    -1,
    "The search should include another folder"
  );
  tree.selectedIndex = selectedIndex;
  const selectedMessageId = headers[selectedIndex].messageId;
  await TestUtils.waitForCondition(
    () => tree.getRowAtIndex(trashIndex),
    "The Trash result should be rendered"
  );

  const expectedPrompt = Services.strings
    .createBundle("chrome://messenger/locale/messenger.properties")
    .GetStringFromName("confirmMsgDelete.deleteFromTrash.desc");
  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    undefined,
    {
      callback(dialogWin) {
        Assert.equal(
          dialogWin.document.getElementById("infoBody").textContent,
          expectedPrompt,
          "Deleting the clicked Trash result should show its permanent-delete warning"
        );
        dialogWin.document.querySelector("dialog").getButton("cancel").click();
      },
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    tree.getRowAtIndex(trashIndex).querySelector(".tree-button-delete"),
    {},
    win
  );
  await dialogPromise;
  await TestUtils.waitForCondition(
    () => !win.windowUtils.isInModalState(),
    "The search dialog should leave its modal state after cancelling deletion"
  );
  Assert.equal(
    tree.view.rowCount,
    4,
    "Cancelling deletion should preserve all search results"
  );
  Assert.equal(
    trashFolder.getTotalMessages(false),
    1,
    "Cancelling deletion should preserve the message in Trash"
  );
  Assert.equal(
    tree.view.getMsgHdrAt(tree.selectedIndex).messageId,
    selectedMessageId,
    "Cancelling deletion should preserve the selection in the other folder"
  );

  await SimpleTest.promiseFocus(win);
  dialogPromise = BrowserTestUtils.promiseAlertDialog(undefined, undefined, {
    callback(dialogWin) {
      Assert.equal(
        dialogWin.document.getElementById("infoBody").textContent,
        expectedPrompt,
        "Confirming deletion should show the permanent-delete warning again"
      );
      dialogWin.document.querySelector("dialog").getButton("accept").click();
    },
  });
  EventUtils.synthesizeMouseAtCenter(
    tree.getRowAtIndex(trashIndex).querySelector(".tree-button-delete"),
    {},
    win
  );
  await dialogPromise;
  await TestUtils.waitForCondition(
    () => tree.view.rowCount == 3,
    "Accepting deletion should remove the clicked search result"
  );
  Assert.equal(
    trashFolder.getTotalMessages(false),
    0,
    "Accepting deletion should remove the message from Trash"
  );
  tree.selectedIndices = [];
  await BrowserTestUtils.closeWindow(win);
  await SpecialPowers.popPrefEnv();
});

add_task(async function test_columnWidths() {
  const win = await openSearchDialog();
  const tree = win.document.getElementById("threadTree");
  const widths = new Map([
    ["subjectCol", 200],
    ["correspondentCol", 150],
  ]);
  // The table can redistribute rendered widths and convert them to percentages.
  // Check the desired widths that are saved and restored independently of layout.
  for (const [id, width] of widths) {
    const column = win.document.getElementById(id);
    const splitter = column.querySelector("hr");
    splitter.width = width;
    splitter.dispatchEvent(new win.CustomEvent("splitter-resized"));
    const columnStates = JSON.parse(
      Services.xulStore.getValue(
        SEARCH_DIALOG_URL,
        "threadTree",
        "columnStates"
      ) || "{}"
    );
    Assert.equal(
      columnStates[id]?.width,
      width,
      `${id} should persist the resized width`
    );
  }

  const picker = tree.querySelector("th.last-column .button-column-picker");
  const popup = tree.querySelector("menupopup.menupopup-column-picker");
  const shown = BrowserTestUtils.waitForPopupEvent(popup, "shown");
  EventUtils.synthesizeMouseAtCenter(picker, {}, win);
  await shown;
  const columnsChanged = BrowserTestUtils.waitForEvent(
    tree.table,
    "columns-changed"
  );
  popup.activateItem(popup.querySelector('[value="sizeCol"]'));
  await columnsChanged;
  const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  popup.hidePopup();
  await hidden;

  Assert.ok(
    BrowserTestUtils.isVisible(win.document.getElementById("sizeCol")),
    "The column picker should show the Size column"
  );
  const columnStates = JSON.parse(
    Services.xulStore.getValue(SEARCH_DIALOG_URL, "threadTree", "columnStates")
  );
  for (const [id, width] of widths) {
    Assert.equal(
      columnStates[id]?.width,
      width,
      `${id} should retain its saved width after changing column visibility`
    );
  }
  await BrowserTestUtils.closeWindow(win);

  const reopened = await openSearchDialog();
  for (const [id, width] of widths) {
    const column = reopened.threadPane.columns.find(c => c.id == id);
    Assert.ok(column, `${id} should be in the restored column definitions`);
    Assert.equal(
      column.width,
      width,
      `${id} should restore its saved width after reopening the dialog`
    );
  }
  await BrowserTestUtils.closeWindow(reopened);
});
