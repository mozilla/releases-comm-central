/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global cal, calendarNavigationBar, CalendarFilteredViewMixin, calFilterProperties, currentView,
     gCurrentMode, MozElements, MozXULElement, Services, toggleOrientation */

/* eslint-enable valid-jsdoc */

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

      const isChecked = id => document.getElementById(id).getAttribute("checked") == "true";

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

      window.addEventListener("viewresize", () => {
        if (gCurrentMode == "calendar" && this.isVisible()) {
          this.onResize();
        }
      });
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
}
