/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This implementation attempts to mimic the behavior of nsTreeSelection.  In
 *  a few cases, this leads to potentially confusing actions.  I attempt to note
 *  when we are doing this and why we do it.
 *
 * Unit test is in mail/base/test/unit/test_treeSelection.js
 */
export class TreeSelection {
  QueryInterface = ChromeUtils.generateQI(["nsITreeSelection"]);

  /**
   * The current XULTreeElement, appropriately QueryInterfaced. May be null.
   */
  _tree;

  /**
   * Where the focus rectangle (that little dotted thing) shows up.  Just
   *  because something is focused does not mean it is actually selected.
   */
  _currentIndex;
  /**
   * The view index where the shift is anchored when it is not (conceptually)
   *  the same as _currentIndex.  This only happens when you perform a ranged
   *  selection.  In that case, the start index of the ranged selection becomes
   *  the shift pivot (and the _currentIndex becomes the end of the ranged
   *  selection.)
   * It gets cleared whenever the selection changes and it's not the result of
   *  a call to rangedSelect.
   */
  _shiftSelectPivot;
  /**
   * A list of [lowIndexInclusive, highIndexInclusive] non-overlapping,
   *  non-adjacent 'tuples' sort in ascending order.
   */
  _ranges;
  /**
   * The number of currently selected rows.
   */
  _count;

  // In the case of the stand-alone message window, there's no tree, but
  // there's a view.
  _view;

  /**
   * A set of indices we think is invalid.
   */
  _invalidIndices;

  constructor(tree) {
    this._tree = tree;

    this._currentIndex = null;
    this._shiftSelectPivot = null;
    this._ranges = [];
    this._count = 0;
    this._invalidIndices = new Set();

    this._selectEventsSuppressed = false;
  }

  /**
   * Mark the currently selected rows as invalid.
   */
  _invalidateSelection() {
    for (const [low, high] of this._ranges) {
      for (let i = low; i <= high; i++) {
        this._invalidIndices.add(i);
      }
    }
  }

  /**
   * Call `invalidateRow` on the tree for each row we think is invalid.
   */
  _doInvalidateRows() {
    if (this.selectEventsSuppressed) {
      return;
    }
    if (this._tree) {
      for (const i of this._invalidIndices) {
        this._tree.invalidateRow(i);
      }
    }
    this._invalidIndices.clear();
  }

  /**
   * Call `invalidateRange` on the tree.
   *
   * @param {number} startIndex - The first index to invalidate.
   * @param {number?} endIndex - The last index to invalidate. If not given,
   *   defaults to the index of the last row.
   */
  _doInvalidateRange(startIndex, endIndex) {
    const noEndIndex = endIndex === undefined;
    if (noEndIndex) {
      if (!this._view || this.view.rowCount == 0) {
        this._doInvalidateAll();
        return;
      }
      endIndex = this._view.rowCount - 1;
    }
    if (this._tree) {
      this._tree.invalidateRange(startIndex, endIndex);
    }
    for (const i of this._invalidIndices) {
      if (i >= startIndex && (noEndIndex || i <= endIndex)) {
        this._invalidIndices.delete(i);
      }
    }
  }

  /**
   * Call `invalidate` on the tree.
   */
  _doInvalidateAll() {
    if (this._tree) {
      this._tree.invalidate();
    }
    this._invalidIndices.clear();
  }

  get tree() {
    return this._tree;
  }
  set tree(tree) {
    this._tree = tree;
  }

  get view() {
    return this._view;
  }
  set view(view) {
    this._view = view;
  }
  /**
   * Although the nsITreeSelection documentation doesn't say, what this method
   *  is supposed to do is check if the seltype attribute on the XUL tree is any
   *  of the following: "single" (only a single row may be selected at a time,
   *  "cell" (a single cell may be selected), or "text" (the row gets selected
   *  but only the primary column shows up as selected.)
   *
   * @returns false because we don't support single-selection.
   */
  get single() {
    return false;
  }

  _updateCount() {
    this._count = 0;
    for (const [low, high] of this._ranges) {
      this._count += high - low + 1;
    }
  }

  get count() {
    return this._count;
  }

  isSelected(viewIndex) {
    for (const [low, high] of this._ranges) {
      if (viewIndex >= low && viewIndex <= high) {
        return true;
      }
    }
    return false;
  }

  /**
   * Select the given row.  It does nothing if that row was already selected.
   */
  select(viewIndex) {
    this._invalidateSelection();
    // current index will provide our effective shift pivot
    this._shiftSelectPivot = null;
    this._currentIndex = viewIndex != -1 ? viewIndex : null;

    if (this._count == 1 && this._ranges[0][0] == viewIndex) {
      return;
    }

    if (viewIndex >= 0) {
      this._count = 1;
      this._ranges = [[viewIndex, viewIndex]];
      this._invalidIndices.add(viewIndex);
    } else {
      this._count = 0;
      this._ranges = [];
    }

    this._doInvalidateRows();
    this._fireSelectionChanged();
  }

  timedSelect() {
    throw new Error("We do not implement timed selection.");
  }

  toggleSelect(index) {
    this._currentIndex = index;
    // If nothing's selected, select index
    if (this._count == 0) {
      this._count = 1;
      this._ranges = [[index, index]];
    } else {
      let added = false;
      for (const [iTupe, [low, high]] of this._ranges.entries()) {
        // below the range? add it to the existing range or create a new one
        if (index < low) {
          this._count++;
          // is it just below an existing range? (range fusion only happens in the
          //  high case, not here.)
          if (index == low - 1) {
            this._ranges[iTupe][0] = index;
            added = true;
            break;
          }
          // then it gets its own range
          this._ranges.splice(iTupe, 0, [index, index]);
          added = true;
          break;
        }
        // in the range?  will need to either nuke, shrink, or split the range to
        //  remove it
        if (index >= low && index <= high) {
          this._count--;
          if (index == low && index == high) {
            // nuke
            this._ranges.splice(iTupe, 1);
          } else if (index == low) {
            // lower shrink
            this._ranges[iTupe][0] = index + 1;
          } else if (index == high) {
            // upper shrink
            this._ranges[iTupe][1] = index - 1;
          } else {
            // split
            this._ranges.splice(iTupe, 1, [low, index - 1], [index + 1, high]);
          }
          added = true;
          break;
        }
        // just above the range?  fuse into the range, and possibly the next
        //  range up.
        if (index == high + 1) {
          this._count++;
          // see if there is another range and there was just a gap of one between
          //  the two ranges.
          if (
            iTupe + 1 < this._ranges.length &&
            this._ranges[iTupe + 1][0] == index + 1
          ) {
            // yes, merge the ranges
            this._ranges.splice(iTupe, 2, [low, this._ranges[iTupe + 1][1]]);
            added = true;
            break;
          }
          // nope, no merge required, just update the range
          this._ranges[iTupe][1] = index;
          added = true;
          break;
        }
        // otherwise we need to keep going
      }

      if (!added) {
        this._count++;
        this._ranges.push([index, index]);
      }
    }

    this._invalidIndices.add(index);
    this._doInvalidateRows();
    this._fireSelectionChanged();
  }

  /**
   * @param rangeStart If omitted, it implies a shift-selection is happening,
   *     in which case we use _shiftSelectPivot as the start if we have it,
   *     _currentIndex if we don't, and if we somehow didn't have a
   *     _currentIndex, we use the range end.
   * @param rangeEnd Just the inclusive end of the range.
   * @param augment Does this set a new selection or should it be merged with
   *     the existing selection?
   */
  rangedSelect(rangeStart, rangeEnd, augment) {
    if (rangeStart == -1) {
      if (this._shiftSelectPivot != null) {
        rangeStart = this._shiftSelectPivot;
      } else if (this._currentIndex != null) {
        rangeStart = this._currentIndex;
      } else {
        rangeStart = rangeEnd;
      }
    }

    this._shiftSelectPivot = rangeStart;
    this._currentIndex = rangeEnd;

    // enforce our ordering constraint for our ranges
    if (rangeStart > rangeEnd) {
      [rangeStart, rangeEnd] = [rangeEnd, rangeStart];
    }

    // if we're not augmenting, then this is really easy.
    if (!augment) {
      this._invalidateSelection();

      this._count = rangeEnd - rangeStart + 1;
      this._ranges = [[rangeStart, rangeEnd]];

      for (let i = rangeStart; i <= rangeEnd; i++) {
        this._invalidIndices.add(i);
      }

      this._doInvalidateRows();
      this._fireSelectionChanged();
      return;
    }

    // Iterate over our existing set of ranges, finding the 'range' of ranges
    //  that our new range overlaps or simply obviates.
    // Overlap variables track blocks we need to keep some part of, Nuke
    //  variables are for blocks that get spliced out.  For our purposes, all
    //  overlap blocks are also nuke blocks.
    let lowOverlap, lowNuke, highNuke, highOverlap;
    // in case there is no overlap, also figure an insertionPoint
    let insertionPoint = this._ranges.length; // default to the end
    for (const [iTupe, [low, high]] of this._ranges.entries()) {
      // If it's completely include the range, it should be nuked
      if (rangeStart <= low && rangeEnd >= high) {
        if (lowNuke == null) {
          // only the first one we see is the low one
          lowNuke = iTupe;
        }
        highNuke = iTupe;
      }
      // If our new range start is inside a range or is adjacent, it's overlap
      if (
        rangeStart >= low - 1 &&
        rangeStart <= high + 1 &&
        lowOverlap == null
      ) {
        lowOverlap = lowNuke = highNuke = iTupe;
      }
      // If our new range ends inside a range or is adjacent, it's overlap
      if (rangeEnd >= low - 1 && rangeEnd <= high + 1) {
        highOverlap = highNuke = iTupe;
        if (lowNuke == null) {
          lowNuke = iTupe;
        }
      }

      // we're done when no more overlap is possible
      if (rangeEnd < low) {
        insertionPoint = iTupe;
        break;
      }
    }

    if (lowOverlap != null) {
      rangeStart = Math.min(rangeStart, this._ranges[lowOverlap][0]);
    }
    if (highOverlap != null) {
      rangeEnd = Math.max(rangeEnd, this._ranges[highOverlap][1]);
    }
    if (lowNuke != null) {
      this._ranges.splice(lowNuke, highNuke - lowNuke + 1, [
        rangeStart,
        rangeEnd,
      ]);
    } else {
      this._ranges.splice(insertionPoint, 0, [rangeStart, rangeEnd]);
    }
    for (let i = rangeStart; i <= rangeEnd; i++) {
      this._invalidIndices.add(i);
    }

    this._updateCount();
    this._doInvalidateRows();
    this._fireSelectionChanged();
  }

  /**
   * This is basically RangedSelect but without insertion of a new range and we
   *  don't need to worry about adjacency.
   * Oddly, nsTreeSelection doesn't fire a selection changed event here...
   */
  clearRange(rangeStart, rangeEnd) {
    // Iterate over our existing set of ranges, finding the 'range' of ranges
    //  that our clear range overlaps or simply obviates.
    // Overlap variables track blocks we need to keep some part of, Nuke
    //  variables are for blocks that get spliced out.  For our purposes, all
    //  overlap blocks are also nuke blocks.
    let lowOverlap, lowNuke, highNuke, highOverlap;
    for (const [iTupe, [low, high]] of this._ranges.entries()) {
      // If we completely include the range, it should be nuked
      if (rangeStart <= low && rangeEnd >= high) {
        if (lowNuke == null) {
          // only the first one we see is the low one
          lowNuke = iTupe;
        }
        highNuke = iTupe;
      }
      // If our new range start is inside a range, it's nuke and maybe overlap
      if (rangeStart >= low && rangeStart <= high && lowNuke == null) {
        lowNuke = highNuke = iTupe;
        // it's only overlap if we don't match at the low end
        if (rangeStart > low) {
          lowOverlap = iTupe;
        }
      }
      // If our new range ends inside a range, it's nuke and maybe overlap
      if (rangeEnd >= low && rangeEnd <= high) {
        highNuke = iTupe;
        // it's only overlap if we don't match at the high end
        if (rangeEnd < high) {
          highOverlap = iTupe;
        }
        if (lowNuke == null) {
          lowNuke = iTupe;
        }
      }

      // we're done when no more overlap is possible
      if (rangeEnd < low) {
        break;
      }
    }
    // nothing to do since there's nothing to nuke
    if (lowNuke == null) {
      return;
    }
    const args = [lowNuke, highNuke - lowNuke + 1];
    if (lowOverlap != null) {
      args.push([this._ranges[lowOverlap][0], rangeStart - 1]);
    }
    if (highOverlap != null) {
      args.push([rangeEnd + 1, this._ranges[highOverlap][1]]);
    }
    this._ranges.splice.apply(this._ranges, args);

    for (let i = rangeStart; i <= rangeEnd; i++) {
      this._invalidIndices.add(i);
    }

    this._updateCount();
    this._doInvalidateRows();
    // note! nsTreeSelection doesn't fire a selection changed event, so neither
    //  do we, but it seems like we should
  }

  /**
   * nsTreeSelection always fires a select notification when the range is
   *  cleared, even if there is no effective chance in selection.
   */
  clearSelection() {
    this._invalidateSelection();
    this._shiftSelectPivot = null;
    this._count = 0;
    this._ranges = [];

    this._doInvalidateRows();
    this._fireSelectionChanged();
  }

  /**
   * Select all with no rows is a no-op, otherwise we select all and notify.
   */
  selectAll() {
    if (!this._view) {
      return;
    }

    const view = this._view;
    const rowCount = view.rowCount;

    // no-ops-ville
    if (!rowCount) {
      return;
    }

    this._count = rowCount;
    this._ranges = [[0, rowCount - 1]];

    this._doInvalidateAll();
    this._fireSelectionChanged();
  }

  getRangeCount() {
    return this._ranges.length;
  }
  getRangeAt(rangeIndex, minObj, maxObj) {
    if (rangeIndex < 0 || rangeIndex >= this._ranges.length) {
      throw new Error("Try a real range index next time.");
    }
    [minObj.value, maxObj.value] = this._ranges[rangeIndex];
  }

  /**
   * Helper method to adjust points in the face of row additions/removal.
   *
   * @param point The point, null if there isn't one, or an index otherwise.
   * @param deltaAt The row at which the change is happening.
   * @param delta The number of rows added if positive, or the (negative)
   *     number of rows removed.
   */
  _adjustPoint(point, deltaAt, delta) {
    // if there is no point, no change
    if (point == null) {
      return point;
    }
    // if the point is before the change, no change
    if (point < deltaAt) {
      return point;
    }
    // if it's a deletion and it includes the point, clear it
    if (delta < 0 && point >= deltaAt && point + delta < deltaAt) {
      return null;
    }
    // (else) the point is at/after the change, compensate
    return point + delta;
  }
  /**
   * Find the index of the range, if any, that contains the given index, and
   *  the index at which to insert a range if one does not exist.
   *
   * @returns A tuple containing: 1) the index if there is one, null otherwise,
   *     2) the index at which to insert a range that would contain the point.
   */
  _findRangeContainingRow(index) {
    for (const [iTupe, [low, high]] of this._ranges.entries()) {
      if (index >= low && index <= high) {
        return [iTupe, iTupe];
      }
      if (index < low) {
        return [null, iTupe];
      }
    }
    return [null, this._ranges.length];
  }

  /**
   * When present, a list of calls made to adjustSelection.  See
   *  |logAdjustSelectionForReplay| and |replayAdjustSelectionLog|.
   */
  _adjustSelectionLog = null;
  /**
   * Start logging calls to adjustSelection made against this instance.  You
   *  would do this because you are replacing an existing selection object
   *  with this instance for the purposes of creating a transient selection.
   *  Of course, you want the original selection object to be up-to-date when
   *  you go to put it back, so then you can call replayAdjustSelectionLog
   *  with that selection object and everything will be peachy.
   */
  logAdjustSelectionForReplay() {
    this._adjustSelectionLog = [];
  }
  /**
   * Stop logging calls to adjustSelection and replay the existing log against
   *  selection.
   *
   * @param selection {nsITreeSelection}.
   */
  replayAdjustSelectionLog(selection) {
    if (this._adjustSelectionLog.length) {
      // Temporarily disable selection events because adjustSelection is going
      //  to generate an event each time otherwise, and better 1 event than
      //  many.
      selection.selectEventsSuppressed = true;
      for (const [index, count] of this._adjustSelectionLog) {
        selection.adjustSelection(index, count);
      }
      selection.selectEventsSuppressed = false;
    }
    this._adjustSelectionLog = null;
  }

  adjustSelection(index, count) {
    // nothing to do if there is no actual change
    if (!count) {
      return;
    }

    if (this._adjustSelectionLog) {
      this._adjustSelectionLog.push([index, count]);
    }

    // adjust our points
    this._shiftSelectPivot = this._adjustPoint(
      this._shiftSelectPivot,
      index,
      count
    );
    this._currentIndex = this._adjustPoint(this._currentIndex, index, count);

    // If we are adding rows, we want to split any range at index and then
    //  translate all of the ranges above that point up.
    if (count > 0) {
      let [iContain, iInsert] = this._findRangeContainingRow(index);
      if (iContain != null) {
        const [low, high] = this._ranges[iContain];
        // if it is the low value, we just want to shift the range entirely, so
        //  do nothing (and keep iInsert pointing at it for translation)
        // if it is not the low value, then there must be at least two values so
        //  we should split it and only translate the new/upper block
        if (index != low) {
          this._ranges.splice(iContain, 1, [low, index - 1], [index, high]);
          iInsert++;
        }
      }
      // now translate everything from iInsert on up
      for (let iTrans = iInsert; iTrans < this._ranges.length; iTrans++) {
        const [low, high] = this._ranges[iTrans];
        this._ranges[iTrans] = [low + count, high + count];
      }
      // invalidate and fire selection change notice
      this._doInvalidateRange(index);
      this._fireSelectionChanged();
      return;
    }

    // If we are removing rows, we are basically clearing the range that is
    //  getting deleted and translating everyone above the remaining point
    //  downwards.  The one trick is we may have to merge the lowest translated
    //  block.
    const saveSuppress = this.selectEventsSuppressed;
    this.selectEventsSuppressed = true;
    this.clearRange(index, index - count - 1);
    // translate
    let iTrans = this._findRangeContainingRow(index)[1];
    for (; iTrans < this._ranges.length; iTrans++) {
      const [low, high] = this._ranges[iTrans];
      // for the first range, low may be below the index, in which case it
      //  should not get translated
      this._ranges[iTrans] = [low >= index ? low + count : low, high + count];
    }
    // we may have to merge the lowest translated block because it may now be
    //  adjacent to the previous block
    if (
      iTrans > 0 &&
      iTrans < this._ranges.length &&
      this._ranges[iTrans - 1][1] == this._ranges[iTrans][0]
    ) {
      this._ranges[iTrans - 1][1] = this._ranges[iTrans][1];
      this._ranges.splice(iTrans, 1);
    }

    this._doInvalidateRange(index);
    this.selectEventsSuppressed = saveSuppress;
  }

  get selectEventsSuppressed() {
    return this._selectEventsSuppressed;
  }
  /**
   * Control whether selection events are suppressed.  For consistency with
   *  nsTreeSelection, we always generate a selection event when a value of
   *  false is assigned, even if the value was already false.
   */
  set selectEventsSuppressed(suppress) {
    if (this._selectEventsSuppressed == suppress) {
      return;
    }

    this._selectEventsSuppressed = suppress;
    if (!suppress) {
      this._fireSelectionChanged();
    }
  }

  /**
   * Note that we bypass any XUL "onselect" handler that may exist and go
   *  straight to the view.  If you have a tree, you shouldn't be using us,
   *  so this seems aboot right.
   */
  _fireSelectionChanged() {
    // don't fire if we are suppressed; we will fire when un-suppressed
    if (this.selectEventsSuppressed) {
      return;
    }
    const view = this._tree?.view ?? this._view;

    // We might not have a view if we're in the middle of setting up things
    view?.selectionChanged();
  }

  get currentIndex() {
    if (this._currentIndex == null) {
      return -1;
    }
    return this._currentIndex;
  }
  /**
   * Sets the current index.  Other than updating the variable, this just
   *  invalidates the tree row if we have a tree.
   * The real selection object would send a DOM event we don't care about.
   */
  set currentIndex(index) {
    if (index == this.currentIndex) {
      return;
    }

    this._invalidateSelection();
    this._currentIndex = index != -1 ? index : null;
    this._invalidIndices.add(index);
    this._doInvalidateRows();
  }

  get shiftSelectPivot() {
    return this._shiftSelectPivot != null ? this._shiftSelectPivot : -1;
  }

  /*
   * Functions after this aren't part of the nsITreeSelection interface.
   */

  /**
   * Duplicate this selection on another nsITreeSelection. This is useful
   * when you would like to discard this selection for a real tree selection.
   * We assume that both selections are for the same tree.
   *
   * @note We don't transfer the correct shiftSelectPivot over.
   * @note This will fire a selectionChanged event on the tree view.
   *
   * @param selection an nsITreeSelection to duplicate this selection onto
   */
  duplicateSelection(selection) {
    selection.selectEventsSuppressed = true;
    selection.clearSelection();
    for (const [iTupe, [low, high]] of this._ranges.entries()) {
      selection.rangedSelect(low, high, iTupe > 0);
    }

    selection.currentIndex = this.currentIndex;
    // This will fire a selectionChanged event
    selection.selectEventsSuppressed = false;
  }
}
