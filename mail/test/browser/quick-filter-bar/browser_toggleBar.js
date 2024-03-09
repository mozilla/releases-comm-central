/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the message filter bar toggles into and out of existence and
 * states are updated as appropriate.
 */

"use strict";

var {
  assert_messages_in_view,
  be_in_folder,
  create_folder,
  focus_thread_tree,
  make_message_sets_in_folders,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var {
  assert_constraints_expressed,
  assert_quick_filter_bar_visible,
  assert_quick_filter_button_enabled,
  clear_constraints,
  toggle_boolean_constraints,
  toggle_quick_filter_bar,
  cleanup_qfb_button,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/QuickFilterBarHelpers.sys.mjs"
);

var folder;
var setUnstarred, setStarred;

add_setup(async function () {
  folder = await create_folder("QuickFilterBarToggleBar");
  [setUnstarred, setStarred] = await make_message_sets_in_folders(
    [folder],
    [{ count: 1 }, { count: 1 }]
  );
  setStarred.setStarred(true);

  registerCleanupFunction(async () => {
    await ensure_cards_view();
  });
});

add_task(async function test_hidden_on_account_central() {
  await be_in_folder(folder.rootFolder);
  await assert_quick_filter_button_enabled(false);
  assert_quick_filter_bar_visible(false);
  teardownTest();
});

add_task(async function test_visible_by_default() {
  await be_in_folder(folder);
  await ensure_table_view();
  await assert_quick_filter_button_enabled(true);
  assert_quick_filter_bar_visible(true);
  teardownTest();
});

add_task(async function test_direct_toggle() {
  assert_quick_filter_bar_visible(true);
  await toggle_quick_filter_bar();
  assert_quick_filter_bar_visible(false);
  await toggle_quick_filter_bar();
  assert_quick_filter_bar_visible(true);
  teardownTest();
});

add_task(async function test_control_shift_k_triggers_display() {
  // hide it
  await toggle_quick_filter_bar();
  assert_quick_filter_bar_visible(false);

  // focus explicitly on the thread pane so we know where the focus is.
  focus_thread_tree();

  // hit control-shift-k
  EventUtils.synthesizeKey("k", { accelKey: true, shiftKey: true });

  // now we should be visible again!
  assert_quick_filter_bar_visible(true);
  teardownTest();
});

add_task(async function test_constraints_disappear_when_collapsed() {
  // set some constraints
  await toggle_boolean_constraints("starred");
  assert_constraints_expressed({ starred: true });
  assert_messages_in_view(setStarred);

  // collapse, now we should see them all again!
  await toggle_quick_filter_bar();
  assert_messages_in_view([setUnstarred, setStarred]);

  // uncollapse, we should still see them all!
  await toggle_quick_filter_bar();
  assert_messages_in_view([setUnstarred, setStarred]);

  // Starred constraint should not be retained.
  assert_constraints_expressed({});
  teardownTest();
});

registerCleanupFunction(async () => {
  await ensure_cards_view();
  await cleanup_qfb_button();
});

function teardownTest() {
  clear_constraints();
}
