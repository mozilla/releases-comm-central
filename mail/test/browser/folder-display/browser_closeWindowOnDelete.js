/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the close message window on delete option works.
 */

"use strict";

var {
  assert_number_of_tabs_open,
  be_in_folder,
  close_tab,
  create_folder,
  make_message_sets_in_folders,
  open_selected_message_in_new_tab,
  open_selected_message_in_new_window,
  press_delete,
  reset_close_message_on_delete,
  select_click_row,
  set_close_message_on_delete,
  switch_tab,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var folder;

add_setup(async function () {
  folder = await create_folder("CloseWindowOnDeleteA");
  await make_message_sets_in_folders([folder], [{ count: 10 }]);
});

/**
 * Delete a message and check that the message window is closed
 * where appropriate.
 */
add_task(
  async function test_close_message_window_on_delete_from_message_window() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    const msgc = await open_selected_message_in_new_window();

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_window();

    const preCount = folder.getTotalMessages(false);
    msgc.focus();
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    await press_delete(msgc);
    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing window");
    }
    await closePromise;

    if (msgc2.closed) {
      throw new Error("should only have closed the active window");
    }

    await BrowserTestUtils.closeWindow(msgc2);

    reset_close_message_on_delete();
  }
);

/**
 * Delete a message when multiple windows are open to the message, and the
 * message is deleted from one of them.
 */
add_task(
  async function test_close_multiple_message_windows_on_delete_from_message_window() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    const msgc = await open_selected_message_in_new_window();
    const msgcA = await open_selected_message_in_new_window();

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_window();

    const preCount = folder.getTotalMessages(false);
    msgc.focus();
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    const closePromiseA = BrowserTestUtils.domWindowClosed(msgcA);
    await press_delete(msgc);

    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing window");
    }
    await closePromise;
    await closePromiseA;

    if (msgc2.closed) {
      throw new Error("should only have closed the active window");
    }

    await BrowserTestUtils.closeWindow(msgc2);

    reset_close_message_on_delete();
  }
);

/**
 * Delete a message when multiple windows are open to the message, and the
 * message is deleted from the 3-pane window.
 */
add_task(
  async function test_close_multiple_message_windows_on_delete_from_3pane_window() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    const msgc = await open_selected_message_in_new_window();
    const msgcA = await open_selected_message_in_new_window();

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_window();

    const preCount = folder.getTotalMessages(false);
    window.focus();
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    const closePromiseA = BrowserTestUtils.domWindowClosed(msgcA);
    await select_click_row(0);
    await press_delete(window);

    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing window");
    }
    await closePromise;
    await closePromiseA;

    if (msgc2.closed) {
      throw new Error("should only have closed the first window");
    }

    await BrowserTestUtils.closeWindow(msgc2);

    reset_close_message_on_delete();
  }
);

/**
 * Delete a message and check that the message tab is closed
 * where appropriate.
 */
add_task(async function test_close_message_tab_on_delete_from_message_tab() {
  set_close_message_on_delete(true);
  await be_in_folder(folder);

  // select the first message
  await select_click_row(0);
  // display it
  const msgc = await open_selected_message_in_new_tab(true);

  await select_click_row(1);
  const msgc2 = await open_selected_message_in_new_tab(true);

  const preCount = folder.getTotalMessages(false);
  await switch_tab(msgc);
  await press_delete();

  if (folder.getTotalMessages(false) != preCount - 1) {
    throw new Error("didn't delete a message before closing tab");
  }

  assert_number_of_tabs_open(2);

  if (msgc2 != document.getElementById("tabmail").tabInfo[1]) {
    throw new Error("should only have closed the active tab");
  }

  close_tab(msgc2);

  reset_close_message_on_delete();
});

/**
 * Delete a message when multiple windows are open to the message, and the
 * message is deleted from one of them.
 */
add_task(
  async function test_close_multiple_message_tabs_on_delete_from_message_tab() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    const msgc = await open_selected_message_in_new_tab(true);
    await open_selected_message_in_new_tab(true);

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_tab(true);

    const preCount = folder.getTotalMessages(false);
    await switch_tab(msgc);
    await press_delete();

    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing tab");
    }

    assert_number_of_tabs_open(2);

    if (msgc2 != document.getElementById("tabmail").tabInfo[1]) {
      throw new Error("should only have closed the active tab");
    }

    close_tab(msgc2);

    reset_close_message_on_delete();
  }
);

/**
 * Delete a message when multiple tabs are open to the message, and the
 * message is deleted from the 3-pane window.
 */
add_task(
  async function test_close_multiple_message_tabs_on_delete_from_3pane_window() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    await open_selected_message_in_new_tab(true);
    await open_selected_message_in_new_tab(true);

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_tab(true);

    const preCount = folder.getTotalMessages(false);
    window.focus();
    await select_click_row(0);
    await press_delete(window);

    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing window");
    }

    assert_number_of_tabs_open(2);

    if (msgc2 != document.getElementById("tabmail").tabInfo[1]) {
      throw new Error("should only have closed the active tab");
    }

    close_tab(msgc2);

    reset_close_message_on_delete();
  }
);

/**
 * Delete a message when multiple windows and tabs are open to the message, and
 * the message is deleted from the 3-pane window.
 */
add_task(
  async function test_close_multiple_windows_tabs_on_delete_from_3pane_window() {
    set_close_message_on_delete(true);
    await be_in_folder(folder);

    // select the first message
    await select_click_row(0);
    // display it
    await open_selected_message_in_new_tab(true);
    const msgcA = await open_selected_message_in_new_window();

    await select_click_row(1);
    const msgc2 = await open_selected_message_in_new_tab(true);
    const msgc2A = await open_selected_message_in_new_window();

    const preCount = folder.getTotalMessages(false);
    window.focus();
    const closePromise = BrowserTestUtils.domWindowClosed(msgcA);
    await select_click_row(0);
    await press_delete(window);

    if (folder.getTotalMessages(false) != preCount - 1) {
      throw new Error("didn't delete a message before closing window");
    }
    await closePromise;

    assert_number_of_tabs_open(2);

    if (msgc2 != document.getElementById("tabmail").tabInfo[1]) {
      throw new Error("should only have closed the active tab");
    }

    if (msgc2A.closed) {
      throw new Error("should only have closed the first window");
    }

    close_tab(msgc2);
    await BrowserTestUtils.closeWindow(msgc2A);

    reset_close_message_on_delete();

    Assert.report(
      false,
      undefined,
      undefined,
      "Test ran to completion successfully"
    );
  }
);
