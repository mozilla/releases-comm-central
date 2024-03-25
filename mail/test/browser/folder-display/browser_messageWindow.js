/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that we can open and close a standalone message display window from the
 *  folder pane.
 */

"use strict";

var {
  add_message_sets_to_folders,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  create_thread,
  open_selected_message_in_new_window,
  plan_for_message_display,
  press_delete,
  select_click_row,
  wait_for_message_display_completion,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var folderA, folderB;
var curMessage;

add_setup(async function () {
  folderA = await create_folder("MessageWindowA");
  folderB = await create_folder("MessageWindowB");
  // create three messages in the folder to display
  const msg1 = create_thread(1);
  const msg2 = create_thread(1);
  const thread1 = create_thread(2);
  const thread2 = create_thread(2);
  await add_message_sets_to_folders([folderA], [msg1, msg2, thread1, thread2]);
  // add two more messages in another folder
  const msg3 = create_thread(1);
  const msg4 = create_thread(1);
  await add_message_sets_to_folders([folderB], [msg3, msg4]);
  folderA.msgDatabase.dBFolderInfo.viewFlags =
    Ci.nsMsgViewFlagsType.kThreadedDisplay;
});

/**
 * The message window.
 * @type {Window}
 */
var msgc;

add_task(async function test_open_message_window() {
  await be_in_folder(folderA);

  // select the first message
  curMessage = await select_click_row(0);

  // display it
  msgc = await open_selected_message_in_new_window();
  await assert_selected_and_displayed(msgc, curMessage);
});

/**
 * Use the "m" keyboard accelerator to mark a message as read or unread.
 */
add_task(function test_toggle_read() {
  curMessage.markRead(false);
  EventUtils.synthesizeKey("m", {}, msgc);
  Assert.ok(curMessage.isRead, "Message should have been marked read!");

  EventUtils.synthesizeKey("m", {}, msgc);
  Assert.ok(!curMessage.isRead, "Message should have been marked unread!");
});

/**
 * Use the "f" keyboard accelerator to navigate to the next message,
 * and verify that it is indeed loaded.
 */
add_task(async function test_navigate_to_next_message() {
  plan_for_message_display(msgc);
  EventUtils.synthesizeKey("f", {}, msgc);
  await wait_for_message_display_completion(msgc, true);
  await assert_selected_and_displayed(msgc, 1);
}).skip();

/**
 * Delete a single message and verify the next message is loaded. This sets
 * us up for the next test, which is delete on a collapsed thread after
 * the previous message was deleted.
 */
add_task(async function test_delete_single_message() {
  plan_for_message_display(msgc);
  await press_delete(msgc);
  await wait_for_message_display_completion(msgc, true);
  await assert_selected_and_displayed(msgc, 1);
}).skip();

/**
 * Delete the current message, and verify that it only deletes
 * a single message, not the messages in the collapsed thread
 */
add_task(async function test_del_collapsed_thread() {
  plan_for_message_display(msgc);
  await press_delete(msgc);
  if (folderA.getTotalMessages(false) != 4) {
    throw new Error("should have only deleted one message");
  }
  await wait_for_message_display_completion(msgc, true);
  await assert_selected_and_displayed(msgc, 1);
}).skip();

/**
 * Hit n enough times to mark all messages in folder A read, and then accept the
 * modal dialog saying that we should move to the next folder. Then, assert that
 * the message displayed in the standalone message window is folder B's first
 * message (since all messages in folder B were unread).
 */
add_task(async function test_next_unread() {
  for (let i = 0; i < 3; ++i) {
    plan_for_message_display(msgc);
    EventUtils.synthesizeKey("n", {}, msgc);
    await wait_for_message_display_completion(msgc, true);
  }

  for (const m of folderA.messages) {
    Assert.ok(m.isRead, `${m.messageId} is read`);
  }

  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("n", {}, msgc);
  plan_for_message_display(msgc);
  await dialogPromise;
  await wait_for_message_display_completion(msgc, true);

  // move to folder B
  await be_in_folder(folderB);

  // select the first message, and make sure it's not read
  const msg = await select_click_row(0);

  // make sure we've been displaying the right message
  await assert_selected_and_displayed(msgc, msg);
}).skip();

/**
 * Close the window by hitting escape.
 */
add_task(async function test_close_message_window() {
  const closePromise = BrowserTestUtils.domWindowClosed(msgc);
  EventUtils.synthesizeKey("VK_ESCAPE", {}, msgc);
  await closePromise;
});
