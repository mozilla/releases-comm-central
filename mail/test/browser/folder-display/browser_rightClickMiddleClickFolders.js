/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving right-clicks, middle clicks, and
 * selections... on folders!
 */

"use strict";

requestLongerTimeout(2);

var {
  assert_folder_displayed,
  assert_folder_selected,
  assert_folder_selected_and_displayed,
  assert_folders_selected_and_displayed,
  assert_selected_tab,
  close_popup,
  close_tab,
  create_folder,
  make_message_sets_in_folders,
  middle_click_on_folder,
  reset_context_menu_background_tabs,
  right_click_on_folder,
  select_click_folder,
  select_shift_click_folder,
  set_context_menu_background_tabs,
  switch_tab,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folderA, folderB, folderC;

add_setup(async function () {
  folderA = await create_folder("RightClickMiddleClickFoldersA");
  folderB = await create_folder("RightClickMiddleClickFoldersB");
  folderC = await create_folder("RightClickMiddleClickFoldersC");

  // We aren't really interested in the messages the folders contain, but just
  // for appearance's sake, add a message to each folder

  await make_message_sets_in_folders([folderA], [{ count: 1 }]);
  await make_message_sets_in_folders([folderB], [{ count: 1 }]);
  await make_message_sets_in_folders([folderC], [{ count: 1 }]);
});

/**
 * One-thing selected, right-click on something else.
 */
add_task(async function test_right_click_folder_with_one_thing_selected() {
  select_click_folder(folderB);
  assert_folder_selected_and_displayed(folderB);

  await right_click_on_folder(folderA);
  assert_folder_selected(folderA);
  assert_folder_displayed(folderB);

  await close_popup(window, getFoldersContext());
  assert_folder_selected_and_displayed(folderB);
}).skip();

/**
 * Many things selected, right-click on something that is not in that selection.
 */
add_task(async function test_right_click_folder_with_many_things_selected() {
  select_click_folder(folderA);
  await select_shift_click_folder(folderB);
  assert_folders_selected_and_displayed(folderA, folderB);

  await right_click_on_folder(folderC);
  assert_folder_selected(folderC);
  assert_folder_displayed(folderA);

  await close_popup(window, getFoldersContext());
  assert_folders_selected_and_displayed(folderA, folderB);
}).skip();

/**
 * One thing selected, right-click on that.
 */
add_task(async function test_right_click_folder_on_existing_single_selection() {
  select_click_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  await right_click_on_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  await close_popup(window, getFoldersContext());
  assert_folders_selected_and_displayed(folderA);
});

/**
 * Many things selected, right-click somewhere in the selection.
 */
add_task(async function test_right_click_folder_on_existing_multi_selection() {
  select_click_folder(folderB);
  await select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  await right_click_on_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  await close_popup(window, getFoldersContext());
  assert_folders_selected_and_displayed(folderB, folderC);
}).skip();

/**
 * One-thing selected, middle-click on something else.
 */
async function _middle_click_folder_with_one_thing_selected_helper(
  aBackground
) {
  select_click_folder(folderB);
  assert_folder_selected_and_displayed(folderB);

  const originalTab = document.getElementById("tabmail").currentTabInfo;
  const [newTab] = middle_click_on_folder(folderA);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    await switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderA);
  close_tab(newTab);

  assert_folder_selected_and_displayed(folderB);
}

async function _middle_click_folder_with_many_things_selected_helper(
  aBackground
) {
  select_click_folder(folderB);
  await select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderB, folderC);

  const originalTab = document.getElementById("tabmail").currentTabInfo;
  const [newTab] = middle_click_on_folder(folderA);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    await switch_tab(newTab);
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
async function _middle_click_folder_on_existing_single_selection_helper(
  aBackground
) {
  select_click_folder(folderC);
  assert_folder_selected_and_displayed(folderC);

  const originalTab = document.getElementById("tabmail").currentTabInfo;
  const [newTab] = middle_click_on_folder(folderC);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    await switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderC);
  close_tab(newTab);

  assert_folder_selected_and_displayed(folderC);
}

/**
 * Many things selected, middle-click somewhere in the selection.
 */
async function _middle_click_on_existing_multi_selection_helper(aBackground) {
  select_click_folder(folderA);
  await select_shift_click_folder(folderC);
  assert_folders_selected_and_displayed(folderA, folderB, folderC);

  const originalTab = document.getElementById("tabmail").currentTabInfo;
  const [newTab] = middle_click_on_folder(folderB);
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check
    await switch_tab(newTab);
  }
  assert_folder_selected_and_displayed(folderB);
  close_tab(newTab);

  // XXX Again, this is wrong. We're still giving it a pass because selecting
  // folderA through folderC is currently the same as selecting folderA.
  assert_folder_selected_and_displayed(folderA);
}

/**
 * Middle click on target folder when a folder is selected and displayed.
 */
async function middle_click_helper(selectedFolder, targetFolder, shiftPressed) {
  select_click_folder(selectedFolder);
  assert_folders_selected_and_displayed(selectedFolder);
  const originalTab = document.getElementById("tabmail").currentTabInfo;

  const [newTab] = middle_click_on_folder(targetFolder, shiftPressed);

  if (shiftPressed) {
    assert_selected_tab(newTab);
  } else {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(originalTab);
    // Now switch to the new tab and check the tab was switched.
    await switch_tab(newTab);
  }
  close_tab(newTab);
  assert_folders_selected_and_displayed(selectedFolder);
}

add_task(async function middle_click_tests() {
  // Set loadInBackground preference to true so that new tabs open without
  // changing focus unless shift is pressed.
  set_context_menu_background_tabs(true);

  select_click_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  // middle clicks while pressing shift
  await middle_click_helper(folderA, folderA, true);
  await middle_click_helper(folderA, folderB, true);

  // middle clicks without pressing shift
  await middle_click_helper(folderA, folderA, false);
  await middle_click_helper(folderA, folderB, false);
});

/**
 * Generate background and foreground tests for each middle click test.
 *
 * @param aTests an array of test names
 */
var global = this;
function _generate_background_foreground_tests(aTests) {
  for (const test of aTests) {
    const helperFunc = global["_" + test + "_helper"];
    global["test_" + test + "_background"] = async function () {
      set_context_menu_background_tabs(true);
      await helperFunc(true);
      reset_context_menu_background_tabs();
    };
    global["test_" + test + "_foreground"] = async function () {
      set_context_menu_background_tabs(false);
      await helperFunc(false);
      reset_context_menu_background_tabs();
    };
    add_task(global[`test_${test}_background`]).skip();
    add_task(global[`test_${test}_foreground`]).skip();
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
