/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { TreeDataAdapter, TreeDataRow } = ChromeUtils.importESModule(
  "chrome://messenger/content/TreeDataAdapter.mjs"
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
