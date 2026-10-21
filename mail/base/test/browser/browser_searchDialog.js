/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const SEARCH_DIALOG_URL = "chrome://messenger/content/searchDialog.xhtml";

let testFolder;

add_setup(function () {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder.createLocalSubfolder("searchDialog");
  Services.xulStore.removeDocument(SEARCH_DIALOG_URL);

  registerCleanupFunction(() => {
    Services.xulStore.removeDocument(SEARCH_DIALOG_URL);
    MailServices.accounts.removeAccount(account, false);
  });
});

/**
 * Opens the search dialog and registers cleanup for the window.
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
  registerCleanupFunction(async () => {
    if (!win.closed) {
      await BrowserTestUtils.closeWindow(win);
    }
  });
  await SimpleTest.promiseFocus(win);
  win.updateSearchFolderPicker(testFolder);
  return win;
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
