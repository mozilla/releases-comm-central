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
  delete_messages,
  get_about_3pane,
  inboxFolder,
  make_message_sets_in_folders,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var about3Pane;
var inboxSubfolder;
var trashFolder;
var trashSubfolder;
var inboxSet;

add_setup(async function () {
  about3Pane = get_about_3pane();

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
  [inboxSet] = await make_message_sets_in_folders(
    [inboxFolder],
    [{ count: 1 }]
  );
  await make_message_sets_in_folders([inboxSubfolder], [{ count: 1 }]);

  // Switch to the unread folder mode.
  await be_in_folder(inboxFolder);
  about3Pane.folderPane.activeModes = ["unread"];
});

/**
 * Test that inbox and inboxSubfolder are in view
 */
add_task(async function test_folder_population() {
  about3Pane.folderTree.expandRowAtIndex(0);
  await new Promise(resolve => setTimeout(resolve));
  assert_folder_visible(inboxFolder);

  about3Pane.folderTree.expandRowAtIndex(1);
  await new Promise(resolve => setTimeout(resolve));
  assert_folder_visible(inboxSubfolder);
});

/**
 * Test that a folder newly getting unread messages doesn't
 * change the selected folder in unread folders mode.
 */
add_task(async function test_newly_added_folder() {
  const [newSet] = await make_message_sets_in_folders(
    [trashFolder],
    [{ count: 1 }]
  );
  assert_folder_visible(trashFolder);
  Assert.equal(about3Pane.folderTree.selectedIndex, 0);
  await delete_messages(newSet);
});

registerCleanupFunction(async function () {
  inboxFolder.propagateDelete(inboxSubfolder, true);
  await delete_messages(inboxSet);
  trashFolder.propagateDelete(trashSubfolder, true);
  about3Pane.folderPane.activeModes = ["all"];
});
