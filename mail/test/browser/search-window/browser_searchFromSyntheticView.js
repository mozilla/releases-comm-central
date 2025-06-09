/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  add_message_sets_to_folders,
  be_in_folder,
  create_folder,
  create_thread,
  delete_messages,
  get_about_3pane,
  inboxFolder,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { SyntheticPartLeaf } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { GlodaMsgIndexer } = ChromeUtils.importESModule(
  "resource:///modules/gloda/IndexMsg.sys.mjs"
);

let folderName, folder, thread, term;

add_setup(async function () {
  folderName = "Test Folder Name";
  folder = await create_folder(folderName);

  term = "atermtosearchfor";
  thread = create_thread(3);
  for (const msg of thread.synMessages) {
    msg.bodyPart = new SyntheticPartLeaf(term);
  }

  await add_message_sets_to_folders([folder], [thread]);

  registerCleanupFunction(async () => {
    folder.deleteSelf(null);

    const tabmail = document.getElementById("tabmail");
    tabmail.closeTab(tabmail.currentTabInfo);
    Services.prefs.clearUserPref("mailnews.default_view_flags");
  });
});

/**
 * Tests the SearchDialog displays a folder when opened from a synthetic view.
 * See bug 1664761 and bug 1248522.
 */
add_task(async function testSearchDialogFolderSelectedFromSyntheticView() {
  await be_in_folder(folder);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  const dbView = get_about_3pane().gDBView;
  await TestUtils.waitForCondition(
    () =>
      thread.synMessages.every((_, i) =>
        window.Gloda.isMessageIndexed(dbView.getMsgHdrAt(i))
      ),
    "messages were not indexed in time"
  );

  const searchBar = document.querySelector("global-search-bar");
  searchBar.overrideSearchTerm(term);
  searchBar.focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const tab = document.querySelector(
    "tabmail > tabbox > tabpanels > vbox[selected=true]"
  );

  const iframe = tab.querySelector("iframe");
  await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");

  const browser = iframe.contentDocument.querySelector("browser");
  await TestUtils.waitForCondition(
    () =>
      browser.contentWindow.FacetContext &&
      browser.contentWindow.FacetContext.rootWin != null,
    "reachOutAndTouchFrame() did not run in time"
  );

  EventUtils.synthesizeMouseAtCenter(
    browser.contentDocument.querySelector(".message-subject"),
    {},
    browser.contentDocument
  );

  const dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/SearchDialog.xhtml"
    );
  });
  window.searchAllMessages();

  const dialogWindow = await dialogPromise;
  const selectedFolder =
    dialogWindow.document.querySelector("#searchableFolders").label;

  Assert.ok(selectedFolder.includes(folderName), "a folder should be selected");
  dialogWindow.close();
});
