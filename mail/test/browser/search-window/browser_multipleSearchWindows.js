/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that we open multiple search windows when shortcuts are invoked multiple
 * times.
 */

"use strict";

var { be_in_folder, create_folder, mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var {
  assert_search_window_folder_displayed,
  close_search_window,
  open_search_window,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/SearchWindowHelpers.jsm"
);

var folderA, folderB;
add_task(function setupModule(module) {
  folderA = create_folder("MultipleSearchWindowsA");
  folderB = create_folder("MultipleSearchWindowsB");
});

/**
 * Test bringing up multiple search windows for multiple folders.
 */
add_task(function test_show_multiple_search_windows_for_multiple_folders() {
  be_in_folder(folderA);

  let swcA = open_search_window();
  // Check whether the window's displaying the right folder
  assert_search_window_folder_displayed(swcA, folderA);

  mc.window.focus();
  be_in_folder(folderB);
  // This should time out if a second search window isn't opened
  let swcB = open_search_window();

  // Now check whether both windows are displaying the right folders
  assert_search_window_folder_displayed(swcA, folderA);
  assert_search_window_folder_displayed(swcB, folderB);

  // Clean up, close both windows
  close_search_window(swcA);
  close_search_window(swcB);
});

/**
 * Test bringing up multiple search windows for the same folder.
 */
add_task(function test_show_multiple_search_windows_for_the_same_folder() {
  be_in_folder(folderA);
  let swc1 = open_search_window();
  // Check whether the window's displaying the right folder
  assert_search_window_folder_displayed(swc1, folderA);

  mc.window.focus();
  // This should time out if a second search window isn't opened
  let swc2 = open_search_window();

  // Now check whether both windows are displaying the right folders
  assert_search_window_folder_displayed(swc1, folderA);
  assert_search_window_folder_displayed(swc2, folderA);

  // Clean up, close both windows
  close_search_window(swc1);
  close_search_window(swc2);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

registerCleanupFunction(() => {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});
