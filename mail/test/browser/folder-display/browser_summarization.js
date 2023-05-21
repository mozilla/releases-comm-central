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

var { ensure_card_exists, ensure_no_card_exists } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
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
  mc,
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
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
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
  select_click_row(0);
  select_shift_click_row(5);
  // this will verify a multi-message display is happening
  assert_selected_and_displayed([0, 5]);
});

add_task(function test_summarization_goes_away() {
  select_none();
  assert_nothing_selected();
});

/**
 * Verify that we update summarization when switching amongst tabs.
 */
add_task(async function test_folder_tabs_update_correctly() {
  // tab with summary
  let tabA = await be_in_folder(folder);
  select_click_row(0);
  select_control_click_row(2);
  assert_selected_and_displayed(0, 2);

  // tab with nothing
  let tabB = await open_folder_in_new_tab(folder);
  wait_for_blank_content_pane();
  assert_nothing_selected();

  // correct changes, none <=> summary
  await switch_tab(tabA);
  assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  assert_nothing_selected();

  // correct changes, one <=> summary
  select_click_row(0);
  assert_selected_and_displayed(0);
  await switch_tab(tabA);
  assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  assert_selected_and_displayed(0);

  // correct changes, summary <=> summary
  select_shift_click_row(3);
  assert_selected_and_displayed([0, 3]);
  await switch_tab(tabA);
  assert_selected_and_displayed(0, 2);
  await switch_tab(tabB);
  assert_selected_and_displayed([0, 3]);

  // closing tab returns state correctly...
  close_tab(tabB);
  assert_selected_and_displayed(0, 2);
});

add_task(async function test_message_tabs_update_correctly() {
  let tabFolder = await be_in_folder(folder);
  let message = select_click_row(0);
  assert_selected_and_displayed(0);

  let tabMessage = await open_selected_message_in_new_tab();
  assert_selected_and_displayed(message);

  await switch_tab(tabFolder);
  select_shift_click_row(2);
  assert_selected_and_displayed([0, 2]);

  await switch_tab(tabMessage);
  assert_selected_and_displayed(message);

  await switch_tab(tabFolder);
  assert_selected_and_displayed([0, 2]);

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
  select_click_row(0);
  // does summarize things.  timer will be tick tick ticking!
  select_shift_click_row(1);
  // verify that things were summarized...
  assert_selected_and_displayed([0, 1]);
  // save the set of messages so we can verify the summary sticks to this.
  let messages = mc.window.gFolderDisplay.selectedMessages;

  // make sure the

  // this will not summarize!
  select_shift_click_row(2, mc, true);
  // verify that our summary is still just 0 and 1.
  assert_messages_summarized(mc, messages);

  // - pretend the timer fired.
  // we need to de-schedule the timer, but do not need to clear the variable
  //  because it will just get overwritten anyways
  mc.window.clearTimeout(mc.messageDisplay._summaryStabilityTimeout);
  mc.messageDisplay._showSummary(true);

  // - the summary should now be up-to-date
  assert_selected_and_displayed([0, 2]);
});

add_task(function test_summarization_thread_detection() {
  select_none();
  assert_nothing_selected();
  make_display_threaded();
  select_click_row(0);
  select_shift_click_row(9);
  let messages = mc.window.gFolderDisplay.selectedMessages;
  toggle_thread_row(0);
  assert_messages_summarized(mc, messages);
  // count the number of messages represented
  assert_summary_contains_N_elts("#message_list > li", 10);
  select_shift_click_row(1);
  // this should have shifted to the multi-message view
  assert_summary_contains_N_elts(".item_header > .date", 0);
  assert_summary_contains_N_elts(".item_header > .subject", 2);
  select_none();
  assert_nothing_selected();
  select_click_row(1); // select a single message
  select_shift_click_row(2); // add a thread
  assert_summary_contains_N_elts(".item_header > .date", 0);
  assert_summary_contains_N_elts(".item_header > .subject", 2);
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
  make_display_threaded();
  // - create the base messages
  let [willMoveMsg, willNotMoveMsg] = await make_message_sets_in_folders(
    [folder],
    [{ count: 1 }, { count: 1 }]
  );

  // - do the non-move case
  // XXX actually, this still gets treated as a move. I don't know why...
  // select it
  select_click_row(willNotMoveMsg);
  assert_selected_and_displayed(willNotMoveMsg);

  // give it a friend...
  await make_message_sets_in_folders(
    [folder],
    [{ count: 1, inReplyTo: willNotMoveMsg }]
  );
  assert_expanded(willNotMoveMsg);
  assert_selected_and_displayed(willNotMoveMsg);

  // - do the move case
  select_click_row(willMoveMsg);
  assert_selected_and_displayed(willMoveMsg);

  // give it a friend...
  await make_message_sets_in_folders(
    [folder],
    [{ count: 1, inReplyTo: willMoveMsg }]
  );
  assert_expanded(willMoveMsg);
  assert_selected_and_displayed(willMoveMsg);
});

/**
 * Selecting an existing (and collapsed) thread, then add a message and make
 *  sure the summary updates.
 */
add_task(
  async function test_summary_updates_when_new_message_added_to_collapsed_thread() {
    await be_in_folder(folder);
    make_display_threaded();
    collapse_all_threads();

    // - select the thread root, thereby summarizing it
    let thread1Root = select_click_row(thread1); // this just uses the root msg
    assert_collapsed(thread1Root);
    // just the thread root should be selected
    assert_selected(thread1Root);
    // but the whole thread should be summarized
    assert_messages_summarized(mc, thread1);

    // - add a new message, make sure it's in the summary now.
    let [thread1Extra] = await make_message_sets_in_folders(
      [folder],
      [{ count: 1, inReplyTo: thread1 }]
    );
    let thread1All = thread1.union(thread1Extra);
    assert_selected(thread1Root);
    assert_messages_summarized(mc, thread1All);
  }
);

add_task(async function test_summary_when_multiple_identities() {
  // First half of the test, makes sure messageDisplay.js understands there's
  // only one thread
  let folder1 = await create_folder("Search1");
  await be_in_folder(folder1);
  let thread1 = create_thread(1);
  await add_message_sets_to_folders([folder1], [thread1]);

  let folder2 = await create_folder("Search2");
  await be_in_folder(folder2);
  await make_message_sets_in_folders(
    [folder2],
    [{ count: 1, inReplyTo: thread1 }]
  );

  let folderVirtual = create_virtual_folder(
    [folder1, folder2],
    {},
    true,
    "SearchBoth"
  );

  // Do the needed tricks
  await be_in_folder(folder1);
  select_click_row(0);
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  mc.window.MsgMoveMessage(folder2);
  wait_for_folder_events();

  await be_in_folder(folder2);
  select_click_row(1);
  plan_to_wait_for_folder_events(
    "DeleteOrMoveMsgCompleted",
    "DeleteOrMoveMsgFailed"
  );
  mc.window.MsgMoveMessage(folder1);
  wait_for_folder_events();

  await be_in_folder(folderVirtual);
  make_display_threaded();
  collapse_all_threads();

  // Assertions
  select_click_row(0);
  assert_messages_summarized(mc, mc.window.gFolderDisplay.selectedMessages);
  // Thread summary shows a date, while multimessage summary shows a subject.
  assert_summary_contains_N_elts(".item_header > .subject", 0);
  assert_summary_contains_N_elts(".item_header > .date", 2);

  // Second half of the test, makes sure MultiMessageSummary groups messages
  // according to their view thread id
  thread1 = create_thread(1);
  await add_message_sets_to_folders([folder1], [thread1]);
  await be_in_folder(folderVirtual);
  select_shift_click_row(1);

  assert_summary_contains_N_elts(".item_header > .subject", 2);
});

function extract_first_address(thread) {
  let addresses = MailServices.headerParser.parseEncodedHeader(
    thread1.getMsgHdr(0).mime2DecodedAuthor
  );
  return addresses[0];
}

function check_address_name(name) {
  let htmlframe = mc.window.document.getElementById("multimessage");
  let match = htmlframe.contentDocument.querySelector(".author");
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

  let address = extract_first_address(thread1);
  ensure_no_card_exists(address.email);

  collapse_all_threads();
  select_click_row(thread1);

  // No address book entry, we display name and e-mail address.
  check_address_name(address.name + " <" + address.email + ">");
});

add_task(async function test_display_name_abook() {
  await be_in_folder(folder);

  let address = extract_first_address(thread1);
  ensure_card_exists(address.email, "My Friend", true);

  collapse_all_threads();
  select_click_row(thread1);

  check_address_name("My Friend");
});

add_task(async function test_display_name_abook_no_pdn() {
  await be_in_folder(folder);

  let address = extract_first_address(thread1);
  ensure_card_exists(address.email, "My Friend", false);

  collapse_all_threads();
  select_click_row(thread1);

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
  select_none();
  assert_nothing_selected();
  make_display_unthreaded();
  select_click_row(0);
  select_shift_click_row(2);
  let messages = mc.window.gFolderDisplay.selectedMessages;

  let contentWindow =
    mc.window.document.getElementById("multimessage").contentWindow;
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

  wait_for_folder_events();
  assert_message_not_in_view(messages);

  select_none();
  assert_nothing_selected();
  select_click_row(0);
  select_shift_click_row(2);
  messages = mc.window.gFolderDisplay.selectedMessages;

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
  wait_for_folder_events();
  assert_message_not_in_view(messages);
});
