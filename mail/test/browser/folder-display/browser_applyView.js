/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Apply Current View To…
 */

"use strict";

var { be_in_folder, create_folder, get_about_3pane } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
  );
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/WindowHelpers.sys.mjs"
);

// These are for the reset/apply to other/apply to other+child tests.
var folderSource, folderParent, folderChild1;

add_setup(async function () {
  folderSource = await create_folder("ColumnsApplySource");

  folderParent = await create_folder("ColumnsApplyParent");
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);

  await be_in_folder(folderSource);
  await ensure_table_view();

  registerCleanupFunction(async () => {
    await ensure_cards_view();
    folderParent.deleteSelf(null);
    folderSource.deleteSelf(null);
  });
});

/**
 * Get the currently visible threadTree columns.
 */
add_task(async function testSetViewSingle() {
  const info = folderSource.msgDatabase.dBFolderInfo;

  Assert.equal(
    info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags should start threaded"
  );
  Assert.equal(
    info.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType should start byDate"
  );
  Assert.equal(
    info.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should start descending"
  );

  const about3Pane = get_about_3pane();

  const threadCol = about3Pane.document.getElementById("threadCol");
  EventUtils.synthesizeMouseAtCenter(threadCol, { clickCount: 1 }, about3Pane);
  await TestUtils.waitForCondition(
    () => info.viewFlags == Ci.nsMsgViewFlagsType.kNone,
    "should change viewFlags to none"
  );

  const subjectCol = about3Pane.document.getElementById("subjectCol");
  EventUtils.synthesizeMouseAtCenter(subjectCol, { clickCount: 1 }, about3Pane);
  await TestUtils.waitForCondition(
    () => info.sortType == Ci.nsMsgViewSortType.bySubject,
    "should change sortType to subject"
  );

  EventUtils.synthesizeMouseAtCenter(subjectCol, { clickCount: 1 }, about3Pane);
  await TestUtils.waitForCondition(
    () => info.sortOrder == Ci.nsMsgViewSortOrder.descending,
    "should change sortOrder to sort descending"
  );

  Assert.equal(
    info.viewFlags,
    Ci.nsMsgViewFlagsType.kNone,
    "viewFlags should now be unthreaded"
  );
  Assert.equal(
    info.sortType,
    Ci.nsMsgViewSortType.bySubject,
    "sortType should now be bySubject"
  );
  Assert.equal(
    info.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should now be descending"
  );
});

async function invoke_column_picker_option(aActions) {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  const colPicker = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] button`
  );
  const colPickerPopup = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] menupopup`
  );

  const shownPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(colPicker, {}, about3Pane);
  await shownPromise;
  const hiddenPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popuphidden"
  );
  await click_menus_in_sequence(colPickerPopup, aActions);
  await hiddenPromise;
}

async function _apply_to_folder_common(aChildrenToo, folder) {
  let notificatonPromise;
  if (aChildrenToo) {
    notificatonPromise = TestUtils.topicObserved("msg-folder-views-propagated");
  }

  const menuItems = [
    { class: "applyViewTo-menu" },
    {
      class: aChildrenToo
        ? "applyViewToFolderAndChildren-menu"
        : "applyViewToFolder-menu",
    },
    { label: "Local Folders" },
  ];
  if (!folder.isServer) {
    menuItems.push({ label: folder.name });
  }
  menuItems.push(menuItems.at(-1));

  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await invoke_column_picker_option(menuItems);
  await dialogPromise;

  if (notificatonPromise) {
    await notificatonPromise;
  }
}

/**
 * Change settings in a folder, apply them to another folder that also has
 *  children. Make sure the folder changes but the children do not.
 */
add_task(async function test_apply_to_folder_no_children() {
  const child1Info = folderChild1.msgDatabase.dBFolderInfo;
  Assert.equal(
    child1Info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags for child1 should start threaded"
  );
  Assert.equal(
    child1Info.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType for child1 should start byDate"
  );
  Assert.equal(
    child1Info.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder for child1 should start descending"
  );

  // Apply to the one dude
  await _apply_to_folder_common(false, folderParent);

  // Should apply to the folderParent.
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.viewFlags,
    Ci.nsMsgViewFlagsType.kNone,
    "viewFlags should have been applied"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortType,
    Ci.nsMsgViewSortType.bySubject,
    "sortType should have been applied"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should have been applied"
  );

  // Shouldn't have applied to its children.
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags should not have been applied to children"
  );
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType should not have been applied to children"
  );
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should not have been applied to children"
  );
});

/**
 * Change settings in a folder, apply them to another folder and its children.
 * Make sure the folder and its children change.
 */
add_task(async function test_apply_to_folder_and_children() {
  await be_in_folder(folderSource);

  const child1Info = folderChild1.msgDatabase.dBFolderInfo;
  Assert.equal(
    child1Info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags for child1 should start threaded"
  );
  Assert.equal(
    child1Info.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType for child1 should start byDate"
  );
  Assert.equal(
    child1Info.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder for child1 should start descending"
  );

  // Apply to folder and children.
  await _apply_to_folder_common(true, folderParent);

  // Should apply to the folderParent.
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.viewFlags,
    Ci.nsMsgViewFlagsType.kNone,
    "viewFlags should have been applied to parent"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortType,
    Ci.nsMsgViewSortType.bySubject,
    "sortType should have been applied to parent"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should have been applied"
  );

  // Should have applied to its children as well.
  for (const child of folderParent.descendants) {
    Assert.equal(
      child.msgDatabase.dBFolderInfo.viewFlags,
      Ci.nsMsgViewFlagsType.kNone,
      "viewFlags should have been applied to children"
    );
    Assert.equal(
      child.msgDatabase.dBFolderInfo.sortType,
      Ci.nsMsgViewSortType.bySubject,
      "sortType should have been applied to children"
    );
    Assert.equal(
      child.msgDatabase.dBFolderInfo.sortOrder,
      Ci.nsMsgViewSortOrder.descending,
      "sortOrder should have been applied to children"
    );
  }
});

/**
 * Change settings in a folder, apply them to the root folder and its children.
 * Make sure the children change.
 */
add_task(async function test_apply_to_root_folder_and_children() {
  const info = folderSource.msgDatabase.dBFolderInfo;
  await be_in_folder(folderSource);

  const about3Pane = get_about_3pane();
  const junkStatusCol = about3Pane.document.getElementById("junkStatusCol");
  EventUtils.synthesizeMouseAtCenter(
    junkStatusCol,
    { clickCount: 1 },
    about3Pane
  );
  Assert.equal(
    info.viewFlags,
    Ci.nsMsgViewFlagsType.kNone,
    "viewFlags should be set to unthreaded"
  );
  Assert.equal(
    info.sortType,
    Ci.nsMsgViewSortType.byJunkStatus,
    "sortType should be set to junkStatus"
  );
  Assert.equal(
    info.sortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "sortOrder should be set to ascending"
  );

  // Apply to the root folder and its descendants.
  await _apply_to_folder_common(true, folderSource.rootFolder);

  // Make sure it is copied to all folders of this server.
  for (const folder of folderSource.rootFolder.descendants) {
    Assert.equal(
      folder.msgDatabase.dBFolderInfo.viewFlags,
      Ci.nsMsgViewFlagsType.kNone,
      `viewFlags should have been applied to ${folder.name}`
    );
    Assert.equal(
      folder.msgDatabase.dBFolderInfo.sortType,
      Ci.nsMsgViewSortType.byJunkStatus,
      `sortType should have been applied to ${folder.name}`
    );
    Assert.equal(
      folder.msgDatabase.dBFolderInfo.sortOrder,
      Ci.nsMsgViewSortOrder.ascending,
      `sortOrder should have been applied to ${folder.name}`
    );
    folder.msgDatabase = null;
  }
});
