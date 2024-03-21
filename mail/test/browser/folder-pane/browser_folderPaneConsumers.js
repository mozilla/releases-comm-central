/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for other dialogs using the tree view implementation in folderPane.js.
 */

/* globals gFolderTreeView */

"use strict";

var { NNTP_PORT, setupLocalServer } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/NNTPHelpers.sys.mjs"
);
var { promise_modal_dialog } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var nntpAccount;

add_setup(function () {
  gFolderTreeView.selectFolder(gFolderTreeView._enumerateFolders[1]);

  const server = setupLocalServer(NNTP_PORT);
  nntpAccount = MailServices.accounts.findAccountForServer(server);
});

add_task(async function test_virtual_folder_selection_tree() {
  const dialogPromise = promise_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_create_virtual_folder
  );

  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_File"),
    {},
    document.getElementById("menu_File").ownerGlobal
  );
  await click_menus_in_sequence(document.getElementById("menu_FilePopup"), [
    { id: "menu_New" },
    { id: "menu_newVirtualFolder" },
  ]);

  await dialogPromise;
});

async function subtest_create_virtual_folder(vfc) {
  // Open the folder chooser.
  const dialogPromise = promise_modal_dialog(
    "mailnews:virtualFolderList",
    subtest_check_virtual_folder_list
  );
  EventUtils.synthesizeMouseAtCenter(
    vfc.document.getElementById("folderListPicker"),
    {},
    vfc.document.getElementById("folderListPicker").ownerGlobal
  );
  await dialogPromise;

  vfc.document.documentElement.querySelector("dialog").cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_virtual_folder_list(listc) {
  const tree = listc.document.getElementById("folderPickerTree");
  // We should see the folders from the 2 base local accounts here.
  Assert.ok(
    tree.view.rowCount > 0,
    "Folder tree was empty in virtual folder selection!"
  );
  listc.document.documentElement.querySelector("dialog").cancelDialog();
}

add_task(async function test_offline_sync_folder_selection_tree() {
  const dialogPromise = promise_modal_dialog(
    "mailnews:synchronizeOffline",
    subtest_offline_sync
  );

  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("menu_File"),
    {},
    document.getElementById("menu_File").ownerGlobal
  );
  await click_menus_in_sequence(document.getElementById("menu_FilePopup"), [
    { id: "offlineMenuItem" },
    { id: "menu_synchronizeOffline" },
  ]);

  await dialogPromise;
});

async function subtest_offline_sync(osc) {
  // Open the folder chooser.
  const dialogPromise = promise_modal_dialog(
    "mailnews:selectOffline",
    subtest_check_offline_folder_list
  );
  EventUtils.synthesizeMouseAtCenter(
    osc.document.getElementById("select"),
    {},
    osc.document.getElementById("select").ownerGlobal
  );
  await dialogPromise;

  osc.document.documentElement.querySelector("dialog").cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_offline_folder_list(listc) {
  const tree = listc.document.getElementById("synchronizeTree");
  // We should see the newsgroups from the NNTP server here.
  Assert.ok(
    tree.view.rowCount > 0,
    "Folder tree was empty in offline sync selection!"
  );
  listc.document.documentElement.querySelector("dialog").cancelDialog();
}

registerCleanupFunction(function () {
  MailServices.accounts.removeAccount(nntpAccount);

  document.getElementById("toolbar-menubar").autohide = true;
  document.getElementById("folderTree").focus();
});
