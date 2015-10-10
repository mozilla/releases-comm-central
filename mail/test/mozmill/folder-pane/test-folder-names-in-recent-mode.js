/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that the folder names have account name appended when in "recent" view.
 */
var MODULE_NAME = "test-folder-names-in-favorite-mode";

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers"];

Cu.import("resource:///modules/iteratorUtils.jsm");

function setupModule(module) {
  collector.getModule("folder-display-helpers").installInto(module);

  assert_folder_mode("all");
  assert_folder_tree_view_row_count(7);
}

function test_folder_names_in_recent_view_mode() {
  // We need 2 local accounts that have pristine folders with
  // unmodified times, so that it does not influence the
  // list of Recent folders. So clear out the most-recently-used time.
  for (let acc in fixIterator(MailServices.accounts.accounts, Ci.nsIMsgAccount)) {
    for (let fld in fixIterator(acc.incomingServer.rootFolder.subFolders,
                                Ci.nsIMsgFolder)) {
      fld.setStringProperty("MRUTime", "0");
    }
  }

  let acc1 = MailServices.accounts.accounts.queryElementAt(0, Ci.nsIMsgAccount);
  let acc2 = MailServices.accounts.accounts.queryElementAt(1, Ci.nsIMsgAccount);
  let rootFolder1 = acc1.incomingServer.rootFolder;
  let rootFolder2 = acc2.incomingServer.rootFolder;

  // Create some test folders.
  rootFolder1.createSubfolder("uniqueName", null);
  rootFolder1.createSubfolder("duplicatedName", null);
  rootFolder2.createSubfolder("duplicatedName", null);
  let inbox2 = rootFolder2.getFolderWithFlags(Ci.nsMsgFolderFlags.Inbox);
  inbox2.createSubfolder("duplicatedName", null);

  let fUnique = rootFolder1.getChildNamed("uniqueName");
  let fDup1 = rootFolder1.getChildNamed("duplicatedName");
  let fDup2 = rootFolder2.getChildNamed("duplicatedName");
  let fDup3 = inbox2.getChildNamed("duplicatedName");
  assert_folder_tree_view_row_count(10);

  // Create some messages in the folders to make them modified.
  make_new_sets_in_folder(fUnique, [{count: 1}]);
  make_new_sets_in_folder(fDup1, [{count: 1}]);
  make_new_sets_in_folder(fDup2, [{count: 2}]);
  make_new_sets_in_folder(fDup3, [{count: 3}]);

  mc.window.gFolderTreeView.mode = "recent_compact";

  // Check displayed folder names. In Recent mode the folders are sorted alphabetically
  assert_folder_at_index_as(0, "duplicatedName - Local Folders (1)");
  assert_folder_at_index_as(1, "duplicatedName - tinderbox@foo.invalid (3)");
  assert_folder_at_index_as(2, "duplicatedName - tinderbox@foo.invalid (2)");
  assert_folder_at_index_as(3, "uniqueName - Local Folders (1)");
  assert_folder_tree_view_row_count(4);

  // Remove our folders to clean up.
  rootFolder1.propagateDelete(fUnique, true, null);
  rootFolder1.propagateDelete(fDup1, true, null);
  rootFolder2.propagateDelete(fDup2, true, null);
  rootFolder2.propagateDelete(fDup3, true, null);
}

function teardownModule() {
  mc.window.gFolderTreeView.mode = "all";
  assert_folder_tree_view_row_count(7);
}
