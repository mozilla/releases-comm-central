/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for the folder pane, in particular the tree view. This is kept separate
 * from the main folder-display suite so that the folders created by other tests
 * there don't influence the results here.
 */

"use strict";

var {
  FAKE_SERVER_HOSTNAME,
  assert_folder_mode,
  assert_folder_tree_view_row_count,
  be_in_folder,
  collapse_folder,
  create_folder,
  enter_folder,
  expand_folder,
  get_about_3pane,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);

var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Assert the Folder Pane is in All Folder mode by default.  Check that the
 * correct number of rows for accounts and folders are always shown as new
 * folders are created, expanded, and collapsed.
 */
add_task(async function test_all_folders_toggle_folder_open_state() {
  // Test that we are in All Folders mode by default
  assert_folder_mode("all");

  const pop3Server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  collapse_folder(pop3Server.rootFolder);
  collapse_folder(MailServices.accounts.localFoldersServer.rootFolder);

  // All folders mode should give us only 2 rows to start
  // (tinderbox account and local folders)
  const accounts = 2;
  assert_folder_tree_view_row_count(accounts);

  const inbox = 1;
  const trash = 1;
  const outbox = 1;
  const archives = 1;
  const folderPaneA = 1;
  // Create archives folder - this is ugly, but essentially the same as
  // what mailWindowOverlay.js does. We can't use the built-in helper
  // method to create the folder because we need the archive flag to get
  // set before the folder added notification is sent out, which means
  // creating the folder object via RDF, setting the flag, and then
  // creating the storage, which sends the notification.
  const folder = MailUtils.getOrCreateFolder(
    pop3Server.rootFolder.URI + "/Archives"
  );
  folder.setFlag(Ci.nsMsgFolderFlags.Archive);
  folder.createStorageIfMissing(null);
  // After creating Archives, account should have expanded
  // so that we should have 5 rows visible
  assert_folder_tree_view_row_count(accounts + inbox + trash + archives);
  // close the tinderbox server.
  collapse_folder(pop3Server.rootFolder);
  const folderA = await create_folder("FolderPaneA");
  await be_in_folder(folderA);

  // After creating our first folder we should have 6 rows visible
  assert_folder_tree_view_row_count(
    accounts + inbox + trash + outbox + folderPaneA
  );

  const about3Pane = get_about_3pane();
  const oneFolderCount = about3Pane.folderTree.rowCount;

  // This makes sure the folder can be toggled
  folderA.createSubfolder("FolderPaneB", null);
  const folderB = folderA.getChildNamed("FolderPaneB");
  // Enter folderB, then enter folderA. This makes sure that folderA is not
  // collapsed.
  await enter_folder(folderB);
  await enter_folder(folderA);

  // At this point folderA should be open, so the view should have one more
  // item than before (FolderPaneB).
  assert_folder_tree_view_row_count(oneFolderCount + 1);

  // Toggle the open state of folderA
  collapse_folder(folderA);

  // folderA should be collapsed so we are back to the original count
  assert_folder_tree_view_row_count(oneFolderCount);

  // Toggle it back to open
  expand_folder(folderA);

  // folderB should be visible again
  assert_folder_tree_view_row_count(oneFolderCount + 1);

  // Close folderA and delete folderB.
  collapse_folder(folderA);
  MailServices.accounts.localFoldersServer.rootFolder.propagateDelete(
    folderB,
    true
  );
  // Open folderA again and check folderB is deleted.
  expand_folder(folderA);
  assert_folder_tree_view_row_count(oneFolderCount);

  // Clean up
  expand_folder(pop3Server.rootFolder);
  folder.clearFlag(Ci.nsMsgFolderFlags.Archive);
  pop3Server.rootFolder.propagateDelete(folder, true, null);
  MailServices.accounts.localFoldersServer.rootFolder.propagateDelete(
    folderA,
    true
  );

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
