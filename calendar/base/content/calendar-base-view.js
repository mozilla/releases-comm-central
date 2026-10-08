/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global cal, calendarNavigationBar, CalendarFilteredViewMixin, calFilterProperties, currentView,
     gCurrentMode, MozElements, MozXULElement, Services, toggleOrientation */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * Calendar observer for calendar view elements. Used in CalendarBaseView class.
   *
   * @implements {calIObserver}
   * @implements {calICompositeObserver}
   * @implements {calIAlarmServiceObserver}
   */
  class CalendarViewObserver {
    /**
     * Constructor for CalendarViewObserver.
     *
     * @param {CalendarBaseView} calendarView - A calendar view.
     */
    constructor(calendarView) {
      this.calView = calendarView.calICalendarView;
    }

    QueryInterface = ChromeUtils.generateQI(["calIAlarmServiceObserver"]);

    // calIAlarmServiceObserver

    onAlarm(alarmItem) {
      this.calView.flashAlarm(alarmItem, false);
    }

    onNotification() {}

    onRemoveAlarmsByItem(item) {
      // Stop the flashing for the item.
      this.calView.flashAlarm(item, true);
    }

    onRemoveAlarmsByCalendar(calendar) {
      // Stop the flashing for all items of this calendar.
      for (const key in this.calView.mFlashingEvents) {
        const item = this.calView.mFlashingEvents[key];
        if (item.calendar.id == calendar.id) {
          this.calView.flashAlarm(item, true);
        }
      }
    }

    onAlarmsLoaded() {}

    // End calIAlarmServiceObserver
  }

  /**
   * Abstract base class for calendar view elements (day, week, multiweek, month).
   *
   * @implements {calICalendarView}
   * @abstract
   */
  class CalendarBaseView extends CalendarFilteredViewMixin(MozXULElement) {
    /**
     * Whether the view has been initialized.
     *
     * @type {boolean}
     */
    #isInitialized = false;

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      // For some unknown reason, `console.createInstance` isn't available when
      // `ensureInitialized` runs.
      this.mLog = console.createInstance({
        prefix: `calendar.baseview (${this.constructor.name})`,
        maxLogLevel: "Warn",
        maxLogLevelPref: "calendar.baseview.loglevel",
      });

      this.mSelectedItems = [];
    }

    ensureInitialized() {
      if (this.#isInitialized) {
        return;
      }
      this.#isInitialized = true;
      Glean.calendar.viewInitialized[this.id].add(1);

      this.weekStartOffset = Services.prefs.getIntPref("calendar.week.start");
      this.calICalendarView = this.getCustomInterfaceCallback(Ci.calICalendarView);

      this.addEventListener("move", event => {
        this.moveView(event.detail);
      });

      this.addEventListener("keypress", event => {
        switch (event.key) {
          case "PageUp":
            this.moveView(-1);
            break;
          case "PageDown":
            this.moveView(1);
            break;
        }
      });

      this.addEventListener("wheel", event => {
        const pixelThreshold = 150;

        if (event.shiftKey && Services.prefs.getBoolPref("calendar.view.mousescroll", true)) {
          let deltaView = 0;
          if (event.deltaMode == event.DOM_DELTA_LINE) {
            if (event.deltaY != 0) {
              deltaView = event.deltaY < 0 ? -1 : 1;
            }
          } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
            this.mPixelScrollDelta += event.deltaY;
            if (this.mPixelScrollDelta > pixelThreshold) {
              deltaView = 1;
              this.mPixelScrollDelta = 0;
            } else if (this.mPixelScrollDelta < -pixelThreshold) {
              deltaView = -1;
              this.mPixelScrollDelta = 0;
            }
          }

          if (deltaView != 0) {
            this.moveView(deltaView);
          }
          event.preventDefault();
        }
      });

      this.addEventListener("MozRotateGesture", event => {
        // Threshold for the minimum and maximum angle we should accept
        // rotation for. 90 degrees minimum is most logical, but 45 degrees
        // allows you to rotate with one hand.
        const MIN_ROTATE_ANGLE = 45;
        const MAX_ROTATE_ANGLE = 180;

        const absval = Math.abs(event.delta);
        if (this.supportsRotation && absval >= MIN_ROTATE_ANGLE && absval < MAX_ROTATE_ANGLE) {
          toggleOrientation();
          event.preventDefault();
        }
      });

      this.addEventListener("MozMagnifyGestureStart", () => {
        this.mMagnifyAmount = 0;
      });

      this.addEventListener("MozMagnifyGestureUpdate", event => {
        // Threshold as to how much magnification causes the zoom to happen.
        const THRESHOLD = 30;

        if (this.supportsZoom) {
          this.mMagnifyAmount += event.delta;

          if (this.mMagnifyAmount > THRESHOLD) {
            this.zoomOut();
            this.mMagnifyAmount = 0;
          } else if (this.mMagnifyAmount < -THRESHOLD) {
            this.zoomIn();
            this.mMagnifyAmount = 0;
          }
          event.preventDefault();
        }
      });

      this.addEventListener("MozSwipeGesture", event => {
        if (
          (event.direction == SimpleGestureEvent.DIRECTION_UP && !this.rotated) ||
          (event.direction == SimpleGestureEvent.DIRECTION_LEFT && this.rotated)
        ) {
          this.moveView(-1);
        } else if (
          (event.direction == SimpleGestureEvent.DIRECTION_DOWN && !this.rotated) ||
          (event.direction == SimpleGestureEvent.DIRECTION_RIGHT && this.rotated)
        ) {
          this.moveView(1);
        }
      });

      this.mRangeStartDate = null;
      this.mRangeEndDate = null;

      this.mWorkdaysOnly = false;

      this.mController = null;

      this.mStartDate = null;
      this.mEndDate = null;

      this.mTasksInView = false;
      this.mShowCompleted = false;

      this.mDisplayDaysOff = true;
      this.mDaysOffArray = [0, 6];

      this.mTimezone = null;
      this.mFlashingEvents = {};

      this.mDropShadowsLength = null;

      this.mShadowOffset = null;
      this.mDropShadows = null;

      this.mMagnifyAmount = 0;
      this.mPixelScrollDelta = 0;

      this.mViewStart = null;
      this.mViewEnd = null;

      this.mToggleStatus = 0;

      this.mToggleStatusFlag = {
        WorkdaysOnly: 1,
        TasksInView: 2,
        ShowCompleted: 4,
      };

      this.mTimezoneObserver = {
        observe: () => {
          this.timezone = cal.dtz.defaultTimezone;
          this.refreshView();

          this.updateTimeIndicatorPosition();
        },
      };

      this.mPrefObserver = {
        calView: this.calICalendarView,

        observe(subj, topic, pref) {
          this.calView.handlePreference(subj, topic, pref);
        },
      };

      this.mObserver = new CalendarViewObserver(this);

      const isChecked = id => document.getElementById(id).hasAttribute("checked");

      this.workdaysOnly = isChecked("calendar_toggle_workdays_only_command");
      this.tasksInView = isChecked("calendar_toggle_tasks_in_view_command");
      this.rotated = isChecked("calendar_toggle_orientation_command");
      this.showCompleted = isChecked("calendar_toggle_show_completed_in_view_command");

      this.mTimezone = cal.dtz.defaultTimezone;
      const alarmService = Cc["@mozilla.org/calendar/alarm-service;1"].getService(
        Ci.calIAlarmService
      );

      alarmService.addObserver(this.mObserver);

      this.setAttribute("type", this.type);

      const resizeObserver = new ResizeObserver(entries => {
        // If this view is visible in the last entry, resize.
        const size = entries.at(-1).contentBoxSize[0];
        if (size.blockSize && size.inlineSize) {
          this.onResize();
        }
      });
      resizeObserver.observe(this);
      window.addEventListener("uifontsizechange", () => {
        this.onFontSizeChange();
      });

      // Add a preference observer to monitor changes.
      Services.prefs.addObserver("calendar.", this.mPrefObserver);
      Services.obs.addObserver(this.mTimezoneObserver, "defaultTimezoneChanged");

      this.updateDaysOffPrefs();
      this.updateTimeIndicatorPosition();

      // Remove observers on window unload.
      window.addEventListener(
        "unload",
        () => {
          alarmService.removeObserver(this.mObserver);

          Services.prefs.removeObserver("calendar.", this.mPrefObserver);
          Services.obs.removeObserver(this.mTimezoneObserver, "defaultTimezoneChanged");
        },
        { once: true }
      );
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     */
    onResize() {
      // Child classes should provide the implementation.
      throw new Error(this.constructor.name + ".onResize not implemented");
    }

    /**
     * Called when the font size of the UI changes. Triggers a resize if the
     * view is active.
     */
    onFontSizeChange() {
      if (gCurrentMode == "calendar" && this.isVisible()) {
        this.onResize();
      }
    }

    /**
     * Whether the view has been initialized.
     *
     * @returns {boolean} - True if the view has been initialized, otherwise
     * false.
     */
    get isInitialized() {
      return this.#isInitialized;
    }

    get type() {
      const typelist = this.id.split("-");
      return typelist[0];
    }

    set rotated(rotated) {
      this.setAttribute("orient", rotated ? "horizontal" : "vertical");
      this.toggleAttribute("rotated", rotated);
    }

    get rotated() {
      return this.getAttribute("orient") == "horizontal";
    }

    get supportsRotation() {
      return false;
    }

    set displayDaysOff(displayDaysOff) {
      this.mDisplayDaysOff = displayDaysOff;
    }

    get displayDaysOff() {
      return this.mDisplayDaysOff;
    }

    set controller(controller) {
      this.mController = controller;
    }

    get controller() {
      return this.mController;
    }

    set daysOffArray(daysOffArray) {
      this.mDaysOffArray = daysOffArray;
    }

    get daysOffArray() {
      return this.mDaysOffArray;
    }

    set tasksInView(tasksInView) {
      this.mTasksInView = tasksInView;
      this.updateItemType();
    }

    get tasksInView() {
      return this.mTasksInView;
    }

    set showCompleted(showCompleted) {
      this.mShowCompleted = showCompleted;
      this.updateItemType();
    }

    get showCompleted() {
      return this.mShowCompleted;
    }

    set timezone(timezone) {
      this.mTimezone = timezone;
    }

    get timezone() {
      return this.mTimezone;
    }

    set workdaysOnly(workdaysOnly) {
      this.mWorkdaysOnly = workdaysOnly;
    }

    get workdaysOnly() {
      return this.mWorkdaysOnly;
    }

    get supportsWorkdaysOnly() {
      return true;
    }

    get supportsZoom() {
      return false;
    }

    get selectionObserver() {
      return this.mSelectionObserver;
    }

    get startDay() {
      return this.startDate;
    }

    get endDay() {
      return this.endDate;
    }

    get supportDisjointDates() {
      return false;
    }

    get hasDisjointDates() {
      return false;
    }

    set rangeStartDate(startDate) {
      this.mRangeStartDate = startDate;
    }

    get rangeStartDate() {
      return this.mRangeStartDate;
    }

    set rangeEndDate(endDate) {
      this.mRangeEndDate = endDate;
    }

    get rangeEndDate() {
      return this.mRangeEndDate;
    }

    get observerID() {
      return "base-view-observer";
    }

    // The end date that should be used for getItems and similar queries.
    get queryEndDate() {
      if (!this.endDate) {
        return null;
      }
      const end = this.endDate.clone();
      end.day += 1;
      end.isDate = true;
      return end;
    }

    /**
     * Return a date object representing the current day.
     *
     * @returns {calIDateTime} A date object.
     */
    today() {
      const date = cal.dtz.jsDateToDateTime(new Date()).getInTimezone(this.mTimezone);
      date.isDate = true;
      return date;
    }

    /**
     * Return whether this view is currently active and visible in the UI.
     *
     * @returns {boolean}
     */
    isVisible() {
      return this == currentView();
    }

    /**
     * Set the view's item type based on the `tasksInView` and `showCompleted` properties.
     */
    updateItemType() {
      if (!this.mTasksInView) {
        this.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
        return;
      }

      let type = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
      type |= this.mShowCompleted
        ? Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL
        : Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
      this.itemType = type;
    }

    // CalendarFilteredViewMixin implementation (clearItems and removeItemsFromCalendar
    // are implemented in subclasses).

    addItems(items) {
      for (const item of items) {
        this.doAddItem(item);
      }
    }

    removeItems(items) {
      for (const item of items) {
        this.doRemoveItem(item);
      }
    }

    // End of CalendarFilteredViewMixin implementation.

    /**
     * Create and fire an event.
     *
     * @param {string} eventName - Name of the event.
     * @param {object} eventDetail - The details to add to the event.
     */
    fireEvent(eventName, eventDetail) {
      this.dispatchEvent(
        new CustomEvent(eventName, { bubbles: true, cancelable: false, detail: eventDetail })
      );
    }

    /**
     * A preference handler typically called by a preferences observer when a preference
     * changes. Handles common preferences while other preferences are handled in subclasses.
     *
     * @param {object} subject - A subject, a prefs object.
     * @param {string} topic - A topic.
     * @param {string} preference - A preference that has changed.
     */
    handleCommonPreference(subject, topic, preference) {
      switch (preference) {
        case "calendar.week.d0sundaysoff":
        case "calendar.week.d1mondaysoff":
        case "calendar.week.d2tuesdaysoff":
        case "calendar.week.d3wednesdaysoff":
        case "calendar.week.d4thursdaysoff":
        case "calendar.week.d5fridaysoff":
        case "calendar.week.d6saturdaysoff":
          this.updateDaysOffPrefs();
          break;
        case "calendar.week.start":
          this.weekStartOffset = Services.prefs.getIntPref("calendar.week.start");
          break;
        case "calendar.alarms.indicator.show":
        case "calendar.date.format":
        case "calendar.view.showLocation":
          // Break here to ensure the view is refreshed.
          break;
        default:
          return;
      }
      this.refreshView();
    }

    /**
     * Check preferences and update which days are days off.
     */
    updateDaysOffPrefs() {
      const prefix = "calendar.week.";
      const daysOffPrefs = [
        [0, "d0sundaysoff", "true"],
        [1, "d1mondaysoff", "false"],
        [2, "d2tuesdaysoff", "false"],
        [3, "d3wednesdaysoff", "false"],
        [4, "d4thursdaysoff", "false"],
        [5, "d5fridaysoff", "false"],
        [6, "d6saturdaysoff", "true"],
      ];
      const filterDaysOff = ([, name, defaultValue]) =>
        Services.prefs.getBoolPref(prefix + name, defaultValue);

      this.daysOffArray = daysOffPrefs.filter(filterDaysOff).map(pref => pref[0]);
    }

    /**
     * Adjust the position of this view's indicator of the current time, if any.
     */
    updateTimeIndicatorPosition() {}

    /**
     * Refresh the view.
     */
    refreshView() {
      if (!this.startDay || !this.endDay) {
        // Don't refresh if we're not initialized.
        return;
      }
      this.goToDay(this.selectedDay);
    }

    handlePreference() {
      // Do nothing by default.
    }

    flashAlarm() {
      // Do nothing by default.
    }

    // calICalendarView Methods

    /**
     * NOTE: This is overridden in each of the built-in calendar views.
     * It's only left here in case some extension is relying on it.
     */
    goToDay(date) {
      this.showDate(date);
    }

    getRangeDescription() {
      return cal.dtz.formatter.formatInterval(this.rangeStartDate, this.rangeEndDate);
    }

    removeDropShadows() {
      this.querySelectorAll("[dropbox='true']").forEach(dbox => {
        dbox.setAttribute("dropbox", "false");
      });
    }

    setDateRange(startDate, endDate) {
      calendarNavigationBar.setDateRange(startDate, endDate);
    }

    getSelectedItems() {
      return this.mSelectedItems;
    }

    setSelectedItems(items) {
      this.mSelectedItems = items.concat([]);
      return this.mSelectedItems;
    }

    getDateList() {
      const start = this.startDate.clone();
      const dateList = [];
      while (start.compare(this.endDate) <= 0) {
        dateList.push(start);
        start.day++;
      }
      return dateList;
    }

    zoomIn() {}

    zoomOut() {}

    zoomReset() {}

    // End calICalendarView Methods
  }

  MozXULElement.implementCustomInterface(CalendarBaseView, [Ci.calICalendarView]);

  MozElements.CalendarBaseView = CalendarBaseView;

  /**
   * A sorted, scrollable list of the calendar items of a day. Only a limited
   * number of items are rendered at first, followed by a link to render more,
   * so that days with a very large number of items stay usable.
   */
  class CalendarItemList {
    /**
     * The number of items rendered at first, and each time the user asks for
     * more.
     *
     * @type {integer}
     */
    static BATCH_SIZE = 50;

    /**
     * All the items, sorted in display order.
     *
     * @type {calIItemBase[]}
     */
    #items = [];

    /** @type {Set<string>} */
    #itemIds = new Set();

    /**
     * The rendered item boxes, keyed by item hashId. Only the first
     * #renderLimit items are rendered.
     *
     * @type {Map<string, Element>}
     */
    boxes = new Map();

    #renderLimit = CalendarItemList.BATCH_SIZE;
    #listItemClass;
    #createItemBox;

    /**
     * @param {object} options
     * @param {string} options.scrollClass - Class of the scrollable element.
     * @param {string} options.listClass - Class of the list element.
     * @param {string} options.listItemClass - Class of each list item.
     * @param {function(calIItemBase, Element):Element} options.createItemBox -
     *   Creates the box displaying an item, appends it to the given list item,
     *   which is already in the document, and returns it.
     */
    constructor({ scrollClass, listClass, listItemClass, createItemBox }) {
      this.#listItemClass = listItemClass;
      this.#createItemBox = createItemBox;

      this.list = document.createElement("ol");
      this.list.classList.add(listClass);
      this.list.setAttribute("role", "listbox");

      this.moreButton = document.createElement("button");
      this.moreButton.classList.add("button", "link-button", "calendar-item-list-more-button");
      this.moreButton.hidden = true;
      this.moreButton.addEventListener("click", event => {
        event.stopPropagation();
        const firstNewItem = this.#items[this.#renderLimit];
        this.showMoreItems();
        // The link may now be hidden, and is below the new items anyway.
        this.boxes.get(firstNewItem?.hashId)?.focus();
      });
      this.moreButton.addEventListener("dblclick", event => event.stopPropagation());

      // The link is kept out of the list, so that the listbox only contains
      // items.
      this.element = document.createElement("div");
      this.element.classList.add(scrollClass);
      this.element.append(this.list, this.moreButton);
    }

    /**
     * All the items, including those not rendered, sorted in display order.
     * Do not modify.
     *
     * @type {calIItemBase[]}
     */
    get items() {
      return this.#items;
    }

    /**
     * Add an item, or replace the item with the same hashId.
     *
     * @param {calIItemBase} item
     * @returns {?Element} The box displaying the item, or null if the item is
     *   not rendered.
     */
    addItem(item) {
      if (this.#itemIds.has(item.hashId)) {
        this.removeItem(item);
      }

      const index = Math.max(cal.data.binarySearch(this.#items, item, cal.view.compareItems), 0);
      this.#items.splice(index, 0, item);
      this.#itemIds.add(item.hashId);

      let box = null;
      if (index < this.#renderLimit) {
        box = this.#renderItem(index);
        const pushedOut = this.#items[this.#renderLimit];
        if (pushedOut) {
          this.#unrenderItem(pushedOut);
        }
      }
      this.#updateMoreButton();
      return box;
    }

    /**
     * @param {calIItemBase} item
     */
    removeItem(item) {
      if (!this.#itemIds.has(item.hashId)) {
        return;
      }
      const index = this.#items.findIndex(i => i.hashId == item.hashId);
      this.#items.splice(index, 1);
      this.#itemIds.delete(item.hashId);
      if (this.boxes.has(item.hashId)) {
        this.#unrenderItem(item);
        this.#renderItems();
      }
      this.#updateMoreButton();
    }

    /**
     * Remove all items for a given calendar.
     *
     * @param {string} calendarId
     */
    removeItemsFromCalendar(calendarId) {
      const remaining = [];
      for (const item of this.#items) {
        if (item.calendar.id == calendarId) {
          this.#itemIds.delete(item.hashId);
          this.#unrenderItem(item);
        } else {
          remaining.push(item);
        }
      }
      this.#items = remaining;
      this.#renderItems();
      this.#updateMoreButton();
    }

    clear() {
      this.#items = [];
      this.#itemIds.clear();
      this.boxes.clear();
      this.#renderLimit = CalendarItemList.BATCH_SIZE;
      this.list.replaceChildren();
      this.#updateMoreButton();
    }

    /**
     * Make sure an item is rendered, rendering as many more batches as needed.
     *
     * @param {calIItemBase} item
     * @returns {?Element} The box displaying the item, or null if the item is
     *   not in the list.
     */
    showItem(item) {
      if (!this.#itemIds.has(item.hashId)) {
        return null;
      }
      const index = this.#items.findIndex(i => i.hashId == item.hashId);
      if (index >= this.#renderLimit) {
        const batchSize = CalendarItemList.BATCH_SIZE;
        this.#renderLimit = (Math.floor(index / batchSize) + 1) * batchSize;
        this.#renderItems();
        this.#updateMoreButton();
      }
      return this.boxes.get(item.hashId);
    }

    /**
     * Render the next batch of items that did not fit within the render limit.
     */
    showMoreItems() {
      this.#renderLimit += CalendarItemList.BATCH_SIZE;
      this.#renderItems();
      this.#updateMoreButton();
    }

    /**
     * Create the box for the item at the given index. The item after it must
     * already be rendered, unless there is none or it is past the render limit.
     *
     * @param {integer} index
     * @returns {Element}
     */
    #renderItem(index) {
      const item = this.#items[index];
      const listItem = document.createElement("li");
      listItem.classList.add(this.#listItemClass);
      listItem.setAttribute("role", "presentation");
      const nextItem = this.#items[index + 1];
      const nextBox = nextItem && this.boxes.get(nextItem.hashId);
      this.list.insertBefore(listItem, nextBox ? nextBox.parentNode : null);

      const box = this.#createItemBox(item, listItem);
      this.boxes.set(item.hashId, box);
      return box;
    }

    /**
     * @param {calIItemBase} item
     */
    #unrenderItem(item) {
      const box = this.boxes.get(item.hashId);
      if (box) {
        box.parentNode.remove();
        this.boxes.delete(item.hashId);
      }
    }

    /**
     * Render any items within the render limit that are not rendered yet.
     */
    #renderItems() {
      // Go backwards so that the item after each rendered one already has a box.
      for (let i = Math.min(this.#items.length, this.#renderLimit) - 1; i >= 0; i--) {
        if (!this.boxes.has(this.#items[i].hashId)) {
          this.#renderItem(i);
        }
      }
    }

    #updateMoreButton() {
      const hiddenCount = this.#items.length - this.#renderLimit;
      this.moreButton.hidden = hiddenCount <= 0;
      if (hiddenCount > 0) {
        document.l10n.setAttributes(this.moreButton, "calendar-view-more-items", {
          count: hiddenCount,
        });
      }
    }
  }

  MozElements.CalendarItemList = CalendarItemList;
}
