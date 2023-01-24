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
  assertSelected(1);
  assertNotSelected(0);
  assertNotSelected(2);
  assertSelectionRanges([[1, 1]]);
  assertCurrentIndex(1);

  sel.select(2);
  assertSelected(2);
  assertNotSelected(1);
  assertNotSelected(3);
  assertSelectionRanges([[2, 2]]);
  assertCurrentIndex(2);

  // -- clearSelection
  sel.clearSelection();
  assertSelectionRanges([]);
  assertCurrentIndex(2); // should still be the same...

  // -- toggleSelect
  // start from nothing
  sel.clearSelection();
  sel.toggleSelect(1);
  assertSelectionRanges([[1, 1]]);
  assertCurrentIndex(1);

  // lower fusion
  sel.select(2);
  sel.toggleSelect(1);
  assertSelectionRanges([[1, 2]]);
  assertCurrentIndex(1);

  // upper fusion
  sel.toggleSelect(3);
  assertSelectionRanges([[1, 3]]);
  assertCurrentIndex(3);

  // splitting
  sel.toggleSelect(2);
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
  assertSelectionRanges([[1, 3]]);
  assertCurrentIndex(2);

  // lower shrinkage
  sel.toggleSelect(1);
  assertSelectionRanges([[2, 3]]);
  assertCurrentIndex(1);

  // upper shrinkage
  sel.toggleSelect(3);
  assertSelectionRanges([[2, 2]]);
  assertCurrentIndex(3);

  // nukage
  sel.toggleSelect(2);
  assertSelectionRanges([]);
  assertCurrentIndex(2);

  // -- rangedSelect
  // simple non-augment
  sel.rangedSelect(0, 0, false);
  assertSelectionRanges([[0, 0]]);
  assertShiftPivot(0);
  assertCurrentIndex(0);

  // slightly less simple non-augment
  sel.rangedSelect(2, 4, false);
  assertSelectionRanges([[2, 4]]);
  assertShiftPivot(2);
  assertCurrentIndex(4);

  // higher distinct range
  sel.rangedSelect(7, 9, true);
  assertSelectionRanges([
    [2, 4],
    [7, 9],
  ]);
  assertShiftPivot(7);
  assertCurrentIndex(9);

  // lower distinct range
  sel.rangedSelect(0, 0, true);
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [7, 9],
  ]);
  assertShiftPivot(0);
  assertCurrentIndex(0);

  // lower fusion
  sel.rangedSelect(6, 6, true);
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [6, 9],
  ]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  // upper fusion
  sel.rangedSelect(10, 11, true);
  assertSelectionRanges([
    [0, 0],
    [2, 4],
    [6, 11],
  ]);
  assertShiftPivot(10);
  assertCurrentIndex(11);

  // notch merge
  sel.rangedSelect(5, 5, true);
  assertSelectionRanges([
    [0, 0],
    [2, 11],
  ]);
  assertShiftPivot(5);
  assertCurrentIndex(5);

  // ambiguous consume with merge
  sel.rangedSelect(0, 5, true);
  assertSelectionRanges([[0, 11]]);
  assertShiftPivot(0);
  assertCurrentIndex(5);

  // aligned consumption
  sel.rangedSelect(0, 15, true);
  assertSelectionRanges([[0, 15]]);
  assertShiftPivot(0);
  assertCurrentIndex(15);

  // excessive consumption
  sel.rangedSelect(5, 7, false);
  sel.rangedSelect(3, 10, true);
  assertSelectionRanges([[3, 10]]);
  assertShiftPivot(3);
  assertCurrentIndex(10);

  // overlap merge
  sel.rangedSelect(5, 10, false);
  sel.rangedSelect(15, 20, true);
  sel.rangedSelect(7, 17, true);
  assertSelectionRanges([[5, 20]]);
  assertShiftPivot(7);
  assertCurrentIndex(17);

  // big merge and consume
  sel.rangedSelect(5, 10, false);
  sel.rangedSelect(15, 20, true);
  sel.rangedSelect(25, 30, true);
  sel.rangedSelect(35, 40, true);
  sel.rangedSelect(7, 37, true);
  assertSelectionRanges([[5, 40]]);
  assertShiftPivot(7);
  assertCurrentIndex(37);

  // broad lower fusion
  sel.rangedSelect(10, 20, false);
  sel.rangedSelect(3, 15, true);
  assertSelectionRanges([[3, 20]]);
  assertShiftPivot(3);
  assertCurrentIndex(15);

  // -- clearRange
  sel.rangedSelect(10, 30, false);

  // irrelevant low
  sel.clearRange(0, 5);
  assertSelectionRanges([[10, 30]]);

  // irrelevant high
  sel.clearRange(40, 45);
  assertSelectionRanges([[10, 30]]);

  // lower shrinkage tight
  sel.clearRange(10, 10);
  assertSelectionRanges([[11, 30]]);

  // lower shrinkage broad
  sel.clearRange(0, 13);
  assertSelectionRanges([[14, 30]]);

  // upper shrinkage tight
  sel.clearRange(30, 30);
  assertSelectionRanges([[14, 29]]);

  // upper shrinkage broad
  sel.clearRange(27, 50);
  assertSelectionRanges([[14, 26]]);

  // split tight
  sel.clearRange(20, 20);
  assertSelectionRanges([
    [14, 19],
    [21, 26],
  ]);

  // split broad
  sel.toggleSelect(20);
  sel.clearRange(19, 21);
  assertSelectionRanges([
    [14, 18],
    [22, 26],
  ]);

  // hit two with tight shrinkage
  sel.clearRange(18, 22);
  assertSelectionRanges([
    [14, 17],
    [23, 26],
  ]);

  // hit two with broad shrinkage
  sel.clearRange(15, 25);
  assertSelectionRanges([
    [14, 14],
    [26, 26],
  ]);

  // obliterate
  sel.clearRange(0, 100);
  assertSelectionRanges([]);

  // multi-obliterate
  sel.rangedSelect(10, 20, true);
  sel.rangedSelect(30, 40, true);
  sel.clearRange(0, 100);
  assertSelectionRanges([]);

  // obliterate with shrinkage
  sel.rangedSelect(5, 10, true);
  sel.rangedSelect(15, 20, true);
  sel.rangedSelect(25, 30, true);
  sel.rangedSelect(35, 40, true);
  sel.clearRange(7, 37);
  assertSelectionRanges([
    [5, 6],
    [38, 40],
  ]);

  // -- selectAll
  sel.selectAll();
  assertSelectionRanges([[0, 100]]);

  // -- adjustSelection
  // bump due to addition on simple select
  sel.select(5);
  sel.adjustSelection(5, 1);
  assertSelectionRanges([[6, 6]]);
  assertCurrentIndex(6);

  sel.select(5);
  sel.adjustSelection(0, 1);
  assertSelectionRanges([[6, 6]]);
  assertCurrentIndex(6);

  // bump due to addition on ranged simple select
  sel.rangedSelect(5, 5, false);
  sel.adjustSelection(5, 1);
  assertSelectionRanges([[6, 6]]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  sel.rangedSelect(5, 5, false);
  sel.adjustSelection(0, 1);
  assertSelectionRanges([[6, 6]]);
  assertShiftPivot(6);
  assertCurrentIndex(6);

  // bump due to addition on ranged select
  sel.rangedSelect(5, 7, false);
  sel.adjustSelection(5, 1);
  assertSelectionRanges([[6, 8]]);
  assertShiftPivot(6);
  assertCurrentIndex(8);

  // no-op with addition
  sel.rangedSelect(0, 3, false);
  sel.adjustSelection(10, 1);
  assertSelectionRanges([[0, 3]]);
  assertShiftPivot(0);
  assertCurrentIndex(3);

  // split due to addition
  sel.rangedSelect(5, 6, false);
  sel.adjustSelection(6, 1);
  assertSelectionRanges([
    [5, 5],
    [7, 7],
  ]);
  assertShiftPivot(5);
  assertCurrentIndex(7);

  // shift due to removal on simple select
  sel.select(5);
  sel.adjustSelection(0, -1);
  assertSelectionRanges([[4, 4]]);
  assertCurrentIndex(4);

  // shift due to removal on ranged simple select
  sel.rangedSelect(5, 5, false);
  sel.adjustSelection(0, -1);
  assertSelectionRanges([[4, 4]]);
  assertShiftPivot(4);
  assertCurrentIndex(4);

  // nuked due to removal on simple select
  sel.select(5);
  sel.adjustSelection(5, -1);
  assertSelectionRanges([]);
  assertCurrentIndex(-1);

  // upper tight shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(10, -1);
  assertSelectionRanges([[5, 9]]);
  assertShiftPivot(5);
  assertCurrentIndex(-1);

  // upper broad shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(6, -10);
  assertSelectionRanges([[5, 5]]);
  assertShiftPivot(5);
  assertCurrentIndex(-1);

  // lower tight shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(5, -1);
  assertSelectionRanges([[5, 9]]);
  assertShiftPivot(-1);
  assertCurrentIndex(9);

  // lower broad shrinkage due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(0, -10);
  assertSelectionRanges([[0, 0]]);
  assertShiftPivot(-1);
  assertCurrentIndex(0);

  // tight nuke due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(5, -6);
  assertSelectionRanges([]);
  assertShiftPivot(-1);
  assertCurrentIndex(-1);

  // broad nuke due to removal
  sel.rangedSelect(5, 10, false);
  sel.adjustSelection(0, -20);
  assertSelectionRanges([]);
  assertShiftPivot(-1);
  assertCurrentIndex(-1);

  // duplicateSelection (please keep this right at the end, as this modifies
  // sel)
  // no guarantees for the shift pivot yet, so don't test that
  let oldSel = sel;
  let newSel = new TreeSelection(null);
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
