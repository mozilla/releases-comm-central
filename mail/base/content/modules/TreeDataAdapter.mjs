/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A class for organising data into rows for TreeView.
 */
export class TreeDataAdapter {
  /**
   * A collator used for sorting rows. The numeric option is used, so the same
   * collator can do numeric sorting as well as string sorting.
   *
   * @type {Intl.Collator}
   */
  static collator = new Intl.Collator(undefined, { numeric: true });

  /**
   * @type {TreeView}
   */
  _tree = null;

  /**
   * An array of TreeDataRow items, each item corresponds to a row in the tree.
   * This array contains the visible rows, that is top-level rows and any
   * deeper row that has no closed ancestor.
   *
   * TODO: Maintain a separate list of top-level rows only.
   *
   * @type {TreeDataRow[]}
   */
  _rowMap = [];

  /**
   * The currently sorted column.
   *
   * @type {string|undefined}
   */
  sortColumn;

  /**
   * The currently sorted direction.
   *
   * @type {"ascending"|"descending"|undefined}
   */
  sortDirection;

  /**
   * Connects this adapter to a TreeView.
   *
   * @param {TreeView} tree
   */
  setTree(tree) {
    this._tree = tree;
  }

  /**
   * Append a row to the array of rows.
   *
   * @param {TreeDataRow} row
   * @returns {TreeDataRow} - The same row, for convenience.
   */
  appendRow(row) {
    this._rowMap.push(row);
    return row;
  }

  /**
   * The number of visible rows.
   *
   * @returns {integer}
   */
  get rowCount() {
    return this._rowMap.length;
  }

  /**
   * The actual text to display in the tree.
   *
   * @param {integer} rowIndex
   * @param {string} columnID
   * @returns {string}
   */
  getCellText(rowIndex, columnID) {
    return this._rowMap[rowIndex].getText(columnID);
  }

  /**
   * A string or numeric value to be used when comparing rows for sorting.
   *
   * @param {integer} rowIndex
   * @param {string} columnID
   * @returns {string|number}
   */
  getCellValue(rowIndex, columnID) {
    return this._rowMap[rowIndex].getValue(columnID);
  }

  /**
   * Properties of the row at `rowIndex`.
   *
   * @param {integer} rowIndex
   * @returns {string}
   */
  getRowProperties(rowIndex) {
    return this._rowMap[rowIndex].getProperties();
  }

  /**
   * The 0-indexed level (depth) of the row at `rowIndex`.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  getLevel(rowIndex) {
    return this._rowMap[rowIndex].level;
  }

  /**
   * The index of the parent of the row at `rowIndex`. Top-level rows have no
   * parent, and return -1.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  getParentIndex(rowIndex) {
    return this._rowMap.indexOf(this._rowMap[rowIndex].parent);
  }

  /**
   * If the row at `rowIndex` has a child-list with at least one element.
   *
   * @param {integer} rowIndex
   * @returns {boolean}
   */
  isContainer(rowIndex) {
    return this._rowMap[rowIndex].children.length > 0;
  }

  /**
   * The count of children of the row at `rowIndex`.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  isContainerEmpty(rowIndex) {
    // If the container has no children, the container is empty.
    return !this._rowMap[rowIndex].children.length;
  }

  /**
   * If the row at `rowIndex` is open (expanded).
   *
   * @param {integer} rowIndex
   * @returns {boolean}
   */
  isContainerOpen(rowIndex) {
    return this._rowMap[rowIndex].open;
  }

  /**
   * Opens or closes a container with children.  The logic here is a bit hairy, so
   * be very careful about changing anything.
   *
   * @param {integer} rowIndex.
   */
  toggleOpenState(rowIndex) {
    // Ok, this is a bit tricky.
    const row = this._rowMap[rowIndex];
    row.open = !row.open;

    if (!row.open) {
      // We're closing the current container.  Remove the children

      // Note that we can't simply splice out children.length, because some of
      // them might have children too.  Find out how many items we're actually
      // going to splice
      const level = row.level;
      let newRowIndex = rowIndex + 1;
      while (
        newRowIndex < this._rowMap.length &&
        this._rowMap[newRowIndex].level > level
      ) {
        newRowIndex++;
      }
      const count = newRowIndex - rowIndex - 1;
      this._rowMap.splice(rowIndex + 1, count);

      // Notify the tree of changes
      if (this._tree && count) {
        this._tree.rowCountChanged(rowIndex + 1, -count);
      }
    } else {
      // We're opening the container.  Add the children to our map

      // Note that these children may have been open when we were last closed,
      // and if they are, we also have to add those grandchildren to the map
      const oldCount = this._rowMap.length;
      this.#recursivelyAddToMap(row, rowIndex);

      // Notify the tree of changes
      if (this._tree) {
        const count = this._rowMap.length - oldCount;
        if (count) {
          this._tree.rowCountChanged(rowIndex + 1, count);
        }
      }
    }

    // Invalidate the toggled row, so that the open/closed marker changes
    if (this._tree) {
      this._tree.invalidateRow(rowIndex);
    }
  }

  /**
   * Adds the children of an open row to the array of visible rows.
   *
   * @param {TreeDataRow} parentRow
   * @param {integer} newIndex - The index of `parentRow` in `_rowMap`.
   * @returns {integer} The number of rows added.
   */
  #recursivelyAddToMap(parentRow, newIndex) {
    // When we add sub-children, we're going to need to increase our index
    // for the next add item at our own level.
    const currentCount = this._rowMap.length;
    if (parentRow.children.length && parentRow.open) {
      for (const [i, child] of parentRow.children.entries()) {
        const index = newIndex + i + 1;
        this._rowMap.splice(index, 0, child);
        newIndex += this.#recursivelyAddToMap(child, index);
      }
    }
    return this._rowMap.length - currentCount;
  }

  /**
   * Handle selection events from TreeSelection. They aren't used here.
   */
  selectionChanged() {}

  /**
   * Sort all of the rows by the given column and in the given direction.
   * Rows are compared by cell value first, then by cell text. This is a
   * stable sort, and the current selection is maintained.
   *
   * @param {string} sortColumn
   * @param {"ascending"|"descending"} sortDirection
   * @param {boolean} [resort=false] - If true, the rows will be sorted again, even if
   *   `sortColumn` and `sortDirection` match the current sort.
   */
  sortBy(sortColumn, sortDirection, resort = false) {
    if (
      sortColumn == this.sortColumn &&
      sortDirection == this.sortDirection &&
      !resort
    ) {
      return;
    }

    if (this.selection) {
      for (const [i, row] of this._rowMap.entries()) {
        row.wasSelected = this.selection.isSelected(i);
        row.wasCurrent = this.selection.currentIndex == i;
      }
    }

    // Do the sort.
    this._rowMap.sort((a, b) => {
      if (sortDirection == "descending") {
        // Swapping the rows produces a descending sort.
        [a, b] = [b, a];
      }

      const aValue = a.getValue(sortColumn);
      const bValue = b.getValue(sortColumn);
      const result = TreeDataAdapter.collator.compare(aValue, bValue);
      if (result != 0) {
        return result;
      }

      const aText = a.getText(sortColumn);
      const bText = b.getText(sortColumn);
      return TreeDataAdapter.collator.compare(aText, bText);
    });

    // Restore what was selected.
    if (this.selection) {
      this.selection.selectEventsSuppressed = true;
      for (const [i, row] of this._rowMap.entries()) {
        if (row.wasSelected != this.selection.isSelected(i)) {
          this.selection.toggleSelect(i);
        }
      }
      // Can't do this until updating the selection is finished.
      this.selection.currentIndex = this._rowMap.findIndex(
        row => row.wasCurrent
      );
      this.selection.selectEventsSuppressed = false;
    }

    this.sortColumn = sortColumn;
    this.sortDirection = sortDirection;
    this._tree?.reset();
  }
}

/**
 * A class representing a row in a TreeView. Provide all of the row's data to
 * the constructor, or make a class inheriting from this one to provide it.
 */
export class TreeDataRow {
  level = 0;
  parent = null;
  open = false;
  children = [];

  /**
   * @param {object} texts - The text to be displayed for this row. The
   *   object's keys are column IDs, and the values are the text to display.
   * @param {object} values - Same as `texts`, but instead the values are string
   *   or numeric values for sorting the rows.
   * @param {string} properties - The defined properties for this row.
   */
  constructor(texts = {}, values = {}, properties = "") {
    this.texts = texts;
    this.values = values;
    this.properties = properties;
  }

  /**
   * The actual text to display in the tree for the given column.
   *
   * @param {columnID} columnID
   * @returns {string}
   */
  getText(columnID) {
    return this.texts[columnID];
  }

  /**
   * The string or numeric value for the given column, to be used when
   * comparing rows for sorting.
   *
   * @param {columnID} columnID
   * @returns {string|number}
   */
  getValue(columnID) {
    return this.values[columnID];
  }

  /**
   * Properties of the row. Usually a space-separated list that gets assigned
   * to an element's attribute and matched with CSS selectors.
   *
   * @returns {string}
   */
  getProperties() {
    return this.properties;
  }

  /**
   * Append a row as a child of this row.
   *
   * @param {TreeDataRow} row
   * @returns {TreeDataRow} - The same row, for convenience.
   */
  appendRow(row) {
    // FIXME: Adding or removing a child while open. It requires working out if
    // all the ancestors are open and modifying _rowMap if that's true. This
    // "everything is a flat list" model isn't very clever.
    row.parent = this;
    row.level = this.level + 1;
    this.children.push(row);
    return row;
  }
}
