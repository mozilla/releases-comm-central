/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  add_sets_to_folders,
  delete_message_set,
  inboxFolder,
  be_in_folder,
  create_folder,
  create_thread,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { SyntheticPartLeaf } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

/**
 * Tests the SearchDialog displays a folder when opened from a synthetic view.
 * See bug 1664761 and bug 1248522.
 */
add_task(async function testSearchDialogFolderSelectedFromSyntheticView() {
  let folderName = "Test Folder Name";
  let folder = create_folder(folderName);
  let thread = create_thread(3);
  let term = "atermtosearchfor";

  registerCleanupFunction(() => {
    be_in_folder(inboxFolder);
    delete_message_set(thread);

    let trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folder.deleteSelf(null);
    trash.emptyTrash(null, null);

    let tabmail = document.querySelector("tabmail");
    while (tabmail.tabInfo.length > 1) {
      tabmail.closeTab(1);
    }
  });

  for (let msg of thread.synMessages) {
    msg.bodyPart = new SyntheticPartLeaf(term);
  }

  be_in_folder(folder);
  add_sets_to_folders([folder], [thread]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  let dbView = window.gFolderDisplay.view.dbView;
  await TestUtils.waitForCondition(
    () =>
      thread.synMessages.every((_, i) =>
        window.Gloda.isMessageIndexed(dbView.getMsgHdrAt(i))
      ),
    "messages were not indexed in time"
  );

  let searchInput = window.document.querySelector("#searchInput");
  searchInput.value = term;
  EventUtils.synthesizeMouseAtCenter(searchInput, {}, window);
  EventUtils.synthesizeKey("VK_RETURN", {}, window);

  let tab = document.querySelector(
    "tabmail>tabbox>tabpanels>vbox[selected=true]"
  );

  let iframe = tab.querySelector("iframe");
  await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");

  let browser = iframe.contentDocument.querySelector("browser");
  await TestUtils.waitForCondition(
    () =>
      browser.contentWindow.FacetContext &&
      browser.contentWindow.FacetContext.rootWin != null,
    "reachOutAndTouchFrame() did not run in time"
  );

  browser.contentDocument.querySelector(".message-subject").click();

  let dialogPromise = BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/SearchDialog.xhtml"
    );
  });
  document.querySelector("#searchMailCmd").click();

  let dialogWindow = await dialogPromise;
  let selectedFolder = dialogWindow.document.querySelector("#searchableFolders")
    .label;

  Assert.ok(selectedFolder.includes(folderName), "a folder is selected");
  dialogWindow.close();
});
