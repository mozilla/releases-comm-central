/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { ThreadPaneColumns } = ChromeUtils.importESModule(
  "chrome://messenger/content/thread-pane-columns.mjs"
);

add_task(function testGetters() {
  const defaultColumns = ThreadPaneColumns.getDefaultColumns();
  const defaultSubjectColumn = defaultColumns.find(
    column => column.id == "subjectCol"
  );

  Assert.notEqual(
    ThreadPaneColumns.getDefaultColumns().find(
      column => column.id == "subjectCol"
    ),
    defaultSubjectColumn,
    "ThreadPaneColumns.getDefaultColumns should return different objects for each call"
  );

  const subjectColumn1 = ThreadPaneColumns.getColumn("subjectCol");
  Assert.notEqual(
    subjectColumn1,
    defaultSubjectColumn,
    "ThreadPaneColumns.getColumn and ThreadPaneColumns.getDefaultColumns should return different objects"
  );

  const subjectColumn2 = ThreadPaneColumns.getColumn("subjectCol");
  Assert.notEqual(
    subjectColumn1,
    subjectColumn2,
    "ThreadPaneColumns.getColumn should return different objects for each call"
  );

  subjectColumn1.testProperty = "hello!";
  Assert.ok(
    !defaultSubjectColumn.testProperty,
    "property changes should not affect other instances of the same column"
  );
  Assert.ok(
    !subjectColumn2.testProperty,
    "property changes should not affect other instances of the same column"
  );
});

add_task(function testCustomColumns() {
  Assert.deepEqual(
    ThreadPaneColumns.getCustomColumns(),
    [],
    "should be no custom columns"
  );
  Assert.equal(
    ThreadPaneColumns.getColumn("testCol"),
    null,
    "ThreadPaneColumns.getColumn should return null"
  );

  ThreadPaneColumns.addCustomColumn("testCol", {
    name: "Test Column",
    textCallback: () => {
      "static value";
    },
  });

  const testColumn = ThreadPaneColumns.getColumn("testCol");
  Assert.equal(testColumn.id, "testCol", "Column should have the correct id");
  Assert.equal(
    testColumn.name,
    "Test Column",
    "Column should have the correct name"
  );
  Assert.ok(testColumn.custom, "Column should be a custom column");
  Assert.ok(!testColumn.sortable, "Column should be a sortable");
  Assert.ok(
    testColumn.handler.QueryInterface(Ci.nsIMsgCustomColumnHandler),
    "Column handler should be a custom column handler"
  );

  const customColumns = ThreadPaneColumns.getCustomColumns();
  Assert.equal(
    customColumns.length,
    1,
    "should return a single custom column object"
  );
  Assert.notEqual(
    customColumns[0],
    testColumn,
    "should return a complex test column object, a simple equal compare should fail"
  );
  Assert.deepEqual(
    customColumns[0],
    testColumn,
    "should return the correct test column object"
  );

  ThreadPaneColumns.removeCustomColumn("testCol");

  Assert.deepEqual(
    ThreadPaneColumns.getCustomColumns(),
    [],
    "should find no custom columns"
  );
  Assert.equal(
    ThreadPaneColumns.getColumn("testCol"),
    null,
    "ThreadPaneColumns.getColumn should return null"
  );
});
