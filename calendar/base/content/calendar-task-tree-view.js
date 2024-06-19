/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported CalendarTaskTreeView */

/* import-globals-from item-editing/calendar-item-editing.js */
/* import-globals-from widgets/mouseoverPreviews.js */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

/**
 * The tree view for a CalendarTaskTree.
 *
 * @implements {nsITreeView}
 */
class CalendarTaskTreeView {
  /**
   * Creates a new task tree view and connects it to a given task tree.
   *
   * @param {CalendarTaskTree} taskTree - The task tree to connect the view to.
   */
  constructor(taskTree) {
    this.tree = taskTree;
    this.mSelectedColumn = null;
    this.sortDirection = null;
  }

  QueryInterface = ChromeUtils.generateQI(["nsITreeView"]);

  /**
   * Get the selected column.
   *
   * @returns {Element} A treecol element.
   */
  get selectedColumn() {
    return this.mSelectedColumn;
  }

  /**
   * Set the selected column and sort by that column.
   *
   * @param {Element} column - A treecol element.
   */
  set selectedColumn(column) {
    const columnProperty = column.getAttribute("itemproperty");

    this.tree.querySelectorAll("treecol").forEach(col => {
      if (col.getAttribute("sortActive")) {
        col.removeAttribute("sortActive");
        col.removeAttribute("sortDirection");
      }
      if (columnProperty == col.getAttribute("itemproperty")) {
        col.setAttribute("sortActive", "true");
        col.setAttribute("sortDirection", this.sortDirection);
      }
    });
    this.mSelectedColumn = column;
  }

  // High-level task tree manipulation

  /**
   * Adds an array of items (tasks) to the list if they match the currently applied filter.
   *
   * @param {object[]} items - An array of task objects to add.
   * @param {boolean} [doNotSort] - Whether to re-sort after adding the tasks.
   */
  addItems(items, doNotSort) {
    this.modifyItems(items, [], doNotSort, true);
  }
  /**
   * Removes an array of items (tasks) from the list.
   *
   * @param {object[]} items - An array of task objects to remove.
   */
  removeItems(items) {
    this.modifyItems([], items, true, false);
  }

  /**
   * Removes an array of old items from the list, and adds an array of new items if
   * they match the currently applied filter.
   *
   * @param {calIItemBase[]} newItems - An array of new items to add.
   * @param {calIItemBase[]} oldItems - An array of old items to remove.
   * @param {boolean} [doNotSort=false] - Whether to re-sort the list after modifying it.
   * @param {boolean} [selectNew=false] - Whether to select the new tasks.
   */
  modifyItems(newItems, oldItems, doNotSort = false, selectNew = false) {
    const selItem = this.tree.currentTask;
    let selIndex = this.tree.currentIndex;
    let firstHash = null;
    const remIndexes = [];

    this.tree.beginUpdateBatch();

    const { deletedItems, addedItems, modifiedItems } = cal.item.interDiff(oldItems, newItems);

    // Find the indexes of the old items that need to be removed.
    for (const item of deletedItems) {
      if (item.hashId in this.tree.mHash2Index) {
        // The old item needs to be removed.
        remIndexes.push(this.tree.mHash2Index[item.hashId]);
        delete this.tree.mHash2Index[item.hashId];
      }
    }

    // Modified items need to be updated.
    for (const item of modifiedItems) {
      if (item.hashId in this.tree.mHash2Index) {
        // Make sure we're using the new version of a modified item.
        this.tree.mTaskArray[this.tree.mHash2Index[item.hashId]] = item;
      }
    }

    // Remove the old items working backward from the end so the indexes stay valid.
    remIndexes
      .sort((a, b) => b - a)
      .forEach(index => {
        this.tree.mTaskArray.splice(index, 1);
        this.tree.rowCountChanged(index, -1);
      });

    // Add the new items.
    for (const item of addedItems) {
      if (!(item.hashId in this.tree.mHash2Index)) {
        const index = this.tree.mTaskArray.length;
        this.tree.mTaskArray.push(item);
        this.tree.mHash2Index[item.hashId] = index;
        this.tree.rowCountChanged(index, 1);
        firstHash = firstHash || item.hashId;
      }
    }

    if (doNotSort) {
      this.tree.recreateHashTable();
    } else {
      this.tree.sortItems();
    }

    if (selectNew && firstHash && firstHash in this.tree.mHash2Index) {
      // Select the first item added into the list.
      selIndex = this.tree.mHash2Index[firstHash];
    } else if (selItem && selItem.hashId in this.tree.mHash2Index) {
      // Select the previously selected item.
      selIndex = this.tree.mHash2Index[selItem.hashId];
    } else if (selIndex >= this.tree.mTaskArray.length) {
      // Make sure the previously selected index is valid.
      selIndex = this.tree.mTaskArray.length - 1;
    }

    if (selIndex > -1) {
      this.tree.view.selection.select(selIndex);
      this.tree.ensureRowIsVisible(selIndex);
    }

    this.tree.endUpdateBatch();
  }

  /**
   * Remove all tasks from the list/tree.
   */
  clear() {
    const count = this.tree.mTaskArray.length;
    if (count > 0) {
      this.tree.mTaskArray = [];
      this.tree.mHash2Index = {};
      this.tree.rowCountChanged(0, -count);
      this.tree.view.selection.clearSelection();
    }
  }

  /**
   * Refresh the display for a given task.
   *
   * @param {object} item - The task object to refresh.
   */
  updateItem(item) {
    const index = this.tree.mHash2Index[item.hashId];
    if (index) {
      this.tree.invalidateRow(index);
    }
  }

  /**
   * Return the item (task) object that's related to a given event. If passed a column and/or row
   * object, set their 'value' property to the column and/or row related to the event.
   *
   * @param {Event} event - An event.
   * @param {object} [col] - A column object.
   * @param {object} [row] - A row object.
   * @returns {?calITodo} the task object related to the event, if any.
   */
  getItemFromEvent(event, col, row) {
    const { col: eventColumn, row: eventRow } = this.tree.getCellAt(event.clientX, event.clientY);
    if (col) {
      col.value = eventColumn;
    }
    if (row) {
      row.value = eventRow;
    }
    return eventRow > -1 ? this.tree.mTaskArray[eventRow] : null;
  }

  // nsITreeView Methods and Properties

  get rowCount() {
    return this.tree.mTaskArray.length;
  }

  getCellProperties(row, col) {
    const rowProps = this.getRowProperties(row);
    const colProps = this.getColumnProperties(col);
    return rowProps + (rowProps && colProps ? " " : "") + colProps;
  }

  getColumnProperties(col) {
    return col.element.getAttribute("id") || "";
  }

  getRowProperties(row) {
    let properties = [];
    const item = this.tree.mTaskArray[row];
    if (item.priority > 0 && item.priority < 5) {
      properties.push("highpriority");
    } else if (item.priority > 5 && item.priority < 10) {
      properties.push("lowpriority");
    }
    properties.push(cal.item.getProgressAtom(item));

    // Add calendar name and id atom.
    properties.push("calendar-" + cal.view.formatStringForCSSRule(item.calendar.name));
    properties.push("calendarid-" + cal.view.formatStringForCSSRule(item.calendar.id));

    // Add item status atom.
    if (item.status) {
      properties.push("status-" + item.status.toLowerCase());
    }

    // Alarm status atom.
    if (item.getAlarms().length) {
      properties.push("alarm");
    }

    // Task categories.
    properties = properties.concat(item.getCategories().map(cal.view.formatStringForCSSRule));

    return properties.join(" ");
  }

  cycleCell(row, col) {
    const task = this.tree.mTaskArray[row];

    // Prevent toggling completed status for parent items of
    // repeating tasks or when the calendar is read-only.
    if (!task || task.recurrenceInfo || task.calendar.readOnly) {
      return;
    }
    if (col != null) {
      const content = col.element.getAttribute("itemproperty");
      if (content == "completed") {
        const newTask = task.clone().QueryInterface(Ci.calITodo);
        newTask.isCompleted = !task.completedDate;
        doTransaction("modify", newTask, newTask.calendar, task, null);
      }
    }
  }

  cycleHeader(col) {
    if (!this.selectedColumn) {
      this.sortDirection = "ascending";
    } else if (!this.sortDirection || this.sortDirection == "descending") {
      this.sortDirection = "ascending";
    } else {
      this.sortDirection = "descending";
    }
    this.selectedColumn = col.element;
    const selectedItems = this.tree.selectedTasks;
    this.tree.sortItems();
    if (selectedItems != undefined) {
      this.tree.view.selection.clearSelection();
      for (const item of selectedItems) {
        const index = this.tree.mHash2Index[item.hashId];
        this.tree.view.selection.toggleSelect(index);
      }
    }
  }

  getCellText(row, col) {
    const task = this.tree.mTaskArray[row];
    if (!task) {
      return "";
    }

    const property = col.element.getAttribute("itemproperty");
    switch (property) {
      case "title":
        // Return title, or "Untitled" if empty/null.
        return task.title
          ? task.title.replace(/\n/g, " ")
          : CalendarTaskTreeView.l10n.formatValueSync("event-untitled");
      case "entryDate":
      case "dueDate":
      case "completedDate":
        return task.recurrenceInfo
          ? cal.l10n.getDateFmtString("Repeating")
          : this._formatDateTime(task[property]);
      case "percentComplete":
        return task.percentComplete > 0 ? task.percentComplete + "%" : "";
      case "categories":
        // TODO This is l10n-unfriendly.
        return task.getCategories().join(", ");
      case "location":
        return task.getProperty("LOCATION");
      case "status":
        return getToDoStatusString(task);
      case "calendar":
        return task.calendar.name;
      case "duration":
        return this.tree.duration(task);
      case "completed":
      case "priority":
      default:
        return "";
    }
  }

  getCellValue(row, col) {
    const task = this.tree.mTaskArray[row];
    if (!task) {
      return null;
    }
    switch (col.element.getAttribute("itemproperty")) {
      case "percentComplete":
        return task.percentComplete;
    }
    return null;
  }

  setCellValue() {
    return null;
  }

  getImageSrc() {
    return "";
  }

  isEditable() {
    return true;
  }

  /**
   * Called to link the task tree to the tree view.
   * A null argument un-sets/un-links the tree.
   *
   * @param {?XULTreeElement} tree
   */
  setTree(tree) {
    const hasOldTree = this.tree != null;
    if (hasOldTree && !tree) {
      // Balances the addObserver calls from the refresh method in the tree.

      // Remove the composite calendar observer.
      const composite = cal.view.getCompositeCalendar(window);
      composite.removeObserver(this.tree.mTaskTreeObserver);

      // Remove the preference observer.
      const branch = Services.prefs.getBranch("");
      branch.removeObserver("calendar.", this.tree.mPrefObserver);
    }
    this.tree = tree;
  }

  isContainer() {
    return false;
  }
  isContainerOpen() {
    return false;
  }
  isContainerEmpty() {
    return false;
  }

  isSeparator() {
    return false;
  }

  isSorted() {
    return false;
  }

  canDrop() {
    return false;
  }

  drop() {}

  getParentIndex() {
    return -1;
  }

  getLevel() {
    return 0;
  }

  // End nsITreeView Methods and Properties
  // Task Tree Event Handlers

  onSelect() {}

  /**
   * Handle double click events.
   *
   * @param {Event} event - The double click event.
   */
  onDoubleClick(event) {
    // Only handle left mouse button clicks.
    if (event.button != 0) {
      return;
    }
    const initialDate = cal.dtz.getDefaultStartDate(this.tree.getInitialDate());
    const col = {};
    const item = this.getItemFromEvent(event, col);
    if (item) {
      const itemProperty = col.value.element.getAttribute("itemproperty");

      // If itemProperty == "completed" then the user has clicked a "completed" checkbox
      // and `item` holds the checkbox state toggled by the first click. So, to make sure the
      // user notices that the state changed, don't call modifyEventWithDialog.
      if (itemProperty != "completed") {
        modifyEventWithDialog(item, true, initialDate);
      }
    } else {
      createTodoWithDialog(null, null, null, null, initialDate);
    }
  }

  /**
   * Handle key press events.
   *
   * @param {Event} event - The key press event.
   */
  onKeyPress(event) {
    switch (event.key) {
      case "Delete": {
        event.target.triggerNode = this.tree;
        document.getElementById("calendar_delete_todo_command").doCommand();
        event.preventDefault();
        event.stopPropagation();
        break;
      }
      case " ": {
        if (this.tree.currentIndex > -1) {
          const col = this.tree.querySelector("[itemproperty='completed']");
          this.cycleCell(this.tree.currentIndex, { element: col });
        }
        break;
      }
      case "Enter": {
        const index = this.tree.currentIndex;
        if (index > -1) {
          modifyEventWithDialog(this.tree.mTaskArray[index]);
        }
        break;
      }
    }
  }

  /**
   * Set the context menu on mousedown to change it before it is opened.
   *
   * @param {Event} event - The mousedown event.
   */
  onMouseDown(event) {
    if (!this.getItemFromEvent(event)) {
      this.tree.view.selection.invalidateSelection();
    }
  }

  // Private Methods and Attributes

  /**
   * Format a datetime object for display.
   *
   * @param {calIDateTime} dateTime - Datetime, from a calITodo object.
   * @returns {string} a formatted string version of the datetime ("" if invalid).
   */
  _formatDateTime(dateTime) {
    return dateTime && dateTime.isValid
      ? cal.dtz.formatter.formatDateTime(dateTime.getInTimezone(cal.dtz.defaultTimezone))
      : "";
  }
}

ChromeUtils.defineLazyGetter(
  CalendarTaskTreeView,
  "l10n",
  () => new Localization(["calendar/calendar.ftl"], true)
);
