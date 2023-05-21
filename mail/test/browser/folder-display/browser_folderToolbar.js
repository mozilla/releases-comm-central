/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that opening new folder and message tabs has the expected result and
 *  that closing them doesn't break anything.
 */

"use strict";

var {
  add_to_toolbar,
  assert_folder_selected_and_displayed,
  assert_nothing_selected,
  be_in_folder,
  close_tab,
  create_folder,
  make_message_sets_in_folders,
  mc,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  remove_from_toolbar,
  select_click_row,
  switch_tab,
  wait_for_blank_content_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var folderA, folderB;

add_setup(async function () {
  folderA = await create_folder("FolderToolbarA");
  // we need one message to select and open
  folderB = await create_folder("FolderToolbarB");
  await make_message_sets_in_folders([folderB], [{ count: 1 }]);
});

add_task(function test_add_folder_toolbar() {
  // It should not be present by default
  let folderLoc = mc.window.document.getElementById("locationFolders");
  Assert.ok(!folderLoc);

  // But it should show up when we call
  add_to_toolbar(
    mc.window.document.getElementById("mail-bar3"),
    "folder-location-container"
  );
  folderLoc = mc.window.document.getElementById("locationFolders");
  Assert.ok(folderLoc);

  Assert.equal(
    !!folderLoc.label,
    true,
    "Uninitialized Folder doesn't have a default label."
  );
});

add_task(async function test_folder_toolbar_shows_correct_item() {
  add_to_toolbar(
    mc.window.document.getElementById("mail-bar3"),
    "folder-location-container"
  );
  let folderLoc = mc.window.document.getElementById("locationFolders");

  // Start in folder a.
  let tabFolderA = await be_in_folder(folderA);
  assert_folder_selected_and_displayed(folderA);
  assert_nothing_selected();
  Assert.equal(
    folderLoc.label,
    "FolderToolbarA",
    "Opening FolderA doesn't update toolbar."
  );

  // Open tab b, make sure it works right.
  let tabFolderB = await open_folder_in_new_tab(folderB);
  wait_for_blank_content_pane();
  assert_folder_selected_and_displayed(folderB);
  assert_nothing_selected();
  Assert.equal(
    folderLoc.label,
    "FolderToolbarB",
    "Opening FolderB in a tab doesn't update toolbar."
  );

  // Go back to tab/folder A and make sure we change correctly.
  await switch_tab(tabFolderA);
  assert_folder_selected_and_displayed(folderA);
  assert_nothing_selected();
  Assert.equal(
    folderLoc.label,
    "FolderToolbarA",
    "Switching back to FolderA's tab doesn't update toolbar."
  );

  // Go back to tab/folder A and make sure we change correctly.
  await switch_tab(tabFolderB);
  assert_folder_selected_and_displayed(folderB);
  assert_nothing_selected();
  Assert.equal(
    folderLoc.label,
    "FolderToolbarB",
    "Switching back to FolderB's tab doesn't update toolbar."
  );
  close_tab(tabFolderB);
});

add_task(async function test_folder_toolbar_disappears_on_message_tab() {
  add_to_toolbar(
    mc.window.document.getElementById("mail-bar3"),
    "folder-location-container"
  );
  await be_in_folder(folderB);
  let folderLoc = mc.window.document.getElementById("locationFolders");
  Assert.ok(folderLoc);
  Assert.equal(
    folderLoc.label,
    "FolderToolbarB",
    "We should have started in FolderB."
  );
  Assert.equal(folderLoc.collapsed, false, "The toolbar should be shown.");

  // Select one message
  select_click_row(0);
  // Open it
  let messageTab = await open_selected_message_in_new_tab();

  Assert.equal(
    mc.window.document.getElementById("folder-location-container").collapsed,
    true,
    "The toolbar should be hidden."
  );

  // Clean up, close the tab
  close_tab(messageTab);
});

add_task(function test_remove_folder_toolbar() {
  remove_from_toolbar(
    mc.window.document.getElementById("mail-bar3"),
    "folder-location-container"
  );

  Assert.ok(!mc.window.document.getElementById("locationFolders"));
});
