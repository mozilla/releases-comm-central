/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that the smart folder mode works properly.
 */

"use strict";

var {
  archive_selected_messages,
  expand_folder,
  FAKE_SERVER_HOSTNAME,
  get_about_3pane,
  get_smart_folder_named,
  get_special_folder,
  inboxFolder,
  make_message_sets_in_folders,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var about3Pane;
var rootFolder;
var inboxSubfolder;
var trashFolder;
var trashSubfolder;

var smartInboxFolder;

add_setup(async function () {
  about3Pane = get_about_3pane();
  rootFolder = inboxFolder.server.rootFolder;
  // Create a folder as a subfolder of the inbox
  inboxFolder.createSubfolder("SmartFoldersA", null);
  inboxSubfolder = inboxFolder.getChildNamed("SmartFoldersA");

  trashFolder = inboxFolder.server.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  trashFolder.createSubfolder("SmartFoldersB", null);
  trashSubfolder = trashFolder.getChildNamed("SmartFoldersB");

  // The message itself doesn't really matter, as long as there's at least one
  // in the folder.
  await make_message_sets_in_folders([inboxFolder], [{ count: 1 }]);
  await make_message_sets_in_folders([inboxSubfolder], [{ count: 1 }]);

  // Switch to the smart folder mode.
  about3Pane.folderPane.activeModes = ["smart"];

  // The smart inbox may not have been created at setup time, so get it now.
  smartInboxFolder = get_smart_folder_named("Inbox");
});

/**
 * Test that smart folders are updated when the folders they should be
 * searching over are added/removed or have the relevant flag set/cleared.
 */
add_task(async function test_folder_flag_changes() {
  expand_folder(smartInboxFolder);
  // Now attempt to select the folder.
  about3Pane.displayFolder(inboxSubfolder);
  // Need to archive two messages in two different accounts in order to
  // create a smart Archives folder.
  await select_click_row(0);
  await archive_selected_messages();
  const pop3Server = MailServices.accounts.findServer(
    "tinderbox",
    FAKE_SERVER_HOSTNAME,
    "pop3"
  );
  const pop3Inbox = await get_special_folder(
    Ci.nsMsgFolderFlags.Inbox,
    false,
    pop3Server
  );
  await make_message_sets_in_folders([pop3Inbox], [{ count: 1 }]);
  about3Pane.displayFolder(pop3Inbox);
  await select_click_row(0);
  await archive_selected_messages();

  const smartArchiveFolder = get_smart_folder_named("Archives");
  let archiveScope =
    "|" +
    smartArchiveFolder.msgDatabase.dBFolderInfo.getCharProperty(
      "searchFolderUri"
    ) +
    "|";
  // We should have both this account, and a folder corresponding
  // to this year in the scope.
  rootFolder = inboxFolder.server.rootFolder;
  let archiveFolder = rootFolder.getChildNamed("Archives");
  assert_folder_and_children_in_scope(archiveFolder, archiveScope);
  archiveFolder = pop3Server.rootFolder.getChildNamed("Archives");
  assert_folder_and_children_in_scope(archiveFolder, archiveScope);

  // Remove the archive flag, and make sure the archive folder and
  // its children are no longer in the search scope.
  archiveFolder.clearFlag(Ci.nsMsgFolderFlags.Archive);

  // Refresh the archive scope because clearing the flag should have
  // changed it.
  archiveScope =
    "|" +
    smartArchiveFolder.msgDatabase.dBFolderInfo.getCharProperty(
      "searchFolderUri"
    ) +
    "|";

  // figure out what we expect the archiveScope to now be.
  rootFolder = inboxFolder.server.rootFolder;
  const localArchiveFolder = rootFolder.getChildNamed("Archives");
  let desiredScope = "|" + localArchiveFolder.URI + "|";
  for (const folder of localArchiveFolder.descendants) {
    desiredScope += folder.URI + "|";
  }

  Assert.equal(
    archiveScope,
    desiredScope,
    "archive scope after removing folder"
  );
  assert_folder_and_children_not_in_scope(archiveFolder, archiveScope);
});

function assert_folder_and_children_in_scope(folder, searchScope) {
  const folderURI = "|" + folder.URI + "|";
  assert_uri_found(folderURI, searchScope);
  for (const f of folder.descendants) {
    assert_uri_found(f.URI, searchScope);
  }
}

function assert_folder_and_children_not_in_scope(folder, searchScope) {
  const folderURI = "|" + folder.URI + "|";
  assert_uri_not_found(folderURI, searchScope);
  for (const f of folder.descendants) {
    assert_uri_not_found(f.URI, searchScope);
  }
}

function assert_uri_found(folderURI, scopeList) {
  if (!scopeList.includes(folderURI)) {
    throw new Error("scope " + scopeList + "doesn't contain " + folderURI);
  }
}

function assert_uri_not_found(folderURI, scopeList) {
  if (scopeList.includes(folderURI)) {
    throw new Error(
      "scope " + scopeList + "contains " + folderURI + " but shouldn't"
    );
  }
}

registerCleanupFunction(async function () {
  about3Pane.folderPane.activeModes = ["all"];
  inboxFolder.propagateDelete(inboxSubfolder, true);
  inboxFolder.deleteMessages(
    [...inboxFolder.messages],
    top.msgWindow,
    false,
    false,
    null,
    false
  );
  trashFolder.propagateDelete(trashSubfolder, true);
});
