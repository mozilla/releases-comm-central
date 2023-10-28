/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Apply Current View To…
 */

"use strict";

var { be_in_folder, create_folder, get_about_3pane } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { click_menus_in_sequence } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
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

  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await invoke_column_picker_option([
    { class: "applyViewTo-menu" },
    {
      class: aChildrenToo
        ? "applyViewToFolderAndChildren-menu"
        : "applyViewToFolder-menu",
    },
    { label: "Local Folders" },
    { label: folder.name },
    { label: folder.name },
  ]);
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
  const child1InfoViewFlags = child1Info.viewFlags;
  const child1InfoSortType = child1Info.sortType;
  const child1InfoSortOrder = child1Info.sortOrder;
  Assert.equal(
    child1Info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags for child1 should start threaded"
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
    folderSource.msgDatabase.dBFolderInfo.viewFlags,
    "viewFlags should have been applied"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortType,
    folderSource.msgDatabase.dBFolderInfo.sortType,
    "sortType should have been applied"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortOrder,
    folderSource.msgDatabase.dBFolderInfo.sortOrder,
    "sortOrder should have been applied"
  );

  // Shouldn't have applied to its children.
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.viewFlags,
    child1InfoViewFlags,
    "viewFlags should not have been applied to children"
  );
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.sortType,
    child1InfoSortType,
    "sortType should not have been applied to children"
  );
  Assert.equal(
    folderChild1.msgDatabase.dBFolderInfo.sortOrder,
    child1InfoSortOrder,
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
    child1Info.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder for child1 should start descending"
  );

  // Apply to folder and children.
  await _apply_to_folder_common(true, folderParent);

  // Should apply to the folderParent.
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.viewFlags,
    folderSource.msgDatabase.dBFolderInfo.viewFlags,
    "viewFlags should have been applied to parent"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortType,
    folderSource.msgDatabase.dBFolderInfo.sortType,
    "sortType should have been applied to parent"
  );
  Assert.equal(
    folderParent.msgDatabase.dBFolderInfo.sortOrder,
    folderSource.msgDatabase.dBFolderInfo.sortOrder,
    "sortOrder should have been applied"
  );

  // Should have applied to its children as well.
  for (const child of folderParent.descendants) {
    Assert.equal(
      child.msgDatabase.dBFolderInfo.viewFlags,
      folderSource.msgDatabase.dBFolderInfo.viewFlags,
      "viewFlags should have been applied to children"
    );
    Assert.equal(
      child.msgDatabase.dBFolderInfo.sortType,
      folderSource.msgDatabase.dBFolderInfo.sortType,
      "sortType should have been applied to children"
    );
    Assert.equal(
      child.msgDatabase.dBFolderInfo.sortOrder,
      folderSource.msgDatabase.dBFolderInfo.sortOrder,
      "sortOrder should have been applied to children"
    );
  }
});
