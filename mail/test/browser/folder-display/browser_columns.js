/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test column default logic and persistence logic.  Persistence comes in both
 *  tab-switching (because of the multiplexed implementation) and
 *  folder-switching forms.
 */

"use strict";

var {
  be_in_folder,
  close_tab,
  create_folder,
  create_virtual_folder,
  enter_folder,
  inboxFolder,
  make_message_sets_in_folders,
  open_folder_in_new_tab,
  switch_tab,
  select_click_row,
  delete_messages,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { click_menus_in_sequence } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

// needed to zero inter-folder processing delay
var { MailUtils } = ChromeUtils.importESModule(
  "resource:///modules/MailUtils.sys.mjs"
);

var { GlodaSyntheticView } = ChromeUtils.importESModule(
  "resource:///modules/gloda/GlodaSyntheticView.sys.mjs"
);

var { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/thread-pane-columns.mjs"
);

var folderInbox, folderSent, folderVirtual, folderA, folderB;
// INBOX_DEFAULTS sans 'dateCol' but gains 'tagsCol'
var columnsB;

// these are for the reset/apply to other/apply to other+child tests.
var folderSource, folderParent, folderChild1, folderChild2;

var useCorrespondent;
var INBOX_DEFAULTS;
var CARDS_INBOX_DEFAULT;
var SENT_DEFAULTS;
var CARDS_SENT_DEFAULTS;
var VIRTUAL_DEFAULTS;
var GLODA_DEFAULTS;

requestLongerTimeout(2);

add_setup(async function () {
  useCorrespondent = Services.prefs.getBoolPref(
    "mail.threadpane.use_correspondents"
  );
  INBOX_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    useCorrespondent ? "correspondentCol" : "senderCol",
    "junkStatusCol",
    "dateCol",
  ];
  CARDS_INBOX_DEFAULT = [
    "subjectCol",
    "senderCol",
    "dateCol",
    "tagsCol",
    "totalCol",
    "unreadCol",
  ];
  SENT_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    useCorrespondent ? "correspondentCol" : "recipientCol",
    "junkStatusCol",
    "dateCol",
  ];
  CARDS_SENT_DEFAULTS = [
    "subjectCol",
    "recipientCol",
    "dateCol",
    "tagsCol",
    "totalCol",
    "unreadCol",
  ];
  VIRTUAL_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    useCorrespondent ? "correspondentCol" : "senderCol",
    "junkStatusCol",
    "dateCol",
  ];
  GLODA_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "subjectCol",
    useCorrespondent ? "correspondentCol" : "senderCol",
    "dateCol",
    "locationCol",
  ];

  // Create the source.
  folderSource = await create_folder("ColumnsApplySource");

  // Switch to table view.
  await ensure_table_view();
  registerCleanupFunction(async () => {
    await ensure_cards_view();
  });

  // Add a message.
  const [messageSet] = await make_message_sets_in_folders(
    [inboxFolder],
    [{ count: 1 }]
  );
  registerCleanupFunction(async () => {
    await delete_messages(messageSet);
  });
});

/**
 * Get the currently visible threadTree columns.
 *
 * @returns {string[]}
 */
function get_visible_threadtree_columns() {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  const columns = about3Pane.threadPane.columns;
  return columns.filter(column => !column.hidden).map(column => column.id);
}

/**
 * Verify that the provided list of columns is visible in the given order,
 * throwing an exception if it is not the case.
 *
 * @param {string[]} desiredColumns - A list of column ID strings for columns
 *   that should be visible in the order that they should be visible.
 */
function assert_visible_columns(desiredColumns) {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  const columns = about3Pane.threadPane.columns;
  const visibleColumns = columns
    .filter(column => !column.hidden)
    .map(column => column.id);
  let failCol = visibleColumns.filter(x => !desiredColumns.includes(x));
  if (failCol.length) {
    throw new Error(
      `Found unexpected visible columns: '${failCol}'!\ndesired list: ${desiredColumns}\nactual list: ${visibleColumns}`
    );
  }
  failCol = desiredColumns.filter(x => !visibleColumns.includes(x));
  if (failCol.length) {
    throw new Error(
      `Found unexpected hidden columns: '${failCol}'!\ndesired list: ${desiredColumns}\nactual list: ${visibleColumns}`
    );
  }
}

/**
 * Verify that the provided list of columns is the expected list for the cards
 * view.
 *
 * @param {string[]} desiredColumns - A list of column ID strings for columns
 *   that should be visible.
 */
function assert_visible_cards_columns(desiredColumns) {
  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  const columns = about3Pane.threadPane.cardColumns;
  const failCol = columns.filter(x => !desiredColumns.includes(x));
  if (failCol.length) {
    throw new Error(
      `Found unexpected cards columns: '${failCol}'!\ndesired list: ${desiredColumns}\nactual list: ${columns}`
    );
  }
}

/**
 * Toggle the column visibility .
 *
 * @param {string} columnID - Id of the thread column element to click.
 */
async function toggleColumn(columnID) {
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
    "popuphidden",
    undefined,
    event => event.originalTarget == colPickerPopup
  );

  const menuItem = colPickerPopup.querySelector(`[value="${columnID}"]`);
  const checkedState = menuItem.getAttribute("checked");
  const checkedStateChanged = TestUtils.waitForCondition(
    () => checkedState != menuItem.getAttribute("checked"),
    "The checked status changed"
  );
  colPickerPopup.activateItem(menuItem);
  await checkedStateChanged;

  // The column picker menupopup doesn't close automatically on purpose.
  EventUtils.synthesizeKey("VK_ESCAPE", {}, about3Pane);
  await hiddenPromise;
}

/**
 * Make sure we set the proper defaults for an Inbox.
 */
add_task(async function test_column_defaults_inbox() {
  // just use the inbox; comes from FolderDisplayHelpers
  folderInbox = inboxFolder;
  await enter_folder(folderInbox);

  assert_visible_columns(INBOX_DEFAULTS);
  assert_visible_cards_columns(CARDS_INBOX_DEFAULT);
});

add_task(async function test_keypress_on_columns() {
  // just use the inbox; comes from FolderDisplayHelpers
  folderInbox = inboxFolder;
  await enter_folder(folderInbox);

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  // Select the first row.
  const row = about3Pane.threadTree.getRowAtIndex(0);
  EventUtils.synthesizeMouseAtCenter(row, {}, about3Pane);

  // Press SHIFT+TAB and LEFT to focus on the column picker.
  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, about3Pane);
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, about3Pane);

  Assert.equal(
    about3Pane.document.activeElement,
    about3Pane.document.querySelector(
      `th[is="tree-view-table-column-picker"] button`
    ),
    "The column picker should be focused"
  );

  Assert.equal(tabmail.tabInfo.length, 1, "Only 1 tab should be visible");

  const colPickerPopup = about3Pane.document.querySelector(
    `th[is="tree-view-table-column-picker"] menupopup`
  );
  let shownPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popupshown"
  );
  // Pressing Enter should open the column picker popup.
  EventUtils.synthesizeKey("VK_RETURN", {}, about3Pane);
  await shownPromise;

  Assert.equal(
    tabmail.tabInfo.length,
    1,
    "The selected message shouldn't be opened in another tab"
  );

  let hiddenPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popuphidden",
    undefined,
    event => event.originalTarget == colPickerPopup
  );
  // Close the column picker.
  EventUtils.synthesizeKey("VK_ESCAPE", {}, about3Pane);
  await hiddenPromise;

  // Move the focus to another column.
  EventUtils.synthesizeKey("KEY_ArrowLeft", {}, about3Pane);
  Assert.notEqual(
    about3Pane.document.activeElement,
    about3Pane.document.querySelector(
      `th[is="tree-view-table-column-picker"] button`
    ),
    "The column picker should not be focused"
  );

  shownPromise = BrowserTestUtils.waitForEvent(colPickerPopup, "popupshown");
  // Right clicking on a column header should trigger the column picker
  // menupopup.
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.document.activeElement,
    { type: "contextmenu" },
    about3Pane
  );
  await shownPromise;

  hiddenPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popuphidden",
    undefined,
    event => event.originalTarget == colPickerPopup
  );
  // Close the column picker.
  EventUtils.synthesizeKey("VK_ESCAPE", {}, about3Pane);
  await hiddenPromise;
});

/**
 * Make sure we set the proper defaults for a Sent folder.
 */
add_task(async function test_column_defaults_sent() {
  folderSent = await create_folder("ColumnsSent");
  folderSent.setFlag(Ci.nsMsgFolderFlags.SentMail);

  await be_in_folder(folderSent);
  assert_visible_columns(SENT_DEFAULTS);
  assert_visible_cards_columns(CARDS_SENT_DEFAULTS);
});

/**
 * Make sure we set the proper defaults for a multi-folder virtual folder.
 */
add_task(async function test_column_defaults_cross_folder_virtual_folder() {
  folderVirtual = create_virtual_folder(
    [folderInbox, folderSent],
    {},
    true,
    "ColumnsVirtual"
  );

  await be_in_folder(folderVirtual);
  assert_visible_columns(VIRTUAL_DEFAULTS);
});

/**
 * Make sure that we initialize our columns from the inbox and that they persist
 *  after that and don't follow the inbox.  This also does a good workout of the
 *  persistence logic.
 */
add_task(async function test_column_defaults_inherit_from_inbox() {
  folderA = await create_folder("ColumnsA");
  // - the folder should inherit from the inbox...
  await be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  // - if we go back to the inbox and change things then the folder's settings
  //  should not change.
  await be_in_folder(folderInbox);
  // show tags, hide date
  await toggleColumn("dateCol");
  await toggleColumn("tagsCol");
  // (paranoia verify)
  columnsB = INBOX_DEFAULTS.slice(0, -1);
  columnsB.push("tagsCol");
  assert_visible_columns(columnsB);

  // make sure A did not change; it should still have dateCol.
  await be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  // and a newly created folder always gets the default set.
  folderB = await create_folder("ColumnsB");
  await be_in_folder(folderB);
  assert_visible_columns(INBOX_DEFAULTS);
  // Now change the columns for folder B so we can use it later.
  await toggleColumn("dateCol");
  await toggleColumn("tagsCol");

  // - and if we restore the inbox, folder B should stay modified too.
  await be_in_folder(folderInbox);
  await toggleColumn("dateCol");
  await toggleColumn("tagsCol");
  assert_visible_columns(INBOX_DEFAULTS);

  await be_in_folder(folderB);
  assert_visible_columns(columnsB);
});

/**
 * Make sure that when we change tabs that things persist/restore correctly.
 */
add_task(async function test_column_visibility_persists_through_tab_changes() {
  const tabA = await be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  const tabB = await open_folder_in_new_tab(folderB);
  assert_visible_columns(columnsB);

  // - switch back and forth among the loaded and verify
  await switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  await switch_tab(tabB);
  assert_visible_columns(columnsB);

  // - change things and make sure the changes stick
  // B gain accountCol
  const bWithExtra = columnsB.concat(["accountCol"]);
  await toggleColumn("accountCol");
  assert_visible_columns(bWithExtra);

  await switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  // A loses junk
  const aSansJunk = INBOX_DEFAULTS.slice(0, -2); // nukes junk, date
  await toggleColumn("junkStatusCol");
  aSansJunk.push("dateCol"); // put date back
  assert_visible_columns(aSansJunk);

  await switch_tab(tabB);
  assert_visible_columns(bWithExtra);
  // B goes back to normal
  await toggleColumn("accountCol");

  await switch_tab(tabA);
  assert_visible_columns(aSansJunk);
  // A goes back to "normal"
  await toggleColumn("junkStatusCol");
  assert_visible_columns(INBOX_DEFAULTS);

  close_tab(tabB);
});

/**
 * Make sure that when we change folders that things persist/restore correctly.
 */
add_task(
  async function test_column_visibility_persists_through_folder_changes() {
    await be_in_folder(folderA);
    assert_visible_columns(INBOX_DEFAULTS);

    // more for A
    const aWithExtra = INBOX_DEFAULTS.concat(["sizeCol", "tagsCol"]);
    await toggleColumn("sizeCol");
    await toggleColumn("tagsCol");
    assert_visible_columns(aWithExtra);

    await be_in_folder(folderB);
    assert_visible_columns(columnsB);

    // B gain accountCol
    const bWithExtra = columnsB.concat(["accountCol"]);
    await toggleColumn("accountCol");
    assert_visible_columns(bWithExtra);

    // check A
    await be_in_folder(folderA);
    assert_visible_columns(aWithExtra);

    // check B
    await be_in_folder(folderB);
    assert_visible_columns(bWithExtra);

    // restore B
    await toggleColumn("accountCol");

    // restore A
    await be_in_folder(folderA);
    await toggleColumn("sizeCol");
    await toggleColumn("tagsCol");

    // check B
    await be_in_folder(folderB);
    assert_visible_columns(columnsB);

    // check A
    await be_in_folder(folderA);
    assert_visible_columns(INBOX_DEFAULTS);
  }
);

/**
 * Test that reordering persists through tab changes and folder changes.
 */
add_task(async function test_column_reordering_persists() {
  const tabA = await be_in_folder(folderA);
  const tabB = await open_folder_in_new_tab(folderB);

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;

  // Move the tags column before the junk.
  const tagsColButton = about3Pane.document.getElementById("tagsColButton");
  tagsColButton.focus();
  // Press Alt + Arrow Left twice to move the tags column before the junk
  // status column.
  EventUtils.synthesizeKey("KEY_ArrowLeft", { altKey: true }, about3Pane);
  EventUtils.synthesizeKey("KEY_ArrowLeft", { altKey: true }, about3Pane);

  // The columns in folderB should reflect the new order.
  const reorderdB = columnsB.concat();
  info(reorderdB);
  reorderdB.splice(5, 0, reorderdB.splice(7, 1)[0]);
  info(reorderdB);
  assert_visible_columns(reorderdB);

  // Move the tags column after the junk, the focus should still be on the
  // tags button.
  EventUtils.synthesizeKey("KEY_ArrowRight", { altKey: true }, about3Pane);

  reorderdB.splice(6, 0, reorderdB.splice(5, 1)[0]);
  assert_visible_columns(reorderdB);

  await switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  await switch_tab(tabB);
  assert_visible_columns(reorderdB);

  await be_in_folder(folderInbox);
  assert_visible_columns(INBOX_DEFAULTS);

  await be_in_folder(folderB);
  assert_visible_columns(reorderdB);

  close_tab(tabB);
});

async function open_column_picker() {
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

  return colPickerPopup;
}

async function invoke_column_picker_option(aActions) {
  const colPickerPopup = await open_column_picker();
  await click_menus_in_sequence(colPickerPopup, aActions);
}

/**
 * The column picker's "reset columns to default" option should set our state
 * back to the natural state.
 */
add_task(async function test_reset_to_inbox() {
  // We should be in the inbox folder and have the default set unchanged.
  assert_visible_columns(INBOX_DEFAULTS);

  // Show the size column.
  const conExtra = INBOX_DEFAULTS.concat(["sizeCol"]);
  await toggleColumn("sizeCol");
  assert_visible_columns(conExtra);

  // Trigger a reset.
  await invoke_column_picker_option([{ label: "Restore column order" }]);
  // Ensure the default set was restored.
  assert_visible_columns(INBOX_DEFAULTS);
});

/**
 * Registers a custom column and verifies it is added to the thread pane.
 */
add_task(async function test_custom_columns() {
  await enter_folder(inboxFolder);
  assert_visible_columns(INBOX_DEFAULTS);

  ThreadPaneColumns.addCustomColumn("testCol", {
    name: "Test",
    hidden: true,
    sortCallback(header) {
      return header.subject.length;
    },
    textCallback(header) {
      return header.subject.length;
    },
  });
  await new Promise(setTimeout);

  assert_visible_columns(INBOX_DEFAULTS);

  let colPickerPopup = await open_column_picker();
  let columnItem = colPickerPopup.querySelector(
    `menuitem[type="checkbox"][value="testCol"]`
  );
  Assert.ok(columnItem, "Column item should exist");
  Assert.ok(
    !columnItem.hasAttribute("checked"),
    "Column item should not be checked"
  );
  colPickerPopup.hidePopup();

  await toggleColumn("testCol");
  assert_visible_columns([...INBOX_DEFAULTS, "testCol"]);

  colPickerPopup = await open_column_picker();
  columnItem = colPickerPopup.querySelector(
    `menuitem[type="checkbox"][value="testCol"]`
  );
  Assert.ok(columnItem, "Column item should exist");
  Assert.equal(
    columnItem.getAttribute("checked"),
    "true",
    "Column item should be checked"
  );
  colPickerPopup.hidePopup();

  ThreadPaneColumns.removeCustomColumn("testCol");

  assert_visible_columns(INBOX_DEFAULTS);

  colPickerPopup = await open_column_picker();
  columnItem = colPickerPopup.querySelector(
    `menuitem[type="checkbox"][value="testCol"]`
  );
  Assert.ok(!columnItem, "Column item should not exist");
  colPickerPopup.hidePopup();
});

add_task(async function test_custom_column_invalidation() {
  await enter_folder(inboxFolder);
  assert_visible_columns(INBOX_DEFAULTS);
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;

  let factor = 1;
  ThreadPaneColumns.addCustomColumn("testCol1", {
    name: "Test1",
    hidden: true,
    sortCallback(header) {
      return header.subject.length * factor;
    },
    textCallback(header) {
      return header.subject.length * factor;
    },
  });
  ThreadPaneColumns.addCustomColumn("testCol2", {
    name: "Test2",
    hidden: true,
    sortCallback(header) {
      return header.subject.length * factor;
    },
    textCallback(header) {
      return header.subject.length * factor;
    },
  });
  await new Promise(setTimeout);

  assert_visible_columns(INBOX_DEFAULTS);

  await toggleColumn("testCol1");
  await toggleColumn("testCol2");
  assert_visible_columns([...INBOX_DEFAULTS, "testCol1", "testCol2"]);

  const row = about3Pane.threadTree.getRowAtIndex(0);
  const value1 = parseInt(
    row.querySelector(".testcol1-column").textContent,
    10
  );
  const value2 = parseInt(
    row.querySelector(".testcol2-column").textContent,
    10
  );
  Assert.greater(value1, 0, "Content of custom cell #1 should be non-zero");
  Assert.greater(value2, 0, "Content of custom cell #2 should be non-zero");
  Assert.equal(
    value1,
    value2,
    "Content of both custom cells should be identical"
  );

  factor = 2;
  ThreadPaneColumns.refreshCustomColumn("testCol1");
  await new Promise(setTimeout);

  const refreshedValue1 = parseInt(
    row.querySelector(".testcol1-column").textContent,
    10
  );
  const refreshedValue2 = parseInt(
    row.querySelector(".testcol2-column").textContent,
    10
  );
  Assert.equal(
    refreshedValue1,
    value1 * 2,
    "Content of custom cell #1 should have doubled"
  );
  Assert.equal(
    refreshedValue2,
    value2,
    "Content of custom cell #2 should have not changed"
  );

  ThreadPaneColumns.removeCustomColumn("testCol1");
  ThreadPaneColumns.removeCustomColumn("testCol2");

  assert_visible_columns(INBOX_DEFAULTS);
});

async function _apply_to_folder_common(aChildrenToo, folder) {
  let notificatonPromise;
  if (aChildrenToo) {
    notificatonPromise = TestUtils.topicObserved(
      "msg-folder-columns-propagated"
    );
  }

  const menuItems = [
    { class: "applyTo-menu" },
    {
      class: aChildrenToo
        ? "applyToFolderAndChildren-menu"
        : "applyToFolder-menu",
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
 *  children.  Make sure the folder changes but the children do not.
 */
add_task(async function test_apply_to_folder_no_children() {
  folderParent = await create_folder("ColumnsApplyParent");
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);
  folderChild2 = folderParent.getChildNamed("Child2");

  await be_in_folder(folderSource);

  // reset!
  await invoke_column_picker_option([{ label: "Restore column order" }]);

  // permute!
  const conExtra = INBOX_DEFAULTS.concat(["sizeCol"]);
  await toggleColumn("sizeCol");
  assert_visible_columns(conExtra);

  // apply to the one dude
  await _apply_to_folder_common(false, folderParent);

  // make sure it copied to the parent
  await be_in_folder(folderParent);
  assert_visible_columns(conExtra);

  // but not the children
  await be_in_folder(folderChild1);
  assert_visible_columns(INBOX_DEFAULTS);
  await be_in_folder(folderChild2);
  assert_visible_columns(INBOX_DEFAULTS);
});

/**
 * Change settings in a folder, apply them to another folder and its children.
 *  Make sure the folder and its children change.
 */
add_task(async function test_apply_to_folder_and_children() {
  // no need to throttle ourselves during testing.
  MailUtils.INTER_FOLDER_PROCESSING_DELAY_MS = 0;

  await be_in_folder(folderSource);

  // reset!
  await invoke_column_picker_option([{ label: "Restore column order" }]);
  const cols = get_visible_threadtree_columns();

  // permute!
  const conExtra = cols.concat(["tagsCol"]);
  await toggleColumn("tagsCol");
  assert_visible_columns(conExtra);

  // apply to the dude and his offspring
  await _apply_to_folder_common(true, folderParent);

  // make sure it copied to the parent and his children
  await be_in_folder(folderParent);
  assert_visible_columns(conExtra);
  await be_in_folder(folderChild1);
  assert_visible_columns(conExtra);
  await be_in_folder(folderChild2);
  assert_visible_columns(conExtra);
});

/**
 * Change settings in an incoming folder, apply them to an outgoing folder that
 * also has children. Make sure the folder changes but the children do not.
 */
add_task(async function test_apply_to_folder_no_children_swapped() {
  folderParent = await create_folder("ColumnsApplyParentOutgoing");
  folderParent.setFlag(Ci.nsMsgFolderFlags.SentMail);
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);
  folderChild2 = folderParent.getChildNamed("Child2");

  await be_in_folder(folderSource);

  // reset!
  await invoke_column_picker_option([{ label: "Restore column order" }]);

  // permute!
  const conExtra = [...INBOX_DEFAULTS];
  if (useCorrespondent) {
    conExtra[5] = "senderCol";
    await toggleColumn("correspondentCol");
    await toggleColumn("senderCol");
  } else {
    conExtra[5] = "correspondentCol";
    await toggleColumn("senderCol");
    await toggleColumn("correspondentCol");
  }
  assert_visible_columns(conExtra);

  // Apply to the one dude.
  await _apply_to_folder_common(false, folderParent);

  // Make sure it copied to the parent.
  const conExtraSwapped = [...SENT_DEFAULTS];
  conExtraSwapped[5] = useCorrespondent ? "recipientCol" : "correspondentCol";
  await be_in_folder(folderParent);
  assert_visible_columns(conExtraSwapped);

  // But not the children.
  await be_in_folder(folderChild1);
  assert_visible_columns(SENT_DEFAULTS);
  await be_in_folder(folderChild2);
  assert_visible_columns(SENT_DEFAULTS);
});

/**
 * Change settings in an incoming folder, apply them to an outgoing folder and
 * its children. Make sure the folder and its children change.
 */
add_task(async function test_apply_to_folder_and_children_swapped() {
  // No need to throttle ourselves during testing.
  MailUtils.INTER_FOLDER_PROCESSING_DELAY_MS = 0;

  await be_in_folder(folderSource);

  // reset order!
  await invoke_column_picker_option([{ label: "Restore column order" }]);

  // permute!
  const conExtra = [...INBOX_DEFAULTS];
  if (useCorrespondent) {
    conExtra[5] = "senderCol";
    await toggleColumn("correspondentCol");
    await toggleColumn("senderCol");
  } else {
    conExtra[5] = "correspondentCol";
    await toggleColumn("senderCol");
    await toggleColumn("correspondentCol");
  }
  assert_visible_columns(conExtra);

  // Apply to the dude and his offspring.
  await _apply_to_folder_common(true, folderParent);

  // Make sure it copied to the parent and his children.
  const conExtraSwapped = [...SENT_DEFAULTS];
  conExtraSwapped[5] = useCorrespondent ? "recipientCol" : "correspondentCol";
  await be_in_folder(folderParent);
  assert_visible_columns(conExtraSwapped);
  await be_in_folder(folderChild1);
  assert_visible_columns(conExtraSwapped);
  await be_in_folder(folderChild2);
  assert_visible_columns(conExtraSwapped);
});

/**
 * Change settings in a folder, apply them to the root folder and its children.
 * Make sure the children change.
 */
add_task(async function test_apply_to_root_folder_and_children() {
  // No need to throttle ourselves during testing.
  MailUtils.INTER_FOLDER_PROCESSING_DELAY_MS = 0;

  await be_in_folder(folderSource);

  // Reset!
  await invoke_column_picker_option([{ label: "Restore column order" }]);
  const cols = get_visible_threadtree_columns();

  // Permute!
  const conExtra = cols.concat(["locationCol"]);
  await toggleColumn("locationCol");
  assert_visible_columns(conExtra);

  // Apply to the root folder and its descendants.
  await _apply_to_folder_common(true, folderSource.rootFolder);

  // Make sure it is copied to all folders of this server.
  for (const folder of folderSource.rootFolder.descendants) {
    await be_in_folder(folder);
    assert_visible_columns(conExtra);
    folder.msgDatabase = null;
  }
});

/**
 * Create a fake gloda collection.
 */
class FakeCollection {
  constructor() {
    this.items = [];
  }
}

add_task(async function test_column_defaults_gloda_collection() {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.openTab("mail3PaneTab", {
    folderPaneVisible: false,
    syntheticView: new GlodaSyntheticView({
      collection: new FakeCollection(),
    }),
    title: "Test gloda results",
  });
  await BrowserTestUtils.waitForCondition(
    () => tab.chromeBrowser.contentWindow.gViewWrapper?.isSynthetic,
    "synthetic view loaded"
  );
  assert_visible_columns(GLODA_DEFAULTS);
  close_tab(tab);
});

add_task(async function test_persist_columns_gloda_collection() {
  const fakeCollection = new FakeCollection();
  const tabmail = document.getElementById("tabmail");
  const tab1 = tabmail.openTab("mail3PaneTab", {
    folderPaneVisible: false,
    syntheticView: new GlodaSyntheticView({
      collection: fakeCollection,
    }),
    title: "Test gloda results 1",
  });
  await BrowserTestUtils.waitForCondition(
    () => tab1.chromeBrowser.contentWindow.gViewWrapper?.isSynthetic,
    "synthetic view loaded"
  );

  await toggleColumn("locationCol");
  await toggleColumn("accountCol");

  // GLODA_DEFAULTS sans 'locationCol' but gains 'accountCol'
  const glodaColumns = GLODA_DEFAULTS.slice(0, -1);
  glodaColumns.push("accountCol");

  const tab2 = tabmail.openTab("mail3PaneTab", {
    folderPaneVisible: false,
    syntheticView: new GlodaSyntheticView({
      collection: fakeCollection,
    }),
    title: "Test gloda results 2",
  });
  await BrowserTestUtils.waitForCondition(
    () => tab2.chromeBrowser.contentWindow.gViewWrapper?.isSynthetic,
    "synthetic view loaded"
  );
  assert_visible_columns(glodaColumns);

  // Restore default gloda columns for debug ease.
  await toggleColumn("locationCol");
  await toggleColumn("accountCol");

  close_tab(tab2);
  close_tab(tab1);
});

add_task(async function test_reset_columns_gloda_collection() {
  const fakeCollection = new FakeCollection();
  const tabmail = document.getElementById("tabmail");
  const tab1 = tabmail.openTab("mail3PaneTab", {
    folderPaneVisible: false,
    syntheticView: new GlodaSyntheticView({
      collection: fakeCollection,
    }),
    title: "Test gloda results 1",
  });
  await BrowserTestUtils.waitForCondition(
    () => tab1.chromeBrowser.contentWindow.gViewWrapper?.isSynthetic,
    "synthetic view loaded"
  );

  await toggleColumn("locationCol");
  await toggleColumn("accountCol");

  // GLODA_DEFAULTS sans 'locationCol' but gains 'accountCol'
  const glodaColumns = GLODA_DEFAULTS.slice(0, -1);
  glodaColumns.push("accountCol");

  assert_visible_columns(glodaColumns);

  // reset order!
  await invoke_column_picker_option([{ label: "Restore column order" }]);

  assert_visible_columns(GLODA_DEFAULTS);

  const tab2 = tabmail.openTab("mail3PaneTab", {
    folderPaneVisible: false,
    syntheticView: new GlodaSyntheticView({
      collection: fakeCollection,
    }),
    title: "Test gloda results 2",
  });
  await BrowserTestUtils.waitForCondition(
    () => tab2.chromeBrowser.contentWindow.gViewWrapper?.isSynthetic,
    "synthetic view loaded"
  );
  assert_visible_columns(GLODA_DEFAULTS);

  // Restore default gloda columns for debug ease.
  await toggleColumn("locationCol");
  await toggleColumn("accountCol");

  close_tab(tab2);
  close_tab(tab1);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});

add_task(async function test_double_click_column_picker() {
  const doubleClickFolder = await create_folder("double click folder");
  await make_message_sets_in_folders([doubleClickFolder], [{ count: 1 }]);
  await be_in_folder(doubleClickFolder);
  await select_click_row(0);

  const tabmail = document.getElementById("tabmail");
  const currentTabInfo = tabmail.currentTabInfo;
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
    "popuphidden",
    undefined,
    event => event.originalTarget == colPickerPopup
  );

  const menuItem = colPickerPopup.querySelector('[value="threadCol"]');
  menuItem.dispatchEvent(new MouseEvent("dblclick", { button: 0 }));

  // The column picker menupopup doesn't close automatically on purpose.
  EventUtils.synthesizeKey("VK_ESCAPE", {}, about3Pane);
  await hiddenPromise;

  Assert.deepEqual(
    tabmail.currentTabInfo,
    currentTabInfo,
    "No message was opened in a tab"
  );
});
