/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving right-clicks, middle clicks, and selections.
 */

"use strict";

var {
  add_sets_to_folders,
  assert_displayed,
  assert_message_not_in_view,
  assert_message_pane_focused,
  assert_messages_not_in_view,
  assert_nothing_selected,
  assert_selected,
  assert_selected_and_displayed,
  assert_selected_tab,
  assert_thread_tree_focused,
  be_in_folder,
  close_popup,
  close_tab,
  collapse_all_threads,
  create_folder,
  create_thread,
  delete_via_popup,
  expand_all_threads,
  focus_thread_tree,
  make_display_threaded,
  make_new_sets_in_folder,
  mc,
  middle_click_on_row,
  reset_context_menu_background_tabs,
  right_click_on_row,
  select_click_row,
  select_none,
  select_shift_click_row,
  set_context_menu_background_tabs,
  switch_tab,
  wait_for_message_display_completion,
  wait_for_popup_to_open,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder, threadedFolder;

/**
 * The number of messages in the thread we use to test.
 */
var NUM_MESSAGES_IN_THREAD = 6;

add_task(function setupModule(module) {
  folder = create_folder("RightClickMiddleClickA");
  threadedFolder = create_folder("RightClickMiddleClickB");
  // we want exactly as many messages as we plan to delete, so that we can test
  //  that the message window and tabs close when they run out of things to
  //  to display.
  make_new_sets_in_folder(folder, [{ count: 20 }]);
  // Create a few messages and one thread (the order is important here, as it
  // determines where the thread is placed. We want it placed right at the
  // end.)
  make_new_sets_in_folder(threadedFolder, [{ count: 50 }]);
  let thread = create_thread(NUM_MESSAGES_IN_THREAD);
  add_sets_to_folders([threadedFolder], [thread]);
});

/**
 * Make sure that a right-click when there is nothing currently selected does
 *  not cause us to display something, as well as correctly causing a transient
 *  selection to occur.
 */
add_task(async function test_right_click_with_nothing_selected() {
  be_in_folder(folder);

  select_none();
  assert_nothing_selected();

  await right_click_on_row(1);
  // Check that the popup opens.
  await wait_for_popup_to_open(mc.e("mailContext"));

  assert_selected(1);
  assert_displayed();

  await close_popup(mc, mc.e("mailContext"));
  assert_nothing_selected();
});

/**
 * Test that clicking on the column header shows the column picker.
 */
add_task(async function test_right_click_column_header_shows_col_picker() {
  be_in_folder(folder);

  // The treecolpicker element itself doesn't have an id, so we have to walk
  // down from the parent to find it.
  //  treadCols
  //   |- hbox                item 0
  //   |- treecolpicker   <-- item 1 this is the one we want
  let threadCols = mc.window.document.getElementById("threadCols");
  let treeColPicker = threadCols.querySelector("treecolpicker");
  let popup = treeColPicker.querySelector("[anonid=popup]");

  // Right click the subject column header
  // This should show the column picker popup.
  mc.rightClick(mc.e("subjectCol"));

  // Check that the popup opens.
  await wait_for_popup_to_open(popup);
  // Hide it again, we just wanted to know it was going to be shown.
  await close_popup(mc, popup);
});

/**
 * One-thing selected, right-click on something else.
 */
add_task(async function test_right_click_with_one_thing_selected() {
  be_in_folder(folder);

  select_click_row(0);
  assert_selected_and_displayed(0);

  await right_click_on_row(1);
  assert_selected(1);
  assert_displayed(0);

  await close_popup(mc, mc.e("mailContext"));
  assert_selected_and_displayed(0);
});

/**
 * Many things selected, right-click on something that is not in that selection.
 */
add_task(async function test_right_click_with_many_things_selected() {
  be_in_folder(folder);

  select_click_row(0);
  select_shift_click_row(5);
  assert_selected_and_displayed([0, 5]);

  await right_click_on_row(6);
  assert_selected(6);
  assert_displayed([0, 5]);

  await close_popup(mc, mc.e("mailContext"));
  assert_selected_and_displayed([0, 5]);
});

/**
 * One thing selected, right-click on that.
 */
add_task(async function test_right_click_on_existing_single_selection() {
  be_in_folder(folder);

  select_click_row(3);
  assert_selected_and_displayed(3);

  await right_click_on_row(3);
  assert_selected_and_displayed(3);

  await close_popup(mc, mc.e("mailContext"));
  assert_selected_and_displayed(3);
});

/**
 * Many things selected, right-click somewhere in the selection.
 */
add_task(async function test_right_click_on_existing_multi_selection() {
  be_in_folder(folder);

  select_click_row(3);
  select_shift_click_row(6);
  assert_selected_and_displayed([3, 6]);

  await right_click_on_row(5);
  assert_selected_and_displayed([3, 6]);

  await close_popup(mc, mc.e("mailContext"));
  assert_selected_and_displayed([3, 6]);
});

/**
 * Middle clicking should open a message in a tab, but not affect our selection.
 */
function _middle_click_with_nothing_selected_helper(aBackground) {
  be_in_folder(folder);

  select_none();
  assert_nothing_selected();
  let folderTab = mc.tabmail.currentTabInfo;
  // Focus the thread tree -- we're going to make sure it's focused when we
  // come back
  focus_thread_tree();
  let [tabMessage, curMessage] = middle_click_on_row(1);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    switch_tab(tabMessage);
  } else {
    wait_for_message_display_completion();
  }

  assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  assert_nothing_selected();
  assert_thread_tree_focused();
}

/**
 * One-thing selected, middle-click on something else.
 */
function _middle_click_with_one_thing_selected_helper(aBackground) {
  be_in_folder(folder);

  select_click_row(0);
  assert_selected_and_displayed(0);

  let folderTab = mc.tabmail.currentTabInfo;
  let [tabMessage, curMessage] = middle_click_on_row(1);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    switch_tab(tabMessage);
  } else {
    wait_for_message_display_completion();
  }

  assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  assert_selected_and_displayed(0);
  assert_thread_tree_focused();
}

/**
 * Many things selected, middle-click on something that is not in that
 *  selection.
 */
function _middle_click_with_many_things_selected_helper(aBackground) {
  be_in_folder(folder);

  select_click_row(0);
  select_shift_click_row(5);
  assert_selected_and_displayed([0, 5]);

  let folderTab = mc.tabmail.currentTabInfo;
  let [tabMessage, curMessage] = middle_click_on_row(1);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    switch_tab(tabMessage);
  } else {
    wait_for_message_display_completion();
  }

  assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  assert_selected_and_displayed([0, 5]);
  assert_thread_tree_focused();
}

/**
 * One thing selected, middle-click on that.
 */
function _middle_click_on_existing_single_selection_helper(aBackground) {
  be_in_folder(folder);

  select_click_row(3);
  assert_selected_and_displayed(3);

  let folderTab = mc.tabmail.currentTabInfo;
  let [tabMessage, curMessage] = middle_click_on_row(3);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    switch_tab(tabMessage);
  } else {
    wait_for_message_display_completion();
  }

  assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  assert_selected_and_displayed(3);
  assert_thread_tree_focused();
}

/**
 * Many things selected, middle-click somewhere in the selection.
 */
function _middle_click_on_existing_multi_selection_helper(aBackground) {
  be_in_folder(folder);

  select_click_row(3);
  select_shift_click_row(6);
  assert_selected_and_displayed([3, 6]);

  let folderTab = mc.tabmail.currentTabInfo;
  let [tabMessage, curMessage] = middle_click_on_row(5);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    switch_tab(tabMessage);
  } else {
    wait_for_message_display_completion();
  }

  assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  assert_selected_and_displayed([3, 6]);
  assert_thread_tree_focused();
}

/**
 * Middle-click on the root of a collapsed thread, making sure that we don't
 * jump around in the thread tree.
 */
function _middle_click_on_collapsed_thread_root_helper(aBackground) {
  be_in_folder(threadedFolder);
  make_display_threaded();
  collapse_all_threads();

  let folderTab = mc.tabmail.currentTabInfo;

  let tree = mc.threadTree;
  // Scroll to the top, then to the bottom
  tree.ensureRowIsVisible(0);
  tree.scrollByLines(mc.folderDisplay.view.dbView.rowCount);
  // Note the first visible row
  let preFirstRow = tree.getFirstVisibleRow();

  // Since reflowing a tree (eg when switching tabs) ensures that the current
  // index is brought into view, we need to set the current index so that we
  // don't scroll because of it. So click on the first visible row.
  select_click_row(preFirstRow);

  // Middle-click on the root of the collapsed thread, which is also the last
  // row
  let [tabMessage] = middle_click_on_row(
    mc.folderDisplay.view.dbView.rowCount - 1
  );

  if (!aBackground) {
    wait_for_message_display_completion();
    // Switch back to the folder tab
    switch_tab(folderTab);
  }

  // Make sure the first visible row is still the same
  if (tree.getFirstVisibleRow() != preFirstRow) {
    throw new Error(
      "The first visible row should have been " +
        preFirstRow +
        ", but is actually " +
        tree.getFirstVisibleRow() +
        "."
    );
  }

  close_tab(tabMessage);
}

/**
 * Middle-click on the root of an expanded thread, making sure that we don't
 * jump around in the thread tree.
 */
function _middle_click_on_expanded_thread_root_helper(aBackground) {
  be_in_folder(threadedFolder);
  make_display_threaded();
  expand_all_threads();

  let folderTab = mc.tabmail.currentTabInfo;

  let tree = mc.threadTree;
  // Scroll to the top, then to near (but not exactly) the bottom
  tree.ensureRowIsVisible(0);
  tree.scrollToRow(
    mc.folderDisplay.view.dbView.rowCount -
      tree.getPageLength() -
      NUM_MESSAGES_IN_THREAD / 2
  );
  // Note the first visible row
  let preFirstRow = tree.getFirstVisibleRow();

  // Since reflowing a tree (eg when switching tabs) ensures that the current
  // index is brought into view, we need to set the current index so that we
  // don't scroll because of it. So click on the first visible row.
  select_click_row(preFirstRow);

  // Middle-click on the root of the expanded thread, which is the row with
  // index (number of rows - number of messages in thread).
  let [tabMessage] = middle_click_on_row(
    mc.folderDisplay.view.dbView.rowCount - NUM_MESSAGES_IN_THREAD
  );

  if (!aBackground) {
    wait_for_message_display_completion();
    // Switch back to the folder tab
    switch_tab(folderTab);
  }

  // Make sure the first visible row is still the same
  if (tree.getFirstVisibleRow() != preFirstRow) {
    throw new Error(
      "The first visible row should have been " +
        preFirstRow +
        ", but is actually " +
        tree.getFirstVisibleRow() +
        "."
    );
  }

  close_tab(tabMessage);
}

/**
 * Generate background and foreground tests for each middle click test.
 *
 * @param aTests an array of test names
 */
var global = this;
function _generate_background_foreground_tests(aTests) {
  for (let test of aTests) {
    let helperFunc = global["_" + test + "_helper"];
    global["test_" + test + "_background"] = function() {
      set_context_menu_background_tabs(true);
      helperFunc(true);
      reset_context_menu_background_tabs();
    };
    global["test_" + test + "_foreground"] = function() {
      set_context_menu_background_tabs(false);
      helperFunc(false);
      reset_context_menu_background_tabs();
    };
  }
}

_generate_background_foreground_tests([
  "middle_click_with_nothing_selected",
  "middle_click_with_one_thing_selected",
  "middle_click_with_many_things_selected",
  "middle_click_on_existing_single_selection",
  "middle_click_on_existing_multi_selection",
  "middle_click_on_collapsed_thread_root",
  "middle_click_on_expanded_thread_root",
]);

/**
 * Right-click on something and delete it, having no selection previously.
 */
add_task(async function test_right_click_deletion_nothing_selected() {
  be_in_folder(folder);

  select_none();
  assert_selected_and_displayed();

  let delMessage = await right_click_on_row(3);
  await delete_via_popup();
  // eh, might as well make sure the deletion worked while we are here
  assert_message_not_in_view(delMessage);

  assert_selected_and_displayed();
});

/**
 * We want to make sure that the selection post-delete still includes the same
 *  message (and that it is displayed).  In order for this to be interesting,
 *  we want to make sure that we right-click delete a message above the selected
 *  message so there is a shift in row numbering.
 */
add_task(async function test_right_click_deletion_one_other_thing_selected() {
  be_in_folder(folder);

  let curMessage = select_click_row(5);

  let delMessage = await right_click_on_row(3);
  await delete_via_popup();
  assert_message_not_in_view(delMessage);

  assert_selected_and_displayed(curMessage);
});

add_task(async function test_right_click_deletion_many_other_things_selected() {
  be_in_folder(folder);

  select_click_row(4);
  let messages = select_shift_click_row(6);

  let delMessage = await right_click_on_row(2);
  await delete_via_popup();
  assert_message_not_in_view(delMessage);

  assert_selected_and_displayed(messages);
});

add_task(async function test_right_click_deletion_of_one_selected_thing() {
  be_in_folder(folder);

  let curMessage = select_click_row(2);

  await right_click_on_row(2);
  await delete_via_popup();
  assert_message_not_in_view(curMessage);

  if (!mc.folderDisplay.selectedCount) {
    throw new Error("We should have tried to select something!");
  }
});

add_task(async function test_right_click_deletion_of_many_selected_things() {
  be_in_folder(folder);

  select_click_row(2);
  let messages = select_shift_click_row(4);

  await right_click_on_row(3);
  await delete_via_popup();
  assert_messages_not_in_view(messages);

  if (!mc.folderDisplay.selectedCount) {
    throw new Error("We should have tried to select something!");
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
