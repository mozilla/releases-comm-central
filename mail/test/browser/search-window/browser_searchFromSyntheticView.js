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
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { SyntheticPartLeaf } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

/**
 * Tests the SearchDialog displays a folder when opened from a synthetic view.
 * See bug 1664761 and bug 1248522.
 */
add_task(async function testSearchDialogFolderSelectedFromSyntheticView() {
  // Make sure the whole test runs with an unthreaded view in all folders.
  Services.prefs.setIntPref("mailnews.default_view_flags", 0);

  const folderName = "Test Folder Name";
  const folder = await create_folder(folderName);
  const thread = create_thread(3);
  const term = "atermtosearchfor";

  registerCleanupFunction(async () => {
    await be_in_folder(inboxFolder);
    await delete_messages(thread);

    const trash = folder.rootFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Trash
    );
    folder.deleteSelf(null);
    trash.emptyTrash(null);

    const tabmail = document.querySelector("tabmail");
    while (tabmail.tabInfo.length > 1) {
      tabmail.closeTab(1);
    }
    Services.prefs.clearUserPref("mailnews.default_view_flags");
  });

  for (const msg of thread.synMessages) {
    msg.bodyPart = new SyntheticPartLeaf(term);
  }

  await be_in_folder(folder);
  await add_message_sets_to_folders([folder], [thread]);

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

  const searchInput = window.document.querySelector("#searchInput");
  searchInput.value = term;
  EventUtils.synthesizeMouseAtCenter(searchInput, {}, window);
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  const tab = document.querySelector(
    "tabmail>tabbox>tabpanels>vbox[selected=true]"
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

  browser.contentDocument.querySelector(".message-subject").click();

  const dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/SearchDialog.xhtml"
    );
  });
  document.querySelector("#searchMailCmd").click();

  const dialogWindow = await dialogPromise;
  const selectedFolder =
    dialogWindow.document.querySelector("#searchableFolders").label;

  Assert.ok(selectedFolder.includes(folderName), "a folder is selected");
  dialogWindow.close();
});
