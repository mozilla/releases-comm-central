/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests Apply Current View To…
 */

"use strict";

var { be_in_folder, create_folder, mc } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

// These are for the reset/apply to other/apply to other+child tests.
var folderSource, folderParent, folderChild1, folderChild2;

add_setup(async function() {
  folderSource = await create_folder("ColumnsApplySource");

  folderParent = await create_folder("ColumnsApplyParent");
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);
  folderChild2 = folderParent.getChildNamed("Child2");

  await be_in_folder(folderSource);

  registerCleanupFunction(function teardown() {
    folderParent.deleteSelf(null);
    folderSource.deleteSelf(null);
  });
});

/**
 * Get the currently visible threadTree columns.
 */
function testSetViewSingle() {
  let info = folderSource.msgDatabase.dBFolderInfo;

  Assert.equal(
    info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags should start threaded"
  );
  Assert.equal(
    info.sortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "sortOrder should start ascending"
  );

  let threadCol = window.getElementById("threadCol");
  EventUtils.synthesizeMouseAtCenter(threadCol, { clickCount: 1 }, window);
  TestUtils.waitForCondition(
    () => info.viewFlags == Ci.nsMsgViewFlagsType.kNone,
    "should change viewFlags to none"
  );

  let subjectCol = window.getElementById("subjectCol");
  EventUtils.synthesizeMouseAtCenter(subjectCol, { clickCount: 1 }, window);
  TestUtils.waitForCondition(
    () => info.sortType == Ci.nsMsgViewSortType.bySubject,
    "should change sortType to subject"
  );

  EventUtils.synthesizeMouseAtCenter(subjectCol, { clickCount: 1 }, window);
  TestUtils.waitForCondition(
    () => info.sortOrder == Ci.nsMsgViewSortOrder.descending,
    "should change sortOrder to sort descending"
  );
}

async function invoke_column_picker_option(aActions) {
  let tabmail = document.getElementById("tabmail");
  let about3Pane = tabmail.currentAbout3Pane;

  let colPicker = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] button`
  );
  let colPickerPopup = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] menupopup`
  );

  let shownPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(colPicker, {}, about3Pane);
  await shownPromise;
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popuphidden"
  );
  await mc.click_menus_in_sequence(colPickerPopup, aActions);
  await hiddenPromise;
}

async function _apply_to_folder_common(aChildrenToo, folder) {
  let notificatonPromise;
  if (aChildrenToo) {
    notificatonPromise = TestUtils.topicObserved("msg-folder-views-propagated");
  }

  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
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
  let child1Info = folderChild1.msgDatabase.dBFolderInfo;
  let child1InfoViewFlags = child1Info.viewFlags;
  let child1InfoSortType = child1Info.sortType;
  let child1InfoSortOrder = child1Info.sortOrder;
  Assert.equal(
    child1Info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags for child1 should start threaded"
  );
  Assert.equal(
    child1Info.sortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "sortOrder for child1 should start ascending"
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

  let child1Info = folderChild1.msgDatabase.dBFolderInfo;
  Assert.equal(
    child1Info.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags for child1 should start threaded"
  );
  Assert.equal(
    child1Info.sortOrder,
    Ci.nsMsgViewSortOrder.ascending,
    "sortOrder for child1 should start ascending"
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
  for (let child of folderParent.descendants) {
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
