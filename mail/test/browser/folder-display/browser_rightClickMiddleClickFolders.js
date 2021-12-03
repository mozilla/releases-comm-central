/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving right-clicks, middle clicks, and
 * selections... on folders!
 */

"use strict";

var {
  assert_folder_displayed,
  assert_folder_selected,
  assert_folder_selected_and_displayed,
  assert_folders_selected_and_displayed,
  assert_no_folders_selected,
  assert_selected_tab,
  be_in_folder,
  close_popup,
  close_tab,
  create_folder,
  make_new_sets_in_folder,
  mc,
  middle_click_on_folder,
  reset_context_menu_background_tabs,
  right_click_on_folder,
  select_click_folder,
  select_no_folders,
  select_shift_click_folder,
  set_context_menu_background_tabs,
  switch_tab,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folderA, folderB, folderC;

add_task(function setupModule(module) {
  folderA = create_folder("RightClickMiddleClickFoldersA");
  folderB = create_folder("RightClickMiddleClickFoldersB");
  folderC = create_folder("RightClickMiddleClickFoldersC");

  // We aren't really interested in the messages the folders contain, but just
  // for appearance's sake, add a message to each folder

  make_new_sets_in_folder(folderA, [{ count: 1 }]);
  make_new_sets_in_folder(folderB, [{ count: 1 }]);
  make_new_sets_in_folder(folderC, [{ count: 1 }]);
});

/**
 * Make sure that a right-click when there is nothing currently selected does
 *  not cause us to display something, as well as correctly causing a transient
 *  selection to occur.
 */
add_task(async function test_right_click_folder_with_nothing_selected() {
  // This should cause folderA to be displayed
  be_in_folder(folderA);

  select_no_folders();
  assert_no_folders_selected();

  right_click_on_folder(folderB);
  assert_folder_selected(folderB);
  // The displayed folder shouldn't change
  assert_folder_displayed(folderA);

  await close_popup(mc, mc.e("folderPaneContext"));
  assert_no_folders_selected();
});

/**
 * One-thing selected, right-click on something else.
 */
add_task(async function test_right_click_folder_with_one_thing_selected() {
  select_click_folder(folderB);
  assert_folder_selected_and_displayed(folderB);

  right_click_on_folder(folderA);
  assert_folder_selected(folderA);
  assert_folder_displayed(folderB);

  await close_popup(mc, mc.e("folderPaneContext"));
  assert_folder_selected_and_displayed(folderB);
});

/**
 * Many things selected, right-click on something that is not in that selection.
 */
add_task(async function test_right_click_folder_with_many_things_selected() {
  select_click_folder(folderA);
  select_shift_click_folder(folderB);
  assert_folders_selected_and_displayed(folderA, folderB);

  right_click_on_folder(folderC);
  assert_folder_selected(folderC);
  assert_folder_displayed(folderA);

  await close_popup(mc, mc.e("folderPaneContext"));
  assert_folders_selected_and_displayed(folderA, folderB);
});

/**
 * One thing selected, right-click on that.
 */
add_task(async function test_right_click_folder_on_existing_single_selection() {
  select_click_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  right_click_on_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  await close_popup(mc, mc.e("folderPaneContext"));
  assert_folders_selected_and_displayed(folderA);
});

/**
 * Many things selected, right-click somewhere in the selection.
 */
add_task(async function test_right_click_folder_on_existing_multi_selection() {
  select_click_folder(folderB);
  select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  right_click_on_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  await close_popup(mc, mc.e("folderPaneContext"));
  assert_folders_selected_and_displayed(folderB, folderC);
});

/**
 * Middle clicking should open a message in a tab, but not affect our selection.
 */
function _middle_click_folder_with_nothing_selected_helper(aBackground) {
  // This should cause folderA to be displayed
  be_in_folder(folderA);

  select_no_folders();
  assert_no_folders_selected();

  let originalTab = mc.tabmail.currentTabInfo;
  let [newTab] = middle_click_on_folder(folderA);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderA);
  close_tab(newTab);

  // XXX This is wrong, we shouldn't have anything selected. Since we don't
  // have a special state for nothing selected, we're giving this a pass for
  // now.
  assert_folder_selected_and_displayed(folderA);
}

/**
 * One-thing selected, middle-click on something else.
 */
function _middle_click_folder_with_one_thing_selected_helper(aBackground) {
  select_click_folder(folderB);
  assert_folder_selected_and_displayed(folderB);

  let originalTab = mc.tabmail.currentTabInfo;
  let [newTab] = middle_click_on_folder(folderA);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderA);
  close_tab(newTab);

  assert_folder_selected_and_displayed(folderB);
}

function _middle_click_folder_with_many_things_selected_helper(aBackground) {
  select_click_folder(folderB);
  select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  let originalTab = mc.tabmail.currentTabInfo;
  let [newTab] = middle_click_on_folder(folderA);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderA);
  close_tab(newTab);

  // XXX Again, this is wrong. We're still giving it a pass because selecting
  // both folderB and folderC is currently the same as selecting folderB.
  assert_folder_selected_and_displayed(folderB);
}

/**
 * One thing selected, middle-click on that.
 */
function _middle_click_folder_on_existing_single_selection_helper(aBackground) {
  select_click_folder(folderC);
  assert_folder_selected_and_displayed(folderC);

  let originalTab = mc.tabmail.currentTabInfo;
  let [newTab] = middle_click_on_folder(folderC);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderC);
  close_tab(newTab);

  assert_folder_selected_and_displayed(folderC);
}

/**
 * Many things selected, middle-click somewhere in the selection.
 */
function _middle_click_on_existing_multi_selection_helper(aBackground) {
  select_click_folder(folderA);
  select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderA, folderB, folderC);

  let originalTab = mc.tabmail.currentTabInfo;
  let [newTab] = middle_click_on_folder(folderB);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderB);
  close_tab(newTab);

  // XXX Again, this is wrong. We're still giving it a pass because selecting
  // folderA through folderC is currently the same as selecting folderA.
  assert_folder_selected_and_displayed(folderA);
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
    add_task(global[`test_${test}_background`]);
    add_task(global[`test_${test}_foreground`]);
  }
}

_generate_background_foreground_tests([
  "middle_click_folder_with_nothing_selected",
  "middle_click_folder_with_one_thing_selected",
  "middle_click_folder_with_many_things_selected",
  "middle_click_folder_on_existing_single_selection",
]);

add_task(() => {
  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
