/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the folder names have account name appended when in "recent" view.
 */

"use strict";

var {
  assert_folder_at_index_as,
  assert_folder_mode,
  assert_folder_tree_view_row_count,
  be_in_folder,
  make_message_sets_in_folders,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(function () {
  assert_folder_mode("all");
  assert_folder_tree_view_row_count(7);
});

add_task(async function test_folder_names_in_recent_view_mode() {
  // We need 2 local accounts that have pristine folders with
  // unmodified times, so that it does not influence the
  // list of Recent folders. So clear out the most-recently-used time.
  for (const acc of MailServices.accounts.accounts) {
    for (const fld of acc.incomingServer.rootFolder.subFolders) {
      fld.setStringProperty("MRUTime", "0");
    }
  }

  const acc1 = MailServices.accounts.accounts[1];
  const acc2 = MailServices.accounts.accounts[0];
  const rootFolder1 = acc1.incomingServer.rootFolder;
  const rootFolder2 = acc2.incomingServer.rootFolder;

  // Create some test folders.
  rootFolder1.createSubfolder("uniqueName", null);
  rootFolder1.createSubfolder("duplicatedName", null);
  rootFolder2.createSubfolder("duplicatedName", null);
  const inbox2 = rootFolder2.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  inbox2.createSubfolder("duplicatedName", null);

  const fUnique = rootFolder1.getChildNamed("uniqueName");
  const fDup1 = rootFolder1.getChildNamed("duplicatedName");
  const fDup2 = rootFolder2.getChildNamed("duplicatedName");
  const fDup3 = inbox2.getChildNamed("duplicatedName");

  // Close the inbox folder if open. This might happen when running multiple
  // tests from the folder-pane.
  const index = window.gFolderTreeView.getIndexOfFolder(inbox2);
  if (index != null) {
    if (window.gFolderTreeView._rowMap[index].open) {
      window.gFolderTreeView._toggleRow(index, false);
    }
  }
  assert_folder_tree_view_row_count(10);

  // Create some messages in the folders to make them recently used.
  await make_message_sets_in_folders([fUnique], [{ count: 1 }]);
  await be_in_folder(fUnique);
  await make_message_sets_in_folders([fDup1], [{ count: 1 }]);
  await be_in_folder(fDup1);
  await make_message_sets_in_folders([fDup2], [{ count: 2 }]);
  await be_in_folder(fDup2);
  await make_message_sets_in_folders([fDup3], [{ count: 3 }]);
  await be_in_folder(fDup3);

  // Enable the recent folder view.
  window.gFolderTreeView.activeModes = "recent";
  // Hide the all folder view by passing the value to the setter, which will
  // take care of toggling off the view if currently visible.
  window.gFolderTreeView.activeModes = "all";

  // Check displayed folder names.
  // In Recent mode the folders are sorted alphabetically and the first index is
  // the Mode Header item.
  assert_folder_at_index_as(0, "Recent Folders");
  assert_folder_at_index_as(1, "duplicatedName - Local Folders (1)");
  assert_folder_at_index_as(2, "duplicatedName - tinderbox@foo.invalid (3)");
  assert_folder_at_index_as(3, "duplicatedName - tinderbox@foo.invalid (2)");
  assert_folder_at_index_as(4, "uniqueName - Local Folders (1)");
  assert_folder_tree_view_row_count(5);

  // Remove our folders to clean up.
  rootFolder1.propagateDelete(fUnique, true);
  rootFolder1.propagateDelete(fDup1, true);
  rootFolder2.propagateDelete(fDup2, true);
  rootFolder2.propagateDelete(fDup3, true);
});

registerCleanupFunction(function () {
  // Hide the recent folders view enabled in the previous test. The activeModes
  // setter should take care of restoring the "all" view and prevent and empty
  // Folder pane.
  window.gFolderTreeView.activeModes = "recent";
  assert_folder_mode("all");
  assert_folder_tree_view_row_count(7);

  document.getElementById("folderTree").focus();

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
