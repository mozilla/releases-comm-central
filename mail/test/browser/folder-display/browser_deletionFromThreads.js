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
  open_folder_in_new_tab,
  press_delete,
  select_click_row,
  switch_tab,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
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
  await TestUtils.waitForCondition(
    () => [...singleFolder.messages].length == 9,
    "singleFolder should have 9 messages"
  );
  folderA = await create_folder("underlyingFolderA");
  folderB = await create_folder("underlyingFolderB");
  await make_message_sets_in_folders(
    [folderA, folderB],
    [{ count: 7, msgsPerThread: 7 }]
  );
  await TestUtils.waitForCondition(
    () => [...folderA.messages].length == 4,
    "folderA should have 4 messages"
  );
  await TestUtils.waitForCondition(
    () => [...folderB.messages].length == 3,
    "folderB should have 3 messages"
  );
  multiFolder = create_virtual_folder("multiFolder", [folderA, folderB]);

  tab1 = await be_in_folder(singleFolder);
  tab2 = await open_folder_in_new_tab(singleFolder);
  const currentTabInfo = document.getElementById("tabmail").currentTabInfo;
  Assert.ok(
    !currentTabInfo.first,
    "Active tab should not be the initial 3pane tab"
  );
  about3Pane = currentTabInfo.chromeBrowser.contentWindow;

  registerCleanupFunction(() => {
    multiFolder.deleteSelf(null);
    singleFolder.deleteSelf(null);
    folderA.deleteSelf(null);
    folderB.deleteSelf(null);
  });
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

async function verify_message_read_status(expected, msg) {
  const dbView =
    document.getElementById("tabmail").currentTabInfo.chromeBrowser
      .contentWindow.gDBView;
  await TestUtils.waitForCondition(() => {
    const state = [];
    for (let i = 0; i < dbView.rowCount; i++) {
      state.push(dbView.getMsgHdrAt(i).isRead);
    }
    // We are comparing two simple arrays, no need to be fancy.
    return JSON.stringify(expected) == JSON.stringify(state);
  }, `Message read states should be correct (${msg})`);
}

add_task(async function delete_from_collapsed_thread() {
  await switch_tab(tab2);
  await collapse_all_threads();
  await switch_tab(tab1);
  await expand_all_threads();

  let curMessage = await select_click_row(3);
  await assert_selected_and_displayed(curMessage);
  await assertReplyCount(8);
  await verify_message_read_status(
    [false, false, false, true, false, false, false, false, false],
    "before 1st delete"
  );
  await press_delete();
  await verify_message_read_status(
    [false, false, false, true, false, false, false, false],
    "after 1st delete"
  );
  await assertReplyCount(7);
  curMessage = await select_click_row(0);
  await verify_message_read_status(
    [true, false, false, true, false, false, false, false],
    "before 2nd delete"
  );
  await press_delete();
  await verify_message_read_status(
    [true, false, true, false, false, false, false],
    "after 2nd delete"
  );
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
  await verify_message_read_status(
    [true, false, true, true, false, false, false],
    "before 3rd delete"
  );
  await press_delete();
  await verify_message_read_status(
    [true, false, true, true, false, false],
    "after 3rd delete"
  );
  await assertReplyCount(5);
  curMessage = await select_click_row(0);
  await verify_message_read_status(
    [true, false, true, true, false, false],
    "before 4th delete"
  );
  await press_delete();
  await verify_message_read_status(
    [true, true, true, false, false],
    "after 4th delete"
  );
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
  await verify_message_read_status(
    [false, false, false, true, false, false, false],
    "before 5th delete"
  );
  await press_delete();
  await verify_message_read_status(
    [false, false, false, true, false, false],
    "after 5th delete"
  );
  await assertReplyCount(5);
  curMessage = await select_click_row(0);
  await verify_message_read_status(
    [true, false, false, true, false, false],
    "before 6th delete"
  );
  await press_delete();
  await verify_message_read_status(
    [true, false, true, false, false],
    "after 6th delete"
  );
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
  await verify_message_read_status(
    [true, false, true, true, false],
    "before 7th delete"
  );
  await press_delete();
  await verify_message_read_status(
    [true, false, true, true],
    "after 7th delete"
  );
  await assertReplyCount(3);
  curMessage = await select_click_row(0);
  await verify_message_read_status(
    [true, false, true, true],
    "before 8th delete"
  );
  await press_delete();
  await verify_message_read_status([true, true, true], "after 8th delete");
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
  await verify_message_read_status(
    [false, false, false, true, true, true],
    "before 9th delete"
  );
  await assertMessagesCount(2, 5);
  await press_delete();
  await verify_message_read_status(
    [false, false, false, true, true],
    "after 9th delete"
  );
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
  await verify_message_read_status(
    [false, false, false, true, true],
    "before 10th delete"
  );
  await assertMessagesCount(2, 4);
  await press_delete();
  await verify_message_read_status(
    [false, false, false, true],
    "after 10th delete"
  );
  await assertMessagesCount(2, 3);

  await close_tab(tab2);
});
