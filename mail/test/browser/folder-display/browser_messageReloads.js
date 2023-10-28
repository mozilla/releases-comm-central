/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that message reloads happen properly when the message pane is hidden,
 * and then made visible again.
 */

"use strict";

var {
  assert_message_pane_hidden,
  assert_message_pane_visible,
  assert_selected_and_displayed,
  be_in_folder,
  close_tab,
  make_message_sets_in_folders,
  create_folder,
  open_folder_in_new_tab,
  select_click_row,
  switch_tab,
  toggle_message_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folder;

add_setup(async function () {
  folder = await create_folder("MessageReloads");
  await make_message_sets_in_folders([folder], [{ count: 1 }]);
});

add_task(async function test_message_reloads_work_with_message_pane_toggles() {
  await be_in_folder(folder);

  assert_message_pane_visible();
  await select_click_row(0);
  // Toggle the message pane off, then on
  toggle_message_pane();
  assert_message_pane_hidden();
  toggle_message_pane();
  assert_message_pane_visible();
  // Open a new tab with the same message
  const tab = await open_folder_in_new_tab(folder);
  // Toggle the message pane off
  assert_message_pane_visible();
  toggle_message_pane();
  assert_message_pane_hidden();
  // Go back to the first tab, and make sure the message is actually displayed
  await switch_tab(0);
  assert_message_pane_visible();
  await assert_selected_and_displayed(0);

  close_tab(tab);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
