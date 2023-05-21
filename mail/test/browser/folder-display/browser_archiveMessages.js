/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  add_message_sets_to_folders,
  archive_messages,
  assert_message_not_in_view,
  assert_nothing_selected,
  assert_selected,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_thread,
  expand_all_threads,
  get_about_3pane,
  make_display_threaded,
  mc,
  select_click_row,
  select_none,
  select_shift_click_row,
  toggle_thread_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;

/**
 * The number of messages in the thread we use to test.
 */
var NUM_MESSAGES_IN_THREAD = 6;

add_setup(async function () {
  folder = await create_folder("ThreadedMessages");
  let thread = create_thread(NUM_MESSAGES_IN_THREAD);
  await add_message_sets_to_folders([folder], [thread]);
  thread = create_thread(NUM_MESSAGES_IN_THREAD);
  await add_message_sets_to_folders([folder], [thread]);
});

/**
 * Test archiving messages that are not currently selected.
 */
add_task(async function test_batch_archiver() {
  await be_in_folder(folder);

  select_none();
  assert_nothing_selected();

  expand_all_threads();

  /* Select the first (expanded) thread */
  let root = select_click_row(0);
  assert_selected_and_displayed(root);

  /* Get a grip on the first and the second sub-message */
  let m1 = select_click_row(1);
  let m2 = select_click_row(2);
  select_click_row(0);
  assert_selected_and_displayed(root);

  /* The root message is selected, we archive the first sub-message */
  archive_messages([m1]);

  /* This message is gone and the root message is still selected **/
  assert_message_not_in_view([m1]);
  assert_selected_and_displayed(root);

  /* Now, archiving messages under a collapsed thread */
  toggle_thread_row(0);
  archive_messages([m2]);

  /* Selection didn't change */
  assert_selected(root);

  /* And the message is gone */
  toggle_thread_row(0);
  assert_message_not_in_view([m2]);

  /* Both threads are collapsed */
  toggle_thread_row(0);

  /* Get a grip on the second thread */
  let root2 = select_click_row(1);
  select_click_row(0);
  assert_selected(root);

  /* Archive the first thread, now the second thread should be selected */
  Assert.ok(
    Services.prefs.getBoolPref("mail.operate_on_msgs_in_collapsed_threads")
  );
  Assert.greater(get_about_3pane().gDBView.getSelectedMsgHdrs().length, 1);
  archive_messages(get_about_3pane().gDBView.getSelectedMsgHdrs());
  select_click_row(0); // TODO This should be unnecessary.
  assert_selected(root2);

  /* We only have the first thread left */
  toggle_thread_row(0);
  assert_selected_and_displayed(root2);
  expand_all_threads();

  /* Archive the head of the thread, check that it still works fine */
  let child1 = select_click_row(1);
  select_click_row(0);
  archive_messages([root2]);
  select_click_row(0); // TODO This should be unnecessary.
  assert_selected_and_displayed(child1);

  /* Test archiving a partial selection */
  let child2 = select_click_row(1);
  let child3 = select_click_row(2);
  select_click_row(3);

  select_shift_click_row(2);
  select_shift_click_row(1);
  select_shift_click_row(0);

  archive_messages([child1, child3]);
  assert_message_not_in_view([child1, child3]);
  select_click_row(0); // TODO This should be unnecessary.
  assert_selected_and_displayed(child2);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
