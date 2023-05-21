/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for other dialogs using the tree view implementation in folderPane.js.
 */

/* globals gFolderTreeView */

"use strict";

var { mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { NNTP_PORT, setupLocalServer } = ChromeUtils.import(
  "resource://testing-common/mozmill/NNTPHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var { click_menus_in_sequence } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var nntpAccount;

add_setup(function () {
  gFolderTreeView.selectFolder(gFolderTreeView._enumerateFolders[1]);

  let server = setupLocalServer(NNTP_PORT);
  nntpAccount = MailServices.accounts.FindAccountForServer(server);
});

add_task(async function test_virtual_folder_selection_tree() {
  plan_for_modal_dialog(
    "mailnews:virtualFolderProperties",
    subtest_create_virtual_folder
  );

  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("menu_File"),
    {},
    mc.window.document.getElementById("menu_File").ownerGlobal
  );
  await click_menus_in_sequence(
    mc.window.document.getElementById("menu_FilePopup"),
    [{ id: "menu_New" }, { id: "menu_newVirtualFolder" }]
  );

  wait_for_modal_dialog("mailnews:virtualFolderProperties");
});

function subtest_create_virtual_folder(vfc) {
  // Open the folder chooser.
  plan_for_modal_dialog(
    "mailnews:virtualFolderList",
    subtest_check_virtual_folder_list
  );
  EventUtils.synthesizeMouseAtCenter(
    vfc.window.document.getElementById("folderListPicker"),
    {},
    vfc.window.document.getElementById("folderListPicker").ownerGlobal
  );
  wait_for_modal_dialog("mailnews:virtualFolderList");

  vfc.window.document.documentElement.querySelector("dialog").cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_virtual_folder_list(listc) {
  let tree = listc.window.document.getElementById("folderPickerTree");
  // We should see the folders from the 2 base local accounts here.
  Assert.ok(
    tree.view.rowCount > 0,
    "Folder tree was empty in virtual folder selection!"
  );
  listc.window.document.documentElement.querySelector("dialog").cancelDialog();
}

add_task(async function test_offline_sync_folder_selection_tree() {
  plan_for_modal_dialog("mailnews:synchronizeOffline", subtest_offline_sync);

  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("menu_File"),
    {},
    mc.window.document.getElementById("menu_File").ownerGlobal
  );
  await click_menus_in_sequence(
    mc.window.document.getElementById("menu_FilePopup"),
    [{ id: "offlineMenuItem" }, { id: "menu_synchronizeOffline" }]
  );

  wait_for_modal_dialog("mailnews:synchronizeOffline");
});

function subtest_offline_sync(osc) {
  // Open the folder chooser.
  plan_for_modal_dialog(
    "mailnews:selectOffline",
    subtest_check_offline_folder_list
  );
  EventUtils.synthesizeMouseAtCenter(
    osc.window.document.getElementById("select"),
    {},
    osc.window.document.getElementById("select").ownerGlobal
  );
  wait_for_modal_dialog("mailnews:selectOffline");

  osc.window.document.documentElement.querySelector("dialog").cancelDialog();
}

/**
 * Bug 464710
 * Check the folder list picker is not empty.
 */
function subtest_check_offline_folder_list(listc) {
  let tree = listc.window.document.getElementById("synchronizeTree");
  // We should see the newsgroups from the NNTP server here.
  Assert.ok(
    tree.view.rowCount > 0,
    "Folder tree was empty in offline sync selection!"
  );
  listc.window.document.documentElement.querySelector("dialog").cancelDialog();
}

registerCleanupFunction(function () {
  MailServices.accounts.removeAccount(nntpAccount);

  document.getElementById("toolbar-menubar").autohide = true;
  document.getElementById("folderTree").focus();
});
