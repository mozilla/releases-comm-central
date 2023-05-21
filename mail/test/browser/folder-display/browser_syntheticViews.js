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
  inboxFolder,
  mc,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { SyntheticPartLeaf } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
const { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const { GlodaMsgIndexer } = ChromeUtils.import(
  "resource:///modules/gloda/IndexMsg.jsm"
);

add_setup(async function () {
  Services.prefs.setBoolPref("mailnews.mark_message_read.auto", false);
  Services.prefs.setBoolPref("mailnews.start_page.enabled", false);
  Services.prefs.setIntPref("mailnews.default_view_flags", 0);

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.mark_message_read.auto");
    Services.prefs.clearUserPref("mailnews.start_page.enabled");
    Services.prefs.clearUserPref("mailnews.default_view_flags");
  });
});

function createThreadWithTerm(msgCount, term) {
  let thread = create_thread(msgCount);
  for (let msg of thread.synMessages) {
    msg.bodyPart = new SyntheticPartLeaf(term);
  }
  return thread;
}

async function waitForThreadIndexed(thread) {
  let dbView = window.gFolderDisplay.view.dbView;
  await TestUtils.waitForCondition(
    () =>
      thread.synMessages.every((_, i) =>
        window.Gloda.isMessageIndexed(dbView.getMsgHdrAt(i))
      ),
    "Messages were not indexed in time"
  );
}

function doGlobalSearch(term) {
  let searchInput = window.document.querySelector("#searchInput");
  searchInput.value = term;
  EventUtils.synthesizeMouseAtCenter(searchInput, {}, window);
  EventUtils.synthesizeKey("VK_RETURN", {}, window);
}

async function clickShowResultsAsList(tab) {
  let iframe = tab.querySelector("iframe");
  await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");

  let browser = iframe.contentDocument.querySelector("browser");
  await TestUtils.waitForCondition(
    () =>
      browser.contentWindow.FacetContext &&
      browser.contentWindow.FacetContext.rootWin != null,
    "reachOutAndTouchFrame() did not run in time"
  );

  let anchor = browser.contentDocument.querySelector("#gloda-showall");
  anchor.click();
}

async function clickMarkRead(row, col) {
  await openContextMenu(row, col);
  await clickSubMenuItem("#mailContext-mark", "#mailContext-markRead");
}

async function clickMarkThreadAsRead(row, col) {
  await openContextMenu(row, col);
  await clickSubMenuItem("#mailContext-mark", "#mailContext-markThreadAsRead");
}

async function clickSubMenuItem(menuId, itemId) {
  let menu = window.document.querySelector(menuId);
  let item = menu.querySelector(itemId);

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  menu.openMenu(true);
  await shownPromise;

  let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  menu.menupopup.activateItem(item);
  await hiddenPromise;
}

async function openConversationView(row, col) {
  let menu = window.document.querySelector("#mailContext");
  let item = window.document.querySelector("#mailContext-openConversation");
  let prevTab = window.document.getElementById("tabmail").selectedTab;

  let loadedPromise = BrowserTestUtils.waitForEvent(window, "MsgsLoaded");
  await openContextMenu(row, col);
  menu.activateItem(item);
  await loadedPromise;
  await TestUtils.waitForCondition(
    () => window.document.getElementById("tabmail").selectedTab != prevTab,
    "Conversation View tab did not open"
  );
}

async function openContextMenu(row, column) {
  let menu = window.document.getElementById("mailContext");
  let tree = window.document.getElementById("threadTree");

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  mailTestUtils.treeClick(EventUtils, window, tree, row, column, {});
  mailTestUtils.treeClick(EventUtils, window, tree, row, column, {
    type: "contextmenu",
  });
  await shownPromise;
}

function closeTabs() {
  let tabmail = document.querySelector("tabmail");
  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(1);
  }
}

/**
 * Test we can mark a message as read in the list view version of the global
 * search results.
 */
add_task(async function testListViewMarkRead() {
  let folder = await create_folder("ListViewMarkReadFolder");
  let term = "listviewmarkread";
  let thread = createThreadWithTerm(2, term);

  registerCleanupFunction(async () => {
    await be_in_folder(inboxFolder);
    await delete_messages(thread);

    let trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folder.deleteSelf(null);
    trash.emptyTrash(null);
  });

  await be_in_folder(folder);
  await add_message_sets_to_folders([folder], [thread]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  await waitForThreadIndexed(thread);
  doGlobalSearch(term);

  let tab = document.querySelector(
    "tabmail>tabbox>tabpanels>vbox[selected=true]"
  );
  await clickShowResultsAsList(tab);
  await clickMarkRead(0, 4);

  let dbView = window.gFolderDisplay.view.dbView;
  Assert.ok(dbView.getMsgHdrAt(0).isRead, "Message 0 is read");
  Assert.ok(!dbView.getMsgHdrAt(1).isRead, "Message 1 is not read");

  closeTabs();
});

/**
 * Test we can mark a thread as read in the list view version of the global
 * search results.
 */
add_task(async function testListViewMarkThreadAsRead() {
  let folder = await create_folder("ListViewMarkThreadAsReadFolder");
  let term = "listviewmarkthreadasread ";
  let thread = createThreadWithTerm(3, term);

  registerCleanupFunction(async () => {
    await be_in_folder(inboxFolder);
    await delete_messages(thread);
    let trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folder.deleteSelf(null);
    trash.emptyTrash(null);
  });

  await be_in_folder(folder);
  await add_message_sets_to_folders([folder], [thread]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  await waitForThreadIndexed(thread);
  doGlobalSearch(term);

  let tab = document.querySelector(
    "tabmail>tabbox>tabpanels>vbox[selected=true]"
  );
  await clickShowResultsAsList(tab);
  await clickMarkThreadAsRead(0, 4);

  let dbView = window.gFolderDisplay.view.dbView;
  thread.synMessages.forEach((_, i) => {
    Assert.ok(dbView.getMsgHdrAt(i).isRead, `Message ${i} is read`);
  });

  closeTabs();
});

/**
 * Test we can mark a message as read in a conversation view.
 */
add_task(async function testConversationViewMarkRead() {
  let folder = await create_folder("ConversationViewMarkReadFolder");
  let thread = create_thread(2);

  registerCleanupFunction(async () => {
    await be_in_folder(inboxFolder);
    await delete_messages(thread);

    let trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folder.deleteSelf(null);
    trash.emptyTrash(null);
  });

  await be_in_folder(folder);
  await add_message_sets_to_folders([folder], [thread]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, {
      callback,
      force: true,
    });
  });

  await waitForThreadIndexed(thread);
  await openConversationView(1, 1);
  await clickMarkRead(0, 4);

  let dbView = window.gFolderDisplay.view.dbView;
  Assert.ok(dbView.getMsgHdrAt(0).isRead, "Message 0 is read");
  Assert.ok(!dbView.getMsgHdrAt(1).isRead, "Message 1 is not read");

  closeTabs();
});

/**
 * Test we can mark a thread as read in a conversation view.
 */
add_task(async function testConversationViewMarkThreadAsRead() {
  let folder = await create_folder("ConversationViewMarkThreadAsReadFolder");
  let thread = create_thread(3);

  registerCleanupFunction(async () => {
    await be_in_folder(inboxFolder);
    await delete_messages(thread);

    let trash = folder.rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
    folder.deleteSelf(null);
    trash.emptyTrash(null);
  });

  await be_in_folder(folder);
  await add_message_sets_to_folders([folder], [thread]);

  await new Promise(callback => {
    GlodaMsgIndexer.indexFolder(folder, { callback, force: true });
  });

  await waitForThreadIndexed(thread);
  await openConversationView(1, 1);
  await clickMarkThreadAsRead(0, 4);

  let dbView = window.gFolderDisplay.view.dbView;
  thread.synMessages.forEach((_, i) => {
    Assert.ok(dbView.getMsgHdrAt(i).isRead, `Message ${i} is read.`);
  });

  closeTabs();
});
