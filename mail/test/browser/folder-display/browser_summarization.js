/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that summarization happens at the right time, that it clears itself at
 *  the right time, that it waits for selection stability when recently
 *  summarized, and that summarization does not break under tabbing.
 *
 * Because most of the legwork is done automatically by
 *  test-folder-display-helpers, the more basic tests may look like general
 *  selection / tabbing tests, but are intended to specifically exercise the
 *  summarization logic and edge cases.  (Although general selection tests and
 *  tab tests may do the same thing too...)
 *
 * Things we don't test but should:
 * - The difference between thread summary and multi-message summary.
 */

"use strict";

var { ensure_card_exists, ensure_no_card_exists } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/AddressBookHelpers.sys.mjs"
);
var {
  add_message_sets_to_folders,
  assert_collapsed,
  assert_expanded,
  assert_messages_summarized,
  assert_message_not_in_view,
  assert_nothing_selected,
  assert_selected,
  assert_selected_and_displayed,
  assert_summary_contains_N_elts,
  be_in_folder,
  close_tab,
  collapse_all_threads,
  create_folder,
  create_thread,
  create_virtual_folder,
  make_display_threaded,
  make_display_unthreaded,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  plan_to_wait_for_folder_events,
  select_click_row,
  select_control_click_row,
  select_none,
  select_shift_click_row,
  switch_tab,
  toggle_thread_row,
  wait_for_blank_content_pane,
  wait_for_folder_events,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folder;
var thread1, thread2, msg1, msg2;

add_setup(async function () {
  // Make sure the whole test starts with an unthreaded view in all folders.
  Services.prefs.setIntPref("mailnews.default_view_flags", 0);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mailnews.default_view_flags");
  });

  folder = await create_folder("SummarizationA");
  thread1 = create_thread(10);
  msg1 = create_thread(1);
  thread2 = create_thread(10);
  msg2 = create_thread(1);
  await add_message_sets_to_folders([folder], [thread1, msg1, thread2, msg2]);
});

add_task(async function test_basic_summarization() {
  await be_in_folder(folder);

  // - make sure we get a summary
  await select_click_row(0);
  await select_shift_click_row(5);
  // this will verify a multi-message display is happening
  await assert_selected_and_displayed([0, 5]);
});

add_task(async function test_summarization_goes_away() {
  await select_none();
  await assert_nothing_selected();
});

/**
 * Verify that we update summarization when switching amongst tabs.
 */
add_task(async function test_folder_tabs_update_correctly() {
  // tab with summary
  const tabA = await be_in_folder(folder);
  await select_click_row(0);
  await select_control_click_row(2);
  await assert_selected_and_displayed(0, 2);

  // tab with nothing
  const tabB = await open_folder_in_new_tab(folder);
  await wait_for_blank_content_pane();
  await assert_nothing_selected();

  // correct changes, none <=> summary
  await switch_tab(tabA);
  await assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  await assert_nothing_selected();

  // correct changes, one <=> summary
  await select_click_row(0);
  await assert_selected_and_displayed(0);
  await switch_tab(tabA);
  await assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  await assert_selected_and_displayed(0);

  // correct changes, summary <=> summary
  await select_shift_click_row(3);
  await assert_selected_and_displayed([0, 3]);
  await switch_tab(tabA);
  await assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  await assert_selected_and_displayed([0, 3]);

  // closing tab returns state correctly...
  close_tab(tabB);
  await assert_selected_and_displayed(0, 2);
});

add_task(async function test_message_tabs_update_correctly() {
  const tabFolder = await be_in_folder(folder);
  const message = await select_click_row(0);
  await assert_selected_and_displayed(0);

  const tabMessage = await open_selected_message_in_new_tab();
  await assert_selected_and_displayed(message);

  await switch_tab(tabFolder);
  await select_shift_click_row(2);
  await assert_selected_and_displayed([0, 2]);

  await switch_tab(tabMessage);
  await assert_selected_and_displayed(message);

  await switch_tab(tabFolder);
  await assert_selected_and_displayed([0, 2]);

  close_tab(tabMessage);
});

/**
 * Test the stabilization logic by making the stabilization interval absurd and
 *  then manually clearing things up.
 */
add_task(async function test_selection_stabilization_logic() {
  // make sure all summarization has run to completion.
  await new Promise(resolve => setTimeout(resolve));
  // does not summarize anything, does not affect timer
  await select_click_row(0);
  // does summarize things.  timer will be tick tick ticking!
  await select_shift_click_row(1);
  // verify that things were summarized...
  await assert_selected_and_displayed([0, 1]);
  // save the set of messages so we can verify the summary sticks to this.
  const messages = window.gFolderDisplay.selectedMessages;

  // make sure the

  // this will not summarize!
  await select_shift_click_row(2, window, true);
  // verify that our summary is still just 0 and 1.
  await assert_messages_summarized(window, messages);

  // - pretend the timer fired.
  // we need to de-schedule the timer, but do not need to clear the variable
  //  because it will just get overwritten anyways
  window.clearTimeout(window.messageDisplay._summaryStabilityTimeout);
  window.messageDisplay._showSummary(true);

  // - the summary should now be up-to-date
  await assert_selected_and_displayed([0, 2]);
});

add_task(async function test_summarization_thread_detection() {
  await select_none();
  await assert_nothing_selected();
  await make_display_threaded();
  await select_click_row(0);
  await select_shift_click_row(9);
  const messages = window.gFolderDisplay.selectedMessages;
  await toggle_thread_row(0);
  await assert_messages_summarized(window, messages);
  // count the number of messages represented
  assert_summary_contains_N_elts("#messageList > li", 10);
  await select_shift_click_row(1);
  // this should have shifted to the multi-message view
  assert_summary_contains_N_elts(".item-header > .date", 0);
  assert_summary_contains_N_elts(".item-header > .subject", 2);
  await select_none();
  await assert_nothing_selected();
  await select_click_row(1); // select a single message
  await select_shift_click_row(2); // add a thread
  assert_summary_contains_N_elts(".item-header > .date", 0);
  assert_summary_contains_N_elts(".item-header > .subject", 2);
});

/**
 * If you are looking at a message that becomes part of a thread because of the
 *  arrival of a new message, expand the thread so you do not have the message
 *  turn into a summary beneath your feet.
 *
 * There are really two cases here:
 * - The thread gets moved because its sorted position changes.
 * - The thread does not move.
 */
add_task(async function test_new_thread_that_was_not_summarized_expands() {
  await be_in_folder(folder);
  await make_display_threaded();
  // - create the base messages
  const [willMoveMsg, willNotMoveMsg] = await make_message_sets_in_folders(
    [folder],
    [{ count: 1 }, { count: 1 }]
  );

  // - do the non-move case
  // XXX actually, this still gets treated as a move. I don't know why...
  // select it
  await select_click_row(willNotMoveMsg);
  await assert_selected_and_displayed(willNotMoveMsg);

  // give it a friend...
  await make_message_sets_in_folders(
    [folder],
    [{ count: 1, inReplyTo: willNotMoveMsg }]
  );
  assert_expanded(willNotMoveMsg);
  await assert_selected_and_displayed(willNotMoveMsg);

  // - do the move case
  await select_click_row(willMoveMsg);
  await assert_selected_and_displayed(willMoveMsg);

  // give it a friend...
  await make_message_sets_in_folders(
    [folder],
    [{ count: 1, inReplyTo: willMoveMsg }]
  );
  assert_expanded(willMoveMsg);
  await assert_selected_and_displayed(willMoveMsg);
});

/**
 * Selecting an existing (and collapsed) thread, then add a message and make
 *  sure the summary updates.
 */
add_task(
  async function test_summary_updates_when_new_message_added_to_collapsed_thread() {
    await be_in_folder(folder);
    await make_display_threaded();
    await collapse_all_threads();

    // - select the thread root, thereby summarizing it
    const thread1Root = await select_click_row(thread1); // this just uses the root msg
    assert_collapsed(thread1Root);
    // just the thread root should be selected
    assert_selected(thread1Root);
    // but the whole thread should be summarized
    await assert_messages_summarized(window, thread1);

    // - add a new message, make sure it's in the summary now.
    const [thread1Extra] = await make_message_sets_in_folders(
      [folder],
      [{ count: 1, inReplyTo: thread1 }]
    );
    const thread1All = thread1.union(thread1Extra);
    assert_selected(thread1Root);
    await assert_messages_summarized(window, thread1All);
  }
);

add_task(async function test_summary_when_multiple_identities() {
  // First half of the test, makes sure messageDisplay.js understands there's
  // only one thread
  const folder1 = await create_folder("Search1");
  await be_in_folder(folder1);
  let thread1 = create_thread(1);
  await add_message_sets_to_folders([folder1], [thread1]);

  const folder2 = await create_folder("Search2");
  await be_in_folder(folder2);
  await make_message_sets_in_folders(
    [folder2],
    [{ count: 1, inReplyTo: thread1 }]
  );

  const folderVirtual = create_virtual_folder(
    [folder1, folder2],
    {},
    true,
    "SearchBoth"
  );

  // Do the needed tricks
  await be_in_folder(folder1);
  await select_click_row(0);
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  window.MsgMoveMessage(folder2);
  await wait_for_folder_events();

  await be_in_folder(folder2);
  await select_click_row(1);
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  window.MsgMoveMessage(folder1);
  await wait_for_folder_events();

  await be_in_folder(folderVirtual);
  await make_display_threaded();
  await collapse_all_threads();

  // Assertions
  await select_click_row(0);
  await assert_messages_summarized(
    window,
    window.gFolderDisplay.selectedMessages
  );
  // Thread summary shows a date, while multimessage summary shows a subject.
  assert_summary_contains_N_elts(".item-header > .subject", 0);
  assert_summary_contains_N_elts(".item-header > .date", 2);

  // Second half of the test, makes sure MultiMessageSummary groups messages
  // according to their view thread id
  thread1 = create_thread(1);
  await add_message_sets_to_folders([folder1], [thread1]);
  await be_in_folder(folderVirtual);
  await select_shift_click_row(1);

  assert_summary_contains_N_elts(".item-header > .subject", 2);
});

function extract_first_address(thread) {
  const addresses = MailServices.headerParser.parseEncodedHeader(
    thread1.getMsgHdr(0).mime2DecodedAuthor
  );
  return addresses[0];
}

function check_address_name(name) {
  const htmlframe = document.getElementById("multimessage");
  const match = htmlframe.contentDocument.querySelector(".author");
  if (match.textContent != name) {
    throw new Error(
      "Expected to find sender named '" +
        name +
        "', found '" +
        match.textContent +
        "'"
    );
  }
}

add_task(async function test_display_name_no_abook() {
  await be_in_folder(folder);

  const address = extract_first_address(thread1);
  ensure_no_card_exists(address.email);

  await collapse_all_threads();
  await select_click_row(thread1);

  // No address book entry, we display name and e-mail address.
  check_address_name(address.name + " <" + address.email + ">");
});

add_task(async function test_display_name_abook() {
  await be_in_folder(folder);

  const address = extract_first_address(thread1);
  ensure_card_exists(address.email, "My Friend", true);

  await collapse_all_threads();
  await select_click_row(thread1);

  check_address_name("My Friend");
});

add_task(async function test_display_name_abook_no_pdn() {
  await be_in_folder(folder);

  const address = extract_first_address(thread1);
  ensure_card_exists(address.email, "My Friend", false);

  await collapse_all_threads();
  await select_click_row(thread1);

  // With address book entry but display name not preferred, we display name and
  // e-mail address.
  check_address_name(address.name + " <" + address.email + ">");

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

add_task(async function test_archive_and_delete_messages() {
  await be_in_folder(folder);
  await select_none();
  await assert_nothing_selected();
  await make_display_unthreaded();
  await select_click_row(0);
  await select_shift_click_row(2);
  let messages = window.gFolderDisplay.selectedMessages;

  const contentWindow = document.getElementById("multimessage").contentWindow;
  // Archive selected messages.
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  EventUtils.synthesizeMouseAtCenter(
    contentWindow.document.getElementById("hdrArchiveButton"),
    {},
    contentWindow
  );

  await wait_for_folder_events();
  assert_message_not_in_view(messages);

  await select_none();
  await assert_nothing_selected();
  await select_click_row(0);
  await select_shift_click_row(2);
  messages = window.gFolderDisplay.selectedMessages;

  // Delete selected messages.
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  EventUtils.synthesizeMouseAtCenter(
    contentWindow.document.getElementById("hdrTrashButton"),
    {},
    contentWindow
  );
  await wait_for_folder_events();
  assert_message_not_in_view(messages);
});
