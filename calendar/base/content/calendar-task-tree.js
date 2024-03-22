/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozXULElement, calendarController, invokeEventDragSession, CalendarTaskTreeView,
    calFilter, TodayPane, currentView */

// Wrap in a block to prevent leaking to window scope.
{
  const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
  const { PluralForm } = ChromeUtils.importESModule("resource:///modules/PluralForm.sys.mjs");

  /**
   * An observer for the calendar event data source. This keeps the unifinder
   * display up to date when the calendar event data is changed.
   *
   * @implements {calIObserver}
   * @implements {calICompositeObserver}
   */
  class TaskTreeObserver {
    /**
     * Creates and connects the new observer to a CalendarTaskTree and sets up Query Interface.
     *
     * @param {CalendarTaskTree} taskTree - The tree to observe.
     */
    constructor(taskTree) {
      this.tree = taskTree;
      this.QueryInterface = ChromeUtils.generateQI(["calICompositeObserver", "calIObserver"]);
    }

    // calIObserver Methods

    onStartBatch() {}

    onEndBatch() {}

    onLoad() {
      this.tree.refresh();
    }

    onAddItem(item) {
      if (!this.tree.hasBeenVisible) {
        return;
      }

      if (item.isTodo()) {
        this.tree.mTreeView.addItems(this.tree.mFilter.getOccurrences(item));
      }
    }

    onModifyItem(newItem, oldItem) {
      if (!this.tree.hasBeenVisible) {
        return;
      }

      if (newItem.isTodo() || oldItem.isTodo()) {
        this.tree.mTreeView.modifyItems(
          this.tree.mFilter.getOccurrences(newItem),
          this.tree.mFilter.getOccurrences(oldItem)
        );
        // We also need to notify potential listeners.
        const event = document.createEvent("Events");
        event.initEvent("select", true, false);
        this.tree.dispatchEvent(event);
      }
    }

    onDeleteItem(deletedItem) {
      if (!this.tree.hasBeenVisible) {
        return;
      }

      if (deletedItem.isTodo()) {
        this.tree.mTreeView.removeItems(this.tree.mFilter.getOccurrences(deletedItem));
      }
    }

    onError() {}

    onPropertyChanged(calendar, name, value) {
      switch (name) {
        case "disabled":
          if (value) {
            this.tree.onCalendarRemoved(calendar);
          } else {
            this.tree.onCalendarAdded(calendar);
          }
          break;
      }
    }

    onPropertyDeleting(calendar, name) {
      this.onPropertyChanged(calendar, name, null, null);
    }

    // End calIObserver Methods
    // calICompositeObserver Methods

    onCalendarAdded(calendar) {
      if (!calendar.getProperty("disabled")) {
        this.tree.onCalendarAdded(calendar);
      }
    }

    onCalendarRemoved(calendar) {
      this.tree.onCalendarRemoved(calendar);
    }

    onDefaultCalendarChanged() {}

    // End calICompositeObserver Methods
  }

  /**
   * Custom element for table-style display of tasks (rows and columns).
   *
   * @augments {MozTree}
   */
  class CalendarTaskTree extends customElements.get("tree") {
    connectedCallback() {
      super.connectedCallback();
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;
      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          <treecols>
            <treecol is="treecol-image" id="calendar-task-tree-col-completed"
                     class="calendar-task-tree-col-completed"
                     style="min-width: 18px"
                     fixed="true"
                     cycler="true"
                     sortKey="completedDate"
                     itemproperty="completed"
                     closemenu="none"
                     src="chrome://messenger/skin/icons/new/compact/checkbox.svg"
                     data-l10n-id="calendar-event-listing-column-completed"/>
            <splitter class="tree-splitter"/>
            <treecol is="treecol-image" id="calendar-task-tree-col-priority"
                     class="calendar-task-tree-col-priority"
                     style="min-width: 17px"
                     fixed="true"
                     itemproperty="priority"
                     closemenu="none"
                     src="chrome://messenger/skin/icons/new/compact/priority.svg"
                     data-l10n-id="calendar-event-listing-column-priority"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-title"
                     itemproperty="title"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-title"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-entrydate"
                     itemproperty="entryDate"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-start-date"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-duedate"
                     itemproperty="dueDate"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-due-date"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-duration"
                     itemproperty="duration"
                     sortKey="dueDate"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-time-until-due"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-completeddate"
                     itemproperty="completedDate"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-completed-date"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-percentcomplete"
                     itemproperty="percentComplete"
                     style="flex: 1 auto; min-width: 40px;"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-percent-complete"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-categories"
                     itemproperty="categories"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-category"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-location"
                     itemproperty="location"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-location"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-status"
                     itemproperty="status"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-status"/>
            <splitter class="tree-splitter"/>
            <treecol class="calendar-task-tree-col-calendar"
                     itemproperty="calendar"
                     style="flex: 1 auto"
                     closemenu="none"
                     data-l10n-id="calendar-event-listing-column-calendar-name"/>
          </treecols>
          <treechildren class="calendar-task-treechildren"
                        tooltip="taskTreeTooltip"
                        ondblclick="mTreeView.onDoubleClick(event)"/>
          `
        )
      );

      this.classList.add("calendar-task-tree");
      this.setAttribute("enableColumnDrag", "true");
      this.setAttribute("keepcurrentinview", "true");

      this.addEventListener("select", event => {
        this.mTreeView.onSelect(event);
        if (calendarController.todo_tasktree_focused) {
          calendarController.onSelectionChanged({ detail: this.selectedTasks });
        }
      });

      this.addEventListener("focus", () => {
        this.updateFocus();
      });

      this.addEventListener("blur", () => {
        this.updateFocus();
      });

      this.addEventListener("keypress", event => {
        this.mTreeView.onKeyPress(event);
      });

      this.addEventListener("mousedown", event => {
        this.mTreeView.onMouseDown(event);
      });

      this.addEventListener("dragstart", event => {
        if (event.target.localName != "treechildren") {
          // We should only drag treechildren, not for example the scrollbar.
          return;
        }
        const item = this.mTreeView.getItemFromEvent(event);
        if (!item || item.calendar.readOnly) {
          return;
        }
        invokeEventDragSession(item, event.target);
      });

      this.mTaskArray = [];
      this.mHash2Index = {};
      this.mPendingRefreshJobs = {};
      this.mShowCompletedTasks = true;
      this.mFilter = null;
      this.mStartDate = null;
      this.mEndDate = null;
      this.mDateRangeFilter = null;
      this.mTextFilterField = null;

      this.mTreeView = new CalendarTaskTreeView(this);
      this.mTaskTreeObserver = new TaskTreeObserver(this);

      // Observes and responds to changes to calendar preferences.
      this.mPrefObserver = (subject, topic, prefName) => {
        switch (prefName) {
          case "calendar.date.format":
          case "calendar.timezone.local":
            this.refresh();
            break;
        }
      };

      // Set up the tree filter.
      this.mFilter = new calFilter();
      this.mFilter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;

      this.restoreColumnState();

      window.addEventListener("unload", this.persistColumnState.bind(this));
    }

    get currentTask() {
      const index = this.currentIndex;

      const isSelected = this.view && this.view.selection && this.view.selection.isSelected(index);

      return isSelected ? this.mTaskArray[index] : null;
    }

    get selectedTasks() {
      const tasks = [];
      const start = {};
      const end = {};
      if (!this.mTreeView.selection) {
        return tasks;
      }

      const rangeCount = this.mTreeView.selection.getRangeCount();

      for (let range = 0; range < rangeCount; range++) {
        this.mTreeView.selection.getRangeAt(range, start, end);

        for (let i = start.value; i <= end.value; i++) {
          const task = this.getTaskAtRow(i);
          if (task) {
            tasks.push(this.getTaskAtRow(i));
          }
        }
      }
      return tasks;
    }

    set showCompleted(val) {
      this.mShowCompletedTasks = val;
    }

    get showCompleted() {
      return this.mShowCompletedTasks;
    }

    set textFilterField(val) {
      this.mTextFilterField = val;
    }

    get textFilterField() {
      return this.mTextFilterField;
    }

    /**
     * We want to make several attributes of the calendar-task-tree column elements persist
     * across restarts. Unfortunately there's no reliable way by using the XUL 'persist'
     * attribute on the column elements. So instead we store the data on the calendar-task-tree
     * element before Thunderbird quits (using `persistColumnState`), and then restore the
     * attributes on the columns when Thunderbird starts up again (using `restoreColumnState`).
     *
     * This function reads data from column attributes and sets it on several attributes on the
     * task tree element, which are persisted because they are in the "persist" attribute of
     * the task tree element.
     * (E.g. `persist="visible-columns ordinals widths sort-active sort-direction"`.)
     */
    persistColumnState() {
      const columns = Array.from(this.querySelectorAll("treecol"));
      const widths = columns.map(col => col.getBoundingClientRect().width || 0);
      const ordinals = columns.map(col => col.ordinal);
      const visibleColumns = columns
        .filter(col => !col.hidden)
        .map(col => col.getAttribute("itemproperty"));

      this.setAttribute("widths", widths.join(" "));
      this.setAttribute("ordinals", ordinals.join(" "));
      this.setAttribute("visible-columns", visibleColumns.join(" "));

      const sorted = this.mTreeView.selectedColumn;
      if (sorted) {
        this.setAttribute("sort-active", sorted.getAttribute("itemproperty"));
        this.setAttribute("sort-direction", this.mTreeView.sortDirection);
      } else {
        this.removeAttribute("sort-active");
        this.removeAttribute("sort-direction");
      }
    }

    /**
     * Reads data from several attributes on the calendar-task-tree element and sets it on the
     * attributes of the columns of the tree. Called on Thunderbird startup to persist the
     * state of the columns across restarts. Used with `persistTaskTreeColumnState` function.
     */
    restoreColumnState() {
      const visibleColumns = this.getAttribute("visible-columns")?.split(" ") || [];
      const ordinals = this.getAttribute("ordinals")?.split(" ") || [];
      const widths = this.getAttribute("widths")?.split(" ") || [];
      const sorted = this.getAttribute("sort-active");
      const sortDirection = this.getAttribute("sort-direction") || "ascending";

      this.querySelectorAll("treecol").forEach(col => {
        const itemProperty = col.getAttribute("itemproperty");
        if (visibleColumns.includes(itemProperty)) {
          col.removeAttribute("hidden");
        } else {
          col.setAttribute("hidden", "true");
        }
        if (ordinals.length > 0) {
          col.ordinal = ordinals.shift();
        }
        if (widths.length > 0) {
          col.style.width = Number(widths.shift()) + "px";
        }
        if (sorted && sorted == itemProperty) {
          this.mTreeView.sortDirection = sortDirection;
          this.mTreeView.selectedColumn = col;
        }
      });
      // Update the ordinal positions of splitters to even numbers, so that
      // they are in between columns.
      const splitters = this.getElementsByTagName("splitter");
      for (let i = 0; i < splitters.length; i++) {
        splitters[i].style.MozBoxOrdinalGroup = (i + 1) * 2;
      }
    }

    /**
     * Calculates the text to display in the "Due In" column for the given task,
     * the amount of time between now and when the task is due.
     *
     * @param {object} task - A task object.
     * @returns {string} A formatted string for the "Due In" column for the task.
     */
    duration(task) {
      const noValidDueDate = !(task && task.dueDate && task.dueDate.isValid);
      if (noValidDueDate) {
        return "";
      }

      const isCompleted = task.completedDate && task.completedDate.isValid;
      const dur = task.dueDate.subtractDate(cal.dtz.now());
      if (isCompleted && dur.isNegative) {
        return "";
      }

      const absSeconds = Math.abs(dur.inSeconds);
      const absMinutes = Math.ceil(absSeconds / 60);
      const prefix = dur.isNegative ? "-" : "";

      if (absMinutes >= 1440) {
        // 1 day or more.
        // Convert weeks to days; duration objects look like this (for 6, 7, and 8 days):
        // { weeks: 0, days: 6 }
        // { weeks: 1, days: 0 }
        // { weeks: 0, days: 8 }
        const days = dur.days + dur.weeks * 7;
        return (
          prefix + PluralForm.get(days, cal.l10n.getCalString("dueInDays")).replace("#1", days)
        );
      } else if (absMinutes >= 60) {
        // 1 hour or more.
        return (
          prefix +
          PluralForm.get(dur.hours, cal.l10n.getCalString("dueInHours")).replace("#1", dur.hours)
        );
      }
      // Less than one hour.
      return cal.l10n.getCalString("dueInLessThanOneHour");
    }

    /**
     * Return the task object at a given row.
     *
     * @param {number} row - The index number identifying the row.
     * @returns {object | null} A task object or null if none found.
     */
    getTaskAtRow(row) {
      return row > -1 ? this.mTaskArray[row] : null;
    }

    /**
     * Return the task object related to a given event.
     *
     * @param {Event} event - The event.
     * @returns {?calITodo} the task object related to the event, if any.
     */
    getTaskFromEvent(event) {
      return this.mTreeView.getItemFromEvent(event);
    }

    refreshFromCalendar(calendar) {
      if (!this.hasBeenVisible) {
        return;
      }

      const refreshJob = {
        QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
        tree: this,
        calendar: null,
        items: null,
        operation: null,

        async cancel() {
          if (this.operation) {
            await this.operation.cancel();
            this.operation = null;
            this.items = [];
          }
        },

        async execute() {
          if (calendar.id in this.tree.mPendingRefreshJobs) {
            this.tree.mPendingRefreshJobs[calendar.id].cancel();
          }
          this.calendar = calendar;
          this.items = [];
          this.tree.mPendingRefreshJobs[calendar.id] = this;
          this.operation = cal.iterate.streamValues(this.tree.mFilter.getItems(calendar));

          for await (const items of this.operation) {
            this.items = this.items.concat(items);
          }

          if (!this.tree.mTreeView.tree) {
            // Looks like we've been disconnected from the DOM, there's no point in continuing.
            return;
          }

          if (calendar.id in this.tree.mPendingRefreshJobs) {
            delete this.tree.mPendingRefreshJobs[calendar.id];
          }

          const oldItems = this.tree.mTaskArray.filter(item => item.calendar.id == calendar.id);
          this.tree.mTreeView.modifyItems(this.items, oldItems);
          this.tree.dispatchEvent(new CustomEvent("refresh", { bubbles: false }));
        },
      };

      refreshJob.execute();
    }

    selectAll() {
      if (this.mTreeView.selection) {
        this.mTreeView.selection.selectAll();
      }
    }

    /**
     * Refreshes the display. Called during connectedCallback and by event observers.
     * Sets up the tree view, calendar event observer, and preference observer.
     */
    refresh() {
      // Only set the view if it's not already mTreeView, otherwise things get confused.
      if (this.view?.wrappedJSObject != this.mTreeView) {
        this.view = this.mTreeView;
      }

      cal.view.getCompositeCalendar(window).addObserver(this.mTaskTreeObserver);

      Services.prefs.getBranch("").addObserver("calendar.", this.mPrefObserver);

      const cals = cal.view.getCompositeCalendar(window).getCalendars() || [];
      const enabledCals = cals.filter(calendar => !calendar.getProperty("disabled"));

      enabledCals.forEach(calendar => this.refreshFromCalendar(calendar));
    }

    onCalendarAdded(calendar) {
      if (!calendar.getProperty("disabled")) {
        this.refreshFromCalendar(calendar);
      }
    }

    onCalendarRemoved(calendar) {
      const tasks = this.mTaskArray.filter(task => task.calendar.id == calendar.id);
      this.mTreeView.removeItems(tasks);
    }

    sortItems() {
      if (this.mTreeView.selectedColumn) {
        const column = this.mTreeView.selectedColumn;
        const modifier = this.mTreeView.sortDirection == "descending" ? -1 : 1;
        const sortKey = column.getAttribute("sortKey") || column.getAttribute("itemproperty");

        cal.unifinder.sortItems(this.mTaskArray, sortKey, modifier);
      }

      this.recreateHashTable();
    }

    recreateHashTable() {
      this.mHash2Index = this.mTaskArray.reduce((hash2Index, task, i) => {
        hash2Index[task.hashId] = i;
        return hash2Index;
      }, {});

      if (this.mTreeView.tree) {
        this.mTreeView.tree.invalidate();
      }
    }

    getInitialDate() {
      return currentView().selectedDay || cal.dtz.now();
    }

    doUpdateFilter(filter) {
      let needsRefresh = false;
      const oldStart = this.mFilter.mStartDate;
      const oldEnd = this.mFilter.mEndDate;
      const filterText = this.mFilter.filterText || "";

      if (filter) {
        const props = this.mFilter.filterProperties;
        this.mFilter.applyFilter(filter);
        needsRefresh = !props || !props.equals(this.mFilter.filterProperties);
      } else {
        this.mFilter.updateFilterDates();
      }

      if (this.mTextFilterField) {
        const field = document.getElementById(this.mTextFilterField);
        if (field) {
          this.mFilter.filterText = field.value;
          needsRefresh =
            needsRefresh || filterText.toLowerCase() != this.mFilter.filterText.toLowerCase();
        }
      }

      // We only need to refresh the tree if the filter properties or date range changed.
      const start = this.mFilter.startDate;
      const end = this.mFilter.mEndDate;

      const sameStartDates = start && oldStart && oldStart.compare(start) == 0;
      const sameEndDates = end && oldEnd && oldEnd.compare(end) == 0;

      if (
        needsRefresh ||
        ((start || oldStart) && !sameStartDates) ||
        ((end || oldEnd) && !sameEndDates)
      ) {
        this.refresh();
      }
    }

    updateFilter(filter) {
      this.doUpdateFilter(filter);
    }

    updateFocus() {
      let menuOpen = false;

      // We need to consider the tree focused if the context menu is open.
      if (this.hasAttribute("context")) {
        const context = document.getElementById(this.getAttribute("context"));
        if (context && context.state) {
          menuOpen = context.state == "open" || context.state == "showing";
        }
      }

      const focused = document.activeElement == this || menuOpen;

      calendarController.onSelectionChanged({ detail: focused ? this.selectedTasks : [] });
      calendarController.todo_tasktree_focused = focused;
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      this.persistColumnState();
      this.mTreeView = null;
    }
  }

  customElements.define("calendar-task-tree", CalendarTaskTree, { extends: "tree" });

  /**
   * Custom element for the task tree that appears in the todaypane.
   */
  class CalendarTaskTreeTodaypane extends CalendarTaskTree {
    getInitialDate() {
      return TodayPane.start || cal.dtz.now();
    }
    updateFilter(filter) {
      this.mFilter.selectedDate = this.getInitialDate();
      this.doUpdateFilter(filter);
    }
  }

  customElements.define("calendar-task-tree-todaypane", CalendarTaskTreeTodaypane, {
    extends: "tree",
  });
}
