/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test that clicking on a folder with an invalid or missing .msf file
 * regenerates the.msf file and loads the view.
 * Also, check that rebuilding the index on a loaded folder reloads the folder.
 */

"use strict";

var {
  assert_messages_in_view,
  assert_selected_and_displayed,
  be_in_folder,
  create_folder,
  get_about_3pane,
  make_message_sets_in_folders,
  select_click_row,
} = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var folder;
var setA;

add_setup(async function () {
  folder = await create_folder("InvalidMSF");
  [setA] = await make_message_sets_in_folders([folder], [{ count: 3 }]);
});

/**
 * Check if the db of a folder assumed to be invalid can be restored.
 */
add_task(async function test_load_folder_with_invalidDB() {
  folder.msgDatabase.dBFolderInfo.sortType = Ci.nsMsgViewSortType.bySubject;
  folder.msgDatabase.summaryValid = false;
  folder.msgDatabase.forceClosed();
  folder.msgDatabase = null;
  await be_in_folder(folder);

  assert_messages_in_view(setA);
  var curMessage = await select_click_row(0);
  await assert_selected_and_displayed(curMessage);
});

add_task(function test_view_sort_maintained() {
  const win = get_about_3pane();
  if (win.gDBView.sortType != Ci.nsMsgViewSortType.bySubject) {
    throw new Error("view sort type not restored from invalid db");
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
