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
   * An array of TreeDataRow items, each item corresponds to a top-level row
   * in the tree.
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
    return this._rowMap.reduce(
      (total, current) => total + (current.open ? current.rowCount + 1 : 1),
      0
    );
  }

  /**
   * Get the row at a given row index, accounting for open rows. This is NOT
   * the same as `this._rowMap[rowIndex]` or `this._rowMap.at(rowIndex).
   *
   * @param {number} rowIndex - A non-negative integer.
   * @returns {?TreeDataRow}
   */
  rowAt(rowIndex) {
    for (const topLevelRow of this._rowMap) {
      if (rowIndex == 0) {
        return topLevelRow;
      }
      rowIndex--;
      if (topLevelRow.open) {
        if (rowIndex < topLevelRow.rowCount) {
          // A subclass might return undefined here, if it loads rows
          // asynchronously. Use a blank row in the interim.
          return topLevelRow.rowAt(rowIndex) ?? new TreeDataRow();
        }
        rowIndex -= topLevelRow.rowCount;
      }
    }
    return null;
  }

  /**
   * Get the row index of a given row, accounting for open rows. This is NOT
   * the same as `this._rowMap.indexOf(row)`.
   *
   * @param {TreeDataRow} row
   * @returns {number} The index of the row (can be used with rowAt) or -1.
   */
  indexOf(row) {
    if (!row) {
      return -1;
    }
    let rowIndex = 0;
    for (const topLevelRow of this._rowMap) {
      if (topLevelRow == row) {
        return rowIndex;
      }
      rowIndex++;
      if (topLevelRow.open) {
        const childIndex = topLevelRow.indexOf(row);
        if (childIndex >= 0) {
          return rowIndex + childIndex;
        }
        rowIndex += topLevelRow.rowCount;
      }
    }
    return -1;
  }

  /**
   * The actual text to display in the tree.
   *
   * @param {integer} rowIndex
   * @param {string} columnID
   * @returns {string}
   */
  getCellText(rowIndex, columnID) {
    return this.rowAt(rowIndex).getText(columnID);
  }

  /**
   * A string or numeric value to be used when comparing rows for sorting.
   *
   * @param {integer} rowIndex
   * @param {string} columnID
   * @returns {string|number}
   */
  getCellValue(rowIndex, columnID) {
    return this.rowAt(rowIndex).getValue(columnID);
  }

  /**
   * Properties of the row at `rowIndex` as a space-separated list.
   *
   * @param {integer} rowIndex
   * @returns {string}
   */
  getRowProperties(rowIndex) {
    return [...this.rowAt(rowIndex).properties].join(" ");
  }

  /**
   * The 0-indexed level (depth) of the row at `rowIndex`.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  getLevel(rowIndex) {
    return this.rowAt(rowIndex).level;
  }

  /**
   * The index of the parent of the row at `rowIndex`. Top-level rows have no
   * parent, and return -1.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  getParentIndex(rowIndex) {
    return this.indexOf(this.rowAt(rowIndex).parent);
  }

  /**
   * If the row at `rowIndex` has a child-list with at least one element.
   *
   * @param {integer} rowIndex
   * @returns {boolean}
   */
  isContainer(rowIndex) {
    return this.rowAt(rowIndex).children.length > 0;
  }

  /**
   * The count of children of the row at `rowIndex`.
   *
   * @param {integer} rowIndex
   * @returns {integer}
   */
  isContainerEmpty(rowIndex) {
    // If the container has no children, the container is empty.
    return !this.rowAt(rowIndex).children.length;
  }

  /**
   * If the row at `rowIndex` is open (expanded).
   *
   * @param {integer} rowIndex
   * @returns {boolean}
   */
  isContainerOpen(rowIndex) {
    return this.rowAt(rowIndex).open;
  }

  /**
   * Opens or closes a container with children.  The logic here is a bit hairy, so
   * be very careful about changing anything.
   *
   * @param {integer} rowIndex
   */
  toggleOpenState(rowIndex) {
    const row = this.rowAt(rowIndex);
    const rowCount = row.rowCount;
    if (row.open) {
      row.open = false;
      if (rowCount) {
        this._tree?.rowCountChanged(rowIndex + 1, -rowCount);
      }
    } else {
      row.open = true;
      // Tell the row it is being opened and it should prepare the child rows.
      // (Used for subclasses.)
      row.ensureChildren?.(this, rowIndex);
      if (rowCount) {
        this._tree?.rowCountChanged(rowIndex + 1, rowCount);
      }
    }
    this._tree?.invalidateRow(rowIndex);
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
  /**
   * How deep in the tree this row is. Top-level rows are at level 0.
   *
   * @type {number}
   */
  level = 0;

  /**
   * Whether or not this row is open (its children are visible).
   *
   * @protected
   * @type {boolean}
   */
  _open = false;

  /**
   * The parent of this row, or null if this is a top-level row.
   *
   * @type {?TreeDataRow}
   */
  parent = null;

  /**
   * Child rows of this row.
   *
   * @type {TreeDataRow[]}
   */
  children = [];

  /**
   * A set of string properties.
   *
   * Setting `@name` and `@private` explicitly to work around jsdoc/sphinx-js
   * not understanding private class fields (#properties).
   *
   * @name TreeDataAdapter.TreeDataRow._properties
   * @private
   * @type {Set<string>}
   */
  #properties;

  /**
   * @param {object} [texts={}] - The text to be displayed for this row. The
   *   object's keys are column IDs, and the values are the text to display.
   * @param {object} [values={}] - Same as `texts`, but instead the values are string
   *   or numeric values for sorting the rows.
   * @param {Iterable<string>} [properties=[]] - The defined properties for this row.
   */
  constructor(texts = {}, values = {}, properties = []) {
    this.texts = texts;
    this.values = values;
    this.#properties = new Set(properties);
  }

  /**
   * Whether or not this row is open (its children are visible). Getter and
   * setter can be overridden in a subclass to run extra code.
   *
   * @type {boolean}
   */
  get open() {
    return this._open;
  }

  set open(value) {
    this._open = value;
  }

  /**
   * The number of visible descendants of this row. Note: this is the same
   * value regardless of whether this row is open or closed.
   *
   * @returns {integer}
   */
  get rowCount() {
    // A subclass might have undefined elements in the children array (i.e. a
    // sparse array), so don't call `reduce` on it.
    let count = 0;
    for (const child of this.children) {
      count += child?.open ? child.rowCount + 1 : 1;
    }
    return count;
  }

  /**
   * Get the row at a given row index, relative to this row (that is, the
   * first child would be at index 0), and accounting for open rows. This is
   * NOT the same as `this.children[rowIndex]` or `this.children.at(rowIndex).
   *
   * @param {number} rowIndex - A non-negative integer.
   * @returns {?TreeDataRow}
   */
  rowAt(rowIndex) {
    for (const childRow of this.children) {
      if (rowIndex == 0) {
        return childRow;
      }
      rowIndex--;
      if (childRow?.open) {
        if (rowIndex < childRow.rowCount) {
          return childRow.rowAt(rowIndex);
        }
        rowIndex -= childRow.rowCount;
      }
    }
    return null;
  }

  /**
   * Get the row index of a given row, relative to this row (that is, the
   * first child would be at index 0), and accounting for open rows. This is
   * NOT the same as `this.children.indexOf(row)`.
   *
   * @param {TreeDataRow} row
   * @returns {number} The index of the row (can be used with rowAt) or -1.
   */
  indexOf(row) {
    let rowIndex = 0;
    for (const childRow of this.children) {
      if (childRow == row) {
        return rowIndex;
      }
      rowIndex++;
      if (childRow.open) {
        const childIndex = childRow.indexOf(row);
        if (childIndex >= 0) {
          return rowIndex + childIndex;
        }
        rowIndex + childRow.rowCount;
      }
    }
    return -1;
  }

  /**
   * The actual text to display in the tree for the given column.
   *
   * @param {string} columnID
   * @returns {string}
   */
  getText(columnID) {
    return this.texts[columnID];
  }

  /**
   * The string or numeric value for the given column, to be used when
   * comparing rows for sorting.
   *
   * @param {string} columnID
   * @returns {string|number}
   */
  getValue(columnID) {
    return this.values[columnID];
  }

  /**
   * Get the properties of the row.
   *
   * @returns {Iterable<string>} Though this function returns an Iterator,
   *   subclasses can override it and return any Iterable (e.g. an Array).
   */
  get properties() {
    return this.#properties.values();
  }

  /**
   * Add a property to the row.
   *
   * @param {string} property
   */
  addProperty(property) {
    this.#properties.add(property);
  }

  /**
   * Change the existence of a property to a given value, or the opposite of
   * the current value.
   *
   * @param {string} property
   * @param {boolean} [force] - If true, the property will be added. If false,
   *   it will be removed. If not given, the property will be toggled.
   */
  toggleProperty(property, force = !this.hasProperty(property)) {
    if (force) {
      this.addProperty(property);
    } else {
      this.removeProperty(property);
    }
  }

  /**
   * Test if the row has the given property.
   *
   * @param {string} property
   * @returns {boolean}
   */
  hasProperty(property) {
    return this.#properties.has(property);
  }

  /**
   * Remove a property from the row.
   *
   * @param {string} property
   */
  removeProperty(property) {
    this.#properties.delete(property);
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
