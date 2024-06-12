/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the many horrors involving right-clicks and selections.
 */

"use strict";

requestLongerTimeout(AppConstants.MOZ_CODE_COVERAGE ? 2 : 1);

var {
  add_message_sets_to_folders,
  assert_displayed,
  assert_message_not_in_view,
  assert_messages_not_in_view,
  assert_nothing_selected,
  assert_selected,
  assert_selected_and_displayed,
  be_in_folder,
  close_popup,
  create_folder,
  create_thread,
  delete_via_popup,
  get_about_3pane,
  make_message_sets_in_folders,
  reset_context_menu_background_tabs,
  reset_open_message_behavior,
  right_click_on_row,
  select_click_row,
  select_none,
  select_shift_click_row,
  set_context_menu_background_tabs,
  set_open_message_behavior,
  wait_for_popup_to_open,
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
  folder = await create_folder("RightClickA");
  threadedFolder = await create_folder("RightClickB");
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
    reset_open_message_behavior();
  });
});

/**
 * Make sure that a right-click when there is nothing currently selected does
 * not cause us to display something, as well as correctly causing a transient
 * selection to occur.
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
});

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
});

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
});

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
});

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
});

add_task(async function test_right_click_deletion_many_other_things_selected() {
  await be_in_folder(folder);

  await select_click_row(4);
  const messages = await select_shift_click_row(6);

  const delMessage = await right_click_on_row(2);
  await delete_via_popup();
  assert_message_not_in_view(delMessage);

  await assert_selected_and_displayed(messages);
});

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
