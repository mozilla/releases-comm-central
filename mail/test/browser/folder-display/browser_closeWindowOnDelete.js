/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the close message window on delete option works.
 */

"use strict";

if (
  AppConstants.MOZ_CODE_COVERAGE ||
  AppConstants.ASAN ||
  AppConstants.DEBUG ||
  AppConstants.TSAN
) {
  requestLongerTimeout(2);
}

var {
  assert_number_of_tabs_open,
  be_in_folder,
  close_tab,
  create_folder,
  open_selected_message_in_new_tab,
  open_selected_message_in_new_window,
  reset_close_message_on_delete,
  select_click_row,
  set_close_message_on_delete,
  switch_tab,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);

var folder;
const tabmail = document.getElementById("tabmail");

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
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    await SimpleTest.promiseFocus(msgc);
    EventUtils.synthesizeKey("KEY_Delete", {}, msgc);
    await closePromise;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    Assert.ok(!msgc2.closed, "should only have closed the active window");
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
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    const closePromiseA = BrowserTestUtils.domWindowClosed(msgcA);
    await SimpleTest.promiseFocus(msgc);
    EventUtils.synthesizeKey("KEY_Delete", {}, msgc);
    await closePromise;
    await closePromiseA;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    Assert.ok(!msgc2.closed, "should only have closed the active window");
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
    const closePromise = BrowserTestUtils.domWindowClosed(msgc);
    const closePromiseA = BrowserTestUtils.domWindowClosed(msgcA);
    await select_click_row(0);
    await SimpleTest.promiseFocus();
    EventUtils.synthesizeKey("KEY_Delete", {}, window);
    await closePromise;
    await closePromiseA;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    Assert.ok(!msgc2.closed, "should only have closed the first window");
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
  const tabClosePromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabClose"
  );
  await SimpleTest.promiseFocus();
  EventUtils.synthesizeKey("KEY_Delete", {}, window);
  await tabClosePromise;

  Assert.equal(
    folder.getTotalMessages(false),
    preCount - 1,
    "should have deleted a message"
  );
  assert_number_of_tabs_open(2);
  Assert.equal(
    msgc2,
    tabmail.tabInfo[1],
    "should only have closed the active tab"
  );

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
    const tabClosePromise = BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabClose"
    );
    await SimpleTest.promiseFocus();
    EventUtils.synthesizeKey("KEY_Delete", {}, window);
    await tabClosePromise;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    assert_number_of_tabs_open(2);
    Assert.equal(
      msgc2,
      tabmail.tabInfo[1],
      "should only have closed the active tab"
    );

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
    await select_click_row(0);
    const tabClosePromise = BrowserTestUtils.waitForEvent(
      tabmail.tabContainer,
      "TabClose"
    );
    await SimpleTest.promiseFocus();
    EventUtils.synthesizeKey("KEY_Delete", {}, window);
    await tabClosePromise;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    assert_number_of_tabs_open(2);
    Assert.equal(
      msgc2,
      tabmail.tabInfo[1],
      "should only have closed the active tab"
    );
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
    const closePromise = BrowserTestUtils.domWindowClosed(msgcA);
    await select_click_row(0);
    await SimpleTest.promiseFocus();
    EventUtils.synthesizeKey("KEY_Delete", {}, window);
    await closePromise;

    Assert.equal(
      folder.getTotalMessages(false),
      preCount - 1,
      "should have deleted a message"
    );
    assert_number_of_tabs_open(2);
    Assert.equal(
      msgc2,
      tabmail.tabInfo[1],
      "should only have closed the active tab"
    );
    close_tab(msgc2);
    Assert.ok(!msgc2A.closed, "should only have closed the first window");
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
