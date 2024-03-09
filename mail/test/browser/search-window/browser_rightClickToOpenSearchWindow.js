/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {
  assert_folders_selected_and_displayed,
  create_folder,
  select_click_folder,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);
var {
  assert_search_window_folder_displayed,
  close_search_window,
  open_search_window_from_context_menu,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/SearchWindowHelpers.sys.mjs"
);

var folderA, folderB;
add_setup(async function () {
  folderA = await create_folder("RightClickToOpenSearchWindowA");
  folderB = await create_folder("RightClickToOpenSearchWindowB");
});

/**
 * Test opening a search window while the same folder is selected.
 */
add_task(
  async function test_open_search_window_with_existing_single_selection() {
    select_click_folder(folderA);
    assert_folders_selected_and_displayed(folderA);

    const swc = await open_search_window_from_context_menu(folderA);
    assert_search_window_folder_displayed(swc, folderA);

    await close_search_window(swc);
  }
);

/**
 * Test opening a search window while a different folder is selected.
 */
add_task(async function test_open_search_window_with_one_thing_selected() {
  select_click_folder(folderA);
  assert_folders_selected_and_displayed(folderA);

  const swc = await open_search_window_from_context_menu(folderB);
  assert_search_window_folder_displayed(swc, folderB);

  await close_search_window(swc);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
