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
    if (selection) {
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
  }

  // CalendarFilteredViewMixin implementation

  clearItems() {
    this.#allRows.length = 0;

    this._tree?.beginUpdateBatch();
    this._rowMap.length = 0;
    this._tree?.endUpdateBatch();
  }

  addItems(items) {
    let anyItemsMatchedFilter = false;

    for (const item of items) {
      const row = new CalendarFilteredTreeViewRow(item);

      const sortValue = row.getValue(this.#sortColumn);

      let addIndex = null;
      for (let i = 0; addIndex === null && i < this.#allRows.length; i++) {
        const comparison = this.#collator.compare(
          sortValue,
          this.#allRows[i].getValue(this.#sortColumn)
        );
        if (
          (comparison < 0 && this.#sortDirection == "ascending") ||
          (comparison >= 0 && this.#sortDirection == "descending")
        ) {
          addIndex = i;
        }
      }

      if (addIndex === null) {
        addIndex = this.#allRows.length;
      }
      this.#allRows.splice(addIndex, 0, row);

      if (this.#itemMatchesFilterIfAny(item)) {
        anyItemsMatchedFilter = true;
      }
    }

    if (anyItemsMatchedFilter) {
      this.#saveSelection();

      this._tree?.beginUpdateBatch();
      this._rowMap = this.#allRows.filter(row => this.#itemMatchesFilterIfAny(row.item));
      this._tree?.endUpdateBatch();

      this.#restoreSelection();
    }
  }

  removeItems(items) {
    const hashIDsToRemove = items.map(i => i.hashId);
    for (let i = this.#allRows.length - 1; i >= 0; i--) {
      if (hashIDsToRemove.includes(this.#allRows[i].item.hashId)) {
        this.#allRows.splice(i, 1);
      }
    }

    this.#saveSelection();

    this._tree?.beginUpdateBatch();
    for (let i = this._rowMap.length - 1; i >= 0; i--) {
      if (hashIDsToRemove.includes(this._rowMap[i].item.hashId)) {
        this._rowMap.splice(i, 1);
      }
    }
    this._tree?.endUpdateBatch();

    this.#restoreSelection();
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

  #sortBy(sortColumn, sortDirection) {
    // Sort underlying array of rows first.
    if (sortColumn == this.#sortColumn) {
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
