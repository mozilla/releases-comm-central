/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for local folder functions.
 */

load("../../../resources/messageGenerator.js");

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource:///modules/iteratorUtils.jsm");
/**
 * Bug 66763
 * Test deletion of a folder with a name already existing in Trash.
 */
function subtest_folder_deletion(root) {
  // Now we only have <root> and some default subfolders, like Trash.
  let trash = root.getChildNamed("Trash");
  do_check_false(trash.hasSubFolders);

  // Create new "folder" in root.
  let folder = root.createLocalSubfolder("folder");
  let path = folder.filePath;
  do_check_true(path.exists());

  // Delete "folder" into Trash.
  let folderArray = toXPCOMArray([folder], Ci.nsIMutableArray);
  root.deleteSubFolders(folderArray, null);
  do_check_false(path.exists());
  do_check_eq(trash.numSubFolders, 1);
  let folderDeleted = trash.getChildNamed("folder");

  // Create another "folder" in root.
  folder = root.createLocalSubfolder("folder");
  // Delete "folder" into Trash again.
  folderArray = toXPCOMArray([folder], Ci.nsIMutableArray);
  root.deleteSubFolders(folderArray, null);
  do_check_eq(trash.numSubFolders, 2);
  // The folder should be automatically renamed as the same name already is in Trash.
  let folderDeleted2 = trash.getChildNamed("folder(2)");

  // Create yet another "folder" in root.
  folder = root.createLocalSubfolder("folder");

  // But now with another subfolder
  let subfolder = folder.QueryInterface(Ci.nsIMsgLocalMailFolder)
                        .createLocalSubfolder("subfolder");

  // Delete folder into Trash again
  folderArray = toXPCOMArray([folder], Ci.nsIMutableArray);
  root.deleteSubFolders(folderArray, null);
  do_check_eq(trash.numSubFolders, 3);
  // The folder should be automatically renamed as the same name already is in Trash
  // but the subfolder should be untouched.
  let folderDeleted3 = trash.getChildNamed("folder(3)");
  do_check_neq(folderDeleted3, null);
  do_check_true(folderDeleted3.containsChildNamed("subfolder"));
  // Now we have <root>
  //               +--Trash
  //                    +--folder
  //                    +--folder(2)
  //                    +--folder(3)
  //                         +--subfolder

  // Create another "folder(3)" in root.
  do_check_false(root.containsChildNamed("folder(3)"));
  folder = root.createLocalSubfolder("folder(3)");
  do_check_true(root.containsChildNamed("folder(3)"));
  // Now try to move "folder(3)" from Trash back to root.
  // That should fail, because the user gets a prompt about it and that does
  // not work in xpcshell.
  try {
    root.copyFolderLocal(folderDeleted3, true, null, null);
    do_throw("copyFolderLocal() should have failed here due to user prompt!");
  } catch (e if e.result == 0x8055001a) {
    // Catch only the expected error NS_MSG_ERROR_COPY_FOLDER_ABORTED,
    // otherwise fail the test.
  }
}

/**
 * Test proper creation/rename/removal of folders under a Local mail account
 */
function subtest_folder_operations(root) {
  // Test - num/hasSubFolders

  // Get the current number of folders
  var numSubFolders = root.numSubFolders;

  var folder = root.createLocalSubfolder("folder1").QueryInterface(Ci.nsIMsgLocalMailFolder);

  do_check_true(root.hasSubFolders);
  do_check_eq(root.numSubFolders, numSubFolders + 1);

  do_check_false(folder.hasSubFolders);
  do_check_eq(folder.numSubFolders, 0);

  var folder2 = folder.createLocalSubfolder("folder2");

  do_check_true(folder.hasSubFolders);
  do_check_eq(folder.numSubFolders, 1);

  // Now we have <root>
  //               +--folder1
  //                    +--folder2

  // Test - getChildNamed

  do_check_eq(root.getChildNamed("folder1"), folder);

  // Check for non match, this should throw
  var thrown = false;
  try {
    root.getChildNamed("folder2");
  }
  catch (e) {
    thrown = true;
  }

  do_check_true(thrown);

  // folder2 is a child of folder however.
  var folder2 = folder.getChildNamed("folder2");

  // Test - isAncestorOf

  do_check_true(folder.isAncestorOf(folder2));
  do_check_true(root.isAncestorOf(folder2));
  do_check_false(folder.isAncestorOf(root));

  // Test - FoldersWithFlag

  const nsMsgFolderFlags = Components.interfaces.nsMsgFolderFlags;

  folder.setFlag(nsMsgFolderFlags.CheckNew);
  do_check_true(folder.getFlag(nsMsgFolderFlags.CheckNew));
  do_check_false(folder.getFlag(nsMsgFolderFlags.Offline));

  folder.setFlag(nsMsgFolderFlags.Offline);
  do_check_true(folder.getFlag(nsMsgFolderFlags.CheckNew));
  do_check_true(folder.getFlag(nsMsgFolderFlags.Offline));

  folder.toggleFlag(nsMsgFolderFlags.CheckNew);
  do_check_false(folder.getFlag(nsMsgFolderFlags.CheckNew));
  do_check_true(folder.getFlag(nsMsgFolderFlags.Offline));

  folder.clearFlag(nsMsgFolderFlags.Offline);
  do_check_false(folder.getFlag(nsMsgFolderFlags.CheckNew));
  do_check_false(folder.getFlag(nsMsgFolderFlags.Offline));

  folder.setFlag(nsMsgFolderFlags.Favorite);
  folder2.setFlag(nsMsgFolderFlags.Favorite);
  folder.setFlag(nsMsgFolderFlags.CheckNew);
  folder2.setFlag(nsMsgFolderFlags.Offline);

  do_check_eq(root.getFolderWithFlags(nsMsgFolderFlags.CheckNew),
              folder);

  // Test - Move folders around

  var folder3 = root.createLocalSubfolder("folder3");
  var folder3Local = folder3.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder);
  var folder1Local = folder.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder);

  // put a single message in folder1.
  let messageGenerator = new MessageGenerator();
  let message = messageGenerator.makeMessage();
  let hdr = folder1Local.addMessage(message.toMboxString());
  do_check_eq(message.messageId, hdr.messageId);

  folder3Local.copyFolderLocal(folder, true, null, null);

  // Test - Get the new folders, make sure the old ones don't exist

  var folder1Moved = folder3.getChildNamed("folder1");
  var folder2Moved = folder1Moved.getChildNamed("folder2");

  thrown = false;
  try {
    root.getChildNamed("folder1");
  }
  catch (e) {
    thrown = true;
  }

  do_check_true(thrown);

  if (folder.filePath.exists())
    dump("shouldn't exist - folder file path " + folder.URI + "\n");
  do_check_false(folder.filePath.exists());
  if (folder2.filePath.exists())
    dump("shouldn't exist - folder2 file path " + folder2.URI + "\n");
  do_check_false(folder2.filePath.exists());

  // make sure getting the db doesn't throw an exception
  let db = folder1Moved.msgDatabase;
  do_check_true(db.summaryValid);

  // Move folders back, get them
  var rootLocal = root.QueryInterface(Components.interfaces.nsIMsgLocalMailFolder);
  rootLocal.copyFolderLocal(folder1Moved, true, null, null);
  folder = root.getChildNamed("folder1");
  folder2 = folder.getChildNamed("folder2");

  // Test - Rename (test that .msf file is renamed as well)
  folder.rename("folder1-newname", null);
  // make sure getting the db doesn't throw an exception, and is valid
  folder = rootLocal.getChildNamed("folder1-newname");
  db = folder.msgDatabase;
  do_check_true(db.summaryValid);

  folder.rename("folder1", null);
  folder = rootLocal.getChildNamed("folder1");

  // Test - propagateDelete (this tests recursiveDelete as well)
  // The folders will be removed from disk completely, not merely to Trash.

  var path1 = folder.filePath;
  var path2 = folder2.filePath;
  var path3 = folder3.filePath;

  do_check_true(path1.exists());
  do_check_true(path2.exists());
  do_check_true(path3.exists());

  // First try deleting folder3 -- folder1 and folder2 paths should still exist
  root.propagateDelete(folder3, true, null);

  do_check_true(path1.exists());
  do_check_true(path2.exists());
  do_check_false(path3.exists());

  root.propagateDelete(folder, true, null);

  do_check_false(path1.exists());
  do_check_false(path2.exists());
}

function test_store_rename(root) {
  let folder1 = root.createLocalSubfolder("newfolder1")
                    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  do_check_true(root.hasSubFolders);
  do_check_false(folder1.hasSubFolders);
  let folder2 = folder1.createLocalSubfolder("newfolder1-sub");
  let folder3 = root.createLocalSubfolder("newfolder3")
                    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  let folder3Subfolder = folder3.createLocalSubfolder("newfolder3-sub");

  do_check_true(folder1.hasSubFolders);
  do_check_false(folder2.hasSubFolders);
  do_check_true(folder3.hasSubFolders);

  folder1.rename("folder1", null);
  do_check_true(root.containsChildNamed("folder1"));
  folder1 = root.getChildNamed("folder1");

  folder1.rename("newfolder1", null);
  do_check_true(root.containsChildNamed("newfolder1"));
  folder1 = root.getChildNamed("newfolder1");
  folder2 = folder1.getChildNamed("newfolder1-sub");

  do_check_true(folder1.containsChildNamed(folder2.name));
  do_check_true(folder2.filePath.exists());

  folder3 = root.getChildNamed("newfolder3");
  root.propagateDelete(folder3, true, null);
  do_check_false(root.containsChildNamed("newfolder3"));
  folder3 = root.createLocalSubfolder("newfolder3");
  folder3SubFolder = folder3.createLocalSubfolder("newfolder3-sub");
  folder3.rename("folder3", null);

  do_check_true(root.containsChildNamed("folder3"));
  do_check_false(root.containsChildNamed("newfolder3"));
}

var gPluggableStores = [
  "@mozilla.org/msgstore/berkeleystore;1",
  "@mozilla.org/msgstore/maildirstore;1"
];

function run_all_tests(aHostName) {
  let server = MailServices.accounts.createIncomingServer("nobody", aHostName,
                                                          "none");
  let account = MailServices.accounts.createAccount();
  account.incomingServer = server;

  let root = server.rootMsgFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  subtest_folder_operations(root);
  subtest_folder_deletion(root);
  test_store_rename(root);
}

function run_test() {
  let hostName = "Local Folders";
  for (let index = 0; index < gPluggableStores.length;) {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID",
                               gPluggableStores[index]);
    run_all_tests(hostName);
    hostName += "-" + ++index;
  }

  // At this point,
  // we should have <root>
  //                  +--newfolder1
  //                     +--newfolder1-subfolder
  //                  +--newfolder3-anotherName
  //                     +--newfolder3-sub
  //                  +--folder(3)
  //                  +--Trash
  //                     +--folder
  //                     +--folder(2)
  //                     +--folder(3)
  //                        +--subfolder
}
