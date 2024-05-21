/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { TreeDataAdapter, TreeDataRow } = ChromeUtils.importESModule(
  "chrome://messenger/content/TreeDataAdapter.mjs"
);
const { TreeSelection } = ChromeUtils.importESModule(
  "chrome://messenger/content/TreeSelection.mjs"
);

/**
 * A simple class to avoid typing out the same thing over and over.
 */
class SimpleRow extends TreeDataRow {
  constructor(id) {
    super({ columnA: `value${id}A`, columnB: `value${id}B` });
  }
}

add_task(function testEmpty() {
  const adapter = new TreeDataAdapter();
  Assert.equal(adapter.rowCount, 0);

  // Cell contents.
  Assert.throws(() => adapter.getCellText(0, "columnA"), /TypeError/);

  // Branching.
  Assert.throws(() => adapter.getParentIndex(0), /TypeError/);
  Assert.throws(() => adapter.getLevel(0), /TypeError/);
  Assert.throws(() => adapter.isContainer(0), /TypeError/);
  Assert.throws(() => adapter.isContainerOpen(0), /TypeError/);
  Assert.throws(() => adapter.isContainerEmpty(0), /TypeError/);
});

add_task(function testOneRow() {
  const adapter = new TreeDataAdapter();
  const row = new SimpleRow("0");
  Assert.equal(adapter.appendRow(row), row);

  // Cell contents.
  Assert.equal(adapter.rowCount, 1);
  Assert.equal(adapter.getCellText(0, "columnA"), "value0A");
  Assert.equal(adapter.getCellText(0, "columnB"), "value0B");
  Assert.equal(adapter.getCellText(0, "columnC"), undefined);
  Assert.throws(() => adapter.getCellText(1, "columnA"), /TypeError/);

  // Branching.
  Assert.equal(adapter.getParentIndex(0), -1);
  Assert.equal(adapter.getLevel(0), 0);
  Assert.strictEqual(adapter.isContainer(0), false);
  Assert.strictEqual(adapter.isContainerOpen(0), false);
  Assert.strictEqual(adapter.isContainerEmpty(0), true);
  Assert.throws(() => adapter.getParentIndex(1), /TypeError/);
  Assert.throws(() => adapter.getLevel(1), /TypeError/);
  Assert.throws(() => adapter.isContainer(1), /TypeError/);
  Assert.throws(() => adapter.isContainerOpen(1), /TypeError/);
  Assert.throws(() => adapter.isContainerEmpty(1), /TypeError/);
});

add_task(function testBranching() {
  const adapter = new TreeDataAdapter();
  const parentRow = adapter.appendRow(new SimpleRow("0"));
  adapter.appendRow(new SimpleRow("1")); // Check that following rows are not broken.
  const childRow0 = new SimpleRow("0.0");
  Assert.equal(parentRow.appendRow(childRow0), childRow0);
  const listenerTree = {
    rowCountChanged(rowIndex, change) {
      this._rowCountChange = { rowIndex, change };
    },
    invalidateRow(rowIndex) {
      this._invalidatedRow = rowIndex;
    },
  };
  adapter.setTree(listenerTree);

  // Cell contents. Row 0 is closed.
  Assert.equal(adapter.rowCount, 2);
  Assert.equal(adapter.getCellText(0, "columnA"), "value0A");
  Assert.equal(adapter.getCellText(0, "columnB"), "value0B");
  Assert.equal(adapter.getCellText(1, "columnA"), "value1A");
  Assert.equal(adapter.getCellText(1, "columnB"), "value1B");
  Assert.throws(() => adapter.getCellText(2, "columnA"), /TypeError/);

  // Branching. Row 0 is closed.
  Assert.equal(adapter.getParentIndex(0), -1);
  Assert.equal(adapter.getLevel(0), 0);
  Assert.strictEqual(adapter.isContainer(0), true);
  Assert.strictEqual(adapter.isContainerOpen(0), false);
  Assert.strictEqual(adapter.isContainerEmpty(0), false);
  Assert.equal(adapter.getParentIndex(1), -1);
  Assert.equal(adapter.getLevel(1), 0);
  Assert.strictEqual(adapter.isContainer(1), false);
  Assert.strictEqual(adapter.isContainerOpen(1), false);
  Assert.strictEqual(adapter.isContainerEmpty(1), true);
  Assert.throws(() => adapter.getParentIndex(2), /TypeError/);
  Assert.throws(() => adapter.getLevel(2), /TypeError/);
  Assert.throws(() => adapter.isContainer(2), /TypeError/);
  Assert.throws(() => adapter.isContainerOpen(2), /TypeError/);
  Assert.throws(() => adapter.isContainerEmpty(2), /TypeError/);

  // Expand the parent row.
  Assert.ok(!listenerTree._rowCountChange);
  Assert.ok(!listenerTree._invalidatedRow);
  adapter.toggleOpenState(0);
  Assert.deepEqual(listenerTree._rowCountChange, { rowIndex: 1, change: 1 });
  delete listenerTree._rowCountChange;
  Assert.equal(listenerTree._invalidatedRow, 0);
  delete listenerTree._invalidatedRow;

  // Cell contents.
  Assert.equal(adapter.rowCount, 3);
  Assert.equal(adapter.getCellText(0, "columnA"), "value0A");
  Assert.equal(adapter.getCellText(0, "columnB"), "value0B");
  Assert.equal(adapter.getCellText(1, "columnA"), "value0.0A");
  Assert.equal(adapter.getCellText(1, "columnB"), "value0.0B");
  Assert.equal(adapter.getCellText(2, "columnA"), "value1A");
  Assert.equal(adapter.getCellText(2, "columnB"), "value1B");
  Assert.throws(() => adapter.getCellText(3, "columnA"), /TypeError/);

  // Branching.
  Assert.equal(adapter.getParentIndex(0), -1);
  Assert.equal(adapter.getLevel(0), 0);
  Assert.strictEqual(adapter.isContainer(0), true);
  Assert.strictEqual(adapter.isContainerOpen(0), true);
  Assert.strictEqual(adapter.isContainerEmpty(0), false);
  Assert.equal(adapter.getParentIndex(1), 0);
  Assert.equal(adapter.getLevel(1), 1);
  Assert.strictEqual(adapter.isContainer(1), false);
  Assert.strictEqual(adapter.isContainerOpen(1), false);
  Assert.strictEqual(adapter.isContainerEmpty(1), true);
  Assert.equal(adapter.getParentIndex(2), -1);
  Assert.equal(adapter.getLevel(2), 0);
  Assert.strictEqual(adapter.isContainer(2), false);
  Assert.strictEqual(adapter.isContainerOpen(2), false);
  Assert.strictEqual(adapter.isContainerEmpty(2), true);
  Assert.throws(() => adapter.getParentIndex(3), /TypeError/);
  Assert.throws(() => adapter.getLevel(3), /TypeError/);
  Assert.throws(() => adapter.isContainer(3), /TypeError/);
  Assert.throws(() => adapter.isContainerOpen(3), /TypeError/);
  Assert.throws(() => adapter.isContainerEmpty(3), /TypeError/);

  // FIXME: Adding or removing a child while open. It requires working out if
  // all the ancestors are open and modifying _rowMap if that's true. This
  // "everything is a flat list" model isn't very clever.

  // Collapse the parent row.
  Assert.ok(!listenerTree._rowCountChange);
  Assert.ok(!listenerTree._invalidatedRow);
  adapter.toggleOpenState(0);
  Assert.deepEqual(listenerTree._rowCountChange, { rowIndex: 1, change: -1 });
  delete listenerTree._rowCountChange;
  Assert.equal(listenerTree._invalidatedRow, 0);
  delete listenerTree._invalidatedRow;

  // Cell contents. Row 0 is closed.
  Assert.equal(adapter.rowCount, 2);
  Assert.equal(adapter.getCellText(0, "columnA"), "value0A");
  Assert.equal(adapter.getCellText(0, "columnB"), "value0B");
  Assert.equal(adapter.getCellText(1, "columnA"), "value1A");
  Assert.equal(adapter.getCellText(1, "columnB"), "value1B");
  Assert.throws(() => adapter.getCellText(2, "columnA"), /TypeError/);

  // Branching. Row 0 is closed.
  Assert.equal(adapter.getParentIndex(0), -1);
  Assert.equal(adapter.getLevel(0), 0);
  Assert.strictEqual(adapter.isContainer(0), true);
  Assert.strictEqual(adapter.isContainerOpen(0), false);
  Assert.strictEqual(adapter.isContainerEmpty(0), false);
  Assert.equal(adapter.getParentIndex(1), -1);
  Assert.equal(adapter.getLevel(1), 0);
  Assert.strictEqual(adapter.isContainer(1), false);
  Assert.strictEqual(adapter.isContainerOpen(1), false);
  Assert.strictEqual(adapter.isContainerEmpty(1), true);
  Assert.throws(() => adapter.getParentIndex(2), /TypeError/);
  Assert.throws(() => adapter.getLevel(2), /TypeError/);
  Assert.throws(() => adapter.isContainer(2), /TypeError/);
  Assert.throws(() => adapter.isContainerOpen(2), /TypeError/);
  Assert.throws(() => adapter.isContainerEmpty(2), /TypeError/);

  // Try opening other rows. This should make no real difference.
  Assert.ok(!listenerTree._rowCountChange);
  Assert.ok(!listenerTree._invalidatedRow);
  adapter.toggleOpenState(1);
  Assert.equal(adapter.rowCount, 2);
  Assert.strictEqual(adapter.isContainerOpen(1), true);
  Assert.ok(!listenerTree._rowCountChange);
  Assert.equal(listenerTree._invalidatedRow, 1);
  delete listenerTree._invalidatedRow;

  adapter.toggleOpenState(1);
  Assert.equal(adapter.rowCount, 2);
  Assert.strictEqual(adapter.isContainerOpen(1), false);
  Assert.ok(!listenerTree._rowCountChange);
  Assert.equal(listenerTree._invalidatedRow, 1);
  delete listenerTree._invalidatedRow;

  Assert.throws(() => adapter.toggleOpenState(2), /TypeError/);
});

add_task(function testSorting() {
  const adapter = new TreeDataAdapter();
  const data = [
    [
      {
        cardinal: 0,
        ordinal: "zeroth",
        prime: 19, // One of the first 10 prime numbers, not in order.
        roman: "CLXXV", // An arbitrary Roman number.
        even: true,
      },
      { roman: 175 }, // The value of the Roman number.
    ],
    [
      { cardinal: 1, ordinal: "first", prime: 23, roman: "CXVI", even: false },
      { roman: 116 },
    ],
    [
      { cardinal: 2, ordinal: "second", prime: 29, roman: "IV", even: true },
      { roman: 4 },
    ],
    [
      { cardinal: 3, ordinal: "third", prime: 3, roman: "LXXVI", even: false },
      { roman: 76 },
    ],
    [
      { cardinal: 4, ordinal: "fourth", prime: 13, roman: "XXVII", even: true },
      { roman: 27 },
    ],
    [
      { cardinal: 5, ordinal: "fifth", prime: 7, roman: "C", even: false },
      { roman: 100 },
    ],
    [
      { cardinal: 6, ordinal: "sixth", prime: 17, roman: "VCI", even: true },
      { roman: 96 },
    ],
    [
      { cardinal: 7, ordinal: "seventh", prime: 2, roman: "CXLI", even: false },
      { roman: 141 },
    ],
    [
      { cardinal: 8, ordinal: "eighth", prime: 5, roman: "V", even: true },
      { roman: 5 },
    ],
    [
      { cardinal: 9, ordinal: "ninth", prime: 11, roman: "XI", even: false },
      { roman: 11 },
    ],
  ];
  for (const [texts, values] of data) {
    adapter.appendRow(new TreeDataRow(texts, values));
  }
  adapter.selection = new TreeSelection();

  function checkColumn(column, expectedTexts) {
    const texts = [];
    for (let i = 0; i < adapter.rowCount; i++) {
      texts.push(adapter.getCellText(i, column));
    }
    Assert.deepEqual(texts, expectedTexts);
  }

  function checkSelection(expectedIndices) {
    const indices = [];
    const rangeCount = adapter.selection.getRangeCount();

    for (let range = 0; range < rangeCount; range++) {
      const min = {};
      const max = {};
      adapter.selection.getRangeAt(range, min, max);

      if (min.value == -1) {
        continue;
      }

      for (let index = min.value; index <= max.value; index++) {
        indices.push(index);
      }
    }

    Assert.deepEqual(indices, expectedIndices);
  }

  // Verify the original order.

  checkColumn("cardinal", [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  checkColumn("ordinal", [
    "zeroth",
    "first",
    "second",
    "third",
    "fourth",
    "fifth",
    "sixth",
    "seventh",
    "eighth",
    "ninth",
  ]);
  checkSelection([]);

  // Select some rows. This selection should be preserved throughout the test.

  adapter.selection.toggleSelect(0);
  adapter.selection.toggleSelect(4);
  adapter.selection.toggleSelect(8);
  checkSelection([0, 4, 8]);

  // Sort by a text column. Check that another column is also reordered to match.

  adapter.sortBy("ordinal", "ascending");
  Assert.equal(adapter.sortColumn, "ordinal");
  Assert.equal(adapter.sortDirection, "ascending");
  checkColumn("ordinal", [
    "eighth",
    "fifth",
    "first",
    "fourth",
    "ninth",
    "second",
    "seventh",
    "sixth",
    "third",
    "zeroth",
  ]);
  checkColumn("cardinal", [8, 5, 1, 4, 9, 2, 7, 6, 3, 0]);
  checkSelection([0, 3, 9]);

  adapter.sortBy("ordinal", "descending");
  Assert.equal(adapter.sortColumn, "ordinal");
  Assert.equal(adapter.sortDirection, "descending");
  checkColumn("ordinal", [
    "zeroth",
    "third",
    "sixth",
    "seventh",
    "second",
    "ninth",
    "fourth",
    "first",
    "fifth",
    "eighth",
  ]);
  checkColumn("cardinal", [0, 3, 6, 7, 2, 9, 4, 1, 5, 8]);
  checkSelection([0, 6, 9]);

  adapter.sortBy("ordinal", "ascending");
  Assert.equal(adapter.sortColumn, "ordinal");
  Assert.equal(adapter.sortDirection, "ascending");
  checkColumn("ordinal", [
    "eighth",
    "fifth",
    "first",
    "fourth",
    "ninth",
    "second",
    "seventh",
    "sixth",
    "third",
    "zeroth",
  ]);
  checkColumn("cardinal", [8, 5, 1, 4, 9, 2, 7, 6, 3, 0]);
  checkSelection([0, 3, 9]);

  // Sort by a numeric column. A numeric sort is applied, otherwise the order
  // would be 11, 13, 17, 19, 2, 23, 29, 3, 5, 7.

  adapter.sortBy("prime", "ascending");
  Assert.equal(adapter.sortColumn, "prime");
  Assert.equal(adapter.sortDirection, "ascending");
  checkColumn("prime", [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]);
  checkColumn("cardinal", [7, 3, 8, 5, 9, 4, 6, 0, 1, 2]);
  checkSelection([2, 5, 7]);

  adapter.sortBy("prime", "descending");
  Assert.equal(adapter.sortColumn, "prime");
  Assert.equal(adapter.sortDirection, "descending");
  checkColumn("prime", [29, 23, 19, 17, 13, 11, 7, 5, 3, 2]);
  checkColumn("cardinal", [2, 1, 0, 6, 4, 9, 5, 8, 3, 7]);
  checkSelection([2, 4, 7]);

  // Sort by a column with values. This is sorted by the values, not the text.

  adapter.sortBy("roman", "ascending");
  Assert.equal(adapter.sortColumn, "roman");
  Assert.equal(adapter.sortDirection, "ascending");
  checkColumn("roman", [
    "IV",
    "V",
    "XI",
    "XXVII",
    "LXXVI",
    "VCI",
    "C",
    "CXVI",
    "CXLI",
    "CLXXV",
  ]);
  checkColumn("cardinal", [2, 8, 9, 4, 3, 6, 5, 1, 7, 0]);
  checkSelection([1, 3, 9]);

  adapter.sortBy("roman", "descending");
  Assert.equal(adapter.sortColumn, "roman");
  Assert.equal(adapter.sortDirection, "descending");
  checkColumn("roman", [
    "CLXXV",
    "CXLI",
    "CXVI",
    "C",
    "VCI",
    "LXXVI",
    "XXVII",
    "XI",
    "V",
    "IV",
  ]);
  checkColumn("cardinal", [0, 7, 1, 5, 6, 3, 4, 9, 8, 2]);
  checkSelection([0, 6, 8]);

  // Check a column where multiple rows have the same value. The sort should
  // be stable, i.e. the rows stay in the existing order when the values match.

  adapter.sortBy("even", "ascending");
  Assert.equal(adapter.sortColumn, "even");
  Assert.equal(adapter.sortDirection, "ascending");
  checkColumn("even", [
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    true,
    true,
  ]);
  checkColumn("cardinal", [7, 1, 5, 3, 9, 0, 6, 4, 8, 2]);

  adapter.sortBy("even", "descending");
  Assert.equal(adapter.sortColumn, "even");
  Assert.equal(adapter.sortDirection, "descending");
  checkColumn("even", [
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
  ]);
  checkColumn("cardinal", [0, 6, 4, 8, 2, 7, 1, 5, 3, 9]);

  // Return to the original order and check all of the data survived.

  adapter.sortBy("cardinal", "ascending");
  Assert.equal(adapter.sortColumn, "cardinal");
  Assert.equal(adapter.sortDirection, "ascending");
  for (let i = 0; i < data.length; i++) {
    Assert.deepEqual(
      [
        adapter.getCellText(i, "cardinal"),
        adapter.getCellText(i, "ordinal"),
        adapter.getCellText(i, "prime"),
        adapter.getCellText(i, "roman"),
        adapter.getCellText(i, "even"),
      ],
      Object.values(data[i][0])
    );
  }
});
