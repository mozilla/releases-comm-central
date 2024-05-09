/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving middle clicks, and selections.
 */

"use strict";

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 3 : 2);

var {
  add_message_sets_to_folders,
  assert_message_pane_focused,
  assert_nothing_selected,
  assert_number_of_tabs_open,
  assert_selected,
  assert_selected_and_displayed,
  assert_selected_tab,
  assert_thread_tree_focused,
  be_in_folder,
  close_tab,
  collapse_all_threads,
  create_folder,
  create_thread,
  expand_all_threads,
  focus_thread_tree,
  get_about_3pane,
  make_display_threaded,
  make_message_sets_in_folders,
  middle_click_on_row,
  reset_context_menu_background_tabs,
  reset_open_message_behavior,
  select_click_row,
  select_none,
  select_shift_click_row,
  set_context_menu_background_tabs,
  set_open_message_behavior,
  switch_tab,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folder, threadedFolder;
var tabmail = document.getElementById("tabmail");

/**
 * The number of messages in the thread we use to test.
 */
var NUM_MESSAGES_IN_THREAD = 6;

add_setup(async function () {
  folder = await create_folder("RightClickMiddleClickA");
  threadedFolder = await create_folder("RightClickMiddleClickB");
  // We want exactly as many messages as we plan to delete, so that we can test
  // that the message window and tabs close when they run out of things to
  // to display.
  await make_message_sets_in_folders([folder], [{ count: 20 }]);
  // Create a few messages and one thread (the order is important here, as it
  // determines where the thread is placed. We want it placed right at the
  // end.)
  await make_message_sets_in_folders([threadedFolder], [{ count: 50 }]);
  const thread = create_thread(NUM_MESSAGES_IN_THREAD);
  await add_message_sets_to_folders([threadedFolder], [thread]);

  registerCleanupFunction(function () {
    folder.deleteSelf(null);
    threadedFolder.deleteSelf(null);
    reset_context_menu_background_tabs();
    reset_open_message_behavior();
  });
});

/**
 * Middle clicking should always open a message in a new tab, without affecting
 * our selection. Regardless of the user's Open message behaviour.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 * @param {number} clickedRow - Index of clicked row
 * @param {number} numMessagesToOpen - Number of tabs that should load.
 */
async function _middle_click_helper(
  shiftPressed,
  clickedRow,
  numMessagesToOpen
) {
  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const preCount =
    document.getElementById("tabmail").tabContainer.allTabs.length;
  const [tabMessage, curMessage] = await middle_click_on_row(
    clickedRow,
    shiftPressed
  );

  if (numMessagesToOpen > 1) {
    await Promise.all(
      tabmail.tabInfo
        .slice(1)
        .map(tab =>
          BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded")
        )
    );
  } else {
    await BrowserTestUtils.waitForEvent(tabMessage.chromeBrowser, "MsgLoaded");
  }

  if (!shiftPressed) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  await assert_selected_and_displayed(curMessage);
  // Check that it opens the correct amount of tabs.
  await assert_number_of_tabs_open(preCount + numMessagesToOpen);
  assert_message_pane_focused();
  tabmail.closeOtherTabs(0);
}

/**
 * Middle clicking should open a message in a tab, but not affect our selection.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_with_nothing_selected_helper(shiftPressed) {
  await be_in_folder(folder);

  await select_none();
  await assert_nothing_selected();
  // Focus the thread tree -- we're going to make sure it's focused when we
  // come back
  focus_thread_tree();

  await _middle_click_helper(shiftPressed, 1, 1);

  await assert_nothing_selected();
  assert_thread_tree_focused();
}

/**
 * One-thing selected, middle-click on something else.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_with_one_thing_selected_helper(shiftPressed) {
  await be_in_folder(folder);

  await select_click_row(0);
  await assert_selected_and_displayed(0);

  await _middle_click_helper(shiftPressed, 1, 1);
  await assert_selected_and_displayed(0);
  assert_thread_tree_focused();
}

/**
 * Many things selected, middle-click on something that is not in that
 * selection.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_with_many_things_selected_helper(shiftPressed) {
  await be_in_folder(folder);

  await select_click_row(0);
  await select_shift_click_row(5);
  await assert_selected_and_displayed([0, 5]);

  await _middle_click_helper(shiftPressed, 6, 1);

  await assert_selected_and_displayed([0, 5]);
  assert_thread_tree_focused();
}

/**
 * One thing selected, middle-click on that.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_on_existing_single_selection_helper(shiftPressed) {
  await be_in_folder(folder);

  await select_click_row(3);
  await assert_selected_and_displayed(3);

  await _middle_click_helper(shiftPressed, 3, 1);

  await assert_selected_and_displayed(3);
  assert_thread_tree_focused();
}

/**
 * Many things selected, middle-click somewhere in the selection.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_on_existing_multi_selection_helper(shiftPressed) {
  await be_in_folder(folder);

  await select_click_row(3);
  await select_shift_click_row(6);
  await assert_selected_and_displayed([3, 6]);

  await _middle_click_helper(shiftPressed, 6, 4);

  await assert_selected_and_displayed([3, 6]);
  assert_thread_tree_focused();
}

/**
 * Middle-click on the root of an expanded thread, making sure that we don't
 * jump around in the thread tree.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_on_expanded_thread_root_helper(shiftPressed) {
  await be_in_folder(threadedFolder);
  await make_display_threaded();
  await expand_all_threads();

  const folderTab = document.getElementById("tabmail").currentTabInfo;

  const tree = get_about_3pane().threadTree;
  // Note the first visible row
  const preFirstRow = tree.getFirstVisibleIndex();

  // Since reflowing a tree (eg when switching tabs) ensures that the current
  // index is brought into view, we need to set the current index so that we
  // don't scroll because of it. So click on the first visible row.
  await select_click_row(preFirstRow);

  // Middle-click on the root of the expanded thread, which is the row with
  // index (number of rows - number of messages in thread).
  const [tabMessage] = await middle_click_on_row(
    tree.view.rowCount - NUM_MESSAGES_IN_THREAD,
    shiftPressed
  );
  await Promise.all(
    tabmail.tabInfo
      .slice(1)
      .map(tab => BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded"))
  );

  if (shiftPressed) {
    await wait_for_message_display_completion();
    // Switch back to the folder tab
    await switch_tab(folderTab);
  }

  // Make sure the first visible row is still the same
  if (tree.getFirstVisibleIndex() != preFirstRow) {
    throw new Error(
      "The first visible row should have been " +
        preFirstRow +
        ", but is actually " +
        tree.getFirstVisibleIndex() +
        "."
    );
  }

  close_tab(tabMessage);
}

/**
 * Middle-click on the root of a collapsed thread, making sure that we don't
 * jump around in the thread tree.
 *
 * @param {boolean} shiftPressed - Whether the shift key has been pressed.
 */
async function _middle_click_on_collapsed_thread_root_helper(shiftPressed) {
  await be_in_folder(threadedFolder);
  await make_display_threaded();
  await collapse_all_threads();

  const folderTab = document.getElementById("tabmail").currentTabInfo;

  const tree = get_about_3pane().threadTree;
  // Note the first visible row
  const preFirstRow = tree.getFirstVisibleIndex();

  // Since reflowing a tree (eg when switching tabs) ensures that the current
  // index is brought into view, we need to set the current index so that we
  // don't scroll because of it. So click on the first visible row.
  await select_click_row(preFirstRow);

  await middle_click_on_row(tree.view.rowCount - 1, shiftPressed);
  await Promise.all(
    tabmail.tabInfo
      .slice(1)
      .map(tab => BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded"))
  );

  if (shiftPressed) {
    await wait_for_message_display_completion();
    // Switch back to the folder tab
    await switch_tab(folderTab);
  }
  // Make sure the first visible row is still the same
  if (tree.getFirstVisibleIndex() != preFirstRow) {
    throw new Error(
      "The first visible row should have been " +
        preFirstRow +
        ", but is actually " +
        tree.getFirstVisibleIndex() +
        "."
    );
  }
  tabmail.closeOtherTabs(0);
}

/**
 * Test ensure that regardless of the openMessageBehaviour the user has set as
 * their preference, middle clicking a message should open the message on a new
 * tab.
 */
add_task(
  async function test_middle_click_interactions_with_different_openMessageBehaviour_preferences() {
    // We will test middle click interactions while using shift on the next task.
    const shiftPressed = false;

    for (
      let openMessageBehaviorPref = 0;
      openMessageBehaviorPref < 3;
      openMessageBehaviorPref++
    ) {
      set_open_message_behavior(openMessageBehaviorPref);

      // No message selected
      // SKIPPED: currently failing if no message has been previously selected.
      // await _middle_click_with_nothing_selected_helper(shiftPressed);

      // one message selected
      await _middle_click_with_one_thing_selected_helper(shiftPressed);

      // Many messages selected but middle clicking a different msg
      await _middle_click_with_many_things_selected_helper(shiftPressed);

      // Middle Clicking on the only selected message
      await _middle_click_on_existing_single_selection_helper(shiftPressed);

      // Middle clicking on a multi message selection
      await _middle_click_on_existing_multi_selection_helper(shiftPressed);

      // collapsed thread root
      await _middle_click_on_collapsed_thread_root_helper(shiftPressed);

      // expanded thread root
      await _middle_click_on_expanded_thread_root_helper(shiftPressed);
    }
  }
);

/**
 * TODO Test that middle clicking while pressing the shift key loads the message
 * correctly depending on the preferense the user set for loadInBackground.
 */
