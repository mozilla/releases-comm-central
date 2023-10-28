/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that "watch thread" and "ignore thread" works correctly.
 */

"use strict";

var {
  add_message_sets_to_folders,
  assert_not_shown,
  assert_selected_and_displayed,
  assert_visible,
  be_in_folder,
  create_folder,
  create_thread,
  expand_all_threads,
  inboxFolder,
  make_display_threaded,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var folder;
var thread1, thread2, thread3;

add_setup(async function () {
  // Use an ascending order to simplify the test.
  Services.prefs.setIntPref("mailnews.default_sort_order", 1);

  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  folder = await create_folder("WatchIgnoreThreadTest");
  thread1 = create_thread(3);
  thread2 = create_thread(4);
  thread3 = create_thread(5);
  await add_message_sets_to_folders([folder], [thread1, thread2, thread3]);

  await be_in_folder(folder);
  await make_display_threaded();
  await expand_all_threads();

  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.default_sort_order");
    document.getElementById("toolbar-menubar").autohide = true;
  });
});

/**
 * Click one of the menu items in the View | Messages menu.
 *
 * @param {string} id - The id of the menu item to click.
 */
async function clickViewMessagesItem(id) {
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_View"),
    {},
    document.getElementById("menu_View").ownerGlobal
  );
  await click_menus_in_sequence(document.getElementById("menu_View_Popup"), [
    { id: "viewMessagesMenu" },
    { id },
  ]);
}

/**
 * Test that Ignore Thread works as expected.
 */
add_task(async function test_ignore_thread() {
  const t1root = thread1.getMsgHdr(0);

  const t1second = await select_click_row(1);
  await assert_selected_and_displayed(t1second);

  // Ignore this thread.
  EventUtils.synthesizeKey("K", { shiftKey: false, accelKey: false });

  // The first msg in the next thread should now be selected.
  const t2root = thread2.getMsgHdr(0);
  await assert_selected_and_displayed(t2root);

  // The ignored thread should still be visible (with an ignored icon).
  assert_visible(t1root);

  // Go to another folder then back. Ignored messages should now be hidden.
  await be_in_folder(inboxFolder);
  await be_in_folder(folder);
  await select_click_row(0);
  await assert_selected_and_displayed(t2root);
});

/**
 * Test that ignored threads are shown when the View | Threads |
 * Ignored Threads option is checked.
 */
add_task(async function test_view_threads_ignored_threads() {
  const t1root = thread1.getMsgHdr(0);
  const t2root = thread2.getMsgHdr(0);

  // Check "Ignored Threads" - the ignored messages should appear =>
  // the first row is the first message of the first thread.
  // await clickViewMessagesItem("viewIgnoredThreadsMenuItem");
  goDoCommand("cmd_viewIgnoredThreads");
  await select_click_row(0);
  await assert_selected_and_displayed(t1root);

  // Uncheck "Ignored Threads" - the ignored messages should get hidden.
  // await clickViewMessagesItem("viewIgnoredThreadsMenuItem");
  goDoCommand("cmd_viewIgnoredThreads");
  await select_click_row(0);
  await assert_selected_and_displayed(t2root);
  assert_not_shown(thread1.msgHdrList);
}).__skipMe = AppConstants.platform == "macosx";

/**
 * Test that Watch Thread makes the thread watched.
 */
add_task(async function test_watch_thread() {
  const t2second = await select_click_row(1);
  const t3root = thread3.getMsgHdr(0);
  await assert_selected_and_displayed(t2second);

  // Watch this thread.
  EventUtils.synthesizeKey("W", { shiftKey: false, accelKey: false });

  // Choose "Watched Threads with Unread".
  // await clickViewMessagesItem("viewWatchedThreadsWithUnreadMenuItem");
  goDoCommand("cmd_viewWatchedThreadsWithUnread");
  await select_click_row(1);
  await assert_selected_and_displayed(t2second);
  assert_not_shown(thread1.msgHdrList);
  assert_not_shown(thread3.msgHdrList);

  // Choose "All Messages" again.
  // await clickViewMessagesItem("viewAllMessagesMenuItem");
  goDoCommand("cmd_viewAllMsgs");
  assert_not_shown(thread1.msgHdrList); // still ignored (and now shown)
  await select_click_row(thread2.msgHdrList.length);
  await assert_selected_and_displayed(t3root);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
}).__skipMe = AppConstants.platform == "macosx";
