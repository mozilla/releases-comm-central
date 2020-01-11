/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global calendarNavigationBar, MozElements, MozXULElement, Services, timeIndicator */

"use strict";

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * Abstract base class that is used for the month and multiweek calendar view custom elements.
   *
   * @implements {calICalendarView}
   * @extends {MozElements.CalendarBaseView}
   * @abstract
   */
  class CalendarMonthBaseView extends MozElements.CalendarBaseView {
    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true in super.connectedCallback.
      super.connectedCallback();

      const row = `
        <html:tr class="calendar-month-view-grid-row">
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
          <html:td>
            <calendar-month-day-box/>
          </html:td>
        </html:tr>
        `;

      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <vbox class="mainbox"
                flex="1">
            <hbox class="labeldaybox labeldaybox-container"
                  equalsize="always"/>
            <html:table class="monthgrid">
              ${row}
              ${row}
              ${row}
              ${row}
              ${row}
              ${row}
            </html:table>
          </vbox>
        `)
      );

      this.addEventListener("wheel", event => {
        const pixelThreshold = 150;
        const scrollEnabled = Services.prefs.getBoolPref("calendar.view.mousescroll", true);
        if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey && scrollEnabled) {
          // In the month view, the only thing that can be scrolled
          // is the month the user is in. calendar-base-view takes care of
          // the shift key, so only move the view when no modifier is pressed.
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
        }
      });

      this.mDateBoxes = null;
      this.mSelectedDayBox = null;

      this.mShowFullMonth = true;
      this.mShowWeekNumber = true;

      this.mShowDaysOutsideMonth = true;
      this.mClickedTime = null;

      // Set the preference for the default start of the week.
      this.weekStartOffset = Services.prefs.getIntPref("calendar.week.start", 0);

      for (let i = 0; i < 7; i++) {
        const hdr = document.createXULElement("calendar-day-label");
        this.labeldaybox.appendChild(hdr);
        hdr.weekDay = (i + this.mWeekStartOffset) % 7;
        hdr.shortWeekNames = false;
      }

      // Set the preference for displaying the week number.
      this.mShowWeekNumber = Services.prefs.getBoolPref(
        "calendar.view-minimonth.showWeekNumber",
        true
      );
    }

    // calICalendarView Properties

    get supportsDisjointDates() {
      return false;
    }

    get hasDisjointDates() {
      return false;
    }

    get startDate() {
      return this.mStartDate;
    }

    get endDate() {
      return this.mEndDate;
    }

    set selectedDay(day) {
      if (this.mSelectedDayBox) {
        this.mSelectedDayBox.selected = false;
      }

      let realDay = day;
      if (!realDay.isDate) {
        realDay = day.clone();
        realDay.isDate = true;
      }
      const box = this.findDayBoxForDate(realDay);
      if (box) {
        box.selected = true;
        this.mSelectedDayBox = box;
      }
      this.fireEvent("dayselect", realDay);
      return day;
    }

    get selectedDay() {
      if (this.mSelectedDayBox) {
        return this.mSelectedDayBox.date.clone();
      }

      return null;
    }

    // End calICalendarView Properties

    set selectedDateTime(dateTime) {
      this.mClickedTime = dateTime;
    }

    get selectedDateTime() {
      return cal.dtz.getDefaultStartDate(this.selectedDay);
    }

    set showFullMonth(showFullMonth) {
      this.mShowFullMonth = showFullMonth;
      return showFullMonth;
    }

    get showFullMonth() {
      return this.mShowFullMonth;
    }

    // This property may be overridden by subclasses if needed.
    set weeksInView(weeksInView) {
      return weeksInView;
    }

    get weeksInView() {
      return 0;
    }

    // Whether to show days outside of the current month.
    set showDaysOutsideMonth(showDays) {
      if (this.mShowDaysOutsideMonth != showDays) {
        this.mShowDaysOutsideMonth = showDays;
        this.refresh();
      }
      return showDays;
    }

    get showDaysOutsideMonth() {
      return this.mShowDaysOutsideMonth;
    }

    get monthgrid() {
      return this.querySelector(".monthgrid");
    }

    // calICalendarView Methods

    setSelectedItems(items, suppressEvent) {
      if (this.mSelectedItems.length) {
        for (const item of this.mSelectedItems) {
          const oldboxes = this.findDayBoxesForItem(item);
          for (const oldbox of oldboxes) {
            oldbox.unselectItem(item);
          }
        }
      }

      this.mSelectedItems = items || [];

      if (this.mSelectedItems.length) {
        for (const item of this.mSelectedItems) {
          const newboxes = this.findDayBoxesForItem(item);
          for (const newbox of newboxes) {
            newbox.selectItem(item);
          }
        }
      }

      if (!suppressEvent) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    centerSelectedItems() {}

    showDate(date) {
      if (date) {
        this.setDateRange(date.startOfMonth, date.endOfMonth);
        this.selectedDay = date;
      } else {
        // Refresh the selected day if it doesn't appear in the view.
        this.refresh();
      }
    }

    setDateRange(startDate, endDate) {
      this.rangeStartDate = startDate;
      this.rangeEndDate = endDate;

      const viewStart = cal
        .getWeekInfoService()
        .getStartOfWeek(startDate.getInTimezone(this.mTimezone));

      const viewEnd = cal.getWeekInfoService().getEndOfWeek(endDate.getInTimezone(this.mTimezone));

      viewStart.isDate = true;
      viewStart.makeImmutable();
      viewEnd.isDate = true;
      viewEnd.makeImmutable();

      this.mStartDate = viewStart;
      this.mEndDate = viewEnd;

      // Check values of tasksInView, workdaysOnly, showCompleted.
      // See setDateRange comment in calendar-multiday-base-view.js.
      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      // Update the navigation bar only when changes are related to the current view.
      if (this.isVisible()) {
        calendarNavigationBar.setDateRange(startDate, endDate);
      }

      // Check whether view range has been changed since last call to relayout().
      if (
        !this.mViewStart ||
        !this.mViewEnd ||
        this.mViewEnd.compare(viewEnd) != 0 ||
        this.mViewStart.compare(viewStart) != 0 ||
        this.mToggleStatus != toggleStatus
      ) {
        this.refresh();
      }
    }

    getDateList() {
      if (!this.mStartDate || !this.mEndDate) {
        return [];
      }

      const results = [];
      const curDate = this.mStartDate.clone();
      curDate.isDate = true;

      while (curDate.compare(this.mEndDate) <= 0) {
        results.push(curDate.clone());
        curDate.day += 1;
      }
      return results;
    }

    // End calICalendarView Methods

    /**
     * Set an attribute on the view element, and do re-layout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsRelayout = attr == "context" || attr == "item-context";

      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Handle preference changes. Typically called by a preference observer.
     *
     * @param {Object} subject       The subject, a prefs object.
     * @param {string} topic         The notification topic.
     * @param {string} preference    The preference to handle.
     */
    handlePreference(subject, topic, preference) {
      subject.QueryInterface(Ci.nsIPrefBranch);

      switch (preference) {
        case "calendar.previousweeks.inview":
          this.updateDaysOffPrefs();
          this.refreshView();
          break;

        case "calendar.week.start":
          this.weekStartOffset = subject.getIntPref(preference);
          // Refresh the view so the settings take effect.
          this.refreshView();
          break;

        case "calendar.weeks.inview":
          this.weeksInView = subject.getIntPref(preference);
          break;

        case "calendar.view-minimonth.showWeekNumber":
          this.mShowWeekNumber = subject.getBoolPref(preference);
          if (this.mShowWeekNumber) {
            this.refreshView();
          } else {
            this.hideWeekNumbers();
          }
          break;

        default:
          this.handleCommonPreference(subject, topic, preference);
          break;
      }
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     *
     * @param {Element} viewElement    A calendar view element (calICalendarView).
     */
    onResize(viewElement) {
      viewElement.adjustWeekdayLength();
      // Delete the timer for the time indicator in day/week view.
      timeIndicator.cancel();
    }

    /**
     * Re-render the view.
     */
    relayout() {
      // Adjust headers based on the starting day of the week, if necessary.
      if (this.labeldaybox.firstElementChild.weekDay != this.weekStartOffset) {
        for (let i = 0; i < this.labeldaybox.children.length; i++) {
          this.labeldaybox.children[i].weekDay = (i + this.weekStartOffset) % 7;
        }
      }

      if (this.mSelectedItems.length) {
        this.mSelectedItems = [];
      }

      if (!this.mStartDate || !this.mEndDate) {
        throw Cr.NS_ERROR_FAILURE;
      }

      // Days that are not in the main month on display are displayed with
      // a gray background.  Unless the month actually starts on a Sunday,
      // this means that mStartDate.month is 1 month less than the main month.
      let mainMonth = this.mStartDate.month;
      if (this.mStartDate.day != 1) {
        mainMonth++;
        mainMonth = mainMonth % 12;
      }

      const dateBoxes = [];
      const today = this.today();

      // This gets set to true, telling us to collapse the rest of the rows.
      let finished = false;
      const dateList = this.getDateList();

      // This allows finding the first column of dayboxes where to set the
      // week labels, taking into account whether days-off are displayed or not.
      let weekLabelColumnPos = -1;

      const rows = this.monthgrid.children;

      // Iterate through each monthgridrow and set up the day-boxes that
      // are its child nodes.  Remember, children is not a normal array,
      // so don't use the in operator if you don't want extra properties
      // coming out.
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        // If we've already assigned all of the day-boxes that we need, just
        // collapse the rest of the rows, otherwise expand them if needed.
        row.toggleAttribute("hidden", finished);
        if (finished) {
          continue;
        }
        for (let j = 0; j < row.children.length; j++) {
          const daybox = row.children[j].firstElementChild;
          const date = dateList[dateBoxes.length];

          // Remove the attribute "relation" for all the column headers.
          // Consider only the first row index otherwise it will be
          // removed again afterwards the correct setting.
          if (i == 0) {
            this.labeldaybox.children[j].removeAttribute("relation");
          }

          daybox.setAttribute("context", this.getAttribute("context"));

          daybox.setAttribute(
            "item-context",
            this.getAttribute("item-context") || this.getAttribute("context")
          );

          // Set the box-class depending on if this box displays a day in
          // the month being currently shown or not.
          let boxClass;
          if (this.showFullMonth) {
            boxClass =
              "calendar-month-day-box-" +
              (mainMonth == date.month ? "current-month" : "other-month");
          } else {
            boxClass = "calendar-month-day-box-current-month";
          }
          if (this.mDaysOffArray.some(dayOffNum => dayOffNum == date.weekday)) {
            boxClass = "calendar-month-day-box-day-off " + boxClass;
          }

          // Set up date relations.
          switch (date.compare(today)) {
            case -1:
              daybox.setAttribute("relation", "past");
              break;
            case 0:
              daybox.setAttribute("relation", "today");
              this.labeldaybox.children[j].setAttribute("relation", "today");
              break;
            case 1:
              daybox.setAttribute("relation", "future");
              break;
          }

          // Set up label with the week number in the first day of the row.
          if (this.mShowWeekNumber) {
            const weekLabel = daybox.querySelector("[data-label='week']");
            if (weekLabelColumnPos < 0) {
              const isDayOff = this.mDaysOffArray.includes((j + this.mWeekStartOffset) % 7);
              if (this.mDisplayDaysOff || !isDayOff) {
                weekLabelColumnPos = j;
              }
            }
            // Build and set the label.
            if (j == weekLabelColumnPos) {
              weekLabel.removeAttribute("hidden");
              const weekNumber = cal.getWeekInfoService().getWeekTitle(date);
              const weekString = cal.l10n.getCalString("abbreviationOfWeek", [weekNumber]);
              weekLabel.value = weekString;
            } else {
              weekLabel.hidden = true;
            }
          }

          daybox.setAttribute("class", boxClass);

          daybox.setDate(date);
          if (date.day == 1 || date.day == date.endOfMonth.day) {
            daybox.showMonthLabel = true;
          } else {
            daybox.showMonthLabel = false;
          }
          daybox.calendarView = this;
          daybox.date = date;
          dateBoxes.push(daybox);

          // If we've now assigned all of our dates, set this to true so we
          // know we can just collapse the rest of the rows.
          if (dateBoxes.length == dateList.length) {
            finished = true;
          }
        }
      }

      // If we're not showing a full month, then add a few extra labels to
      // help the user orient themselves in the view.
      if (!this.mShowFullMonth) {
        dateBoxes[0].showMonthLabel = true;
        dateBoxes[dateBoxes.length - 1].showMonthLabel = true;
      }

      // Store these, so that we can access them later.
      this.mDateBoxes = dateBoxes;
      this.hideDaysOff();

      this.adjustWeekdayLength();

      // Store the start and end of current view. Next time when
      // setDateRange is called, it will use mViewStart and mViewEnd to
      // check if view range has been changed.
      this.mViewStart = this.mStartDate;
      this.mViewEnd = this.mEndDate;

      // Store toggle status of current view.
      let toggleStatus = 0;

      if (this.mTasksInView) {
        toggleStatus |= this.mToggleStatusFlag.TasksInView;
      }
      if (this.mWorkdaysOnly) {
        toggleStatus |= this.mToggleStatusFlag.WorkdaysOnly;
      }
      if (this.mShowCompleted) {
        toggleStatus |= this.mToggleStatusFlag.ShowCompleted;
      }

      this.mToggleStatus = toggleStatus;
    }

    /**
     * Hide the week numbers.
     */
    hideWeekNumbers() {
      const rows = this.monthgrid.children;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        for (let j = 0; j < row.children.length; j++) {
          const daybox = row.children[j].firstElementChild;
          const weekLabel = daybox.querySelector("[data-label='week']");
          weekLabel.hidden = true;
        }
      }
    }

    /**
     * Hide the days off.
     */
    hideDaysOff() {
      const headerkids = this.querySelector(".labeldaybox").children;
      const rows = this.monthgrid.children;

      const lastColNum = rows[0].children.length - 1;
      for (let colNum = 0; colNum <= lastColNum; colNum++) {
        const dayForColumn = (colNum + this.mWeekStartOffset) % 7;
        const dayOff = this.mDaysOffArray.includes(dayForColumn);
        headerkids[colNum].hidden = dayOff && !this.mDisplayDaysOff;
        for (let row of rows) {
          row.children[colNum].toggleAttribute("hidden", dayOff && !this.mDisplayDaysOff);
        }
      }
    }

    /**
     * Return the day box element for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {?Element}            A `calendar-month-day-box` element.
     */
    findDayBoxForDate(date) {
      if (!this.mDateBoxes) {
        return null;
      }
      for (const box of this.mDateBoxes) {
        if (box.mDate.compare(date) == 0) {
          return box;
        }
      }
      return null;
    }

    /**
     * Return the day box elements for a given calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {Element[]}           An array of `calendar-month-day-box` elements.
     */
    findDayBoxesForItem(item) {
      let targetDate = null;
      let finishDate = null;
      const boxes = [];

      // All our boxes are in default time zone, so we need these times in them too.
      if (cal.item.isEvent(item)) {
        targetDate = item.startDate.getInTimezone(this.mTimezone);
        finishDate = item.endDate.getInTimezone(this.mTimezone);
      } else if (cal.item.isToDo(item)) {
        // Consider tasks without entry OR due date.
        if (item.entryDate || item.dueDate) {
          targetDate = (item.entryDate || item.dueDate).getInTimezone(this.mTimezone);
          finishDate = (item.dueDate || item.entryDate).getInTimezone(this.mTimezone);
        }
      }

      if (!targetDate) {
        return boxes;
      }

      if (!finishDate) {
        const maybeBox = this.findDayBoxForDate(targetDate);
        if (maybeBox) {
          boxes.push(maybeBox);
        }
        return boxes;
      }

      if (targetDate.compare(this.mStartDate) < 0) {
        targetDate = this.mStartDate.clone();
      }

      if (finishDate.compare(this.mEndDate) > 0) {
        finishDate = this.mEndDate.clone();
        finishDate.day++;
      }

      // Reset the time to 00:00, so that we really get all the boxes.
      targetDate.isDate = false;
      targetDate.hour = 0;
      targetDate.minute = 0;
      targetDate.second = 0;

      if (targetDate.compare(finishDate) == 0) {
        // We have also to handle zero length events in particular for
        // tasks without entry or due date.
        const box = this.findDayBoxForDate(targetDate);
        if (box) {
          boxes.push(box);
        }
      }

      while (targetDate.compare(finishDate) == -1) {
        const box = this.findDayBoxForDate(targetDate);

        // This might not exist if the event spans the view start or end.
        if (box) {
          boxes.push(box);
        }
        targetDate.day += 1;
      }

      return boxes;
    }

    /**
     * Display a calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     */
    doAddItem(item) {
      this.findDayBoxesForItem(item).forEach(box => box.addItem(item));
    }

    /**
     * Remove a calendar item so it is no longer displayed.
     *
     * @param {calIItemBase} item    A calendar item.
     */
    doDeleteItem(item) {
      const boxes = this.findDayBoxesForItem(item);

      if (!boxes.length) {
        return;
      }

      const oldLength = this.mSelectedItems.length;

      const isNotItem = a => a.hashId != item.hashId;
      this.mSelectedItems = this.mSelectedItems.filter(isNotItem);

      boxes.forEach(box => box.deleteItem(item));

      // If a deleted event was selected, announce that the selection changed.
      if (oldLength != this.mSelectedItems.length) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    /**
     * Remove all items for a given calendar so they are no longer displayed.
     *
     * @param {calICalendar} calendar    A calendar object.
     */
    deleteItemsFromCalendar(calendar) {
      if (!this.mDateBoxes) {
        return;
      }
      for (const box of this.mDateBoxes) {
        for (const id in box.mItemHash) {
          const node = box.mItemHash[id];
          const item = node.item;

          if (item.calendar.id == calendar.id) {
            box.deleteItem(item);
          }
        }
      }
    }

    /**
     * Make a calendar item flash.  Used when an alarm goes off to make the related item flash.
     *
     * @param {Object} item    The calendar item to flash.
     * @param {boolean} stop        Whether to stop flashing that's already started.
     */
    flashAlarm(item, stop) {
      if (!this.initialized) {
        return;
      }

      const showIndicator = Services.prefs.getBoolPref("calendar.alarms.indicator.show", true);
      const totaltime = Services.prefs.getIntPref("calendar.alarms.indicator.totaltime", 3600);

      if (!stop && (!showIndicator || totaltime < 1)) {
        // No need to animate if the indicator should not be shown.
        return;
      }

      // Make sure the flashing attribute is set or reset on all visible boxes.
      const boxes = this.findDayBoxesForItem(item);
      for (const box of boxes) {
        for (const id in box.mItemHash) {
          const itemData = box.mItemHash[id];

          if (itemData.item.hasSameIds(item)) {
            if (stop) {
              itemData.removeAttribute("flashing");
            } else {
              itemData.setAttribute("flashing", "true");
            }
          }
        }
      }

      if (stop) {
        // We are done flashing, prevent newly created event boxes from flashing.
        delete this.mFlashingEvents[item.hashId];
      } else {
        // Set up a timer to stop the flashing after the total time.
        this.mFlashingEvents[item.hashId] = item;
        setTimeout(() => this.flashAlarm(item, true), totaltime);
      }
    }
  }

  MozElements.CalendarMonthBaseView = CalendarMonthBaseView;
}
