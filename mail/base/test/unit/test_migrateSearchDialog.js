/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);

const { getValue, hasValue, setValue } = Services.xulStore;

const urlBefore = "chrome://messenger/content/SearchDialog.xhtml";
const urlAfter = "chrome://messenger/content/searchDialog.xhtml";

function simulateMigration(dataBefore) {
  Services.xulStore.removeDocument(urlBefore);
  Services.xulStore.removeDocument(urlAfter);

  for (const id of Object.keys(dataBefore)) {
    for (const [key, value] of Object.entries(dataBefore[id])) {
      setValue(urlBefore, id, key, value);
    }
  }

  Services.prefs.setIntPref("mail.ui-rdf.version", 65);
  MailMigrator._migrateUI();
  Assert.greaterOrEqual(
    Services.prefs.getIntPref("mail.ui-rdf.version", 0),
    66
  );
}

/**
 * No existing data.
 */
add_task(function testNothing() {
  simulateMigration({});

  // There should be no migrated values.
  Assert.ok(!hasValue(urlAfter, "threadTree", "columnStates"));
  Assert.ok(!hasValue(urlAfter, "threadTree", "sortColumn"));
  Assert.ok(!hasValue(urlAfter, "threadTree", "sortDirection"));
});

/**
 * Just some window data. No column data.
 */
add_task(function testWindowOnly() {
  simulateMigration({
    searchMailWindow: {
      screenX: "492",
      screenY: "293",
      width: "623",
      height: "454",
      sizemode: "normal",
    },
    searchTerms: { height: "123" },
    checkSearchSubFolders: { checked: "" },
    searchResults: { height: "200" },
  });

  // The old values should have been removed.
  Assert.ok(!hasValue(urlBefore, "subjectCol", "ordinal"));
  Assert.ok(!hasValue(urlBefore, "searchMailWindow", "screenX"));
  Assert.ok(!hasValue(urlBefore, "searchMailWindow", "screenY"));
  Assert.ok(!hasValue(urlBefore, "searchMailWindow", "width"));
  Assert.ok(!hasValue(urlBefore, "searchMailWindow", "height"));
  Assert.ok(!hasValue(urlBefore, "searchMailWindow", "sizemode"));

  // The values should have been migrated.
  Assert.equal(
    getValue(urlAfter, "searchMailWindow", "screenX"),
    "492",
    "searchMailWindow screenX"
  );
  Assert.equal(
    getValue(urlAfter, "searchMailWindow", "screenY"),
    "293",
    "searchMailWindow screenY"
  );
  Assert.equal(
    getValue(urlAfter, "searchMailWindow", "width"),
    "623",
    "searchMailWindow width"
  );
  Assert.equal(
    getValue(urlAfter, "searchMailWindow", "height"),
    "454",
    "searchMailWindow height"
  );
  Assert.equal(
    getValue(urlAfter, "searchMailWindow", "sizemode"),
    "normal",
    "searchMailWindow sizemode"
  );
  Assert.equal(
    getValue(urlAfter, "searchTerms", "height"),
    "123",
    "searchTerms height"
  );
  Assert.equal(
    getValue(urlAfter, "checkSearchSubFolders", "checked"),
    "",
    "checkSearchSubFolders checked"
  );
  Assert.equal(
    getValue(urlAfter, "searchResults", "height"),
    "200",
    "searchResults height"
  );

  // There should be no migrated column data.
  Assert.ok(!hasValue(urlAfter, "threadTree", "columnStates"));
  Assert.ok(!hasValue(urlAfter, "threadTree", "sortColumn"));
  Assert.ok(!hasValue(urlAfter, "threadTree", "sortDirection"));
});

/**
 * Column data. Including some bogus columns we don't use.
 */
add_task(function testColumnData() {
  simulateMigration({
    // Hidden by default, but visible.
    selectCol: { ordinal: "1", hidden: "-moz-missing\n" },
    // Bogus. We don't use this column.
    threadCol: { ordinal: "3", hidden: "" },
    // Has been sorted at one time in the past, but that's not relevant.
    flaggedCol: { ordinal: "5", sortDirection: "-moz-missing\n" },
    // Visible by default, but hidden.
    attachmentCol: { ordinal: "7", hidden: "" },
    // Has extra data (width) that we're going to ignore.
    subjectCol: { ordinal: "9", sortDirection: "-moz-missing\n", width: "270" },
    unreadButtonColHeader: { ordinal: "11" },
    senderCol: { ordinal: "13" },
    recipientCol: { ordinal: "15" },
    correspondentCol: { ordinal: "17" },
    junkStatusCol: { ordinal: "19" },
    receivedCol: { ordinal: "21" },
    // The sorted column.
    dateCol: { ordinal: "23", sortDirection: "descending", width: "175" },
    statusCol: { ordinal: "25" },
    sizeCol: { ordinal: "27" },
    tagsCol: { ordinal: "29" },
    accountCol: { ordinal: "31" },
    priorityCol: { ordinal: "33" },
    unreadCol: { ordinal: "35" },
    totalCol: { ordinal: "37" },
    locationCol: { ordinal: "39" },
    idCol: { ordinal: "41" },
    // Out of order. Hidden by default, but visible.
    deleteCol: { ordinal: "3", hidden: "-moz-missing\n" },
  });

  // The old values should have been removed.
  Assert.ok(!hasValue(urlBefore, "subjectCol", "ordinal"));

  // The column data should have been migrated.
  Assert.ok(
    hasValue(urlAfter, "threadTree", "columnStates"),
    "threadTree columnStates"
  );
  Assert.equal(
    getValue(urlAfter, "threadTree", "sortColumn"),
    "dateCol",
    "threadTree sortColumn"
  );
  Assert.equal(
    getValue(urlAfter, "threadTree", "sortDirection"),
    "descending",
    "threadTree sortDirection"
  );

  const columnStates = JSON.parse(
    getValue(urlAfter, "threadTree", "columnStates")
  );
  Assert.ok(!columnStates.threadCol, "bogus column should not be included");
  Assert.deepEqual(
    columnStates.selectCol,
    { visible: true, ordinal: "1" },
    "selectCol"
  );
  Assert.deepEqual(
    columnStates.deleteCol,
    { visible: true, ordinal: "3" },
    "deleteCol"
  );
  Assert.deepEqual(
    columnStates.flaggedCol,
    { visible: true, ordinal: "5" },
    "flaggedCol"
  );
  Assert.deepEqual(
    columnStates.attachmentCol,
    { visible: false, ordinal: "7" },
    "attachmentCol"
  );
  Assert.deepEqual(
    columnStates.subjectCol,
    { visible: true, ordinal: "9" },
    "subjectCol"
  );
  Assert.deepEqual(
    columnStates.unreadButtonColHeader,
    { visible: true, ordinal: "11" },
    "unreadButtonColHeader"
  );
  Assert.deepEqual(
    columnStates.senderCol,
    { visible: false, ordinal: "13" },
    "senderCol"
  );
  Assert.deepEqual(
    columnStates.recipientCol,
    { visible: false, ordinal: "15" },
    "recipientCol"
  );
  Assert.deepEqual(
    columnStates.correspondentCol,
    { visible: true, ordinal: "17" },
    "correspondentCol"
  );
  Assert.deepEqual(
    columnStates.junkStatusCol,
    { visible: true, ordinal: "19" },
    "junkStatusCol"
  );
  Assert.deepEqual(
    columnStates.dateCol,
    { visible: true, ordinal: "23" },
    "dateCol"
  );
  Assert.deepEqual(
    columnStates.receivedCol,
    { visible: false, ordinal: "21" },
    "receivedCol"
  );
  Assert.deepEqual(
    columnStates.statusCol,
    { visible: false, ordinal: "25" },
    "statusCol"
  );
  Assert.deepEqual(
    columnStates.sizeCol,
    { visible: false, ordinal: "27" },
    "sizeCol"
  );
  Assert.deepEqual(
    columnStates.tagsCol,
    { visible: false, ordinal: "29" },
    "tagsCol"
  );
  Assert.deepEqual(
    columnStates.accountCol,
    { visible: false, ordinal: "31" },
    "accountCol"
  );
  Assert.deepEqual(
    columnStates.priorityCol,
    { visible: false, ordinal: "33" },
    "priorityCol"
  );
  Assert.deepEqual(
    columnStates.unreadCol,
    { visible: false, ordinal: "35" },
    "unreadCol"
  );
  Assert.deepEqual(
    columnStates.totalCol,
    { visible: false, ordinal: "37" },
    "totalCol"
  );
  Assert.deepEqual(
    columnStates.locationCol,
    { visible: true, ordinal: "39" },
    "locationCol"
  );
  Assert.deepEqual(
    columnStates.idCol,
    { visible: false, ordinal: "41" },
    "idCol"
  );
});
