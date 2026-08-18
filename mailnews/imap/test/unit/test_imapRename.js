/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// This tests that renaming non-ASCII name folder works, and that the settings
// of a renamed folder are not lost.

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The flags a user can turn on for a single folder in its properties dialog.
const settingFlags = {
  Offline: Ci.nsMsgFolderFlags.Offline,
  CheckNew: Ci.nsMsgFolderFlags.CheckNew,
  Favorite: Ci.nsMsgFolderFlags.Favorite,
};

add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
  IMAPPump.incomingServer.rootFolder.createSubfolder("folder 1", null);
  await PromiseTestUtils.promiseFolderAdded("folder 1");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;
});

add_task(async function test_rename() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  const targetFolder = rootFolder.getChildNamed("folder 1");
  applySettings(targetFolder);

  targetFolder.rename("folder \u00e1", null);

  IMAPPump.server.performTest("RENAME");
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  const folder = rootFolder.getChildNamed("folder \u00e1");
  Assert.ok(folder.msgDatabase.summaryValid);
  Assert.equal("folder &AOE-", folder.filePath.leafName);
  Assert.equal("folder \u00e1", folder.name);

  // The folder is addressed by its encoded name, so the settings have to reach
  // it under that name and no summary file may appear under the decoded one.
  assertSettings(folder, "the folder renamed to a non-ASCII name");
  const decodedSummaryFile = folder.filePath.parent.clone();
  decodedSummaryFile.append("folder \u00e1.msf");
  Assert.ok(
    !decodedSummaryFile.exists(),
    "no summary file for a second folder"
  );
});

// Renaming an IMAP folder replaces its database with an empty one, so
// everything the user configured on the folder has to be carried over.
add_task(async function test_renameKeepsSettings() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;

  // A folder the user has configured.
  const folderAdded = PromiseTestUtils.promiseFolderAdded("with settings");
  rootFolder.createSubfolder("with settings", null);
  const folder = await folderAdded;
  applySettings(folder);

  // Rename it, which is what the properties dialog and the context menu do.
  folder.rename("renamed", null);
  IMAPPump.server.performTest("RENAME");

  // Let the rename settle before looking at the result.
  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  const renamedFolder = rootFolder.getChildNamed("renamed");
  Assert.ok(renamedFolder.msgDatabase.summaryValid, "the rename went through");
  assertSettings(renamedFolder, "the renamed folder");

  // The server hands out a new UIDVALIDITY for the renamed mailbox, which makes
  // the first sync of the folder replace the database once more.
  const syncListener = new PromiseTestUtils.PromiseUrlListener();
  renamedFolder
    .QueryInterface(Ci.nsIMsgImapMailFolder)
    .updateFolderWithListener(null, syncListener);
  await syncListener.promise;
  assertSettings(renamedFolder, "the renamed folder after its first sync");
});

// The rename writes retention settings, so make sure it doesn't hand its own
// to a folder that just follows the account.
add_task(async function test_renameKeepsFollowingTheAccount() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;

  // A folder the user has not configured, so it follows the account.
  const folderAdded = PromiseTestUtils.promiseFolderAdded("without settings");
  rootFolder.createSubfolder("without settings", null);
  const folder = await folderAdded;

  folder.rename("renamed again", null);
  IMAPPump.server.performTest("RENAME");

  const listener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, listener);
  await listener.promise;

  Assert.ok(
    rootFolder.getChildNamed("renamed again").retentionSettings
      .useServerDefaults,
    "the renamed folder has no retention settings of its own"
  );
});

// Moving an IMAP folder renames it on the server, so it loses its database the
// same way.
add_task(async function test_moveKeepsSettings() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;

  // Somewhere to move to.
  let folderAdded = PromiseTestUtils.promiseFolderAdded("destination");
  rootFolder.createSubfolder("destination", null);
  const destination = await folderAdded;

  // A folder the user has configured.
  folderAdded = PromiseTestUtils.promiseFolderAdded("to move");
  rootFolder.createSubfolder("to move", null);
  const folder = await folderAdded;
  applySettings(folder);

  // Move it, which is what dragging it in the folder pane does.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(folder, destination, true, copyListener, null);
  await copyListener.promise;

  assertSettings(destination.getChildNamed("to move"), "the moved folder");
});

// Deleting a folder moves it to the trash, which is a rename as well. A folder
// on its way out must not get the settings back.
add_task(async function test_moveToTrashDropsSettings() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;
  const trash = rootFolder.getFolderWithFlags(Ci.nsMsgFolderFlags.Trash);
  Assert.ok(trash, "the account has a trash folder");

  // A folder the user has configured.
  const folderAdded = PromiseTestUtils.promiseFolderAdded("to delete");
  rootFolder.createSubfolder("to delete", null);
  const folder = await folderAdded;
  applySettings(folder);

  // Delete it, which moves it to the trash.
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(folder, trash, true, copyListener, null);
  await copyListener.promise;

  const deletedFolder = trash.getChildNamed("to delete");
  Assert.ok(
    !(deletedFolder.flags & Ci.nsMsgFolderFlags.Favorite),
    "the deleted folder is no longer a favourite"
  );
  Assert.ok(
    !(deletedFolder.flags & Ci.nsMsgFolderFlags.CheckNew),
    "the deleted folder is no longer checked for new messages"
  );
});

/**
 * Give a folder the settings the tests check for. These are the settings a user
 * can make for a single folder, as opposed to the whole account.
 *
 * @param {nsIMsgFolder} folder
 */
function applySettings(folder) {
  for (const flag of Object.values(settingFlags)) {
    folder.setFlag(flag);
  }

  const retentionSettings = Cc[
    "@mozilla.org/msgDatabase/retentionSettings;1"
  ].createInstance(Ci.nsIMsgRetentionSettings);
  retentionSettings.useServerDefaults = false;
  retentionSettings.retainByPreference =
    Ci.nsIMsgRetentionSettings.nsMsgRetainByNumHeaders;
  retentionSettings.numHeadersToKeep = 42;
  retentionSettings.applyToFlaggedMessages = true;
  // Through the database, so the folder has to read them back the way it does
  // after a restart, instead of answering from memory.
  folder.msgDatabase.msgRetentionSettings = retentionSettings;

  // Where the user dragged the folder to in a manually sorted folder list.
  folder.userSortOrder = 7;
}

/**
 * Check the settings applied by applySettings, in the folder and in
 * its database. The renamed folder is a new object with a new database, so its
 * values can only come from the folder it was renamed from.
 *
 * @param {nsIMsgFolder} folder
 * @param {string} what - Names the folder in the assertion messages.
 */
function assertSettings(folder, what) {
  for (const [name, flag] of Object.entries(settingFlags)) {
    Assert.ok(folder.flags & flag, `${what} has the ${name} flag`);
    Assert.ok(
      folder.msgDatabase.dBFolderInfo.flags & flag,
      `${what} has the ${name} flag in its database`
    );
  }

  Assert.equal(folder.userSortOrder, 7, `${what} keeps its place in the list`);
  Assert.equal(
    folder.msgDatabase.dBFolderInfo.userSortOrder,
    7,
    `${what} has its place in the list in its database`
  );

  const retentionSettings = folder.retentionSettings;
  Assert.equal(
    retentionSettings.useServerDefaults,
    false,
    `${what} overrides the server retention settings`
  );
  Assert.equal(
    retentionSettings.retainByPreference,
    Ci.nsIMsgRetentionSettings.nsMsgRetainByNumHeaders,
    `${what} retains messages by number`
  );
  Assert.equal(
    retentionSettings.numHeadersToKeep,
    42,
    `${what} keeps 42 messages`
  );
  Assert.ok(
    retentionSettings.applyToFlaggedMessages,
    `${what} applies retention to starred messages`
  );
  // The folder answers from memory, so read the database row itself to see that
  // the settings were written down.
  Assert.equal(
    folder.msgDatabase.dBFolderInfo.getUint32Property("numHdrsToKeep", 0),
    42,
    `${what} has its retention settings in its database`
  );
}
