/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that commands on virtual folders work properly.
 */

"use strict";

var {
  be_in_folder,
  expand_all_threads,
  make_display_threaded,
  mc,
  MessageInjection,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var msgsPerThread = 5;
var singleVirtFolder;
var multiVirtFolder;

add_task(function setupModule(module) {
  let [folderOne] = MessageInjection.make_folder_with_sets([{ msgsPerThread }]);
  let [folderTwo] = MessageInjection.make_folder_with_sets([{ msgsPerThread }]);

  singleVirtFolder = MessageInjection.make_virtual_folder([folderOne], {});
  multiVirtFolder = MessageInjection.make_virtual_folder(
    [folderOne, folderTwo],
    {}
  );
});

add_task(function test_single_folder_select_thread() {
  be_in_folder(singleVirtFolder);
  make_display_threaded();
  expand_all_threads();

  // Try selecting the thread from the root message.
  select_click_row(0);
  EventUtils.synthesizeKey("a", { accelKey: true, shiftKey: true });
  Assert.ok(
    mc.folderDisplay.selectedCount == msgsPerThread,
    "Didn't select all messages in the thread!"
  );

  // Now try selecting the thread from a non-root message.
  select_click_row(1);
  EventUtils.synthesizeKey("a", { accelKey: true, shiftKey: true });
  Assert.ok(
    mc.folderDisplay.selectedCount == msgsPerThread,
    "Didn't select all messages in the thread!"
  );
});

add_task(function test_cross_folder_select_thread() {
  be_in_folder(multiVirtFolder);
  make_display_threaded();
  expand_all_threads();

  // Try selecting the thread from the root message.
  select_click_row(0);
  EventUtils.synthesizeKey("a", { accelKey: true, shiftKey: true });
  Assert.ok(
    mc.folderDisplay.selectedCount == msgsPerThread,
    "Didn't select all messages in the thread!"
  );

  // Now try selecting the thread from a non-root message.
  select_click_row(1);
  EventUtils.synthesizeKey("a", { accelKey: true, shiftKey: true });
  Assert.ok(
    mc.folderDisplay.selectedCount == msgsPerThread,
    "Didn't select all messages in the thread!"
  );
});
