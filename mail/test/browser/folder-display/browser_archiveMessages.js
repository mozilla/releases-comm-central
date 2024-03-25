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
  select_click_row,
  select_none,
  select_shift_click_row,
  toggle_thread_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
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

  await select_none();
  await assert_nothing_selected();

  await expand_all_threads();

  /* Select the first (expanded) thread */
  const root = await select_click_row(0);
  await assert_selected_and_displayed(root);

  /* Get a grip on the first and the second sub-message */
  const m1 = await select_click_row(1);
  const m2 = await select_click_row(2);
  await select_click_row(0);
  await assert_selected_and_displayed(root);

  /* The root message is selected, we archive the first sub-message */
  await archive_messages([m1]);

  /* This message is gone and the root message is still selected **/
  assert_message_not_in_view([m1]);
  await assert_selected_and_displayed(root);

  /* Now, archiving messages under a collapsed thread */
  await toggle_thread_row(0);
  await archive_messages([m2]);

  /* Selection didn't change */
  assert_selected(root);

  /* And the message is gone */
  await toggle_thread_row(0);
  assert_message_not_in_view([m2]);

  /* Both threads are collapsed */
  await toggle_thread_row(0);

  /* Get a grip on the second thread */
  const root2 = await select_click_row(1);
  await select_click_row(0);
  assert_selected(root);

  /* Archive the first thread, now the second thread should be selected */
  Assert.ok(
    Services.prefs.getBoolPref("mail.operate_on_msgs_in_collapsed_threads")
  );
  Assert.greater(get_about_3pane().gDBView.getSelectedMsgHdrs().length, 1);
  await archive_messages(get_about_3pane().gDBView.getSelectedMsgHdrs());
  await select_click_row(0); // TODO This should be unnecessary.
  assert_selected(root2);

  /* We only have the first thread left */
  await toggle_thread_row(0);
  await assert_selected_and_displayed(root2);
  await expand_all_threads();

  /* Archive the head of the thread, check that it still works fine */
  const child1 = await select_click_row(1);
  await select_click_row(0);
  await archive_messages([root2]);
  await select_click_row(0); // TODO This should be unnecessary.
  await assert_selected_and_displayed(child1);

  /* Test archiving a partial selection */
  const child2 = await select_click_row(1);
  const child3 = await select_click_row(2);
  await select_click_row(3);

  await select_shift_click_row(2);
  await select_shift_click_row(1);
  await select_shift_click_row(0);

  await archive_messages([child1, child3]);
  assert_message_not_in_view([child1, child3]);
  await select_click_row(0); // TODO This should be unnecessary.
  await assert_selected_and_displayed(child2);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
