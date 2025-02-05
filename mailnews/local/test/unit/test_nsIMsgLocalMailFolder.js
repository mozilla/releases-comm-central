/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for local folder functions.
 */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

/**
 * Bug 66763
 * Test deletion of a folder with a name already existing in Trash.
 */
function subtest_folder_deletion(root) {
  // Now we only have <root> and some default subfolders, like Trash.
  const trash = root.getChildNamed("Trash");
  Assert.ok(!trash.hasSubFolders);

  // Create new "folder" in root.
  let folder = root.createLocalSubfolder("folder");
  const path = folder.filePath;
  Assert.ok(path.exists());

  // Delete "folder" into Trash.
  folder.deleteSelf(null);
  Assert.ok(!path.exists());
  Assert.equal(trash.numSubFolders, 1);
  trash.getChildNamed("folder");

  // Create another "folder" in root.
  folder = root.createLocalSubfolder("folder");
  // Delete "folder" into Trash again.
  folder.deleteSelf(null);
  Assert.equal(trash.numSubFolders, 2);
  // The folder should be automatically renamed as the same name already is in Trash.
  trash.getChildNamed("folder(2)");

  // Create yet another "folder" in root.
  folder = root.createLocalSubfolder("folder");

  // But now with another subfolder
  folder
    .QueryInterface(Ci.nsIMsgLocalMailFolder)
    .createLocalSubfolder("subfolder");

  // Delete folder into Trash again
  folder.deleteSelf(null);
  Assert.equal(trash.numSubFolders, 3);
  // The folder should be automatically renamed as the same name already is in Trash
  // but the subfolder should be untouched.
  const folderDeleted3 = trash.getChildNamed("folder(3)");
  Assert.notEqual(folderDeleted3, null);
  Assert.ok(folderDeleted3.containsChildNamed("subfolder"));
  // Now we have <root>
  //               +--Trash
  //                    +--folder
  //                    +--folder(2)
  //                    +--folder(3)
  //                         +--subfolder

  // Create another "folder(3)" in root.
  Assert.ok(!root.containsChildNamed("folder(3)"));
  folder = root.createLocalSubfolder("folder(3)");
  Assert.ok(root.containsChildNamed("folder(3)"));
  // Now try to move "folder(3)" from Trash back to root.
  // That should fail, because the user gets a prompt about it and that does
  // not work in xpcshell.
  try {
    root.copyFolderLocal(folderDeleted3, true, null, null);
    do_throw("copyFolderLocal() should have failed here due to user prompt!");
  } catch (e) {
    // Catch only the expected error NS_MSG_ERROR_COPY_FOLDER_ABORTED,
    // otherwise fail the test.
    if (e.result != 0x8055001a) {
      throw e;
    }
  }
}

/**
 * Test proper creation/rename/removal of folders under a Local mail account
 */
function subtest_folder_operations(root) {
  // Test - num/hasSubFolders

  // Get the current number of folders
  var numSubFolders = root.numSubFolders;

  var folder = root
    .createLocalSubfolder("folder1")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);

  Assert.ok(root.hasSubFolders);
  Assert.equal(root.numSubFolders, numSubFolders + 1);

  Assert.ok(!folder.hasSubFolders);
  Assert.equal(folder.numSubFolders, 0);

  var folder2 = folder.createLocalSubfolder("folder2");

  Assert.ok(folder.hasSubFolders);
  Assert.equal(folder.numSubFolders, 1);

  // Now we have <root>
  //               +--folder1
  //                    +--folder2

  // Test - getChildNamed

  Assert.equal(root.getChildNamed("folder1"), folder);

  // Check for non match, this should return null.
  Assert.equal(
    root.getChildNamed("folder2"),
    null,
    "should get null folder2 child when not found"
  );

  // folder2 is a child of folder however.
  folder2 = folder.getChildNamed("folder2");

  // Test - isAncestorOf

  Assert.ok(folder.isAncestorOf(folder2));
  Assert.ok(root.isAncestorOf(folder2));
  Assert.ok(!folder.isAncestorOf(root));

  // Test - FoldersWithFlag

  folder.setFlag(Ci.nsMsgFolderFlags.CheckNew);
  Assert.ok(folder.getFlag(Ci.nsMsgFolderFlags.CheckNew));
  Assert.ok(!folder.getFlag(Ci.nsMsgFolderFlags.Offline));

  folder.setFlag(Ci.nsMsgFolderFlags.Offline);
  Assert.ok(folder.getFlag(Ci.nsMsgFolderFlags.CheckNew));
  Assert.ok(folder.getFlag(Ci.nsMsgFolderFlags.Offline));

  folder.toggleFlag(Ci.nsMsgFolderFlags.CheckNew);
  Assert.ok(!folder.getFlag(Ci.nsMsgFolderFlags.CheckNew));
  Assert.ok(folder.getFlag(Ci.nsMsgFolderFlags.Offline));

  folder.clearFlag(Ci.nsMsgFolderFlags.Offline);
  Assert.ok(!folder.getFlag(Ci.nsMsgFolderFlags.CheckNew));
  Assert.ok(!folder.getFlag(Ci.nsMsgFolderFlags.Offline));

  folder.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folder2.setFlag(Ci.nsMsgFolderFlags.Favorite);
  folder.setFlag(Ci.nsMsgFolderFlags.CheckNew);
  folder2.setFlag(Ci.nsMsgFolderFlags.Offline);

  Assert.equal(root.getFolderWithFlags(Ci.nsMsgFolderFlags.CheckNew), folder);

  // Test - Move folders around

  var folder3 = root.createLocalSubfolder("folder3");
  var folder3Local = folder3.QueryInterface(Ci.nsIMsgLocalMailFolder);
  var folder1Local = folder.QueryInterface(Ci.nsIMsgLocalMailFolder);

  // put a single message in folder1.
  const messageGenerator = new MessageGenerator();
  const message = messageGenerator.makeMessage();
  const hdr = folder1Local.addMessage(message.toMessageString());
  Assert.equal(message.messageId, hdr.messageId);

  folder3Local.copyFolderLocal(folder, true, null, null);

  // Test - Get the new folders, make sure the old ones don't exist

  var folder1Moved = folder3.getChildNamed("folder1");
  folder1Moved.getChildNamed("folder2");

  Assert.equal(
    root.getChildNamed("folder1"),
    null,
    "should get null folder1 child when not found"
  );

  if (folder.filePath.exists()) {
    dump("shouldn't exist - folder file path " + folder.URI + "\n");
  }
  Assert.ok(!folder.filePath.exists());
  if (folder2.filePath.exists()) {
    dump("shouldn't exist - folder2 file path " + folder2.URI + "\n");
  }
  Assert.ok(!folder2.filePath.exists());

  // make sure getting the db doesn't throw an exception
  let db = folder1Moved.msgDatabase;
  Assert.ok(db.summaryValid);

  // Move folders back, get them
  var rootLocal = root.QueryInterface(Ci.nsIMsgLocalMailFolder);
  rootLocal.copyFolderLocal(folder1Moved, true, null, null);
  folder = root.getChildNamed("folder1");
  folder2 = folder.getChildNamed("folder2");

  // Test - Rename (test that .msf file is renamed as well)
  folder.rename("folder1-newname", null);
  // make sure getting the db doesn't throw an exception, and is valid
  folder = rootLocal.getChildNamed("folder1-newname");
  db = folder.msgDatabase;
  Assert.ok(db.summaryValid);

  folder.rename("folder1", null);
  folder = rootLocal.getChildNamed("folder1");

  // Test - propagateDelete (this tests recursiveDelete as well)
  // The folders will be removed from disk completely, not merely to Trash.

  var path1 = folder.filePath;
  var path2 = folder2.filePath;
  var path3 = folder3.filePath;

  Assert.ok(path1.exists());
  Assert.ok(path2.exists());
  Assert.ok(path3.exists());

  // First try deleting folder3 -- folder1 and folder2 paths should still exist
  root.propagateDelete(folder3, true);

  Assert.ok(path1.exists());
  Assert.ok(path2.exists());
  Assert.ok(!path3.exists());

  root.propagateDelete(folder, true);

  Assert.ok(!path1.exists());
  Assert.ok(!path2.exists());
}

function test_store_rename(root) {
  let folder1 = root
    .createLocalSubfolder("newfolder1")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  Assert.ok(root.hasSubFolders);
  Assert.ok(!folder1.hasSubFolders);
  let folder2 = folder1.createLocalSubfolder("newfolder1-sub");
  let folder3 = root
    .createLocalSubfolder("newfolder3")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder3.createLocalSubfolder("newfolder3-sub");

  Assert.ok(folder1.hasSubFolders);
  Assert.ok(!folder2.hasSubFolders);
  Assert.ok(folder3.hasSubFolders);

  folder1.rename("folder1", null);
  Assert.ok(root.containsChildNamed("folder1"));
  folder1 = root.getChildNamed("folder1");

  folder1.rename("newfolder1", null);
  Assert.ok(root.containsChildNamed("newfolder1"));
  folder1 = root.getChildNamed("newfolder1");
  folder2 = folder1.getChildNamed("newfolder1-sub");

  Assert.ok(folder1.containsChildNamed(folder2.name));
  Assert.ok(folder2.filePath.exists());

  folder3 = root.getChildNamed("newfolder3");
  root.propagateDelete(folder3, true);
  Assert.ok(!root.containsChildNamed("newfolder3"));
  folder3 = root
    .createLocalSubfolder("newfolder3")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder3.createLocalSubfolder("newfolder3-sub");
  folder3.rename("folder3", null);

  Assert.ok(root.containsChildNamed("folder3"));
  Assert.ok(!root.containsChildNamed("newfolder3"));
}

function test_unsafe_characters(root) {
  // Create α, β, and γ.

  root.createSubfolder("folder α", null);
  const folderAlpha = root.getChildNamed("folder α");
  const folderBeta = root.createLocalSubfolder("folder β");
  folderBeta.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderBeta.createLocalSubfolder("folder γ");

  const safeAlpha = AppConstants.platform == "win" ? "0750df29" : "folder α";
  Assert.ok(root.containsChildNamed("folder α"));
  Assert.equal(folderAlpha.name, "folder α");
  Assert.equal(folderAlpha.filePath.leafName, safeAlpha);
  Assert.ok(folderAlpha.filePath.exists());
  Assert.equal(folderAlpha.summaryFile.leafName, `${safeAlpha}.msf`);
  Assert.ok(folderAlpha.summaryFile.exists());

  const safeBeta = AppConstants.platform == "win" ? "6b171c02" : "folder β";
  Assert.ok(root.containsChildNamed("folder β"));
  Assert.equal(root.getChildNamed("folder β"), folderBeta);
  Assert.equal(folderBeta.name, "folder β");
  Assert.equal(folderBeta.filePath.leafName, safeBeta);
  Assert.ok(folderBeta.filePath.exists());
  Assert.equal(folderBeta.summaryFile.leafName, `${safeBeta}.msf`);
  Assert.ok(folderBeta.summaryFile.exists());
  Assert.equal(
    folderBeta.subFolders[0].filePath.parent.leafName,
    `${safeBeta}.sbd`
  );
  Assert.ok(folderBeta.subFolders[0].filePath.parent.exists());

  // Rename β to δ.

  folderBeta.rename("folder δ", null);
  Assert.ok(!root.containsChildNamed("folder β"));
  Assert.ok(root.containsChildNamed("folder δ"));

  const folderDelta = root.getChildNamed("folder δ");
  folderDelta.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const safeDelta = AppConstants.platform == "win" ? "32a395b4" : "folder δ";
  Assert.equal(folderDelta.name, "folder δ");
  Assert.equal(folderDelta.filePath.leafName, safeDelta);
  Assert.ok(folderDelta.filePath.exists());
  Assert.equal(folderDelta.summaryFile.leafName, `${safeDelta}.msf`);
  Assert.ok(folderDelta.summaryFile.exists());
  Assert.equal(
    folderDelta.subFolders[0].filePath.parent.leafName,
    `${safeDelta}.sbd`
  );
  Assert.ok(folderDelta.subFolders[0].filePath.parent.exists());

  // Copy α into δ.

  // Note: this operation is synchronous and even if we passed a listener it
  // wouldn't get called anyway. Such consistency!
  folderDelta.copyFolderLocal(folderAlpha, false, null, null);

  Assert.ok(root.containsChildNamed("folder α"));
  Assert.ok(folderDelta.containsChildNamed("folder α"));
  const newFolderAlpha = folderDelta.getChildNamed("folder α");
  Assert.notEqual(newFolderAlpha, folderAlpha);
  Assert.equal(newFolderAlpha.name, "folder α");
  Assert.equal(newFolderAlpha.filePath.leafName, safeAlpha);
  Assert.ok(newFolderAlpha.filePath.exists());
  Assert.equal(newFolderAlpha.summaryFile.leafName, `${safeAlpha}.msf`);
  Assert.ok(newFolderAlpha.summaryFile.exists());
  Assert.equal(newFolderAlpha.filePath.parent.leafName, `${safeDelta}.sbd`);
}

add_task(function testMbox() {
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  run_all_tests("LocalFoldersTest-mbox");
});

add_task(function testMaildir() {
  Services.prefs.setCharPref(
    "mail.serverDefaultStoreContractID",
    "@mozilla.org/msgstore/maildirstore;1"
  );
  run_all_tests("LocalFoldersTest-maildir");
});

function run_all_tests(aHostName) {
  const server = MailServices.accounts.createIncomingServer(
    "nobody",
    aHostName,
    "none"
  );
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;

  const root = server.rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  subtest_folder_operations(root);
  subtest_folder_deletion(root);
  test_store_rename(root);
  test_unsafe_characters(root);
}
