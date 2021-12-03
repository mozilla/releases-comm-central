/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the unread folder mode works properly. This includes making
 * sure that the selected folder is maintained correctly when the view
 * is rebuilt because a folder has become newly unread.
 */

"use strict";

var {
  assert_folder_visible,
  be_in_folder,
  delete_message_set,
  inboxFolder,
  make_new_sets_in_folder,
  mc,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var rootFolder;
var inboxSubfolder;
var trashFolder;
var trashSubfolder;
var inboxSet;

add_task(function setupModule(module) {
  rootFolder = inboxFolder.server.rootFolder;

  // Create a folder as a subfolder of the inbox
  inboxFolder.createSubfolder("UnreadFoldersA", null);
  inboxSubfolder = inboxFolder.getChildNamed("UnreadFoldersA");

  trashFolder = inboxFolder.server.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  trashFolder.createSubfolder("UnreadFoldersB", null);
  trashSubfolder = trashFolder.getChildNamed("UnreadFoldersB");

  // The message itself doesn't really matter, as long as there's at least one
  // in the folder.
  [inboxSet] = make_new_sets_in_folder(inboxFolder, [{ count: 1 }]);
  make_new_sets_in_folder(inboxSubfolder, [{ count: 1 }]);
});

/**
 * Switch to the unread folder mode.
 */
add_task(function test_switch_to_unread_folders() {
  be_in_folder(inboxFolder);
  mc.folderTreeView.activeModes = "unread";
  // Hide the all folder views.
  mc.folderTreeView.activeModes = "all";
});

/**
 * Test that inbox and inboxSubfolder are in view
 */
add_task(function test_folder_population() {
  assert_folder_visible(inboxFolder);
  assert_folder_visible(inboxSubfolder);
});

/**
 * Test that a folder newly getting unread messages doesn't
 * change the selected folder in unread folders mode.
 */
add_task(function test_newly_added_folder() {
  let [newSet] = make_new_sets_in_folder(trashFolder, [{ count: 1 }]);
  assert_folder_visible(trashFolder);
  if (mc.folderTreeView.getSelectedFolders()[0] != inboxFolder) {
    throw new Error(
      "Inbox folder should be selected after new unread folder" +
        " added to unread view"
    );
  }
  delete_message_set(newSet);
});

registerCleanupFunction(function teardownModule() {
  inboxFolder.propagateDelete(inboxSubfolder, true, null);
  delete_message_set(inboxSet);
  trashFolder.propagateDelete(trashSubfolder, true, null);
  mc.folderTreeView.activeModes = "unread";

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
