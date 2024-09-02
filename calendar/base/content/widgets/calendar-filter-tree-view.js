/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal, getEventStatusString, CalendarFilteredViewMixin, PROTO_TREE_VIEW */

class CalendarFilteredTreeView extends CalendarFilteredViewMixin(PROTO_TREE_VIEW) {
  /**
   * A function to, given a calendar item, determine whether it matches some
   * condition, and should therefore be displayed.
   *
   * @callback filterFunction
   * @param {calIItemBase} item The item to compute filter for
   * @returns {boolean} Whether the item matches the filter
   */

  #collator = new Intl.Collator(undefined, { numeric: true });
  #sortColumn = "startDate";
  #sortDirection = "ascending";

  /** @type {filterFunction?} */
  #filterFunction = null;

  /** @type {CalendarFilteredTreeViewRow[]} */
  #allRows = [];

  /**
   * Set the function used to filter displayed rows and update the current view.
   *
   * @param {filterFunction} filterFunction The function to use as a filter
   */
  setFilterFunction(filterFunction) {
    this.#filterFunction = filterFunction;

    this._tree?.beginUpdateBatch();

    if (this.#filterFunction) {
      this._rowMap = this.#allRows.filter(row => this.#filterFunction(row.item));
    } else {
      // With no filter function, all rows should be displayed.
      this._rowMap = Array.from(this.#allRows);
    }

    this._tree?.endUpdateBatch();

    // Ensure that no items remain selected after filter change.
    this.selection.clearSelection();
  }

  /**
   * Clear the filter on the current view.
   */
  clearFilter() {
    this.setFilterFunction(null);
  }

  /**
   * Retrieve the calendar item for the specified row.
   *
   * @param {number} row - The row index containing the item to retrieve.
   * @returns {calIItemBase} - A calendar item corresponding to the row index.
   */
  getItemAt(row) {
    if (row < 0 || row >= this._rowMap.length) {
      console.error(`Attempted to get row ${row} from tree view with ${this._rowMap.length} rows`);
      return null;
    }

    return this._rowMap[row].item;
  }

  /**
   * Retrieve the calendar item for the row at the specified coordinates.
   *
   * @param {number} x - The X coordinate at which to look.
   * @param {number} y - The Y coordinate at which to look.
   * @returns {calIItemBase} - A calendar item corresponding to the coordinates.
   */
  getItemAtCoordinates(x, y) {
    const row = this._tree.getRowAt(x, y);
    if (row == -1) {
      // No row was found at the given coordinates.
      return null;
    }

    return this.getItemAt(row);
  }

  /**
   * Given a calendar item, determine whether it matches the current filter.
   *
   * @param {calIItemBase} item The item to compute filter for
   * @returns {boolean} Whether the item matches the filter, or true if filter
   * is unset
   */
  #itemMatchesFilterIfAny(item) {
    return !this.#filterFunction || this.#filterFunction(item);
  }

  /**
   * Set the selection in the tree to all rows containing one of the provided
   * items.
   *
   * @param {calIItemBase[]} items
   */
  setSelectionFromItems(items) {
    const selection = this.selection;
    if (!selection) {
      return;
    }

    selection.selectEventsSuppressed = true;

    // Build a set of item hash IDs for the selection. Time complexity for set
    // lookup is specified to be better than linear, so we can avoid quadratic
    // time in finding which rows need to be selected.

    // Building a map from hash ID to row number at insertion time is
    // problematic because the rows array is a member of the parent tree view
    // class and we can't guarantee it won't be modified outside of this class,
    // meaning it could fall out of sync with the hash ID map.
    const hashIdsToSelect = new Set(items.map(item => item.hashId));

    // Build the selection.
    for (let i = 0; i < this._rowMap.length; i++) {
      // Instead of clearing the selection, we simply toggle when there's a
      // mismatch. This avoids a visible flashing of rows which don't change.
      if (hashIdsToSelect.has(this._rowMap[i].item.hashId) != selection.isSelected(i)) {
        selection.toggleSelect(i);

        if (hashIdsToSelect.length == 1) {
          // If there's only one item selected, we want to scroll it into view.
          this.tree.ensureRowIsVisible(i);
          break;
        }
      }
    }

    selection.selectEventsSuppressed = false;
  }

  /**
   * Save currently selected rows so that they can be restored after
   * modifications to the tree.
   */
  #saveSelection() {
    const selection = this.selection;
    if (selection) {
      // Mark rows which are selected.
      for (let i = 0; i < this._rowMap.length; i++) {
        this._rowMap[i].wasSelected = selection.isSelected(i);
        this._rowMap[i].wasCurrent = selection.currentIndex == i;
      }
    }
  }

  /**
   * Reselect rows which were selected before modifications were made to the
   * tree.
   */
  #restoreSelection() {
    const selection = this.selection;
    if (!selection) {
      return;
    }

    selection.selectEventsSuppressed = true;

    let newCurrent;
    for (let i = 0; i < this._rowMap.length; i++) {
      if (this._rowMap[i].wasSelected != selection.isSelected(i)) {
        selection.toggleSelect(i);
      }

      if (this._rowMap[i].wasCurrent) {
        newCurrent = i;
      }
    }

    selection.currentIndex = newCurrent;

    this.selectionChanged();
    selection.selectEventsSuppressed = false;
  }

  // CalendarFilteredViewMixin implementation

  clearItems() {
    this.#allRows.length = 0;

    this._tree?.beginUpdateBatch();
    this._rowMap.length = 0;
    this._tree?.endUpdateBatch();

    this.selection?.clearSelection();
  }

  addItems(items) {
    this._tree?.beginUpdateBatch();
    this.#saveSelection();

    let anyItemsMatchedFilter = false;

    for (const item of items) {
      this.#allRows.push(new CalendarFilteredTreeViewRow(item));

      if (this.#itemMatchesFilterIfAny(item)) {
        anyItemsMatchedFilter = true;
      }
    }

    this.#sortBy(this.#sortColumn, this.#sortDirection, true);

    if (anyItemsMatchedFilter) {
      this._rowMap = this.#allRows.filter(row => this.#itemMatchesFilterIfAny(row.item));
    }

    this.#restoreSelection();
    this._tree?.endUpdateBatch();
  }

  removeItems(items) {
    this._tree?.beginUpdateBatch();
    this.#saveSelection();

    const hashIdsToRemove = items.map(i => i.hashId);
    for (let i = this.#allRows.length - 1; i >= 0; i--) {
      if (hashIdsToRemove.includes(this.#allRows[i].item.hashId)) {
        this.#allRows.splice(i, 1);
      }
    }

    for (let i = this._rowMap.length - 1; i >= 0; i--) {
      if (hashIdsToRemove.includes(this._rowMap[i].item.hashId)) {
        this._rowMap.splice(i, 1);
      }
    }

    if (this.selection) {
      // Don't leave behind bogus rows in the selection. Restoring the selection
      // doesn't touch items beyond the end of the row map, but we've just
      // reduced the row map's length, so we need to clear out any rows beyond
      // the new map's end.
      this.selection.selectEventsSuppressed = true;
      this.selection.clearSelection();
      this.selection.selectEventsSuppressed = false;
    }

    this.#restoreSelection();
    this._tree?.endUpdateBatch();
  }

  removeItemsFromCalendar(calendarId) {
    const itemsToRemove = this.#allRows
      .filter(row => row.calendar.id == calendarId)
      .map(row => row.item);
    this.removeItems(itemsToRemove);
  }

  // nsITreeView implementation

  isSorted() {
    return true;
  }

  cycleHeader(column) {
    let direction = "ascending";
    if (column.id == this.#sortColumn && this.#sortDirection == "ascending") {
      direction = "descending";
    }

    this.#sortBy(column.id, direction);
  }

  #sortBy(sortColumn, sortDirection, force) {
    // Sort underlying array of rows first.
    if (sortColumn == this.#sortColumn && !force) {
      if (sortDirection == this.#sortDirection) {
        // Sort order hasn't changed; do nothing.
        return;
      }

      this.#allRows.reverse();
    } else {
      this.#allRows.sort((a, b) => {
        const aValue = a.getValue(sortColumn);
        const bValue = b.getValue(sortColumn);

        if (sortDirection == "descending") {
          return this.#collator.compare(bValue, aValue);
        }

        return this.#collator.compare(aValue, bValue);
      });
    }

    this.#saveSelection();

    // Refilter displayed rows from newly-sorted underlying array.
    this._tree?.beginUpdateBatch();
    this._rowMap = this.#allRows.filter(row => this.#itemMatchesFilterIfAny(row.item));
    this._tree?.endUpdateBatch();

    this.#restoreSelection();

    this.#sortColumn = sortColumn;
    this.#sortDirection = sortDirection;
  }
}

class CalendarFilteredTreeViewRow {
  static listFormatter = new Services.intl.ListFormat(
    Services.appinfo.name == "xpcshell" ? "en-US" : Services.locale.appLocalesAsBCP47,
    { type: "unit" }
  );

  #columnTextCache = {};
  #columnValueCache = {};
  #item = null;
  #calendar = null;
  wasSelected = false;
  wasCurrent = false;

  constructor(item) {
    this.#item = item;
    this.#calendar = item.calendar;
  }

  #getTextByColumnID(columnID) {
    switch (columnID) {
      case "calendarName":
      case "unifinder-search-results-tree-col-calendarname":
        return this.#calendar.name;
      case "categories":
      case "unifinder-search-results-tree-col-categories":
        return CalendarFilteredTreeViewRow.listFormatter.format(this.#item.getCategories());
      case "color":
      case "unifinder-search-results-tree-col-color":
        return cal.view.formatStringForCSSRule(this.#calendar.id);
      case "endDate":
      case "unifinder-search-results-tree-col-enddate": {
        const endDate = this.#item.endDate.getInTimezone(cal.dtz.defaultTimezone);
        if (endDate.isDate) {
          endDate.day--;
        }

        return cal.dtz.formatter.formatDateTime(endDate);
      }
      case "location":
      case "unifinder-search-results-tree-col-location":
        return this.#item.getProperty("LOCATION");
      case "startDate":
      case "unifinder-search-results-tree-col-startdate":
        return cal.dtz.formatter.formatDateTime(
          this.#item.startDate.getInTimezone(cal.dtz.defaultTimezone)
        );
      case "status":
      case "unifinder-search-results-tree-col-status":
        return getEventStatusString(this.#item);
      case "title":
      case "unifinder-search-results-tree-col-title":
        return this.#item.title?.replace(/\n/g, " ") || "";
    }

    return "";
  }

  getText(columnID) {
    if (!(columnID in this.#columnTextCache)) {
      this.#columnTextCache[columnID] = this.#getTextByColumnID(columnID);
    }

    return this.#columnTextCache[columnID];
  }

  #getValueByColumnID(columnID) {
    switch (columnID) {
      case "startDate":
      case "unifinder-search-results-tree-col-startdate":
        return this.#item.startDate.icalString;
      case "endDate":
      case "unifinder-search-results-tree-col-enddate":
        return this.#item.endDate.icalString;
    }

    return this.getText(columnID);
  }

  getValue(columnID) {
    if (!(columnID in this.#columnValueCache)) {
      this.#columnValueCache[columnID] = this.#getValueByColumnID(columnID);
    }

    return this.#columnValueCache[columnID];
  }

  getProperties() {
    let properties = [];
    if (this.#item.priority > 0 && this.#item.priority < 5) {
      properties.push("highpriority");
    } else if (this.#item.priority > 5 && this.#item.priority < 10) {
      properties.push("lowpriority");
    }

    properties.push("calendar-" + cal.view.formatStringForCSSRule(this.#calendar.name));

    if (this.#item.status) {
      properties.push("status-" + this.#item.status.toLowerCase());
    }

    if (this.#item.getAlarms().length) {
      properties.push("alarm");
    }

    properties = properties.concat(this.#item.getCategories().map(cal.view.formatStringForCSSRule));
    return properties.join(" ");
  }

  /** @type {calIItemBase} */
  get item() {
    return this.#item;
  }

  /** @type {calICalendar} */
  get calendar() {
    return this.#calendar;
  }

  get open() {
    return false;
  }

  get level() {
    return 0;
  }

  get children() {
    return [];
  }
}
