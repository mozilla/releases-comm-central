/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for other dialogs using the tree view implementation in folderPane.js.
 */

"use strict";

/* import-globals-from ../shared-modules/test-folder-display-helpers.js */
/* import-globals-from ../shared-modules/test-nntp-helpers.js */
/* import-globals-from ../shared-modules/test-window-helpers.js */

var MODULE_NAME = "test-folder-pane";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = [
  "folder-display-helpers",
  "window-helpers",
  "nntp-helpers",
];

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var nntpAccount;

function setupModule(module) {
  for (let lib of MODULE_REQUIRES) {
    collector.getModule(lib).installInto(module);
  }

  let server = setupLocalServer(NNTP_PORT);
  nntpAccount = MailServices.accounts.FindAccountForServer(server);
}

function test_virtual_folder_selection_tree() {
  plan_for_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_create_virtual_folder
  );
  mc.click_through_appmenu([{ id: "appmenu_new" }], {
    id: "appmenu_newVirtualFolder",
  });

  wait_for_modal_dialog("mailnews:virtualFolderProperties");
}

function subtest_create_virtual_folder(vfc) {
  // Open the folder chooser.
  plan_for_modal_dialog(
    "mailnews:virtualFolderList",
    subtest_check_virtual_folder_list
  );
  vfc.click(vfc.eid("folderListPicker"));
  wait_for_modal_dialog("mailnews:virtualFolderList");

  vfc.window.document.documentElement.cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_virtual_folder_list(listc) {
  let tree = listc.e("folderPickerTree");
  // We should see the folders from the 2 base local accounts here.
  assert_true(
    tree.view.rowCount > 0,
    "Folder tree was empty in virtual folder selection!"
  );
  listc.window.document.documentElement.cancelDialog();
}

function test_offline_sync_folder_selection_tree() {
  plan_for_modal_dialog("mailnews:synchronizeOffline", subtest_offline_sync);

  mc.click_through_appmenu(
    [{ id: "appmenu_File" }, { id: "appmenu_offline" }],
    { id: "appmenu_synchronizeOffline" }
  );

  wait_for_modal_dialog("mailnews:synchronizeOffline");
}

function subtest_offline_sync(osc) {
  // Open the folder chooser.
  plan_for_modal_dialog(
    "mailnews:selectOffline",
    subtest_check_offline_folder_list
  );
  osc.click(osc.eid("select"));
  wait_for_modal_dialog("mailnews:selectOffline");

  osc.window.document.documentElement.cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_offline_folder_list(listc) {
  let tree = listc.e("synchronizeTree");
  // We should see the newsgroups from the NNTP server here.
  assert_true(
    tree.view.rowCount > 0,
    "Folder tree was empty in offline sync selection!"
  );
  listc.window.document.documentElement.cancelDialog();
}

function teardownModule() {
  MailServices.accounts.removeAccount(nntpAccount);
}
