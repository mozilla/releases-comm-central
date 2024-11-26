/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);
import {
  TreeView,
  TreeViewTableRow,
} from "chrome://messenger/content/tree-view.mjs";

const xulStoreURL = location.href.replace(/\?.*/, "");

/**
 * Create a shallow clone of an array of column definitions. Use this to avoid
 * the same objects being used in multiple places, so that properties are not
 * accidentally overwritten.
 *
 * @param {ColumnDef[]} columns
 * @returns {ColumnDef[]}
 */
function cloneColumns(columns) {
  return columns.map(column => ({ ...column }));
}

/**
 * Subclass of TreeView that handles the column arrangement and sorting events
 * automatically. Remembers the columns and sort order between sessions.
 */
class AutoTreeView extends TreeView {
  #defaultColumns;

  connectedCallback() {
    super.connectedCallback();

    this.table.editable = true;
    this.table.addEventListener("column-resized", this);
    this.table.addEventListener("columns-changed", this);
    this.table.addEventListener("reorder-columns", this);
    this.table.addEventListener("restore-columns", this);
    this.table.addEventListener("sort-changed", this);

    window.addEventListener("uidensitychange", this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    window.removeEventListener("uidensitychange", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "column-resized":
        this.resizeColumn(event.detail.column, event.detail.splitter.width);
        break;
      case "columns-changed":
        this.changeColumns(
          event.detail.value,
          !event.detail.target.hasAttribute("checked")
        );
        break;
      case "reorder-columns":
        // TODO: Fix this event so it provides column IDs, not column defs.
        this.reorderColumns(event.detail.columns.map(column => column.id));
        break;
      case "restore-columns":
        this.restoreDefaultColumns();
        break;
      case "sort-changed":
        this.sortBy(event.detail.column);
        break;
      case "uidensitychange":
        this._rowElementClass.ROW_HEIGHT =
          this._rowElementClass.ROW_HEIGHTS[UIDensity.prefValue];
        this.reset();
        break;
      case "keydown": {
        let modifier = event.ctrlKey;
        let antiModifier = event.metaKey;
        if (AppConstants.platform == "macosx") {
          [modifier, antiModifier] = [antiModifier, modifier];
        }
        if (event.key.toLowerCase() == "a" && modifier && !antiModifier) {
          this.selectAll();
          this.dispatchEvent(new CustomEvent("select"));
          event.preventDefault();
          break;
        }
        // Falls through.
      }
      default:
        super.handleEvent(event);
        break;
    }
  }

  /**
   * The default columns for this TreeView. These will be used if there's no
   * information in the xulStore about columns, or if the user clicks the
   * "Restore Columns" item from the column picker.
   *
   * @type {ColumnDef[]}
   */
  get defaultColumns() {
    return this.#defaultColumns;
  }

  set defaultColumns(columns) {
    if (this.#defaultColumns) {
      throw new Error(
        "Default columns on a tree view should be set only once."
      );
    }
    for (const column of columns) {
      if (!column.id) {
        throw new Error("Tree view columns must have IDs.");
      }
      if (document.getElementById(column.id)) {
        throw new Error(
          "Tree view column IDs must be unique within the document."
        );
      }
      if (/[^\w-]/.test(column.id)) {
        throw new Error("Tree view column IDs must use only safe characters.");
      }
    }

    this.#defaultColumns = cloneColumns(columns);
    this.table.setColumns(this.#restoreColumns(cloneColumns(columns)));
  }

  /**
   * The current view for this list. Setting a view causes it to be sorted,
   * if there is information in the xulStore about sorting.
   *
   * @type {TreeDataAdapter}
   */
  get view() {
    return super.view;
  }

  set view(view) {
    if (!view) {
      super.view = view;
      return;
    }

    const sortColumn = Services.xulStore.getValue(
      xulStoreURL,
      this.id,
      "sortColumn"
    );
    const sortDirection = Services.xulStore.getValue(
      xulStoreURL,
      this.id,
      "sortDirection"
    );
    if (sortColumn && sortDirection) {
      // Pre-sort the view to avoid displaying it unsorted, then sorting it.
      view.sortBy(sortColumn, sortDirection);
    }
    super.view = view;
    // Now update the headers.
    this.sortBy(view.sortColumn, view.sortDirection);
  }

  /**
   * Resize the given column to the given width, and remember the width.
   *
   * @param {string} columnId
   * @param {integer} width
   */
  resizeColumn(columnId, width) {
    const column = this.table.columns.find(c => c.id == columnId);
    if (column) {
      column.width = width;
    }
    this.#persistColumns();
  }

  /**
   * Show or hide the given column, and remember the state.
   *
   * @param {string} columnId
   * @param {boolean} hidden
   */
  changeColumns(columnId, hidden) {
    const column = this.table.columns.find(c => c.id == columnId);
    if (column.hidden == hidden) {
      return;
    }
    column.hidden = hidden;

    this.table.updateColumns(this.table.columns);
    this.reset();
    this.#persistColumns();
  }

  /**
   * Rearrange the columns into the given order, and remember the order.
   *
   * @param {string[]} columnIds - The IDs of the columns, in the order wanted.
   */
  reorderColumns(columnIds) {
    const columns = cloneColumns(this.table.columns);
    columns.sort((a, b) => columnIds.indexOf(a.id) - columnIds.indexOf(b.id));
    this.table.updateColumns(columns);
    this.reset();
    this.#persistColumns();
  }

  /**
   * Revert the columns to the default settings, and clear the column
   * information from the xulStore.
   */
  restoreDefaultColumns() {
    this.table.setColumns(cloneColumns(this.#defaultColumns));
    this.reset();
    this.#forgetColumns();
  }

  /**
   * Save the column order, visibility states, and widths in the xulStore.
   */
  #persistColumns() {
    const columns = [];
    let save = false;

    for (let i = 0; i < this.table.columns.length; i++) {
      const column = this.table.columns[i];
      const j = this.#defaultColumns.findIndex(c => c.id == column.id);
      const defaultColumn = this.#defaultColumns[j];

      let columnDef = column.id;
      if (j != i) {
        save = true;
      }

      if (column.width && column.width != defaultColumn.width) {
        columnDef += `:${parseInt(column.width, 10)}`;
        save = true;
      }

      if (column.hidden) {
        columnDef += ":hidden";
      }
      if (column.hidden != defaultColumn.hidden) {
        save = true;
      }

      columns.push(columnDef);
    }

    if (save) {
      Services.xulStore.setValue(
        xulStoreURL,
        this.id,
        "columns",
        columns.join(",")
      );
      return;
    }
    Services.xulStore.removeValue(xulStoreURL, this.id, "columns");
  }

  /**
   * Retrieve the column information from the xulStore and apply it to `columns`.
   *
   * @param {ColumnDef} columns
   */
  #restoreColumns(columns) {
    if (
      !this.id ||
      !Services.xulStore.hasValue(xulStoreURL, this.id, "columns")
    ) {
      return columns;
    }

    try {
      const value = Services.xulStore.getValue(xulStoreURL, this.id, "columns");
      const order = [];
      const hidden = new Map();
      const widths = new Map();
      for (const columnDef of value.split(",")) {
        const [id, ...state] = columnDef.split(":");
        order.push(id);
        const width = parseInt(state.at(0), 10);
        if (!isNaN(width)) {
          widths.set(id, width);
        }
        hidden.set(id, state.at(-1) == "hidden");
      }
      columns.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      for (const column of columns) {
        if (hidden.has(column.id)) {
          column.hidden = hidden.get(column.id);
        }
        if (widths.has(column.id)) {
          column.width = widths.get(column.id);
        }
      }
    } catch (ex) {
      console.error(ex);
    }
    return columns;
  }

  /**
   * Remove column information from the xulStore.
   */
  #forgetColumns() {
    if (!this.id) {
      return;
    }

    Services.xulStore.removeValue(xulStoreURL, this.id, "columns");
  }

  /**
   * Sort the view by the given column and direction, and remember the sort.
   *
   * @param {string} [newColumn] - If not given, the currently sorted column
   *   will be used.
   * @param {"ascending"|"descending"} [newDirection] - If not given, and
   *   `newColumn` is the currently sorted column, the sort direction flips.
   *   Otherwise, ascending direction is used.
   */
  sortBy(newColumn, newDirection) {
    const { sortColumn, sortDirection } = this.view;
    if (!newColumn) {
      if (!sortColumn) {
        return;
      }
      newColumn = sortColumn;
    }
    if (!newDirection) {
      newDirection =
        sortColumn == newColumn && sortDirection == "ascending"
          ? "descending"
          : "ascending";
    }

    if (newColumn != sortColumn || newDirection != sortDirection) {
      this.view.sortBy(newColumn, newDirection);
      this.#persistSort();
    }

    this.table
      .querySelector(".sorting")
      ?.classList.remove("sorting", "ascending", "descending");
    this.table
      .querySelector(`#${newColumn} button`)
      ?.classList.add("sorting", newDirection);
  }

  /**
   * Save the sort column and direction in the xulStore.
   */
  #persistSort() {
    if (!this.id) {
      return;
    }

    const { sortColumn, sortDirection } = this.view;
    if (sortColumn && sortDirection) {
      Services.xulStore.setValue(
        xulStoreURL,
        this.id,
        "sortColumn",
        sortColumn
      );
      Services.xulStore.setValue(
        xulStoreURL,
        this.id,
        "sortDirection",
        sortDirection
      );
      return;
    }
    Services.xulStore.removeValue(xulStoreURL, this.id, "sortColumn");
    Services.xulStore.removeValue(xulStoreURL, this.id, "sortDirection");
  }
}
customElements.define("auto-tree-view", AutoTreeView);

/**
 * Rows in a AutoTreeView table. Handles putting the text into the table cells
 * and hiding the appropriate columns.
 */
class AutoTreeViewTableRow extends TreeViewTableRow {
  static ROW_HEIGHTS = {
    [UIDensity.MODE_COMPACT]: 18,
    [UIDensity.MODE_NORMAL]: 22,
    [UIDensity.MODE_TOUCH]: 32,
  };
  static ROW_HEIGHT = AutoTreeViewTableRow.ROW_HEIGHTS[UIDensity.prefValue];

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.setAttribute("draggable", "true");
    this.classList.add("table-layout");

    for (const column of this.list.table.columns) {
      this.appendChild(document.createElement("td")).classList.add(
        `${column.id.toLowerCase()}-column`
      );
    }
  }

  _fillRow() {
    super._fillRow();

    this.dataset.properties = this.view.getRowProperties(this._index);

    for (const column of this.list.table.columns) {
      const cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
      if (column.hidden) {
        cell.hidden = true;
        continue;
      }

      const text = this.view.getCellText(this._index, column.id);
      cell.textContent = text;
      if (column.l10n.cell) {
        document.l10n.setAttributes(cell, column.l10n.cell, { title: text });
        continue;
      }

      cell.removeAttribute("aria-label");
      cell.title = text;
    }

    this.setAttribute("aria-label", this.firstElementChild.textContent);
  }
}
customElements.define("auto-tree-view-table-row", AutoTreeViewTableRow, {
  extends: "tr",
});
