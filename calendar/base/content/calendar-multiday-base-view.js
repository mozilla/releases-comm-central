/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global calendarNavigationBar, currentView, MozElements, MozXULElement, Services,
   setAttributeToChildren, setBooleanAttribute, timeIndicator, gCurrentMode */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");
  /**
   * The time bar that displays time divisions to the side or top of a multiday (day or week) view.
   */
  class CalendarTimeBar extends MozXULElement {
    static get inheritedAttributes() {
      return {
        ".timebarboxstack": "orient,width,height",
        ".topbox": "orient,width,height",
        ".timeIndicator-timeBar": "orient",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      const stack = document.createElementNS("http://www.w3.org/1999/xhtml", "div");
      const topbox = stack.cloneNode();
      const indicator = stack.cloneNode();

      stack.setAttribute("class", "timebarboxstack");
      stack.setAttribute("style", "display: block; position: relative;");

      topbox.setAttribute("class", "topbox");

      indicator.setAttribute("class", "timeIndicator-timeBar");
      indicator.setAttribute("hidden", "true");

      stack.appendChild(topbox);
      stack.appendChild(indicator);
      this.appendChild(stack);

      this.initializeAttributeInheritance();

      this.mPixPerMin = 0.6;

      this.mStartMin = 0;
      this.mEndMin = 24 * 60;

      this.mDayStartHour = 0;
      this.mDayEndHour = 24;

      this.relayout();
      this.dispatchEvent(new CustomEvent("bindingattached", { bubbles: false }));
    }

    set pixelsPerMinute(ppm) {
      if (ppm != this.mPixPerMin) {
        this.mPixPerMin = ppm;
        this.relayout();
      }
      return ppm;
    }

    get pixelsPerMinute() {
      return this.mPixPerMin;
    }

    /**
     * Set the hours when the day starts and ends.
     *
     * @param {number} dayStartHour    Hour when the day will start.
     * @param {number} dayEndHour      Hour when the day will end.
     */
    setDayStartEndHours(dayStartHour, dayEndHour) {
      if (
        dayStartHour * 60 < this.mStartMin ||
        dayStartHour > dayEndHour ||
        dayEndHour * 60 > this.mEndMin
      ) {
        throw Cr.NS_ERROR_INVALID_ARG;
      }

      if (this.mDayStartHour != dayStartHour || this.mDayEndHour != dayEndHour) {
        this.mDayEndHour = dayEndHour;
        this.mDayStartHour = dayStartHour;

        const topbox = this.querySelector(".topbox");
        if (topbox.children.length) {
          // This only needs to be re-done if the initial relayout has already
          // happened.  (If it hasn't happened, this will be done when it does happen.)
          const start = this.mStartMin / 60;
          const end = this.mEndMin / 60;

          for (let hour = start; hour < end; hour++) {
            if (hour < this.mDayStartHour || hour >= this.mDayEndHour) {
              topbox.children[hour].setAttribute("off-time", "true");
            } else {
              topbox.children[hour].removeAttribute("off-time");
            }
          }
        }
      }
    }

    /**
     * Set an attribute on the time bar element, and do a relayout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsRelayout = attr == "orient" && this.getAttribute("orient") != value;

      // This should be done using lookupMethod(), see bug 286629.
      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Re-render the contents of the time bar.
     */
    relayout() {
      const topbox = this.querySelector(".topbox");

      while (topbox.hasChildNodes()) {
        topbox.lastChild.remove();
      }

      const orient = topbox.getAttribute("orient");
      const timeFormatter = cal.getDateFormatter();
      const jsTime = new Date();

      this.getSections().forEach(([startMinute, duration]) => {
        const box = document.createXULElement("box");
        box.setAttribute("orient", orient);

        // Calculate duration pixel as the difference between
        // start pixel and end pixel to avoid rounding errors.
        const startPix = Math.round(startMinute * this.mPixPerMin);
        const endPix = Math.round((startMinute + duration) * this.mPixPerMin);
        const durPix = endPix - startPix;

        box.setAttribute(orient == "horizontal" ? "width" : "height", durPix);

        const hour = Math.floor(startMinute / 60);
        let timeString = "";

        if (duration == 60) {
          jsTime.setHours(hour, 0, 0);

          const dateTime = cal.dtz.jsDateToDateTime(jsTime, cal.dtz.floating);

          timeString = timeFormatter.formatTime(dateTime);
        }

        const label = document.createXULElement("label");
        label.setAttribute("value", timeString);
        label.setAttribute("class", "calendar-time-bar-label");
        label.setAttribute("align", "center");
        box.appendChild(label);

        // Set up workweek hours.
        if (hour < this.mDayStartHour || hour >= this.mDayEndHour) {
          box.setAttribute("off-time", "true");
        }

        box.setAttribute("class", "calendar-time-bar-box-" + (hour % 2 == 0 ? "even" : "odd"));

        topbox.appendChild(box);
      });
    }

    /**
     * Get the section data for dividing up the time bar.
     *
     * @return {number[][]}    An array of arrays that represent time bar sections. Each array
     *                         holds two numbers, the first is the minute during the day when
     *                         the section starts, and the second is how many minutes the
     *                         section lasts (usually 60).
     */
    getSections() {
      const sections = [];
      let currentMin = this.mStartMin;

      while (currentMin < this.mEndMin) {
        const minutesLeft = this.mEndMin - currentMin;
        let duration;

        if (minutesLeft < 60) {
          duration = minutesLeft;
        } else {
          // 0 is falsy, so when the modulo is 0, duration is 60.
          duration = currentMin % 60 || 60;
        }

        sections.push([currentMin, duration]);

        currentMin += duration;
      }
      return sections;
    }
  }

  customElements.define("calendar-time-bar", CalendarTimeBar);

  /**
   * Abstract class used for the day and week calendar view elements. (Not month or multiweek.)
   *
   * @implements {calICalendarView}
   * @extends {MozElements.CalendarBaseView}
   * @abstract
   */
  class CalendarMultidayBaseView extends MozElements.CalendarBaseView {
    static get inheritedAttributes() {
      return { ".timebar": "orient" };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasConnected) {
        return;
      }
      // this.hasConnected is set to true via super.connectedCallback (below).

      // The orient of the calendar-time-bar should be the opposite of the parent.
      this.appendChild(
        MozXULElement.parseXULToFragment(`
          <box class="mainbox multiday-view-main-box"
               flex="1">
            <box class="labelbox multiday-view-label-box">
              <box class="labeltimespacer multiday-view-label-time-spacer"/>
              <box class="labeldaybox multiday-view-label-day-box"
                   flex="1"
                   equalsize="always"/>
              <box class="labelscrollbarspacer multiday-labelscrollbarspacer"/>
            </box>
            <box class="headerbox multiday-view-header-box">
              <box class="headertimespacer multiday-view-header-time-spacer"/>
              <box class="headerdaybox multiday-view-header-day-box"
                   flex="1"
                   equalsize="always"/>
              <box class="headerscrollbarspacer multiday-headerscrollbarspacer"/>
            </box>
            <scrollbox class="scrollbox"
                       flex="1"
                       onoverflow="adjustScrollBarSpacers();"
                       onunderflow="adjustScrollBarSpacers();">
              <calendar-time-bar class="timebar"/>
              <box class="daybox multiday-view-day-box"
                   flex="1"
                   equalsize="always"/>
            </scrollbox>
          </box>
        `)
      );

      this.initializeAttributeInheritance();

      // super.connectedCallback has to be called after the time bar is added to the DOM.
      super.connectedCallback();

      this.addEventListener("click", event => {
        if (event.button != 2) {
          return;
        }
        this.selectedDateTime = null;
      });

      this.addEventListener("wheel", event => {
        // Only shift hours if no modifier is pressed.
        if (!event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          let minute = this.mFirstVisibleMinute;

          if (event.deltaMode == event.DOM_DELTA_LINE) {
            if (this.rotated && event.deltaX != 0) {
              minute += event.deltaX < 0 ? -60 : 60;
            } else if (!this.rotated && event.deltaY != 0) {
              minute += event.deltaY < 0 ? -60 : 60;
            }
          } else if (event.deltaMode == event.DOM_DELTA_PIXEL) {
            if (this.rotated && event.deltaX != 0) {
              minute += Math.ceil(event.deltaX / this.mPixPerMin);
            } else if (!this.rotated && event.deltaY != 0) {
              minute += Math.ceil(event.deltaY / this.mPixPerMin);
            }
          }
          this.scrollToMinute(minute);
        }

        // We are taking care of scrolling, so prevent the default action in any case.
        event.preventDefault();
      });

      this.addEventListener("scroll", event => {
        const scrollbox = this.querySelector(".scrollbox");

        // Update the first visible minute, but only if the scrollbox has been sized.
        if (scrollbox.scrollHeight > 0) {
          const scrollTopOrLeft =
            scrollbox.getAttribute("orient") == "horizontal"
              ? scrollbox.scrollTop
              : scrollbox.scrollLeft;

          this.mFirstVisibleMinute = Math.round(scrollTopOrLeft / this.mPixPerMin);
        }
      });

      // mDateList will always be sorted before being set.
      this.mDateList = null;

      /**
       * A column in the view representing a particular date.
       * @typedef {Object} DateColumn
       * @property {calIDateTime} date    The date.
       * @property {Element} column       A `calendar-event-column` where regular,
       *                                  (not "all day") events appear.
       * @property {Element} header       A `calendar-header-container` where "all day"
       *                                  events appear.
       */

      /** @type {DateColumn[]} */
      this.mDateColumns = null;

      this.mPixPerMin = 0.6;
      this.mMinPixelsPerMinute = 0.1;

      this.mSelectedDayCol = null;
      this.mSelectedDay = null;

      this.mStartMin = 0;
      this.mEndMin = 24 * 60;

      this.mDayStartMin = 0;
      this.mDayEndMin = 0;

      this.mVisibleMinutes = 9 * 60;
      this.mClickedTime = null;

      this.mTimeIndicatorInterval = 15;
      this.mTimeIndicatorMinutes = 0;

      this.mModeHandler = null;
      this.mFirstVisibleMinute = 0;

      // Get day start/end hour from prefs and set on the view.
      const startHour = Services.prefs.getIntPref("calendar.view.daystarthour", 8) * 60;
      const endHour = Services.prefs.getIntPref("calendar.view.dayendhour", 17) * 60;
      this.setDayStartEndMinutes(startHour, endHour);

      // Initially scroll to the day start hour in the view.
      this.scrollToMinute(this.mDayStartMin);

      // Get visible hours from prefs and set on the view.
      const visibleMinutes = Services.prefs.getIntPref("calendar.view.visiblehours", 9) * 60;
      this.setVisibleMinutes(visibleMinutes);

      // Set the time interval for the time indicator timer.
      this.setTimeIndicatorInterval(
        Services.prefs.getIntPref("calendar.view.timeIndicatorInterval", 15)
      );

      this.enableTimeIndicator();

      this.reorient();
    }

    // calICalendarView Properties

    get supportsZoom() {
      return true;
    }

    get supportsRotation() {
      return true;
    }

    get supportsDisjointDates() {
      return true;
    }

    get hasDisjointDates() {
      return this.mDateList != null;
    }

    get startDate() {
      if (this.mStartDate) {
        return this.mStartDate;
      } else if (this.mDateList && this.mDateList.length > 0) {
        return this.mDateList[0];
      } else {
        return null;
      }
    }

    get endDate() {
      if (this.mEndDate) {
        return this.mEndDate;
      } else if (this.mDateList && this.mDateList.length > 0) {
        return this.mDateList[this.mDateList.length - 1];
      } else {
        return null;
      }
    }

    set selectedDay(day) {
      // Ignore if just 1 visible, it's always selected, but we don't indicate it.
      if (this.numVisibleDates == 1) {
        this.fireEvent("dayselect", day);
        return day;
      }

      if (this.mSelectedDayCol) {
        this.mSelectedDayCol.column.selected = false;
        this.mSelectedDayCol.header.removeAttribute("selected");
      }

      if (day) {
        this.mSelectedDayCol = this.findColumnForDate(day);
        if (this.mSelectedDayCol) {
          this.mSelectedDay = this.mSelectedDayCol.date;
          this.mSelectedDayCol.column.selected = true;
          this.mSelectedDayCol.header.setAttribute("selected", "true");
        } else {
          this.mSelectedDay = day;
        }
      }
      this.fireEvent("dayselect", day);
      return day;
    }

    get selectedDay() {
      let selected;
      if (this.numVisibleDates == 1) {
        selected = this.mDateColumns[0].date;
      } else if (this.mSelectedDay) {
        selected = this.mSelectedDay;
      } else if (this.mSelectedDayCol) {
        selected = this.mSelectedDayCol.date;
      }

      // TODO Make sure the selected day is valid.
      // TODO Select now if it is in the range?
      return selected;
    }

    // End calICalendarView Properties

    get daysInView() {
      return this.labeldaybox.children && this.labeldaybox.children.length;
    }

    set selectedDateTime(dateTime) {
      this.mClickedTime = dateTime;
    }

    get selectedDateTime() {
      return this.mClickedTime;
    }

    set pixelsPerMinute(ppm) {
      this.mPixPerMin = ppm;

      this.timebar.pixelsPerMinute = ppm;

      if (!this.mDateColumns) {
        return ppm;
      }
      for (const col of this.mDateColumns) {
        col.column.pixelsPerMinute = ppm;
      }
      return ppm;
    }

    get pixelsPerMinute() {
      return this.mPixPerMin;
    }

    // Private

    get numVisibleDates() {
      if (this.mDateList) {
        return this.mDateList.length;
      }

      let count = 0;

      if (!this.mStartDate || !this.mEndDate) {
        // The view has not been initialized, so there are 0 visible dates.
        return count;
      }

      const date = this.mStartDate.clone();
      while (date.compare(this.mEndDate) <= 0) {
        count++;
        date.day += 1;
      }

      return count;
    }

    get timebar() {
      return this.querySelector(".timebar");
    }

    get timeBarTimeIndicator() {
      return this.timebar.querySelector(".timeIndicator-timeBar");
    }

    get scrollbox() {
      return this.querySelector(".scrollbox");
    }

    /**
     * Set the preference for the time indicator interval.
     *
     * @param {number} prefInterval    A time indicator interval preference value.
     */
    setTimeIndicatorInterval(prefInterval) {
      // If the preference just edited by the user is outside the valid
      // range [0, 1440], we change it into the nearest limit (0 or 1440).
      const newTimeInterval = Math.max(0, Math.min(1440, prefInterval));
      if (newTimeInterval != prefInterval) {
        Services.prefs.setIntPref("calendar.view.timeIndicatorInterval", newTimeInterval);
      }

      if (newTimeInterval != this.mTimeIndicatorInterval) {
        this.mTimeIndicatorInterval = newTimeInterval;
      }
      if (this.mTimeIndicatorInterval == 0) {
        timeIndicator.cancel();
      }
    }

    /**
     * Hides or shows the time indicator when the time indicator interval preference changes
     * to 0 or changes from 0 to greater than 0. Also updates its position if needed.
     */
    enableTimeIndicator() {
      const hideIndicator = this.mTimeIndicatorInterval == 0;
      setBooleanAttribute(this.timeBarTimeIndicator, "hidden", hideIndicator);

      const todayColumn = this.findColumnForDate(this.today());
      if (todayColumn) {
        setBooleanAttribute(todayColumn.column.timeIndicatorBox, "hidden", hideIndicator);
      }

      // Update the timer but only under some circumstances, otherwise
      // it will update the wrong view or it will start without need.
      const currView = currentView().type;
      if (
        gCurrentMode == "calendar" &&
        currView == this.type &&
        !hideIndicator &&
        (currView == "day" || currView == "week")
      ) {
        this.updateTimeIndicatorPosition(true);
      }
    }

    /**
     * Update the position of the time indicator.
     *
     * @param {boolean} updateTheTimer    Whether to update the timer.
     * @param {boolean} ppmChanged        Whether the pixels per minute has changed.
     * @param {boolean} viewChanged       Whether the view has changed.
     */
    updateTimeIndicatorPosition(updateTheTimer, ppmChanged, viewChanged) {
      const now = cal.dtz.now();
      const nowMinutes = now.hour * 60 + now.minute;

      if (updateTheTimer) {
        const originalPrefInt = this.mTimeIndicatorInterval;
        if (originalPrefInt == 0) {
          timeIndicator.cancel();
          return;
        }

        // If pixels per minute is small, increase (then update) the interval pref.
        const prefInt =
          ppmChanged && this.mPixPerMin < 0.6
            ? Math.round(originalPrefInt / this.mPixPerMin)
            : originalPrefInt;

        if (!ppmChanged || viewChanged || prefInt != originalPrefInt) {
          // Synchronize the timer with a multiple of the interval.
          const firstInterval = (prefInt - (nowMinutes % prefInt)) * 60 - now.second;
          if (timeIndicator.timer) {
            timeIndicator.cancel();
          }
          timeIndicator.lastView = this.id;
          timeIndicator.timer = setTimeout(() => {
            this.updateTimeIndicatorPosition(false);
            timeIndicator.start(prefInt * 60, this);
          }, firstInterval * 1000);

          // Set the time for the first positioning of the indicator.
          const time = Math.floor(nowMinutes / prefInt) * prefInt;
          document.getElementById("day-view").mTimeIndicatorMinutes = time;
          document.getElementById("week-view").mTimeIndicatorMinutes = time;
        }
      } else if (updateTheTimer === false) {
        // Set the time for every positioning after the first
        document.getElementById("day-view").mTimeIndicatorMinutes = nowMinutes;
        document.getElementById("week-view").mTimeIndicatorMinutes = nowMinutes;
      }
      // Update the position of the indicator.
      const position = Math.round(this.mPixPerMin * this.mTimeIndicatorMinutes) - 1;
      const posAttr = this.getAttribute("orient") == "vertical" ? "top: " : "left: ";

      if (this.timeBarTimeIndicator) {
        this.timeBarTimeIndicator.setAttribute("style", posAttr + position + "px;");
      }

      const todayColumn = this.findColumnForDate(this.today());
      if (todayColumn) {
        todayColumn.column.timeIndicatorBox.setAttribute(
          "style",
          "margin-" + posAttr + position + "px;"
        );
      }
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
        case "calendar.view.daystarthour":
          this.setDayStartEndMinutes(subject.getIntPref(preference) * 60, this.mDayEndMin);
          this.refreshView();
          break;

        case "calendar.view.dayendhour":
          this.setDayStartEndMinutes(this.mDayStartMin, subject.getIntPref(preference) * 60);
          this.refreshView();
          break;

        case "calendar.view.visiblehours":
          this.setVisibleMinutes(subject.getIntPref(preference) * 60);
          this.refreshView();
          break;

        case "calendar.view.timeIndicatorInterval":
          this.setTimeIndicatorInterval(subject.getIntPref(preference));
          this.enableTimeIndicator();
          break;

        default:
          this.handleCommonPreference(subject, topic, preference);
          break;
      }
    }

    /**
     * Handle resizing by adjusting the view to the new size.
     *
     * @param {Element} calViewElem    A calendar view element (calICalendarView).
     */
    onResize(calViewElem) {
      const self = calViewElem || this; // eslint-disable-line consistent-this
      const isARelayout = !calViewElem;

      const scrollboxRect = this.scrollbox.getBoundingClientRect();
      const isOrientHorizontal = self.getAttribute("orient") == "horizontal";

      const size = isOrientHorizontal ? scrollboxRect.width : scrollboxRect.height;

      const ppmRaw = size / self.mVisibleMinutes;
      const ppmRounded = Math.floor(ppmRaw * 1000) / 1000;

      const ppm = ppmRounded < self.mMinPixelsPerMinute ? self.mMinPixelsPerMinute : ppmRounded;

      const ppmHasChanged = self.pixelsPerMinute != ppm;
      self.pixelsPerMinute = ppm;

      setTimeout(() => self.scrollToMinute(self.mFirstVisibleMinute), 0);

      // Fit the weekday labels while scrolling.
      self.adjustWeekdayLength(isOrientHorizontal);

      // Adjust the time indicator position and the related timer.
      if (this.mTimeIndicatorInterval != 0) {
        const viewHasChanged = isARelayout && timeIndicator.lastView != this.id;
        if (
          gCurrentMode == "calendar" &&
          (!timeIndicator.timer || ppmHasChanged || viewHasChanged)
        ) {
          self.updateTimeIndicatorPosition(true, ppmHasChanged, viewHasChanged);
        }
      }
    }

    /**
     * Make a calendar item flash or stop flashing. Called when the item's alarm fires.
     *
     * @param {calIItemBase} item    The calendar item.
     * @param {boolean} stop         Whether to stop the item from flashing.
     */
    flashAlarm(item, stop) {
      function setFlashingAttribute(box) {
        if (stop) {
          box.removeAttribute("flashing");
        } else {
          box.setAttribute("flashing", "true");
        }
      }

      const showIndicator = Services.prefs.getBoolPref("calendar.alarms.indicator.show", true);
      const totaltime = Services.prefs.getIntPref("calendar.alarms.indicator.totaltime", 3600);

      if (!stop && (!showIndicator || totaltime < 1)) {
        // No need to animate if the indicator should not be shown.
        return;
      }

      // Make sure the flashing attribute is set or reset on all visible boxes.
      const columns = this.findColumnsForItem(item);
      for (const col of columns) {
        const colBox = col.column.findChunkForOccurrence(item);
        const headerBox = col.header.findBoxForItem(item);

        if (colBox && colBox.eventbox) {
          setFlashingAttribute(colBox.eventbox);
        }
        if (headerBox) {
          setFlashingAttribute(headerBox);
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

    // calICalendarView Methods

    showDate(date) {
      const targetDate = date.getInTimezone(this.mTimezone);
      targetDate.isDate = true;

      if (this.mStartDate && this.mEndDate) {
        if (this.mStartDate.compare(targetDate) <= 0 && this.mEndDate.compare(targetDate) >= 0) {
          return;
        }
      } else if (this.mDateList) {
        for (const listDate of this.mDateList) {
          // If date is already visible, nothing to do.
          if (listDate.compare(targetDate) == 0) {
            return;
          }
        }
      }

      // If we're only showing one date, then continue
      // to only show one date; otherwise, show the week.
      if (this.numVisibleDates == 1) {
        this.setDateRange(date, date);
      } else {
        this.setDateRange(date.startOfWeek, date.endOfWeek);
      }

      this.selectedDay = targetDate;
    }

    setDateRange(startDate, endDate) {
      this.rangeStartDate = startDate;
      this.rangeEndDate = endDate;

      const viewStart = startDate.getInTimezone(this.mTimezone);
      const viewEnd = endDate.getInTimezone(this.mTimezone);

      viewStart.isDate = true;
      viewStart.makeImmutable();
      viewEnd.isDate = true;
      viewEnd.makeImmutable();
      this.mStartDate = viewStart;
      this.mEndDate = viewEnd;

      // goToDay are called when toggle the values below. The attempt to fix
      // Bug 872063 has modified the behavior of setDateRange, which doesn't
      // always refresh the view anymore. That is not the expected behavior
      // by goToDay. Add checks here to determine if the view need to be
      // refreshed.

      // First, check values of tasksInView, workdaysOnly, showCompleted.
      // Their status will determine the value of toggleStatus, which is
      // saved to this.mToggleStatus during last call to relayout()
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
        calendarNavigationBar.setDateRange(viewStart, viewEnd);
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
      const dates = [];
      if (this.mStartDate && this.mEndDate) {
        const date = this.mStartDate.clone();
        while (date.compare(this.mEndDate) <= 0) {
          dates.push(date.clone());
          date.day += 1;
        }
      } else if (this.mDateList) {
        for (const date of this.mDateList) {
          dates.push(date.clone());
        }
      }

      return dates;
    }

    setSelectedItems(items, suppressEvent) {
      if (this.mSelectedItems) {
        for (const item of this.mSelectedItems) {
          for (const occ of this.getItemOccurrencesInView(item)) {
            const cols = this.findColumnsForItem(occ);
            for (const col of cols) {
              col.header.unselectOccurrence(occ);
              col.column.unselectOccurrence(occ);
            }
          }
        }
      }
      this.mSelectedItems = items || [];

      for (const item of this.mSelectedItems) {
        for (const occ of this.getItemOccurrencesInView(item)) {
          const cols = this.findColumnsForItem(occ);
          if (cols.length == 0) {
            continue;
          }
          const start = item.startDate || item.entryDate || item.dueDate;
          for (const col of cols) {
            if (start.isDate) {
              col.header.selectOccurrence(occ);
            } else {
              col.column.selectOccurrence(occ);
            }
          }
        }
      }

      if (!suppressEvent) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }
    }

    centerSelectedItems() {
      const displayTZ = cal.dtz.defaultTimezone;
      let lowMinute = 24 * 60;
      let highMinute = 0;

      for (const item of this.mSelectedItems) {
        const startDateProperty = cal.dtz.startDateProp(item);
        const endDateProperty = cal.dtz.endDateProp(item);

        let occs = [];
        if (item.recurrenceInfo) {
          // If selected a parent item, show occurrence(s) in view range.
          occs = item.getOccurrencesBetween(this.startDate, this.queryEndDate);
        } else {
          occs = [item];
        }

        for (const occ of occs) {
          let occStart = occ[startDateProperty];
          let occEnd = occ[endDateProperty];
          // Must have at least one of start or end.
          if (!occStart && !occEnd) {
            // Task with no dates.
            continue;
          }

          // If just has single datetime, treat as zero duration item
          // (such as task with due datetime or start datetime only).
          occStart = occStart || occEnd;
          occEnd = occEnd || occStart;
          // Now both occStart and occEnd are datetimes.

          // Skip occurrence if all-day: it won't show in time view.
          if (occStart.isDate || occEnd.isDate) {
            continue;
          }

          // Trim dates to view.  (Not mutated so just reuse view dates.)
          if (this.startDate.compare(occStart) > 0) {
            occStart = this.startDate;
          }
          if (this.queryEndDate.compare(occEnd) < 0) {
            occEnd = this.queryEndDate;
          }

          // Convert to display timezone if different.
          if (occStart.timezone != displayTZ) {
            occStart = occStart.getInTimezone(displayTZ);
          }
          if (occEnd.timezone != displayTZ) {
            occEnd = occEnd.getInTimezone(displayTZ);
          }
          // If crosses midnight in current TZ, set end just
          // before midnight after start so start/title usually visible.
          if (!cal.dtz.sameDay(occStart, occEnd)) {
            occEnd = occStart.clone();
            occEnd.day = occStart.day;
            occEnd.hour = 23;
            occEnd.minute = 59;
          }

          // Ensure range shows occ.
          lowMinute = Math.min(occStart.hour * 60 + occStart.minute, lowMinute);
          highMinute = Math.max(occEnd.hour * 60 + occEnd.minute, highMinute);
        }
      }

      const displayDuration = highMinute - lowMinute;
      if (this.mSelectedItems.length && displayDuration >= 0) {
        let minute;
        if (displayDuration <= this.mVisibleMinutes) {
          minute = lowMinute + (displayDuration - this.mVisibleMinutes) / 2;
        } else if (this.mSelectedItems.length == 1) {
          // If the displayDuration doesn't fit into the visible minutes, but
          // only one event is selected, then go ahead and center the event start.

          minute = Math.max(0, lowMinute - this.mVisibleMinutes / 2);
        }
        this.scrollToMinute(minute);
      }
    }

    zoomIn(level) {
      let visibleHours = Services.prefs.getIntPref("calendar.view.visiblehours", 9);
      visibleHours += level || 1;

      Services.prefs.setIntPref("calendar.view.visiblehours", Math.min(visibleHours, 24));
    }

    zoomOut(level) {
      let visibleHours = Services.prefs.getIntPref("calendar.view.visiblehours", 9);
      visibleHours -= level || 1;

      Services.prefs.setIntPref("calendar.view.visiblehours", Math.max(1, visibleHours));
    }

    zoomReset() {
      Services.prefs.setIntPref("calendar.view.visiblehours", 9);
    }

    // End calICalendarView Methods

    /**
     * Return all the occurrences of a given item that are currently displayed in the view.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {calIItemBase[]}      An array of occurrences.
     */
    getItemOccurrencesInView(item) {
      if (item.recurrenceInfo && item.recurrenceStartDate) {
        // If a parent item is selected, show occurrence(s) in view range.
        return item.getOccurrencesBetween(this.startDate, this.queryEndDate);
      } else if (item.recurrenceStartDate) {
        return [item];
      }
      // Undated todo.
      return [];
    }

    /**
     * Set an attribute on the view element, and do re-orientation and re-layout if needed.
     *
     * @param {string} attr     The attribute to set.
     * @param {string} value    The value to set.
     */
    setAttribute(attr, value) {
      const needsReorient = attr == "orient" && this.getAttribute("orient") != value;

      const needsRelayout = attr == "context" || attr == "item-context";

      // This should be done using lookupMethod(), see bug 286629.
      const ret = XULElement.prototype.setAttribute.call(this, attr, value);

      if (needsReorient) {
        this.reorient();
      } else if (needsRelayout) {
        this.relayout();
      }

      return ret;
    }

    /**
     * Update the view when the view has changed orientation (horizontal or vertical).
     */
    reorient() {
      const orient = this.getAttribute("orient") || "horizontal";
      const otherOrient = orient == "vertical" ? "horizontal" : "vertical";

      this.pixelsPerMinute = orient == "horizontal" ? 1.5 : 0.6;

      const normalElems = [".mainbox", ".timebar"];
      const otherElems = [
        ".labelbox",
        ".labeldaybox",
        ".headertimespacer",
        ".headerbox",
        ".headerdaybox",
        ".scrollbox",
        ".daybox",
      ];

      for (const selector of normalElems) {
        this.querySelector(selector).setAttribute("orient", orient);
      }
      for (const selector of otherElems) {
        this.querySelector(selector).setAttribute("orient", otherOrient);
      }

      const scrollbox = this.scrollbox;
      const mainbox = this.querySelector(".mainbox");

      if (orient == "vertical") {
        scrollbox.setAttribute("style", "overflow-x: hidden; overflow-y: auto;");
        mainbox.setAttribute("style", "overflow-x: auto; overflow-y: hidden;");
      } else {
        scrollbox.setAttribute("style", "overflow-x: auto; overflow-y: hidden;");
        mainbox.setAttribute("style", "overflow-x: hidden; overflow-y: auto;");
      }

      const boxes = [".daybox", ".headerdaybox"];
      for (const selector of boxes) {
        const box = this.querySelector(selector);
        setAttributeToChildren(box, "orient", orient);
      }

      setAttributeToChildren(this.labeldaybox, "orient", otherOrient);

      this.refresh();
    }

    /**
     * Re-render the view.
     */
    relayout() {
      if (!this.mStartDate || !this.mEndDate) {
        return;
      }

      const orient = this.getAttribute("orient") || "horizontal";
      const otherOrient = orient == "horizontal" ? "vertical" : "horizontal";

      const computedDateList = [];
      const startDate = this.mStartDate.clone();

      while (startDate.compare(this.mEndDate) <= 0) {
        const workday = startDate.clone();
        workday.makeImmutable();

        if (this.mDisplayDaysOff || !this.mDaysOffArray.includes(startDate.weekday)) {
          computedDateList.push(workday);
        }
        startDate.day += 1;
      }
      this.mDateList = computedDateList;

      // Deselect the previously selected event upon switching views, otherwise those events
      // will stay selected forever, if other events are selected after changing the view.
      this.setSelectedItems([], true);

      const daybox = this.querySelector(".daybox");
      const headerdaybox = this.querySelector(".headerdaybox");

      const dayStartMin = this.mDayStartMin;
      const dayEndMin = this.mDayEndMin;

      const setUpDayEventsBox = (dayBox, date) => {
        dayBox.setAttribute(
          "class",
          "calendar-event-column-" + (counter % 2 == 0 ? "even" : "odd")
        );
        dayBox.setAttribute("context", this.getAttribute("context"));
        dayBox.setAttribute(
          "item-context",
          this.getAttribute("item-context") || this.getAttribute("context")
        );

        dayBox.startLayoutBatchChange();
        dayBox.date = date;
        dayBox.setAttribute("orient", orient);

        dayBox.calendarView = this;
        dayBox.setDayStartEndMinutes(dayStartMin, dayEndMin);
      };

      const setUpDayHeaderBox = (dayBox, date) => {
        dayBox.date = date;
        dayBox.calendarView = this;
        dayBox.setAttribute("orient", "vertical");
        // Since the calendar-header-container boxes have the same vertical
        // orientation for normal and rotated views, it needs an attribute
        // "rotated" in order to have different css rules.
        setBooleanAttribute(dayBox, "rotated", orient == "horizontal");
      };

      this.mDateColumns = [];

      // Get today's date.
      const today = this.today();
      let counter = 0;
      const dayboxkids = daybox.children;
      const headerboxkids = headerdaybox.children;
      const labelboxkids = this.labeldaybox.children;
      let updateTimeIndicator = false;

      for (const date of computedDateList) {
        let dayEventsBox;
        if (counter < dayboxkids.length) {
          dayEventsBox = dayboxkids[counter];
          dayEventsBox.removeAttribute("relation");
          dayEventsBox.mEventInfos = [];
        } else {
          dayEventsBox = document.createXULElement("calendar-event-column");
          dayEventsBox.setAttribute("flex", "1");
          daybox.appendChild(dayEventsBox);
        }
        setUpDayEventsBox(dayEventsBox, date);

        let dayHeaderBox;
        if (counter < headerboxkids.length) {
          dayHeaderBox = headerboxkids[counter];
          // Delete backwards to make sure we get them all
          // and delete until no more elements are left.
          while (dayHeaderBox.mItemBoxes.length != 0) {
            const num = dayHeaderBox.mItemBoxes.length;
            dayHeaderBox.deleteEvent(dayHeaderBox.mItemBoxes[num - 1].occurrence);
          }
        } else {
          dayHeaderBox = document.createXULElement("calendar-header-container");
          dayHeaderBox.setAttribute("flex", "1");
          headerdaybox.appendChild(dayHeaderBox);
        }
        setUpDayHeaderBox(dayHeaderBox, date);

        if (this.mDaysOffArray.includes(date.weekday)) {
          dayEventsBox.dayOff = true;
          dayHeaderBox.setAttribute("weekend", "true");
        } else {
          dayEventsBox.dayOff = false;
          dayHeaderBox.removeAttribute("weekend");
        }
        let labelbox;
        if (counter < labelboxkids.length) {
          labelbox = labelboxkids[counter];
          labelbox.date = date;
        } else {
          labelbox = document.createXULElement("calendar-day-label");
          labelbox.setAttribute("orient", otherOrient);
          this.labeldaybox.appendChild(labelbox);
          labelbox.date = date;
        }
        // Set attributes for date relations and for the time indicator.
        const headerDayBox = this.querySelector(".headerdaybox");
        headerDayBox.removeAttribute("todaylastinview");
        dayEventsBox.timeIndicatorBox.setAttribute("hidden", "true");
        switch (date.compare(today)) {
          case -1: {
            dayHeaderBox.setAttribute("relation", "past");
            dayEventsBox.setAttribute("relation", "past");
            labelbox.setAttribute("relation", "past");
            break;
          }
          case 0: {
            const relation_ = this.numVisibleDates == 1 ? "today1day" : "today";
            dayHeaderBox.setAttribute("relation", relation_);
            dayEventsBox.setAttribute("relation", relation_);
            labelbox.setAttribute("relation", relation_);
            setBooleanAttribute(
              dayEventsBox.timeIndicatorBox,
              "hidden",
              this.mTimeIndicatorInterval == 0
            );
            updateTimeIndicator = true;

            // Due to equalsize=always being set on the dayboxes
            // parent, there are a few issues showing the border of
            // the last daybox correctly. To work around this, we're
            // setting an attribute we can use in CSS. For more
            // information about this hack, see bug 455045.
            if (
              dayHeaderBox == headerdaybox.children[headerdaybox.children.length - 1] &&
              this.numVisibleDates > 1
            ) {
              headerDayBox.setAttribute("todaylastinview", "true");
            }
            break;
          }
          case 1: {
            dayHeaderBox.setAttribute("relation", "future");
            dayEventsBox.setAttribute("relation", "future");
            labelbox.setAttribute("relation", "future");
            break;
          }
        }
        // We don't want to actually mess with our original dates, plus
        // they're likely to be immutable.
        const date2 = date.clone();
        date2.isDate = true;
        date2.makeImmutable();
        this.mDateColumns.push({ date: date2, column: dayEventsBox, header: dayHeaderBox });
        counter++;
      }

      // Remove any extra columns that may have been hanging around.
      function removeExtraKids(elem) {
        while (counter < elem.children.length) {
          elem.children[counter].remove();
        }
      }
      removeExtraKids(daybox);
      removeExtraKids(headerdaybox);
      removeExtraKids(this.labeldaybox);

      if (updateTimeIndicator) {
        this.updateTimeIndicatorPosition();
      }

      // Fix pixels-per-minute.
      this.onResize();
      if (this.mDateColumns) {
        for (const col of this.mDateColumns) {
          col.column.endLayoutBatchChange();
        }
      }

      // Adjust scrollbar spacers.
      this.adjustScrollBarSpacers();

      // Store the start and end of current view. Next time when
      // setDateRange is called, it will use mViewStart and mViewEnd to
      // check if view range has been changed.
      this.mViewStart = this.mStartDate;
      this.mViewEnd = this.mEndDate;

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
     * Return the column object for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {?DateColumn}         A column object.
     */
    findColumnForDate(date) {
      if (!this.mDateColumns) {
        return null;
      }
      for (const col of this.mDateColumns) {
        if (col.date.compare(date) == 0) {
          return col;
        }
      }
      return null;
    }

    /**
     * Return the day box (column header) for a given date.
     *
     * @param {calIDateTime} date    A date.
     * @return {Element}             A `calendar-header-container` where "all day" events appear.
     */
    findDayBoxForDate(date) {
      const col = this.findColumnForDate(date);
      return col && col.header;
    }

    /**
     * Select the column header for a given date.
     *
     * @param {calIDateTime} date    A date.
     */
    selectColumnHeader(date) {
      let child = this.labeldaybox.firstElementChild;
      while (child) {
        if (child.date.compare(date) == 0) {
          child.setAttribute("selected", "true");
        } else {
          child.removeAttribute("selected");
        }
        child = child.nextElementSibling;
      }
    }

    /**
     * Return the column objects for a group of occurrences.
     *
     * @param {calIItemBase[]} occurrences    Array of calendar item occurrences.
     * @return {DateColumn[]}                 Array of column objects.
     */
    findColumnsForOccurrences(occurrences) {
      if (!this.mDateColumns || !this.mDateColumns.length) {
        return [];
      }

      const occMap = {};
      for (const occ of occurrences) {
        const startDate = occ[cal.dtz.startDateProp(occ)].getInTimezone(this.mStartDate.timezone);

        const endDate =
          occ[cal.dtz.endDateProp(occ)].getInTimezone(this.mEndDate.timezone) || startDate;

        if (startDate.compare(this.mStartDate) >= 0 && endDate.compare(this.mEndDate) <= 0) {
          for (let i = startDate.day; i <= endDate.day; i++) {
            occMap[i] = true;
          }
        }
      }

      return this.mDateColumns.filter(col => col.date.day in occMap);
    }

    /**
     * Return the column objects for a given calendar item.
     *
     * @param {calIItemBase} item    A calendar item.
     * @return {DateColumn[]}        An array of column objects.
     */
    findColumnsForItem(item) {
      const columns = [];

      if (!this.mDateColumns) {
        return columns;
      }

      // Note that these may be dates or datetimes.
      const startDate = item.startDate || item.entryDate || item.dueDate;
      if (!startDate) {
        return columns;
      }
      const timezone = this.mDateColumns[0].date.timezone;
      let targetDate = startDate.getInTimezone(timezone);
      let finishDate = (item.endDate || item.dueDate || item.entryDate || startDate).getInTimezone(
        timezone
      );

      if (targetDate.compare(this.mStartDate) < 0) {
        targetDate = this.mStartDate.clone();
      }

      if (finishDate.compare(this.mEndDate) > 0) {
        finishDate = this.mEndDate.clone();
        finishDate.day++;
      }

      // Set the time to 00:00 so that we get all the boxes.
      targetDate.isDate = false;
      targetDate.hour = 0;
      targetDate.minute = 0;
      targetDate.second = 0;

      if (targetDate.compare(finishDate) == 0) {
        // We have also to handle zero length events in particular for
        // tasks without entry or due date.
        const col = this.findColumnForDate(targetDate);
        if (col) {
          columns.push(col);
        }
      }

      while (targetDate.compare(finishDate) == -1) {
        const col = this.findColumnForDate(targetDate);

        // This might not exist if the event spans the view start or end.
        if (col) {
          columns.push(col);
        }
        targetDate.day += 1;
      }

      return columns;
    }

    /**
     * For the given client-coord-system point, return the event column element that contains
     * it. If no column contains it, return null.
     *
     * @param {number} clientX    A client X coordinate.
     * @param {number} clientY    A client Y coordinate.
     * @return {?Element}         A `calendar-event-column` element.
     */
    findColumnForClientPoint(clientX, clientY) {
      if (!this.mDateColumns) {
        return null;
      }
      for (const col of this.mDateColumns) {
        const element = col.column.querySelector(".multiday-column-box-stack");

        const boundingRect = element.getBoundingClientRect();
        if (
          clientX >= element.screenX &&
          clientX <= element.screenX + boundingRect.width &&
          clientY >= element.screenY &&
          clientY <= element.screenY + boundingRect.height
        ) {
          return col.column;
        }
      }
      return null;
    }

    /**
     * If an all day event is added or deleted, then the header with all day events could get a
     * scrollbar. Readjust the scrollbar spacers.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    adjustScrollbarSpacersForAlldayEvents(event) {
      const startDate = event[cal.dtz.startDateProp(event)];
      const endDate = event[cal.dtz.endDateProp(event)];

      if ((startDate && startDate.isDate) || (endDate && endDate.isDate)) {
        this.adjustScrollBarSpacers();
      }
    }

    /**
     * Display a calendar item.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    doAddItem(event) {
      const cols = this.findColumnsForItem(event);
      if (!cols.length) {
        return;
      }

      for (const col of cols) {
        const estart = event.startDate || event.entryDate || event.dueDate;

        if (estart.isDate) {
          col.header.addEvent(event);
        } else {
          col.column.addEvent(event);
        }
      }
      this.adjustScrollbarSpacersForAlldayEvents(event);
    }

    /**
     * Remove a calendar item so it is no longer displayed.
     *
     * @param {calIItemBase} event    A calendar item.
     */
    doDeleteItem(event) {
      const cols = this.findColumnsForItem(event);
      if (!cols.length) {
        return;
      }

      const oldLength = this.mSelectedItems.length;
      this.mSelectedItems = this.mSelectedItems.filter(item => {
        return item.hashId != event.hashId;
      });

      for (const col of cols) {
        const estart = event.startDate || event.entryDate || event.dueDate;

        if (estart.isDate) {
          col.header.deleteEvent(event);
        } else {
          col.column.deleteEvent(event);
        }
      }

      // If a deleted event was selected, we need to announce that the selection changed.
      if (oldLength != this.mSelectedItems.length) {
        this.fireEvent("itemselect", this.mSelectedItems);
      }

      this.adjustScrollbarSpacersForAlldayEvents(event);
    }

    /**
     * Remove all items for a given calendar so they are no longer displayed.
     *
     * @param {calICalendar} calendar    A calendar object.
     */
    deleteItemsFromCalendar(calendar) {
      if (!this.mDateColumns) {
        return;
      }
      for (const col of this.mDateColumns) {
        // Get all-day events in column header and events within the column.
        const colEvents = col.header.mItemBoxes
          .map(box => box.occurrence)
          .concat(col.column.mEventInfos.map(info => info.event));

        for (const event of colEvents) {
          if (event.calendar.id == calendar.id) {
            this.doDeleteItem(event);
          }
        }
      }
    }

    /**
     * Adjust scroll bar spacers if needed.
     */
    adjustScrollBarSpacers() {
      // Get the width or height of the scrollbox scrollbar, depending on view orientation.
      const widthOrHeight = this.getAttribute("orient") == "vertical" ? "width" : "height";

      // We cannot access the scrollbar to get its size directly (e.g. via querySelector) so
      // we subtract the size of the other scrollbox children from the size of the scrollbox
      // to calculate the size of the scrollbar.
      let scrollboxChildrenSize = 0;
      for (const child of this.scrollbox.children) {
        scrollboxChildrenSize += child.getBoundingClientRect()[widthOrHeight];
      }
      const scrollboxSize = this.scrollbox.getBoundingClientRect()[widthOrHeight];

      const scrollbarSize = scrollboxSize - scrollboxChildrenSize;

      // Check if we need to show the headerScrollbarSpacer at all.
      let headerPropVal = scrollbarSize;
      const headerDayBox = this.querySelector(".headerdaybox");
      if (headerDayBox) {
        // Only do this when there are multiple days.
        const headerDayBoxMaxHeight = parseInt(
          document.defaultView.getComputedStyle(headerDayBox).getPropertyValue("max-height"),
          10
        );

        if (
          this.getAttribute("orient") == "vertical" &&
          headerDayBox.getBoundingClientRect().height >= headerDayBoxMaxHeight
        ) {
          // If the headerDayBox is just as high as the max-height, then
          // there is already a scrollbar and we don't need to show the
          // headerScrollbarSpacer. This is only valid for the non-rotated view.
          headerPropVal = 0;
        }
      }

      // Set the same width/height for the label and header box spacers.
      this.querySelector(".headerscrollbarspacer").setAttribute(widthOrHeight, headerPropVal);
      this.querySelector(".labelscrollbarspacer").setAttribute(widthOrHeight, scrollbarSize);
    }

    /**
     * Scroll the view to a given minute.
     *
     * @param {number} rawMinute    The minute to scroll to.
     */
    scrollToMinute(rawMinute) {
      const scrollbox = this.scrollbox;
      // The minute will be the first minute showed in the view, so it must
      // belong to the range 0 <-> (24*60 - minutes_showed_in_the_view) but
      // we consider 25 hours instead of 24 to let the view scroll until
      // showing events that start just before 0.00.
      const maxFirstMin =
        25 * 60 - Math.round(scrollbox.getBoundingClientRect().height / this.mPixPerMin);

      const minute = Math.min(maxFirstMin, Math.max(0, rawMinute));

      if (scrollbox.scrollHeight > 0) {
        const pos = Math.round(minute * this.mPixPerMin);
        if (scrollbox.getAttribute("orient") == "horizontal") {
          scrollbox.scrollTo(scrollbox.scrollLeft, pos);
        } else {
          scrollbox.scrollTo(pos, scrollbox.scrollTop);
        }
      }

      // Set the first visible minute in any case, we want to move to the
      // right minute as soon as possible if we couldn't do so above.
      this.mFirstVisibleMinute = minute;
    }

    /**
     * Set the day start minute and the day end minute.
     *
     * @param {number} dayStartMin    Starting minute for the day.
     * @param {number} dayEndMin      Ending minute for the day.
     */
    setDayStartEndMinutes(dayStartMin, dayEndMin) {
      // If the timebar is not set up yet, defer until it is.
      if (!("setDayStartEndHours" in this.timebar)) {
        this.timebar.addEventListener(
          "bindingattached",
          () => this.setDayStartEndMinutes(dayStartMin, dayEndMin),
          { once: true }
        );
        return;
      }
      if (dayStartMin < this.mStartMin || dayStartMin > dayEndMin || dayEndMin > this.mEndMin) {
        throw Cr.NS_ERROR_INVALID_ARG;
      }
      if (this.mDayStartMin != dayStartMin || this.mDayEndMin != dayEndMin) {
        this.mDayStartMin = dayStartMin;
        this.mDayEndMin = dayEndMin;

        // Also update on the time-bar.
        this.timebar.setDayStartEndHours(this.mDayStartMin / 60, this.mDayEndMin / 60);
      }
    }

    /**
     * Set how many minutes are visible in the view.
     *
     * @param {number} minutes    A number of visible minutes.
     * @return {number}           A number of visible minutes.
     */
    setVisibleMinutes(minutes) {
      if (minutes <= 0 || minutes > this.mEndMin - this.mStartMin) {
        throw Cr.NS_ERROR_INVALID_ARG;
      }
      if (this.mVisibleMinutes != minutes) {
        this.mVisibleMinutes = minutes;
      }
      return this.mVisibleMinutes;
    }
  }

  MozElements.CalendarMultidayBaseView = CalendarMultidayBaseView;
}
