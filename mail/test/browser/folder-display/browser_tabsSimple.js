/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that opening new folder and message tabs has the expected result and
 * that closing them doesn't break anything.  sid0 added checks for focus
 * transitions at one point; I (asuth) am changing our test infrastructure to
 * cause more realistic focus changes so those changes now look sillier
 * because in many cases we are explicitly setting focus back after the thread
 * tree gains focus.
 */

"use strict";

var {
  assert_folder_tree_focused,
  assert_message_pane_focused,
  assert_messages_in_view,
  assert_nothing_selected,
  assert_selected_and_displayed,
  assert_thread_tree_focused,
  be_in_folder,
  close_tab,
  create_folder,
  focus_folder_tree,
  focus_message_pane,
  focus_thread_tree,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  select_click_row,
  switch_tab,
  wait_for_blank_content_pane,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folderA, folderB, setA, setB;

add_setup(async function () {
  folderA = await create_folder("TabsSimpleA");
  folderB = await create_folder("TabsSimpleB");

  // We will verify we are seeing the right folder by checking that it has the
  //  right messages in it.
  [setA] = await make_message_sets_in_folders([folderA], [{}]);
  [setB] = await make_message_sets_in_folders([folderB], [{}]);
});

/** The tabs in our test. */
var tabFolderA, tabFolderB, tabMessageA, tabMessageB;
/** The message that we selected for tab display, to check it worked right. */
var messageA, messageB;

/**
 * Make sure the default tab works right.
 */
add_task(async function test_open_folder_a() {
  tabFolderA = await be_in_folder(folderA);
  assert_messages_in_view(setA);
  await assert_nothing_selected();
  // Focus the folder tree here
  focus_folder_tree();
});

/**
 * Open tab b, make sure it works right.
 */
add_task(async function test_open_folder_b_in_tab() {
  tabFolderB = await open_folder_in_new_tab(folderB);
  await wait_for_blank_content_pane();
  assert_messages_in_view(setB);
  await assert_nothing_selected();
  focus_thread_tree();
});

/**
 * Go back to tab/folder A and make sure we change correctly.
 */
add_task(async function test_switch_to_tab_folder_a() {
  await switch_tab(tabFolderA);
  assert_messages_in_view(setA);
  await assert_nothing_selected();
  assert_folder_tree_focused();
});

/**
 * Select a message in folder A and open it in a new window, making sure that
 *  the displayed message is the right one.
 */
add_task(async function test_open_message_a_in_tab() {
  // (this focuses the thread tree for tabFolderA...)
  messageA = await select_click_row(0);
  // (...refocus the folder tree for our sticky check below)
  focus_folder_tree();
  tabMessageA = await open_selected_message_in_new_tab();
  await assert_selected_and_displayed(messageA);
  assert_message_pane_focused();
});

/**
 * Go back to tab/folder B and make sure we change correctly.
 */
add_task(async function test_switch_to_tab_folder_b() {
  await switch_tab(tabFolderB);
  assert_messages_in_view(setB);
  await assert_nothing_selected();
  assert_thread_tree_focused();
});

/**
 * Select a message in folder B and open it in a new window, making sure that
 *  the displayed message is the right one.
 */
add_task(async function test_open_message_b_in_tab() {
  messageB = await select_click_row(0);
  // Let's focus the message pane now
  focus_message_pane();
  tabMessageB = await open_selected_message_in_new_tab();
  await assert_selected_and_displayed(messageB);
  assert_message_pane_focused();
});

/**
 * Switch to message tab A.
 */
add_task(async function test_switch_to_message_a() {
  await switch_tab(tabMessageA);
  await assert_selected_and_displayed(messageA);
  assert_message_pane_focused();
});

/**
 * Close message tab A (when it's in the foreground).
 */
add_task(function test_close_message_a() {
  close_tab();
  // our current tab is now undefined for the purposes of this test.
});

/**
 * Make sure all the other tabs are still happy.
 */
add_task(async function test_tabs_are_still_happy() {
  await switch_tab(tabFolderB);
  assert_messages_in_view(setB);
  await assert_selected_and_displayed(messageB);
  assert_message_pane_focused();

  await switch_tab(tabMessageB);
  await assert_selected_and_displayed(messageB);
  assert_message_pane_focused();

  await switch_tab(tabFolderA);
  assert_messages_in_view(setA);
  await assert_selected_and_displayed(messageA);
  // focus restoration uses setTimeout(0) and so we need to give it a chance
  await new Promise(resolve => setTimeout(resolve));
  assert_folder_tree_focused();
});

/**
 * Close message tab B (when it's in the background).
 */
add_task(async function test_close_message_b() {
  close_tab(tabMessageB);
  // we should still be on folder A
  assert_messages_in_view(setA);
  await assert_selected_and_displayed(messageA);
  assert_folder_tree_focused();
});

/**
 * Switch to tab B, close it, make sure we end up on tab A.
 */
add_task(async function test_close_folder_b() {
  await switch_tab(tabFolderB);
  assert_messages_in_view(setB);
  await assert_selected_and_displayed(messageB);
  assert_message_pane_focused();

  close_tab();
  assert_messages_in_view(setA);
  await assert_selected_and_displayed(messageA);
  assert_folder_tree_focused();

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
