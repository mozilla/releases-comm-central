/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that opening new folder and message tabs has the expected result and
 *  that closing them doesn't break anything.
 */

"use strict";

var {
  assert_folder_selected_and_displayed,
  assert_nothing_selected,
  be_in_folder,
  close_tab,
  create_folder,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  open_selected_message_in_new_tab,
  select_click_row,
  switch_tab,
  wait_for_blank_content_pane,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

var folderA, folderB;

add_setup(async function () {
  folderA = await create_folder("FolderToolbarA");
  // we need one message to select and open
  folderB = await create_folder("FolderToolbarB");
  await make_message_sets_in_folders([folderB], [{ count: 1 }]);

  storeState({
    mail: ["folder-location"],
  });
  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      subtree: true,
      childList: true,
    },
    () =>
      document.querySelector("#unifiedToolbarContent .folder-location button")
  );
  registerCleanupFunction(() => {
    storeState({});
  });
});

add_task(async function test_folder_toolbar_shows_correct_item() {
  const folderLoc = document.querySelector(
    "#unifiedToolbarContent .folder-location button"
  );

  // Start in folder a.
  const tabFolderA = await be_in_folder(folderA);
  assert_folder_selected_and_displayed(folderA);
  await assert_nothing_selected();
  Assert.equal(
    folderLoc.label.textContent,
    "FolderToolbarA",
    "Opening FolderA doesn't update toolbar."
  );

  // Open tab b, make sure it works right.
  const tabFolderB = await open_folder_in_new_tab(folderB);
  await wait_for_blank_content_pane();
  assert_folder_selected_and_displayed(folderB);
  await assert_nothing_selected();
  Assert.equal(
    folderLoc.label.textContent,
    "FolderToolbarB",
    "Opening FolderB in a tab doesn't update toolbar."
  );

  // Go back to tab/folder A and make sure we change correctly.
  await switch_tab(tabFolderA);
  assert_folder_selected_and_displayed(folderA);
  await assert_nothing_selected();
  Assert.equal(
    folderLoc.label.textContent,
    "FolderToolbarA",
    "Switching back to FolderA's tab doesn't update toolbar."
  );

  // Go back to tab/folder A and make sure we change correctly.
  await switch_tab(tabFolderB);
  assert_folder_selected_and_displayed(folderB);
  await assert_nothing_selected();
  Assert.equal(
    folderLoc.label.textContent,
    "FolderToolbarB",
    "Switching back to FolderB's tab doesn't update toolbar."
  );
  close_tab(tabFolderB);
});

add_task(async function test_folder_toolbar_disappears_on_message_tab() {
  await be_in_folder(folderB);
  const folderLoc = document.querySelector(
    "#unifiedToolbarContent .folder-location button"
  );
  Assert.ok(folderLoc);
  Assert.equal(
    folderLoc.label.textContent,
    "FolderToolbarB",
    "We should have started in FolderB."
  );
  Assert.ok(!folderLoc.disabled, "The toolbar button should be enabled.");

  // Select one message
  await select_click_row(0);
  // Open it
  const messageTab = await open_selected_message_in_new_tab();

  await BrowserTestUtils.waitForMutationCondition(
    document.getElementById("unifiedToolbarContent"),
    {
      attributes: true,
    },
    () => folderLoc.disabled
  );
  Assert.ok(folderLoc.disabled, "The toolbar button should be disabled.");

  // Clean up, close the tab
  close_tab(messageTab);
});
