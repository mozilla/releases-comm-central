/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that we open multiple search windows when shortcuts are invoked multiple
 * times.
 */

"use strict";

var { be_in_folder, create_folder } = ChromeUtils.import(
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
add_setup(async function () {
  folderA = await create_folder("MultipleSearchWindowsA");
  folderB = await create_folder("MultipleSearchWindowsB");
});

/**
 * Test bringing up multiple search windows for multiple folders.
 */
add_task(
  async function test_show_multiple_search_windows_for_multiple_folders() {
    await be_in_folder(folderA);

    const swcA = await open_search_window();
    // Check whether the window's displaying the right folder
    assert_search_window_folder_displayed(swcA, folderA);

    window.focus();
    await be_in_folder(folderB);
    // This should time out if a second search window isn't opened
    const swcB = await open_search_window();

    // Now check whether both windows are displaying the right folders
    assert_search_window_folder_displayed(swcA, folderA);
    assert_search_window_folder_displayed(swcB, folderB);

    // Clean up, close both windows
    await close_search_window(swcA);
    await close_search_window(swcB);
  }
);

/**
 * Test bringing up multiple search windows for the same folder.
 */
add_task(
  async function test_show_multiple_search_windows_for_the_same_folder() {
    await be_in_folder(folderA);
    const swc1 = await open_search_window();
    // Check whether the window's displaying the right folder
    assert_search_window_folder_displayed(swc1, folderA);

    window.focus();
    // This should time out if a second search window isn't opened
    const swc2 = await open_search_window();

    // Now check whether both windows are displaying the right folders
    assert_search_window_folder_displayed(swc1, folderA);
    assert_search_window_folder_displayed(swc2, folderA);

    // Clean up, close both windows
    await close_search_window(swc1);
    await close_search_window(swc2);
  }
);
