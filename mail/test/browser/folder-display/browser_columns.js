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
  mc,
  open_folder_in_new_tab,
  switch_tab,
  wait_for_all_messages_to_load,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
// needed to zero inter-folder processing delay
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");

var folderInbox, folderSent, folderVirtual, folderA, folderB;
// INBOX_DEFAULTS sans 'dateCol' but gains 'tagsCol'
var columnsB;
// GLODA_DEFAULTS sans 'locationCol' but gains 'accountCol'
var glodaColumns;

// these are for the reset/apply to other/apply to other+child tests.
var folderSource, folderParent, folderChild1, folderChild2;

var gColumnStateUpdated = false;

var useCorrespondent;
var INBOX_DEFAULTS;
var SENT_DEFAULTS;
var VIRTUAL_DEFAULTS;
var GLODA_DEFAULTS;

add_task(function setupModule(module) {
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
  VIRTUAL_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "attachmentCol",
    "subjectCol",
    "unreadButtonColHeader",
    useCorrespondent ? "correspondentCol" : "senderCol",
    "junkStatusCol",
    "dateCol",
    "locationCol",
  ];
  GLODA_DEFAULTS = [
    "threadCol",
    "flaggedCol",
    "subjectCol",
    useCorrespondent ? "correspondentCol" : "senderCol",
    "dateCol",
    "locationCol",
  ];

  // create the source
  folderSource = create_folder("ColumnsApplySource");
});

/**
 * Get the currently visible threadTree columns.
 */
function get_visible_threadtree_columns() {
  let cols = mc.e("threadTree").columns;
  let visibleColumnIds = [];
  for (let col = cols.getFirstColumn(); col != null; col = col.getNext()) {
    if (!col.element.hidden) {
      visibleColumnIds.push(col.id);
    }
  }
  return visibleColumnIds;
}

/**
 * Verify that the provided list of columns is visible in the given order,
 *  throwing an exception if it is not the case.
 *
 * @param aDesiredColumns A list of column ID strings for columns that should be
 *     visible in the order that they should be visible.
 */
function assert_visible_columns(aDesiredColumns) {
  let cols = mc.e("threadTree").columns;
  let iDesired = 0;

  let visibleColumnIds = [];
  let failCol = null;
  for (let col = cols.getFirstColumn(); col != null; col = col.getNext()) {
    if (!col.element.hidden) {
      visibleColumnIds.push(col.id);
      if (!failCol) {
        if (aDesiredColumns[iDesired] != col.id) {
          failCol = col;
        } else {
          iDesired++;
        }
      }
    }
  }
  if (failCol) {
    throw new Error(
      "Found visible column '" +
        failCol.id +
        "' but was " +
        "expecting '" +
        aDesiredColumns[iDesired] +
        "'!" +
        "\ndesired list: " +
        aDesiredColumns +
        "\n actual list: " +
        visibleColumnIds
    );
  }
}

/**
 * Show the column with the given id.
 *
 * @param aColumnId Id of the treecol element you want to show.
 */
function show_column(aColumnId) {
  mc.e(aColumnId).removeAttribute("hidden");
}

/**
 * Hide the column with the given id.
 *
 * @param aColumnId Id of the treecol element you want to hide.
 */
function hide_column(aColumnId) {
  mc.e(aColumnId).setAttribute("hidden", "true");
}

/**
 * Move a column before another column.
 *
 * @param aColumnId The id of the column you want to move.
 * @param aBeforeId The id of the column you want the moving column to end up
 *     before.
 */
function reorder_column(aColumnId, aBeforeId) {
  let col = mc.e(aColumnId);
  let before = mc.e(aBeforeId);
  mc.threadTree._reorderColumn(col, before, true);
}

/**
 * Make sure we set the proper defaults for an Inbox.
 */
add_task(function test_column_defaults_inbox() {
  // just use the inbox; comes from test-folder-display-helpers
  folderInbox = inboxFolder;
  enter_folder(folderInbox);
  assert_visible_columns(INBOX_DEFAULTS);
});

/**
 * Make sure we set the proper defaults for a Sent folder.
 */
add_task(function test_column_defaults_sent() {
  folderSent = create_folder("ColumnsSent");
  folderSent.setFlag(Ci.nsMsgFolderFlags.SentMail);

  be_in_folder(folderSent);
  assert_visible_columns(SENT_DEFAULTS);
});

/**
 * Make sure we set the proper defaults for a multi-folder virtual folder.
 */
add_task(function test_column_defaults_cross_folder_virtual_folder() {
  folderVirtual = create_virtual_folder(
    [folderInbox, folderSent],
    {},
    true,
    "ColumnsVirtual"
  );

  be_in_folder(folderVirtual);
  assert_visible_columns(VIRTUAL_DEFAULTS);
});

/**
 * Make sure that we initialize our columns from the inbox and that they persist
 *  after that and don't follow the inbox.  This also does a good workout of the
 *  persistence logic.
 */
add_task(function test_column_defaults_inherit_from_inbox() {
  folderA = create_folder("ColumnsA");
  // - the folder should inherit from the inbox...
  be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  // - if we go back to the inbox and change things then the folder's settings
  //  should not change.
  be_in_folder(folderInbox);
  // show tags, hide date
  hide_column("dateCol");
  show_column("tagsCol");
  // (paranoia verify)
  columnsB = INBOX_DEFAULTS.slice(0, -1);
  columnsB.push("tagsCol");
  assert_visible_columns(columnsB);

  // make sure A did not change; it should still have dateCol.
  be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  // - but folder B should pick up on the modified set
  folderB = create_folder("ColumnsB");
  be_in_folder(folderB);
  assert_visible_columns(columnsB);

  // - and if we restore the inbox, folder B should stay modified too.
  be_in_folder(folderInbox);
  show_column("dateCol");
  hide_column("tagsCol");
  assert_visible_columns(INBOX_DEFAULTS);

  be_in_folder(folderB);
  assert_visible_columns(columnsB);
});

/**
 * Make sure that when we change tabs that things persist/restore correctly.
 */
add_task(function test_column_visibility_persists_through_tab_changes() {
  let tabA = be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  let tabB = open_folder_in_new_tab(folderB);
  assert_visible_columns(columnsB);

  // - switch back and forth among the loaded and verify
  switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  switch_tab(tabB);
  assert_visible_columns(columnsB);

  // - change things and make sure the changes stick
  // B gain accountCol
  let bWithExtra = columnsB.concat(["accountCol"]);
  show_column("accountCol");
  assert_visible_columns(bWithExtra);

  switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  // A loses junk
  let aSansJunk = INBOX_DEFAULTS.slice(0, -2); // nukes junk, date
  hide_column("junkStatusCol");
  aSansJunk.push("dateCol"); // put date back
  assert_visible_columns(aSansJunk);

  switch_tab(tabB);
  assert_visible_columns(bWithExtra);
  // B goes back to normal
  hide_column("accountCol");

  switch_tab(tabA);
  assert_visible_columns(aSansJunk);
  // A goes back to "normal"
  show_column("junkStatusCol");
  assert_visible_columns(INBOX_DEFAULTS);

  close_tab(tabB);
});

/**
 * Make sure that when we change folders that things persist/restore correctly.
 */
add_task(function test_column_visibility_persists_through_folder_changes() {
  be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);

  // more for A
  let aWithExtra = INBOX_DEFAULTS.concat(["sizeCol", "tagsCol"]);
  show_column("sizeCol");
  show_column("tagsCol");
  assert_visible_columns(aWithExtra);

  be_in_folder(folderB);
  assert_visible_columns(columnsB);

  // B gain accountCol
  let bWithExtra = columnsB.concat(["accountCol"]);
  show_column("accountCol");
  assert_visible_columns(bWithExtra);

  // check A
  be_in_folder(folderA);
  assert_visible_columns(aWithExtra);

  // check B
  be_in_folder(folderB);
  assert_visible_columns(bWithExtra);

  // restore B
  hide_column("accountCol");

  // restore A
  be_in_folder(folderA);
  hide_column("sizeCol");
  hide_column("tagsCol");

  // check B
  be_in_folder(folderB);
  assert_visible_columns(columnsB);

  // check A
  be_in_folder(folderA);
  assert_visible_columns(INBOX_DEFAULTS);
});

/**
 * Test that reordering persists through tab changes and folder changes.
 */
add_task(function test_column_reordering_persists() {
  let tabA = be_in_folder(folderA);
  let tabB = open_folder_in_new_tab(folderB);

  // put correspondent/sender before subject
  reorder_column(
    useCorrespondent ? "correspondentCol" : "senderCol",
    "subjectCol"
  );
  let reorderdB = columnsB.concat();
  reorderdB.splice(5, 1);
  reorderdB.splice(3, 0, useCorrespondent ? "correspondentCol" : "senderCol");
  assert_visible_columns(reorderdB);

  switch_tab(tabA);
  assert_visible_columns(INBOX_DEFAULTS);

  switch_tab(tabB);
  assert_visible_columns(reorderdB);

  be_in_folder(folderInbox);
  assert_visible_columns(INBOX_DEFAULTS);

  be_in_folder(folderB);
  assert_visible_columns(reorderdB);

  close_tab(tabB);
});

async function invoke_column_picker_option(aActions) {
  // The treecolpicker element itself doesn't have an id, so we have to walk
  // down from the parent to find it.
  //  treadCols
  //   |- hbox                item 0
  //   |- treecolpicker   <-- item 1 this is the one we want
  let threadCols = mc.window.document.getElementById("threadCols");
  let colPicker = threadCols.querySelector("treecolpicker");
  let colPickerPopup = colPicker.querySelector("[anonid=popup]");

  mc.sleep(500);
  let shownPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popupshown"
  );
  EventUtils.synthesizeMouseAtCenter(colPicker, {}, window);
  await shownPromise;
  let hiddenPromise = BrowserTestUtils.waitForEvent(
    colPickerPopup,
    "popuphidden",
    undefined,
    event => event.originalTarget == colPickerPopup
  );
  await mc.click_menus_in_sequence(colPickerPopup, aActions);
  await hiddenPromise;
}

/**
 * The column picker's "reset columns to default" option should set our state
 *  back to the natural state.
 */
add_task(async function test_reset_to_inbox() {
  // it better have INBOX defaults
  assert_visible_columns(INBOX_DEFAULTS);

  // permute them
  let conExtra = INBOX_DEFAULTS.concat(["sizeCol"]);
  show_column("sizeCol");
  assert_visible_columns(conExtra);

  // reset!
  await invoke_column_picker_option([{ anonid: "menuitem" }]);
});

async function _apply_to_folder_common(aChildrenToo, folder) {
  let notificatonPromise;
  if (aChildrenToo) {
    notificatonPromise = TestUtils.topicObserved(
      "msg-folder-columns-propagated"
    );
  }

  let dialogPromise = BrowserTestUtils.promiseAlertDialog("accept");
  await invoke_column_picker_option([
    { class: "applyTo-menu" },
    {
      class: aChildrenToo
        ? "applyToFolderAndChildren-menu"
        : "applyToFolder-menu",
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
 *  children.  Make sure the folder changes but the children do not.
 */
add_task(async function test_apply_to_folder_no_children() {
  folderParent = create_folder("ColumnsApplyParent");
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);
  folderChild2 = folderParent.getChildNamed("Child2");

  be_in_folder(folderSource);

  // reset!
  await invoke_column_picker_option([{ anonid: "menuitem" }]);

  // permute!
  let conExtra = INBOX_DEFAULTS.concat(["sizeCol"]);
  show_column("sizeCol");
  assert_visible_columns(conExtra);

  // apply to the one dude
  await _apply_to_folder_common(false, folderParent);

  // make sure it copied to the parent
  be_in_folder(folderParent);
  assert_visible_columns(conExtra);

  // but not the children
  be_in_folder(folderChild1);
  assert_visible_columns(INBOX_DEFAULTS);
  be_in_folder(folderChild2);
  assert_visible_columns(INBOX_DEFAULTS);
});

/**
 * Change settings in a folder, apply them to another folder and its children.
 *  Make sure the folder and its children change.
 */
add_task(async function test_apply_to_folder_and_children() {
  // no need to throttle ourselves during testing.
  MailUtils.INTER_FOLDER_PROCESSING_DELAY_MS = 0;

  be_in_folder(folderSource);

  await invoke_column_picker_option([{ anonid: "menuitem" }]); // reset order!
  let cols = get_visible_threadtree_columns();

  // permute!
  let conExtra = cols.concat(["tagsCol"]);
  show_column("tagsCol");
  assert_visible_columns(conExtra);

  // apply to the dude and his offspring
  await _apply_to_folder_common(true, folderParent);

  // make sure it copied to the parent and his children
  be_in_folder(folderParent);
  assert_visible_columns(conExtra);
  be_in_folder(folderChild1);
  assert_visible_columns(conExtra);
  be_in_folder(folderChild2);
  assert_visible_columns(conExtra);
});

/**
 * Change settings in an incoming folder, apply them to an outgoing folder that
 * also has children. Make sure the folder changes but the children do not.
 */
add_task(async function test_apply_to_folder_no_children_swapped() {
  folderParent = create_folder("ColumnsApplyParentOutgoing");
  folderParent.setFlag(Ci.nsMsgFolderFlags.SentMail);
  folderParent.createSubfolder("Child1", null);
  folderChild1 = folderParent.getChildNamed("Child1");
  folderParent.createSubfolder("Child2", null);
  folderChild2 = folderParent.getChildNamed("Child2");

  be_in_folder(folderSource);

  await invoke_column_picker_option([{ anonid: "menuitem" }]); // reset order!
  // Hide the columns that were added in other tests, since reset now
  // only resets the order.
  hide_column("tagsCol");
  hide_column("sizeCol");

  // permute!
  let conExtra = [...INBOX_DEFAULTS];
  if (useCorrespondent) {
    conExtra[5] = "senderCol";
    hide_column("correspondentCol");
    show_column("senderCol");
  } else {
    conExtra[5] = "correspondentCol";
    hide_column("senderCol");
    show_column("correspondentCol");
  }
  assert_visible_columns(conExtra);

  // Apply to the one dude.
  await _apply_to_folder_common(false, folderParent);

  // Make sure it copied to the parent.
  let conExtraSwapped = [...SENT_DEFAULTS];
  conExtraSwapped[5] = useCorrespondent ? "recipientCol" : "correspondentCol";
  be_in_folder(folderParent);
  assert_visible_columns(conExtraSwapped);

  // But not the children.
  be_in_folder(folderChild1);
  assert_visible_columns(SENT_DEFAULTS);
  be_in_folder(folderChild2);
  assert_visible_columns(SENT_DEFAULTS);
});

/**
 * Change settings in an incoming folder, apply them to an outgoing folder and
 * its children. Make sure the folder and its children change.
 */
add_task(async function test_apply_to_folder_and_children_swapped() {
  // No need to throttle ourselves during testing.
  MailUtils.INTER_FOLDER_PROCESSING_DELAY_MS = 0;

  be_in_folder(folderSource);

  await invoke_column_picker_option([{ anonid: "menuitem" }]); // reset order!

  // permute!
  let conExtra = [...INBOX_DEFAULTS];
  if (useCorrespondent) {
    conExtra[5] = "senderCol";
    hide_column("correspondentCol");
    show_column("senderCol");
  } else {
    conExtra[5] = "correspondentCol";
    hide_column("senderCol");
    show_column("correspondentCol");
  }
  assert_visible_columns(conExtra);

  // Apply to the dude and his offspring.
  await _apply_to_folder_common(true, folderParent);

  // Make sure it copied to the parent and his children.
  let conExtraSwapped = [...SENT_DEFAULTS];
  conExtraSwapped[5] = useCorrespondent ? "recipientCol" : "correspondentCol";
  be_in_folder(folderParent);
  assert_visible_columns(conExtraSwapped);
  be_in_folder(folderChild1);
  assert_visible_columns(conExtraSwapped);
  be_in_folder(folderChild2);
  assert_visible_columns(conExtraSwapped);
});

/**
 * Create a fake gloda collection.
 */
function FakeCollection() {
  this.items = [];
}

function plan_for_columns_state_update() {
  gColumnStateUpdated = false;
}

function wait_for_columns_state_updated() {
  const STATE_PREF = "mailnews.database.global.views.global";
  let columns_state_updated = function() {
    gColumnStateUpdated = true;
  };
  Services.prefs.addObserver(STATE_PREF, columns_state_updated);
  mc.waitFor(
    () => gColumnStateUpdated,
    "Timeout waiting for columns state updated."
  );
  Services.prefs.removeObserver(STATE_PREF, columns_state_updated);
}

add_task(function test_column_defaults_gloda_collection() {
  let fakeCollection = new FakeCollection();
  let tab = mc.tabmail.openTab("glodaList", { collection: fakeCollection });
  wait_for_all_messages_to_load();
  assert_visible_columns(GLODA_DEFAULTS);
  close_tab(tab);
});

add_task(function test_persist_columns_gloda_collection() {
  let fakeCollection = new FakeCollection();
  let tab1 = mc.tabmail.openTab("glodaList", { collection: fakeCollection });
  wait_for_all_messages_to_load();

  plan_for_columns_state_update();
  hide_column("locationCol");
  wait_for_columns_state_updated();

  plan_for_columns_state_update();
  show_column("accountCol");
  wait_for_columns_state_updated();

  glodaColumns = GLODA_DEFAULTS.slice(0, -1);
  glodaColumns.push("accountCol");

  let tab2 = mc.tabmail.openTab("glodaList", { collection: fakeCollection });
  wait_for_all_messages_to_load();
  assert_visible_columns(glodaColumns);

  close_tab(tab2);
  close_tab(tab1);
});

add_task(async function test_reset_columns_gloda_collection() {
  let fakeCollection = new FakeCollection();
  let tab1 = mc.tabmail.openTab("glodaList", { collection: fakeCollection });
  wait_for_all_messages_to_load();
  assert_visible_columns(glodaColumns);

  await invoke_column_picker_option([{ anonid: "menuitem" }]); // reset!
  assert_visible_columns(glodaColumns); // same, only order (would be) reset

  let tab2 = mc.tabmail.openTab("glodaList", { collection: fakeCollection });
  wait_for_all_messages_to_load();
  assert_visible_columns(glodaColumns);

  close_tab(tab2);
  close_tab(tab1);

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
