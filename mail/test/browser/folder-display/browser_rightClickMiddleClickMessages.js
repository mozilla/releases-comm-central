/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving right-clicks, middle clicks, and selections.
 */

"use strict";

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 2 : 1);

var {
  add_message_sets_to_folders,
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
  get_about_3pane,
  make_display_threaded,
  make_message_sets_in_folders,
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
var tabmail = document.getElementById("tabmail");

/**
 * The number of messages in the thread we use to test.
 */
var NUM_MESSAGES_IN_THREAD = 6;

add_setup(async function () {
  folder = await create_folder("RightClickMiddleClickA");
  threadedFolder = await create_folder("RightClickMiddleClickB");
  // we want exactly as many messages as we plan to delete, so that we can test
  //  that the message window and tabs close when they run out of things to
  //  to display.
  await make_message_sets_in_folders([folder], [{ count: 20 }]);
  // Create a few messages and one thread (the order is important here, as it
  // determines where the thread is placed. We want it placed right at the
  // end.)
  await make_message_sets_in_folders([threadedFolder], [{ count: 50 }]);
  const thread = create_thread(NUM_MESSAGES_IN_THREAD);
  await add_message_sets_to_folders([threadedFolder], [thread]);

  registerCleanupFunction(function () {
    reset_context_menu_background_tabs();
  });
});

/**
 * Make sure that a right-click when there is nothing currently selected does
 *  not cause us to display something, as well as correctly causing a transient
 *  selection to occur.
 */
add_task(async function test_right_click_with_nothing_selected() {
  await be_in_folder(folder);

  await select_none();
  await assert_nothing_selected();

  await right_click_on_row(1);
  // Check that the popup opens.
  await wait_for_popup_to_open(getMailContext());

  assert_selected(1);
  await assert_displayed();

  await close_popup(window, getMailContext());
  await assert_nothing_selected();
}).skip();

/**
 * Test that clicking on the column header shows the column picker.
 */
add_task(async function test_right_click_column_header_shows_col_picker() {
  await be_in_folder(folder);

  // The treecolpicker element itself doesn't have an id, so we have to walk
  // down from the parent to find it.
  //  treadCols
  //   |- hbox                item 0
  //   |- treecolpicker   <-- item 1 this is the one we want
  const threadCols = document.getElementById("threadCols");
  const treeColPicker = threadCols.querySelector("treecolpicker");
  const popup = treeColPicker.querySelector("[anonid=popup]");

  // Right click the subject column header
  // This should show the column picker popup.
  const subjectCol = document.getElementById("subjectCol");
  EventUtils.synthesizeMouseAtCenter(
    subjectCol,
    { type: "contextmenu", button: 2 },
    subjectCol.ownerGlobal
  );

  // Check that the popup opens.
  await wait_for_popup_to_open(popup);
  // Hide it again, we just wanted to know it was going to be shown.
  await close_popup(window, popup);
}).skip();

/**
 * One-thing selected, right-click on something else.
 */
add_task(async function test_right_click_with_one_thing_selected() {
  await be_in_folder(folder);

  await select_click_row(0);
  await assert_selected_and_displayed(0);

  await right_click_on_row(1);
  assert_selected(1);
  await assert_displayed(0);

  await close_popup(window, getMailContext());
  await assert_selected_and_displayed(0);
}).skip();

/**
 * Many things selected, right-click on something that is not in that selection.
 */
add_task(async function test_right_click_with_many_things_selected() {
  await be_in_folder(folder);

  await select_click_row(0);
  await select_shift_click_row(5);
  await assert_selected_and_displayed([0, 5]);

  await right_click_on_row(6);
  assert_selected(6);
  await assert_displayed([0, 5]);

  await close_popup(window, getMailContext());
  await assert_selected_and_displayed([0, 5]);
}).skip();

/**
 * One thing selected, right-click on that.
 */
add_task(async function test_right_click_on_existing_single_selection() {
  await be_in_folder(folder);

  await select_click_row(3);
  await assert_selected_and_displayed(3);

  await right_click_on_row(3);
  await assert_selected_and_displayed(3);

  await close_popup(window, getMailContext());
  await assert_selected_and_displayed(3);
});

/**
 * Many things selected, right-click somewhere in the selection.
 */
add_task(async function test_right_click_on_existing_multi_selection() {
  await be_in_folder(folder);

  await select_click_row(3);
  await select_shift_click_row(6);
  await assert_selected_and_displayed([3, 6]);

  await right_click_on_row(5);
  await assert_selected_and_displayed([3, 6]);

  await close_popup(window, getMailContext());
  await assert_selected_and_displayed([3, 6]);
});

/**
 * Middle clicking should open a message in a tab, but not affect our selection.
 */
async function _middle_click_with_nothing_selected_helper(aBackground) {
  await be_in_folder(folder);

  await select_none();
  await assert_nothing_selected();
  const folderTab = document.getElementById("tabmail").currentTabInfo;
  // Focus the thread tree -- we're going to make sure it's focused when we
  // come back
  focus_thread_tree();
  const [tabMessage, curMessage] = await middle_click_on_row(1);
  if (aBackground) {
    await BrowserTestUtils.waitForEvent(tabMessage.chromeBrowser, "MsgLoaded");
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  await assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  await assert_nothing_selected();
  assert_thread_tree_focused();
}

add_task(async function test_middle_click_with_nothing_selected_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_with_nothing_selected_helper(false);
});

add_task(async function test_middle_click_with_nothing_selected_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_with_nothing_selected_helper(true);
});

/**
 * One-thing selected, middle-click on something else.
 */
async function _middle_click_with_one_thing_selected_helper(aBackground) {
  await be_in_folder(folder);

  await select_click_row(0);
  await assert_selected_and_displayed(0);

  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const [tabMessage, curMessage] = await middle_click_on_row(1);
  if (aBackground) {
    await BrowserTestUtils.waitForEvent(tabMessage.chromeBrowser, "MsgLoaded");
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  await assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  await assert_selected_and_displayed(0);
  assert_thread_tree_focused();
}

add_task(async function test_middle_click_with_one_thing_selected_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_with_one_thing_selected_helper(false);
});

add_task(async function test_middle_click_with_one_thing_selected_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_with_one_thing_selected_helper(true);
});

/**
 * Many things selected, middle-click on something that is not in that
 *  selection.
 */
async function _middle_click_with_many_things_selected_helper(aBackground) {
  await be_in_folder(folder);

  await select_click_row(0);
  await select_shift_click_row(5);
  await assert_selected_and_displayed([0, 5]);

  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const [tabMessage] = await middle_click_on_row(6);
  if (aBackground) {
    await BrowserTestUtils.waitForEvent(tabMessage.chromeBrowser, "MsgLoaded");
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  assert_message_pane_focused();
  tabmail.closeOtherTabs(0);

  await assert_selected_and_displayed([0, 5]);
  assert_thread_tree_focused();
}

add_task(async function test_middle_click_with_many_things_selected_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_with_many_things_selected_helper(false);
});

add_task(async function test_middle_click_with_many_things_selected_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_with_many_things_selected_helper(true);
});

/**
 * One thing selected, middle-click on that.
 */
async function _middle_click_on_existing_single_selection_helper(aBackground) {
  await be_in_folder(folder);

  await select_click_row(3);
  await assert_selected_and_displayed(3);

  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const [tabMessage, curMessage] = await middle_click_on_row(3);
  if (aBackground) {
    await BrowserTestUtils.waitForEvent(tabMessage.chromeBrowser, "MsgLoaded");
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  await assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  close_tab(tabMessage);

  await assert_selected_and_displayed(3);
  assert_thread_tree_focused();
}

add_task(async function test_middle_click_on_existing_single_selection_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_on_existing_single_selection_helper(false);
});

add_task(async function test_middle_click_on_existing_single_selection_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_on_existing_single_selection_helper(true);
});

/**
 * Many things selected, middle-click somewhere in the selection.
 */
async function _middle_click_on_existing_multi_selection_helper(aBackground) {
  await be_in_folder(folder);

  await select_click_row(3);
  await select_shift_click_row(6);
  await assert_selected_and_displayed([3, 6]);

  const folderTab = document.getElementById("tabmail").currentTabInfo;
  const [tabMessage, curMessage] = await middle_click_on_row(6);
  await Promise.all(
    tabmail.tabInfo
      .slice(1)
      .map(tab => BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded"))
  );
  if (aBackground) {
    // Make sure we haven't switched to the new tab.
    assert_selected_tab(folderTab);
    // Now switch to the new tab and check
    await switch_tab(tabMessage);
  } else {
    await wait_for_message_display_completion();
  }

  await assert_selected_and_displayed(curMessage);
  assert_message_pane_focused();
  tabmail.closeOtherTabs(0);

  await assert_selected_and_displayed([3, 6]);
  assert_thread_tree_focused();
}

add_task(async function test_middle_click_on_existing_multi_selection_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_on_existing_multi_selection_helper(false);
});

add_task(async function test_middle_click_on_existing_multi_selection_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_on_existing_multi_selection_helper(true);
});

/**
 * Middle-click on the root of a collapsed thread, making sure that we don't
 * jump around in the thread tree.
 */
async function _middle_click_on_collapsed_thread_root_helper(aBackground) {
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

  await middle_click_on_row(get_about_3pane().gDBView.rowCount - 1);
  await Promise.all(
    tabmail.tabInfo
      .slice(1)
      .map(tab => BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded"))
  );

  if (!aBackground) {
    await wait_for_message_display_completion();
    // Switch back to the folder tab
    await switch_tab(folderTab);
  }
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

add_task(async function test_middle_click_on_collapsed_thread_root_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_on_collapsed_thread_root_helper(false);
});

add_task(async function test_middle_click_on_collapsed_thread_root_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_on_collapsed_thread_root_helper(true);
});

/**
 * Middle-click on the root of an expanded thread, making sure that we don't
 * jump around in the thread tree.
 */
async function _middle_click_on_expanded_thread_root_helper(aBackground) {
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
    tree.view.rowCount - NUM_MESSAGES_IN_THREAD
  );
  await Promise.all(
    tabmail.tabInfo
      .slice(1)
      .map(tab => BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded"))
  );

  if (!aBackground) {
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

add_task(async function test_middle_click_on_expanded_thread_root_fg() {
  set_context_menu_background_tabs(false);
  await _middle_click_on_expanded_thread_root_helper(false);
});

add_task(async function test_middle_click_on_expanded_thread_root_bg() {
  set_context_menu_background_tabs(true);
  await _middle_click_on_expanded_thread_root_helper(true);
});

/**
 * Right-click on something and delete it, having no selection previously.
 */
add_task(async function test_right_click_deletion_nothing_selected() {
  await be_in_folder(folder);

  await select_none();
  await assert_selected_and_displayed();

  const delMessage = await right_click_on_row(3);
  await delete_via_popup();
  // eh, might as well make sure the deletion worked while we are here
  assert_message_not_in_view(delMessage);

  await assert_selected_and_displayed();
}).skip();

/**
 * We want to make sure that the selection post-delete still includes the same
 *  message (and that it is displayed).  In order for this to be interesting,
 *  we want to make sure that we right-click delete a message above the selected
 *  message so there is a shift in row numbering.
 */
add_task(async function test_right_click_deletion_one_other_thing_selected() {
  await be_in_folder(folder);

  const curMessage = await select_click_row(5);

  const delMessage = await right_click_on_row(3);
  await delete_via_popup();
  assert_message_not_in_view(delMessage);

  await assert_selected_and_displayed(curMessage);
}).skip();

add_task(async function test_right_click_deletion_many_other_things_selected() {
  await be_in_folder(folder);

  await select_click_row(4);
  const messages = await select_shift_click_row(6);

  const delMessage = await right_click_on_row(2);
  await delete_via_popup();
  assert_message_not_in_view(delMessage);

  await assert_selected_and_displayed(messages);
}).skip();

add_task(async function test_right_click_deletion_of_one_selected_thing() {
  await be_in_folder(folder);

  const curMessage = await select_click_row(2);

  await right_click_on_row(2);
  await delete_via_popup();
  assert_message_not_in_view(curMessage);

  Assert.notEqual(
    get_about_3pane().gDBView.selection.count,
    0,
    "We should have tried to select something!"
  );
});

add_task(async function test_right_click_deletion_of_many_selected_things() {
  await be_in_folder(folder);

  await select_click_row(2);
  const messages = await select_shift_click_row(4);

  await right_click_on_row(3);
  await delete_via_popup();
  assert_messages_not_in_view(messages);

  Assert.notEqual(
    get_about_3pane().gDBView.selection.count,
    0,
    "We should have tried to select something!"
  );
});
