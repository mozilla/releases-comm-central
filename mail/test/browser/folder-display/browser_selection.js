/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  assert_nothing_selected,
  assert_selected_and_displayed,
  assert_visible,
  be_in_folder,
  close_tab,
  create_folder,
  delete_via_popup,
  enter_folder,
  make_display_grouped,
  make_display_threaded,
  make_display_unthreaded,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  press_delete,
  right_click_on_row,
  select_click_row,
  select_column_click_row,
  select_control_click_row,
  select_none,
  select_shift_click_row,
  switch_tab,
  wait_for_blank_content_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

// let us have 2 folders
var folder = null,
  folder2 = null;

add_setup(async function () {
  folder = await create_folder("SelectionA");
  folder2 = await create_folder("SelectionB");
  await make_message_sets_in_folders([folder, folder2], [{ count: 50 }]);
});

// https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c80
add_task(async function test_selection_on_entry() {
  await enter_folder(folder);
  await assert_nothing_selected();
});

add_task(async function test_selection_extension() {
  await be_in_folder(folder);

  // https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c79 (was good)
  await select_click_row(1);
  await select_control_click_row(2);
  await press_delete();
  await assert_selected_and_displayed(1);
  // https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c79 (was bad)
  await select_click_row(2);
  await select_control_click_row(1);
  await press_delete();
  await assert_selected_and_displayed(1);

  // https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c87 first bit
  await press_delete();
  await assert_selected_and_displayed(1);
});

add_task(async function test_selection_select_column() {
  await be_in_folder(folder);
  document.getElementById("selectCol").removeAttribute("hidden");
  await select_none();
  await select_column_click_row(0);
  await assert_selected_and_displayed(0);
  await select_column_click_row(0);
  await assert_nothing_selected();
  await select_column_click_row(2);
  await select_column_click_row(3);
  await select_column_click_row(4);
  // This only takes a range.
  await assert_selected_and_displayed([2, 4]); // ensures multi-message summary
  await select_column_click_row(2);
  await assert_selected_and_displayed([3, 4]); // ensures multi-message summary
  await select_column_click_row(3);
  await assert_selected_and_displayed(4);
  await select_column_click_row(4);
  await assert_nothing_selected();
});

add_task(async function test_selection_select_column_deselection() {
  await be_in_folder(folder);
  await select_none();
  await select_column_click_row(3);
  await select_column_click_row(3);
  await assert_nothing_selected();
  await right_click_on_row(7);
  await delete_via_popup();
  await assert_nothing_selected();
  document.getElementById("selectCol").setAttribute("hidden", true);
});

add_task(async function test_selection_last_message_deleted() {
  await be_in_folder(folder);
  await select_click_row(-1);
  await press_delete();
  await assert_selected_and_displayed(-1);
});

add_task(async function test_selection_persists_through_threading_changes() {
  await be_in_folder(folder);

  await make_display_unthreaded();
  let message = await select_click_row(3);
  await make_display_threaded();
  await assert_selected_and_displayed(message);
  await make_display_grouped();
  await assert_selected_and_displayed(message);
});

// https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c82 2nd half
add_task(async function test_no_selection_persists_through_threading_changes() {
  await be_in_folder(folder);

  await make_display_unthreaded();
  await select_none();
  await make_display_threaded();
  await assert_nothing_selected();
  await make_display_grouped();
  await assert_nothing_selected();
  await make_display_unthreaded();
});

add_task(async function test_selection_persists_through_folder_tab_changes() {
  let tab1 = await be_in_folder(folder);

  await select_click_row(2);

  let tab2 = await open_folder_in_new_tab(folder2);
  await wait_for_blank_content_pane();
  await assert_nothing_selected();

  await switch_tab(tab1);
  await assert_selected_and_displayed(2);

  await switch_tab(tab2);
  await assert_nothing_selected();
  await select_click_row(3);

  await switch_tab(tab1);
  await assert_selected_and_displayed(2);
  await select_shift_click_row(4); // 2-4 selected
  await assert_selected_and_displayed([2, 4]); // ensures multi-message summary

  await switch_tab(tab2);
  await assert_selected_and_displayed(3);

  close_tab(tab2);
  await assert_selected_and_displayed([2, 4]);
});

// https://bugzilla.mozilla.org/show_bug.cgi?id=474701#c87
/**
 * Verify that we scroll to new messages when we enter a folder.
 */
add_task(async function test_enter_scroll_to_new() {
  // be in the folder
  await be_in_folder(folder);
  // make sure the sort is ascending...
  window.gFolderDisplay.view.sortAscending();
  // leave the folder so that the messages get marked as read
  await enter_folder(folder.rootFolder);
  // add a new message, and make sure it is new
  await make_message_sets_in_folders([folder], [{ count: 1 }]);
  // enter the folder
  await enter_folder(folder);
  // make sure it (which must be the last row) is visible
  assert_visible(-1);
}).skip(); // Bug 1602436.

/**
 * Test that the last selected message persists through folder changes.
 */
add_task(async function test_selection_persists_through_folder_changes() {
  // be in the folder
  await be_in_folder(folder);
  // select a message
  await select_click_row(3);
  // leave and re-enter the folder
  await enter_folder(folder.rootFolder);
  await enter_folder(folder);
  // make sure it is selected and displayed
  await assert_selected_and_displayed(3);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
