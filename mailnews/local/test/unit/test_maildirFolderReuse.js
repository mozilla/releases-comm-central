/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

let rootFolder;

add_setup(function () {
  const account = MailServices.accounts.createLocalMailAccount();
  rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
});

add_task(function test_folder_not_reused_after_rename() {
  const folderName = "FolderToRename";
  const folder = rootFolder.createLocalSubfolder(folderName);
  const oldURI = folder.URI;

  folder.rename("RenamedFolder", null);
  Assert.equal(folder.parent, null, "renamed folder should be detached");

  const recreated = rootFolder.createLocalSubfolder(folderName);
  Assert.notEqual(
    recreated,
    folder,
    "recreated folder should be a fresh object"
  );
  Assert.equal(
    MailServices.folderLookup.getFolderForURL(oldURI),
    recreated,
    "lookup should return the recreated folder"
  );
});

add_task(function test_folder_not_reused_after_delete() {
  const folderName = "FolderToDelete";
  const folder = rootFolder.createLocalSubfolder(folderName);
  const oldURI = folder.URI;

  rootFolder.propagateDelete(folder, true);
  Assert.equal(folder.parent, null, "deleted folder should be detached");

  const recreated = rootFolder.createLocalSubfolder(folderName);
  Assert.notEqual(
    recreated,
    folder,
    "recreating the old URI should create a fresh folder object"
  );
  Assert.equal(
    MailServices.folderLookup.getFolderForURL(oldURI),
    recreated,
    "lookup should return the recreated folder"
  );
});

add_task(function test_empty_trash_preserves_folder_object() {
  let trashFolder = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  if (!trashFolder) {
    trashFolder = rootFolder.createLocalSubfolder("Trash");
    trashFolder.setFlag(Ci.nsMsgFolderFlags.Trash);
  }
  const trashURI = trashFolder.URI;
  trashFolder.createSubfolder("FolderInTrash", null);

  trashFolder.emptyTrash(null);

  Assert.equal(
    rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash),
    trashFolder,
    "emptying maildir Trash should preserve its folder object"
  );
  Assert.equal(
    MailServices.folderLookup.getFolderForURL(trashURI),
    trashFolder,
    "lookup should still return the original Trash folder"
  );
});
