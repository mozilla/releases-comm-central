/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the message counts displayed in the parent message of a thread or
 * a group header are updated correctly when a related message is deleted
 * elsewhere.
 */

"use strict";

var {
  assert_selected_and_displayed,
  be_in_folder,
  create_virtual_folder,
  close_tab,
  collapse_all_threads,
  create_folder,
  expand_all_threads,
  get_about_3pane,
  make_display_grouped,
  make_display_threaded,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  press_delete,
  select_click_row,
  switch_tab,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var singleFolder, folderA, folderB, multiFolder;
var tab1, tab2;
var about3Pane;

add_setup(async function () {
  singleFolder = await create_folder("DeletionFromThreads");
  await make_message_sets_in_folders(
    [singleFolder],
    [{ count: 9, msgsPerThread: 9 }]
  );
  folderA = await create_folder("underlyingFolderA");
  folderB = await create_folder("underlyingFolderB");
  await make_message_sets_in_folders(
    [folderA, folderB],
    [{ count: 7, msgsPerThread: 7 }]
  );
  multiFolder = create_virtual_folder([folderA, folderB], {});

  tab1 = await be_in_folder(singleFolder);
  tab2 = await open_folder_in_new_tab(singleFolder);

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;
});

const assertReplyCount = async replyCount => {
  await switch_tab();
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

  const replies = about3Pane.threadTree.querySelector(".thread-replies");
  Assert.deepEqual(
    about3Pane.document.l10n.getAttributes(replies),
    { id: "threadpane-replies", args: { count: replyCount } },
    "Thread header in background tab should show the correct message count."
  );

  await switch_tab();
};

add_task(async function delete_from_collapsed_thread() {
  await switch_tab(tab2);
  await collapse_all_threads();
  await switch_tab(tab1);
  await expand_all_threads();

  let curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertReplyCount(8);
  await press_delete();
  await assertReplyCount(7);
  curMessage = await select_click_row(0);
  await press_delete();
  await assertReplyCount(6);
});

add_task(async function delete_from_expanded_thread() {
  await switch_tab(tab2);
  await expand_all_threads();
  await switch_tab(tab1);
  await expand_all_threads();

  let curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertReplyCount(6);
  await press_delete();
  await assertReplyCount(5);
  curMessage = await select_click_row(0);
  await press_delete();
  await assertReplyCount(4);
});

add_task(async function delete_from_collapsed_xfthread() {
  await switch_tab(tab2);
  await be_in_folder(multiFolder);
  await collapse_all_threads();
  await switch_tab(tab1);
  await be_in_folder(multiFolder);
  await expand_all_threads();

  let curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertReplyCount(6);
  await press_delete();
  await assertReplyCount(5);
  curMessage = await select_click_row(0);
  await press_delete();
  await assertReplyCount(4);
});

add_task(async function delete_from_expanded_xfthread() {
  await switch_tab(tab2);
  await be_in_folder(multiFolder);
  await expand_all_threads();
  await switch_tab(tab1);
  await be_in_folder(multiFolder);
  await expand_all_threads();

  let curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertReplyCount(4);
  await press_delete();
  await assertReplyCount(3);
  curMessage = await select_click_row(0);
  await press_delete();
  await assertReplyCount(2);
});

const assertMessagesCount = async (unreadCount, messagesCount) => {
  await switch_tab();
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));

  const count = about3Pane.threadTree.querySelector(".sort-header-details");
  Assert.deepEqual(
    about3Pane.document.l10n.getAttributes(count),
    {
      id: "threadpane-sort-header-unread-count",
      args: {
        unread: unreadCount,
        total: messagesCount,
      },
    },
    "Group header in background tab should show the correct message count."
  );

  await switch_tab();
};

add_task(async function delete_from_expanded_group() {
  await switch_tab(tab2);
  await be_in_folder(singleFolder);
  await make_display_grouped();
  await expand_all_threads();
  await switch_tab(tab1);
  await be_in_folder(singleFolder);

  const curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertMessagesCount(2, 5);
  await press_delete();
  await assertMessagesCount(2, 4);
});

add_task(async function delete_from_collapsed_group() {
  await switch_tab(tab2);
  await be_in_folder(singleFolder);
  await make_display_grouped();
  await collapse_all_threads();
  await switch_tab(tab1);
  await be_in_folder(singleFolder);

  const curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertMessagesCount(2, 4);
  await press_delete();
  await assertMessagesCount(2, 3);

  await close_tab(tab2);
});
