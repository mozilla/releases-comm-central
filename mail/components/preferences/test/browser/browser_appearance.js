/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

let threadTree,
  prefsWindow,
  prefsDocument,
  tabmail,
  folderSource,
  folderParent,
  folderChild1,
  folderChild2;

add_setup(async () => {
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderSource = rootFolder.createLocalSubfolder("ViewFlagsSource");
  folderParent = rootFolder.createLocalSubfolder("ViewFlagsParent");
  folderParent.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folderChild1 = folderParent.createLocalSubfolder("Child1", null);
  folderChild2 = folderParent.createLocalSubfolder("Child2", null);

  // Access the folder once to let the code store the current default settings.
  tabmail = document.getElementById("tabmail");
  tabmail.currentAbout3Pane.displayFolder(folderSource);
  threadTree = tabmail.currentAbout3Pane.threadTree;

  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneAppearance"));

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mail.threadpane.listview");
    Services.prefs.clearUserPref("mail.threadpane.cardsview.rowcount");
    Services.prefs.clearUserPref("mail.threadpane.table.horizontal_scroll");
    Services.prefs.clearUserPref("mailnews.default_view_flags");
    Services.prefs.clearUserPref("mailnews.default_sort_type");
    Services.prefs.clearUserPref("mailnews.default_sort_order");
  });
});

/**
 *
 * @param {XULElement} menu - The menuitem to click.
 * @param {integer} index - The index of the menupoup children to select.
 */
async function changeMenuItem(menu, index) {
  menu.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(menu, {}, prefsWindow);
  await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "shown");
  menu.menupopup.activateItem(menu.menupopup.children[index]);
  await BrowserTestUtils.waitForPopupEvent(menu.menupopup, "hidden");
}

add_task(async function test_cards_table_switch() {
  info("Check that the default options are correct");

  Assert.equal(
    prefsDocument.getElementById("appearanceViewStyle").selectedItem.value,
    Services.prefs.getIntPref("mail.threadpane.listview"),
    "The thread appearance style should match the default pref"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      prefsDocument.getElementById("cardsViewOptions")
    ),
    "Cards view options are visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("tableViewOptions")),
    "Table view options are hidden"
  );

  info("Test changing from 3 to 2 rows");

  Assert.equal(
    prefsDocument.getElementById("appearanceCardRows").selectedItem.value,
    Services.prefs.getIntPref("mail.threadpane.cardsview.rowcount"),
    "The cards row style should match the default pref"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("cardStyle2Rows"),
    {},
    prefsWindow
  );

  await BrowserTestUtils.waitForMutationCondition(
    threadTree,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => threadTree.classList.contains("cards-row-compact")
  );

  info("Test switching to table view");

  const switchedToTable = BrowserTestUtils.waitForAttribute(
    "rows",
    threadTree,
    "thread-row"
  );

  EventUtils.synthesizeMouseAtCenter(
    prefsDocument.getElementById("appearanceStyleTable"),
    {},
    prefsWindow
  );

  await switchedToTable;

  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("cardsViewOptions")),
    "Cards view options are hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      prefsDocument.getElementById("tableViewOptions")
    ),
    "Table view options are visible"
  );

  info("Test horizontal scroll option");

  const tableHorizontalScroll = prefsDocument.getElementById(
    "tableHorizontalScroll"
  );
  Assert.equal(
    tableHorizontalScroll.checked,
    Services.prefs.getBoolPref("mail.threadpane.table.horizontal_scroll"),
    "The table horizontal scroll should match the default pref"
  );

  tableHorizontalScroll.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(tableHorizontalScroll, {}, prefsWindow);

  await TestUtils.waitForCondition(
    () => threadTree.table.isHorizontalScroll,
    "The table view should have horizontal scroll"
  );

  EventUtils.synthesizeMouseAtCenter(tableHorizontalScroll, {}, prefsWindow);

  await TestUtils.waitForCondition(
    () => !threadTree.table.isHorizontalScroll,
    "The table view shouldn't have horizontal scroll"
  );

  info("Test switching back to cards view");

  const switchedToCards = BrowserTestUtils.waitForAttribute(
    "rows",
    threadTree,
    "thread-card"
  );

  const appearanceStyleCards = prefsDocument.getElementById(
    "appearanceStyleCards"
  );
  appearanceStyleCards.scrollIntoView({
    block: "end",
    behavior: "instant",
  });
  EventUtils.synthesizeMouseAtCenter(appearanceStyleCards, {}, prefsWindow);

  await switchedToCards;

  Assert.ok(
    BrowserTestUtils.isVisible(
      prefsDocument.getElementById("cardsViewOptions")
    ),
    "Cards view options are visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("tableViewOptions")),
    "Table view options are hidden"
  );
});

add_task(async function test_default_preferences_flags() {
  info("Check that the menulist selected values match the preferences values.");

  Assert.equal(
    prefsDocument.getElementById("defaultViewFlags").selectedItem.value,
    Services.prefs.getIntPref("mailnews.default_view_flags"),
    "The view flags menuitem should match the default pref"
  );
  Assert.equal(
    prefsDocument.getElementById("defaultSortType").selectedItem.value,
    Services.prefs.getIntPref("mailnews.default_sort_type"),
    "The sort type menuitem should match the default pref"
  );
  Assert.equal(
    prefsDocument.getElementById("defaultSortOrder").selectedItem.value,
    Services.prefs.getIntPref("mailnews.default_sort_order"),
    "The sort order menuitem should match the default pref"
  );
});

add_task(async function test_edit_flags_all_folders() {
  info("Ensure that changing the menulist updates the preferences correctly.");

  const defaultFlagUnthreaded = prefsDocument.getElementById(
    "defaultFlagUnthreaded"
  );
  defaultFlagUnthreaded.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(defaultFlagUnthreaded, {}, prefsWindow);

  Assert.equal(
    Services.prefs.getIntPref("mailnews.default_view_flags"),
    0,
    "The view flags pref should have been updated"
  );

  await changeMenuItem(prefsDocument.getElementById("defaultSortType"), 1);

  Assert.equal(
    Services.prefs.getIntPref("mailnews.default_sort_type"),
    19,
    "The sort type pref should have been updated"
  );

  const defaultSortOrderAscending = prefsDocument.getElementById(
    "defaultSortOrderAscending"
  );
  defaultSortOrderAscending.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
  EventUtils.synthesizeMouseAtCenter(
    defaultSortOrderAscending,
    {},
    prefsWindow
  );

  Assert.equal(
    Services.prefs.getIntPref("mailnews.default_sort_order"),
    1,
    "The sort order pref should have been updated"
  );

  info("Test that a previously accessed folder didn't change its flags");

  const dbFolder = folderSource.msgDatabase.dBFolderInfo;
  Assert.equal(
    dbFolder.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags should remain threaded"
  );
  Assert.equal(
    dbFolder.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType should remain byDate"
  );
  Assert.equal(
    dbFolder.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should remain descending"
  );
  folderSource.msgDatabase = null;

  Assert.equal(
    threadTree.table.body.getAttribute("role"),
    "treegrid",
    "The currently selected folder should be presented as Tree Grid View"
  );

  info("Apply the new flags to all existing folders");

  const applyPromise = TestUtils.topicObserved("global-view-flags-changed");

  const dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  const applyAll = prefsDocument.getElementById("applyAll");
  applyAll.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(applyAll, {}, prefsWindow);
  await dialogPromise;
  await applyPromise;

  for (const folder of [folderSource, folderParent, folderChild1]) {
    const dbInfo = folder.msgDatabase.dBFolderInfo;
    Assert.equal(
      dbInfo.viewFlags,
      Ci.nsMsgViewFlagsType.kNone,
      `viewFlags should be grouped by sort for ${folder.name}`
    );
    Assert.equal(
      dbInfo.sortType,
      Ci.nsMsgViewSortType.bySubject,
      `sortType should be bySubject for ${folder.name}`
    );
    Assert.equal(
      dbInfo.sortOrder,
      Ci.nsMsgViewSortOrder.ascending,
      `sortOrder should be ascending for ${folder.name}`
    );
    folder.msgDatabase = null;
  }

  Assert.equal(
    threadTree.table.body.getAttribute("role"),
    "listbox",
    "The currently selected folder should be presented as Listbox"
  );
});

add_task(async function test_edit_flags_single_folders() {
  info("Change flags and only apply them to a single folder");

  const defaultFlagThreaded = prefsDocument.getElementById(
    "defaultFlagThreaded"
  );
  defaultFlagThreaded.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(defaultFlagThreaded, {}, prefsWindow);
  await changeMenuItem(prefsDocument.getElementById("defaultSortType"), 0);

  const defaultSortOrderDescending = prefsDocument.getElementById(
    "defaultSortOrderDescending"
  );
  defaultSortOrderDescending.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
  EventUtils.synthesizeMouseAtCenter(
    defaultSortOrderDescending,
    {},
    prefsWindow
  );

  const chooseButton = prefsDocument.getElementById("applyChoose");
  const choosePopup = prefsDocument.getElementById("folderPickerMenuPopup");

  let applyPromise = TestUtils.topicObserved("global-view-flags-changed");

  chooseButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(chooseButton, {}, prefsWindow);
  await BrowserTestUtils.waitForPopupEvent(choosePopup, "shown");
  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await click_menus_in_sequence(choosePopup, [
    { class: "apply-view-to-folder-menu" },
    { label: "Local Folders" },
    { label: folderParent.name },
    { label: folderParent.name },
  ]);
  await dialogPromise;
  await BrowserTestUtils.waitForPopupEvent(choosePopup, "hidden");
  await applyPromise;

  const dbInfo = folderParent.msgDatabase.dBFolderInfo;
  Assert.equal(
    dbInfo.viewFlags,
    Ci.nsMsgViewFlagsType.kThreadedDisplay,
    "viewFlags should be set to threaded"
  );
  Assert.equal(
    dbInfo.sortType,
    Ci.nsMsgViewSortType.byDate,
    "sortType should be set to byDate"
  );
  Assert.equal(
    dbInfo.sortOrder,
    Ci.nsMsgViewSortOrder.descending,
    "sortOrder should be set to descending"
  );
  folderSource.msgDatabase = null;

  info("Change flags and apply them to a folder and its children");

  const defaultFlagGrouped = prefsDocument.getElementById("defaultFlagGrouped");
  defaultFlagGrouped.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(defaultFlagGrouped, {}, prefsWindow);
  await changeMenuItem(prefsDocument.getElementById("defaultSortType"), 1);

  const defaultSortOrderAscending = prefsDocument.getElementById(
    "defaultSortOrderAscending"
  );
  defaultSortOrderAscending.scrollIntoView({
    block: "start",
    behavior: "instant",
  });
  EventUtils.synthesizeMouseAtCenter(
    defaultSortOrderAscending,
    {},
    prefsWindow
  );

  applyPromise = TestUtils.topicObserved("global-view-flags-changed");

  chooseButton.scrollIntoView({ block: "start", behavior: "instant" });
  EventUtils.synthesizeMouseAtCenter(chooseButton, {}, prefsWindow);
  await BrowserTestUtils.waitForPopupEvent(choosePopup, "shown");
  dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await click_menus_in_sequence(choosePopup, [
    { class: "apply-view-to-folder-and-children-menu" },
    { label: "Local Folders" },
    { label: folderParent.name },
    { label: folderParent.name },
  ]);
  await dialogPromise;
  await BrowserTestUtils.waitForPopupEvent(choosePopup, "hidden");
  await applyPromise;

  for (const folder of [folderParent, folderChild1, folderChild2]) {
    const dbFolderInfo = folder.msgDatabase.dBFolderInfo;
    Assert.ok(
      !(dbFolderInfo.viewFlags & Ci.nsMsgViewFlagsType.kGroupBySort),
      `viewFlags should be grouped by sort for ${folder.name}`
    );
    Assert.equal(
      dbFolderInfo.sortType,
      Ci.nsMsgViewSortType.bySubject,
      `sortType should be bySubject for ${folder.name}`
    );
    Assert.equal(
      dbFolderInfo.sortOrder,
      Ci.nsMsgViewSortOrder.ascending,
      `sortOrder should be ascending for ${folder.name}`
    );
    folder.msgDatabase = null;
  }
});
