/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { TreeSelection } = ChromeUtils.importESModule(
  "chrome://messenger/content/tree-selection.mjs"
);

var fakeView = {
  rowCount: 101,
  selectionChanged() {},
  QueryInterface: ChromeUtils.generateQI(["nsITreeView"]),
};

var sel = new TreeSelection(null);
sel.view = fakeView;

var tree = {
  view: fakeView,

  _invalidationCount: 0,
  invalidate() {
    this._invalidationCount++;
  },
  invalidateRange(startIndex, endIndex) {
    for (let index = startIndex; index <= endIndex; index++) {
      this.invalidateRow(index);
    }
  },
  _invalidatedRows: [],
  invalidateRow(index) {
    this._invalidatedRows.push(index);
  },

  assertInvalidated() {
    Assert.equal(this._invalidationCount, 1, "invalidated once");
    this._invalidationCount = 0;
    this.assertInvalidatedRows();
  },
  assertDidntInvalidate() {
    Assert.equal(this._invalidationCount, 0, "didn't invalidate");
  },
  assertInvalidatedRows(expected) {
    if (expected) {
      this.assertDidntInvalidate();
    } else {
      expected = [];
    }
    const numericSort = (a, b) => a - b;
    Assert.deepEqual(
      this._invalidatedRows.sort(numericSort),
      expected.sort(numericSort),
      "invalidated rows"
    );
    this._invalidatedRows.length = 0;
  },
};
sel.tree = tree;

function createRangeArray(low, high) {
  const array = [];
  for (let i = low; i <= high; i++) {
    array.push(i);
  }
  return array;
}

function assertSelectionRanges(expected) {
  Assert.deepEqual(sel._ranges, expected, "selected ranges");
}

function assertCurrentIndex(index) {
  Assert.equal(sel.currentIndex, index, `current index should be ${index}`);
}

function assertShiftPivot(index) {
  Assert.equal(
    sel.shiftSelectPivot,
    index,
    `shift select pivot should be ${index}`
  );
}

function assertSelected(index) {
  Assert.ok(sel.isSelected(index), `${index} should be selected`);
}

function assertNotSelected(index) {
  Assert.ok(!sel.isSelected(index), `${index} should not be selected`);
}

function run_test() {
  // -- select
  sel.select(1);
  tree.assertInvalidatedRows([1]);
  assertSelected(1);
  assertNotSelected(0);
  assertNotSelected(2);
  assertSelectionRanges([[1, 1]]);
  assertCurrentIndex(1);

  sel.select(2);
  tree.assertInvalidatedRows([1, 2]);
  assertSelected(2);
  assertNotSelected(1);
  assertNotSelected(3);
  assertSelectionRanges([[2, 2]]);
  assertCurrentIndex(2);

  // -- clearSelection
  sel.clearSelection();
  tree.assertInvalidatedRows([2]);
  assertSelectionRanges([]);
  assertCurrentIndex(2); // should still be the same...

  // -- toggleSelect
  // start from nothing
  sel.clearSelection();
  tree.assertInvalidatedRows([]);
  sel.toggleSelect(1);
  tree.assertInvalidatedRows([1]);
  assertSelectionRanges([[1, 1]]);
  assertCurrentIndex(1);

  // lower fusion
  sel.select(2);
  tree.assertInvalidatedRows([1, 2]);
  sel.toggleSelect(1);
  tree.assertInvalidatedRows([1]);
  assertSelectionRanges([[1, 2]]);
  assertCurrentIndex(1);

  // upper fusion
  sel.toggleSelect(3);
  tree.assertInvalidatedRows([3]);
  assertSelectionRanges([[1, 3]]);
  assertCurrentIndex(3);

  // splitting
  sel.toggleSelect(2);
  tree.assertInvalidatedRows([2]);
  assertSelectionRanges([
    [1, 1],
    [3, 3],
  ]);
  assertSelected(1);
  assertSelected(3);
  assertNotSelected(0);
  assertNotSelected(2);
  assertNotSelected(4);
  assertCurrentIndex(2);

  // merge
  sel.toggleSelect(2);
  tree.assertInvalidatedRows([2]);
  assertSelectionRanges([[1, 3]]);
  assertCurrentIndex(2);

  // lower shrinkage
  sel.toggleSelect(1);
  tree.assertInvalidatedRows([1]);
  assertSelectionRanges([[2, 3]]);
  assertCurrentIndex(1);

  // upper shrinkage
  sel.toggleSelect(3);
  tree.assertInvalidatedRows([3]);
  assertSelectionRanges([[2, 2]]);
  assertCurrentIndex(3);

  // nukage
  sel.toggleSelect(2);
  tree.assertInvalidatedRows([2]);
  assertSelectionRanges([]);
  assertCurrentIndex(2);

  // -- rangedSelect
  // simple non-augment
  sel.rangedSelect(0, 0, false);
  tree.assertInvalidatedRows([0]);
  assertSelectionRanges([[0, 0]]);
  assertShiftPivot(0);
  assertCurrentIndex(0);

  // slightly less simple non-augment
  sel.rangedSelect(2, 4, false);
  tree.assertInvalidatedRows([0, 2, 3, 4]);
  assertSelectionRanges([[2, 4]]);
  assertShiftPivot(2);
  assertCurrentIndex(4);

  // higher distinct range
  sel.rangedSelect(7, 9, true);
  tree.assertInvalidatedRows([7, 8, 9]);
  assertSelectionRanges([
    [2, 4],
    [7, 9],
  ]);
  assertShiftPivot(7);
  assertCurrentIndex(9);

  // lower distinct range
  sel.rangedSelect(0, 0, true);
  tree.assertInvalidatedRows([0]);
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [7, 9],
  ]);
  assertShiftPivot(0);
  assertCurrentIndex(0);

  // lower fusion
  sel.rangedSelect(6, 6, true);
  tree.assertInvalidatedRows([6, 7, 8, 9]); // Ideally this would just be 6.
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [6, 9],
  ]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  // upper fusion
  sel.rangedSelect(10, 11, true);
  tree.assertInvalidatedRows([6, 7, 8, 9, 10, 11]); // 10, 11
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [6, 11],
  ]);
  assertShiftPivot(10);
  assertCurrentIndex(11);

  // notch merge
  sel.rangedSelect(5, 5, true);
  tree.assertInvalidatedRows([2, 3, 4, 5, 6, 7, 8, 9, 10, 11]); // 5
  assertSelectionRanges([
    [0, 0],
    [2, 11],
  ]);
  assertShiftPivot(5);
  assertCurrentIndex(5);

  // ambiguous consume with merge
  sel.rangedSelect(0, 5, true);
  tree.assertInvalidatedRows(createRangeArray(0, 11)); // 1
  assertSelectionRanges([[0, 11]]);
  assertShiftPivot(0);
  assertCurrentIndex(5);

  // aligned consumption
  sel.rangedSelect(0, 15, true);
  tree.assertInvalidatedRows(createRangeArray(0, 15)); // 12, 13, 14, 15
  assertSelectionRanges([[0, 15]]);
  assertShiftPivot(0);
  assertCurrentIndex(15);

  // excessive consumption
  sel.rangedSelect(5, 7, false);
  tree.assertInvalidatedRows(createRangeArray(0, 15)); // 0 to 4, 8 to 15
  sel.rangedSelect(3, 10, true);
  tree.assertInvalidatedRows([3, 4, 5, 6, 7, 8, 9, 10]); // 3, 4, 8, 9, 10
  assertSelectionRanges([[3, 10]]);
  assertShiftPivot(3);
  assertCurrentIndex(10);

  // overlap merge
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([3, 4, 5, 6, 7, 8, 9, 10]); // 3, 4
  sel.rangedSelect(15, 20, true);
  tree.assertInvalidatedRows([15, 16, 17, 18, 19, 20]);
  sel.rangedSelect(7, 17, true);
  tree.assertInvalidatedRows(createRangeArray(5, 20)); // 11, 12, 13, 14
  assertSelectionRanges([[5, 20]]);
  assertShiftPivot(7);
  assertCurrentIndex(17);

  // big merge and consume
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows(createRangeArray(5, 20)); // 11 to 20
  sel.rangedSelect(15, 20, true);
  tree.assertInvalidatedRows([15, 16, 17, 18, 19, 20]);
  sel.rangedSelect(25, 30, true);
  tree.assertInvalidatedRows([25, 26, 27, 28, 29, 30]);
  sel.rangedSelect(35, 40, true);
  tree.assertInvalidatedRows([35, 36, 37, 38, 39, 40]);
  sel.rangedSelect(7, 37, true);
  tree.assertInvalidatedRows(createRangeArray(5, 40)); // 11 to 14, 21 to 24, 31 to 34
  assertSelectionRanges([[5, 40]]);
  assertShiftPivot(7);
  assertCurrentIndex(37);

  // broad lower fusion
  sel.rangedSelect(10, 20, false);
  tree.assertInvalidatedRows(createRangeArray(5, 40)); // 5 to 9, 21 to 40
  sel.rangedSelect(3, 15, true);
  tree.assertInvalidatedRows(createRangeArray(3, 20)); // 3 to 9
  assertSelectionRanges([[3, 20]]);
  assertShiftPivot(3);
  assertCurrentIndex(15);

  // -- clearRange
  sel.rangedSelect(10, 30, false);
  tree.assertInvalidatedRows(createRangeArray(3, 30)); // 3 to 9, 21 to 30

  // irrelevant low
  sel.clearRange(0, 5);
  tree.assertInvalidatedRows([]);
  assertSelectionRanges([[10, 30]]);

  // irrelevant high
  sel.clearRange(40, 45);
  tree.assertInvalidatedRows([]);
  assertSelectionRanges([[10, 30]]);

  // lower shrinkage tight
  sel.clearRange(10, 10);
  tree.assertInvalidatedRows([10]);
  assertSelectionRanges([[11, 30]]);

  // lower shrinkage broad
  sel.clearRange(0, 13);
  tree.assertInvalidatedRows(createRangeArray(0, 13)); // 11, 12, 13
  assertSelectionRanges([[14, 30]]);

  // upper shrinkage tight
  sel.clearRange(30, 30);
  tree.assertInvalidatedRows([30]);
  assertSelectionRanges([[14, 29]]);

  // upper shrinkage broad
  sel.clearRange(27, 50);
  tree.assertInvalidatedRows(createRangeArray(27, 50)); // 27, 28, 29
  assertSelectionRanges([[14, 26]]);

  // split tight
  sel.clearRange(20, 20);
  tree.assertInvalidatedRows([20]);
  assertSelectionRanges([
    [14, 19],
    [21, 26],
  ]);

  // split broad
  sel.toggleSelect(20);
  tree.assertInvalidatedRows([20]);
  sel.clearRange(19, 21);
  tree.assertInvalidatedRows([19, 20, 21]);
  assertSelectionRanges([
    [14, 18],
    [22, 26],
  ]);

  // hit two with tight shrinkage
  sel.clearRange(18, 22);
  tree.assertInvalidatedRows([18, 19, 20, 21, 22]); // 18, 22
  assertSelectionRanges([
    [14, 17],
    [23, 26],
  ]);

  // hit two with broad shrinkage
  sel.clearRange(15, 25);
  tree.assertInvalidatedRows(createRangeArray(15, 25)); // 15, 16, 17, 23, 24, 25
  assertSelectionRanges([
    [14, 14],
    [26, 26],
  ]);

  // obliterate
  sel.clearRange(0, 100);
  tree.assertInvalidatedRows(createRangeArray(0, 100)); // 14, 26
  assertSelectionRanges([]);

  // multi-obliterate
  sel.rangedSelect(10, 20, true);
  tree.assertInvalidatedRows(createRangeArray(10, 20));
  sel.rangedSelect(30, 40, true);
  tree.assertInvalidatedRows(createRangeArray(30, 40));
  sel.clearRange(0, 100);
  tree.assertInvalidatedRows(createRangeArray(0, 100)); // 10 to 20, 30 to 40
  assertSelectionRanges([]);

  // obliterate with shrinkage
  sel.rangedSelect(5, 10, true);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.rangedSelect(15, 20, true);
  tree.assertInvalidatedRows([15, 16, 17, 18, 19, 20]);
  sel.rangedSelect(25, 30, true);
  tree.assertInvalidatedRows([25, 26, 27, 28, 29, 30]);
  sel.rangedSelect(35, 40, true);
  tree.assertInvalidatedRows([35, 36, 37, 38, 39, 40]);
  sel.clearRange(7, 37);
  tree.assertInvalidatedRows(createRangeArray(7, 37)); // 7 to 10, 15 to 20, 25 to 30, 35 to 37
  assertSelectionRanges([
    [5, 6],
    [38, 40],
  ]);

  // -- selectAll
  sel.selectAll();
  tree.assertInvalidated();
  assertSelectionRanges([[0, 100]]);

  // -- adjustSelection
  // bump due to addition on simple select
  sel.select(5);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  sel.adjustSelection(5, 1);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([[6, 6]]);
  assertCurrentIndex(6);

  sel.select(5);
  tree.assertInvalidatedRows([5, 6]);
  sel.adjustSelection(0, 1);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([[6, 6]]);
  assertCurrentIndex(6);

  // bump due to addition on ranged simple select
  sel.rangedSelect(5, 5, false);
  tree.assertInvalidatedRows([5, 6]);
  sel.adjustSelection(5, 1);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([[6, 6]]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  sel.rangedSelect(5, 5, false);
  tree.assertInvalidatedRows([5, 6]);
  sel.adjustSelection(0, 1);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([[6, 6]]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  // bump due to addition on ranged select
  sel.rangedSelect(5, 7, false);
  tree.assertInvalidatedRows([5, 6, 7]);
  sel.adjustSelection(5, 1);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([[6, 8]]);
  assertShiftPivot(6);
  assertCurrentIndex(8);

  // no-op with addition
  sel.rangedSelect(0, 3, false);
  tree.assertInvalidatedRows([0, 1, 2, 3, 6, 7, 8]);
  sel.adjustSelection(10, 1);
  tree.assertInvalidatedRows(createRangeArray(10, 100));
  assertSelectionRanges([[0, 3]]);
  assertShiftPivot(0);
  assertCurrentIndex(3);

  // split due to addition
  sel.rangedSelect(5, 6, false);
  tree.assertInvalidatedRows([0, 1, 2, 3, 5, 6]);
  sel.adjustSelection(6, 1);
  tree.assertInvalidatedRows(createRangeArray(6, 100));
  assertSelectionRanges([
    [5, 5],
    [7, 7],
  ]);
  assertShiftPivot(5);
  assertCurrentIndex(7);

  // shift due to removal on simple select
  sel.select(5);
  tree.assertInvalidatedRows([5, 7]);
  sel.adjustSelection(0, -1);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([[4, 4]]);
  assertCurrentIndex(4);

  // shift due to removal on ranged simple select
  sel.rangedSelect(5, 5, false);
  tree.assertInvalidatedRows([4, 5]);
  sel.adjustSelection(0, -1);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([[4, 4]]);
  assertShiftPivot(4);
  assertCurrentIndex(4);

  // nuked due to removal on simple select
  sel.select(5);
  tree.assertInvalidatedRows([4, 5]);
  sel.adjustSelection(5, -1);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([]);
  assertCurrentIndex(-1);

  // upper tight shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(10, -1);
  tree.assertInvalidatedRows(createRangeArray(10, 100));
  assertSelectionRanges([[5, 9]]);
  assertShiftPivot(5);
  assertCurrentIndex(-1);

  // upper broad shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(6, -10);
  tree.assertInvalidatedRows(createRangeArray(6, 100));
  assertSelectionRanges([[5, 5]]);
  assertShiftPivot(5);
  assertCurrentIndex(-1);

  // lower tight shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(5, -1);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([[5, 9]]);
  assertShiftPivot(-1);
  assertCurrentIndex(9);

  // lower broad shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(0, -10);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([[0, 0]]);
  assertShiftPivot(-1);
  assertCurrentIndex(0);

  // tight nuke due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([0, 5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(5, -6);
  tree.assertInvalidatedRows(createRangeArray(5, 100));
  assertSelectionRanges([]);
  assertShiftPivot(-1);
  assertCurrentIndex(-1);

  // broad nuke due to removal
  sel.rangedSelect(5, 10, false);
  tree.assertInvalidatedRows([5, 6, 7, 8, 9, 10]);
  sel.adjustSelection(0, -20);
  tree.assertInvalidatedRows(createRangeArray(0, 100));
  assertSelectionRanges([]);
  assertShiftPivot(-1);
  assertCurrentIndex(-1);

  // duplicateSelection (please keep this right at the end, as this modifies
  // sel)
  // no guarantees for the shift pivot yet, so don't test that
  const oldSel = sel;
  const newSel = new TreeSelection(null);
  newSel.view = fakeView;
  // multiple selections
  oldSel.rangedSelect(1, 3, false);
  oldSel.rangedSelect(5, 5, true);
  oldSel.rangedSelect(10, 10, true);
  oldSel.rangedSelect(6, 7, true);

  oldSel.duplicateSelection(newSel);
  // from now on we're only going to be checking newSel
  sel = newSel;
  assertSelectionRanges([
    [1, 3],
    [5, 7],
    [10, 10],
  ]);
  assertCurrentIndex(7);

  // single selection
  oldSel.select(4);
  oldSel.duplicateSelection(newSel);
  assertSelectionRanges([[4, 4]]);
  assertCurrentIndex(4);

  // nothing selected
  oldSel.clearSelection();
  oldSel.duplicateSelection(newSel);
  assertSelectionRanges([]);
  assertCurrentIndex(4);
}
