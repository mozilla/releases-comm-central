/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals cal MozXULElement */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
  const lazy = {};
  ChromeUtils.defineESModuleGetters(lazy, {
    CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  });

  const dayFormatter = new Services.intl.DateTimeFormat(undefined, { day: "numeric" });
  const dateFormatter = new Services.intl.DateTimeFormat(undefined, { dateStyle: "long" });

  /**
   * MiniMonth Calendar: day-of-month grid component.
   * Displays month name and year above grid of days of month by week rows.
   * Arrows move forward or back a month or a year.
   * Clicking on a day cell selects that day.
   * At site, can provide id, and code to run when value changed by picker.
   *   <calendar-minimonth id="my-date-picker" onchange="myDatePick( this );"/>
   *
   * May get/set value in javascript with
   *   document.querySelector("#my-date-picker").value = new Date();
   *
   * @implements {calIObserver}
   * @implements {calICompositeObserver}
   */
  class CalendarMinimonth extends MozXULElement {
    constructor() {
      super();
      // Set up custom interfaces.
      this.calIObserver = this.getCustomInterfaceCallback(Ci.calIObserver);
      this.calICompositeObserver = this.getCustomInterfaceCallback(Ci.calICompositeObserver);

      const onPreferenceChanged = () => {
        this.dayBoxes.clear(); // Days have moved, force a refresh of the grid.
        this.refreshDisplay();
      };

      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "weekStart",
        "calendar.week.start",
        0,
        onPreferenceChanged
      );
      XPCOMUtils.defineLazyPreferenceGetter(
        this,
        "showWeekNumber",
        "calendar.view-minimonth.showWeekNumber",
        true,
        onPreferenceChanged
      );
    }

    static get inheritedAttributes() {
      return {
        ".minimonth-header": "readonly,month,year",
        ".minimonth-year-name": "value=year",
      };
    }

    connectedCallback() {
      if (this.delayConnectedCallback() || this.hasChildNodes()) {
        return;
      }

      MozXULElement.insertFTLIfNeeded("calendar/calendar-widgets.ftl");

      const minimonthHeader = `
        <html:div class="minimonth-header minimonth-month-box"
                  xmlns="http://www.w3.org/1999/xhtml">
          <div class="minimonth-nav-section">
            <button class="button icon-button icon-only minimonth-nav-btn today-button"
                    data-l10n-id="calendar-today-button-tooltip"
                    type="button"
                    dir="0">
            </button>
          </div>
          <div class="minimonth-nav-section">
            <button class="button icon-button icon-only minimonth-nav-btn months-back-button"
                    data-l10n-id="calendar-nav-button-prev-tooltip-month"
                    type="button"
                    dir="-1">
            </button>
            <div class="minimonth-nav-item">
              <input class="minimonth-month-name" tabindex="-1" readonly="true" disabled="disabled" />
            </div>
            <button class="button icon-button icon-only minimonth-nav-btn months-forward-button"
                    data-l10n-id="calendar-nav-button-next-tooltip-month"
                    type="button"
                    dir="1">
            </button>
          </div>
          <div class="minimonth-nav-section">
            <button class="button icon-button icon-only minimonth-nav-btn years-back-button"
                    data-l10n-id="calendar-nav-button-prev-tooltip-year"
                    type="button"
                    dir="-1">
            </button>
            <div class="minimonth-nav-item">
              <input class="yearcell minimonth-year-name" tabindex="-1" readonly="true" disabled="disabled" />
            </div>
            <button class="button icon-button icon-only minimonth-nav-btn years-forward-button"
                    data-l10n-id="calendar-nav-button-next-tooltip-year"
                    type="button"
                    dir="1">
            </button>
          </div>
        </html:div>
      `;

      const minimonthWeekRow = `
        <html:tr class="minimonth-row-body">
          <html:th class="minimonth-week" scope="row"></html:th>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
          <html:td class="minimonth-day" tabindex="-1"></html:td>
        </html:tr>
      `;

      this.appendChild(
        MozXULElement.parseXULToFragment(
          `
          ${minimonthHeader}
          <html:div class="minimonth-readonly-header minimonth-month-box"></html:div>
          <html:table class="minimonth-calendar minimonth-cal-box">
            <html:tr class="minimonth-row-head">
              <html:th class="minimonth-row-header-week" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
              <html:th class="minimonth-row-header" scope="col"></html:th>
            </html:tr>
            ${minimonthWeekRow}
            ${minimonthWeekRow}
            ${minimonthWeekRow}
            ${minimonthWeekRow}
            ${minimonthWeekRow}
            ${minimonthWeekRow}
          </html:table>
          `,
          ["chrome://calendar/locale/global.dtd"]
        )
      );
      this.initializeAttributeInheritance();
      this.setAttribute("orient", "vertical");

      // Set up header buttons.
      this.querySelector(".months-back-button").addEventListener("click", () =>
        this.advanceMonth(-1)
      );
      this.querySelector(".months-forward-button").addEventListener("click", () =>
        this.advanceMonth(1)
      );
      this.querySelector(".years-back-button").addEventListener("click", () =>
        this.advanceYear(-1)
      );
      this.querySelector(".years-forward-button").addEventListener("click", () =>
        this.advanceYear(1)
      );
      this.querySelector(".today-button").addEventListener("click", () => {
        this.value = new Date();
      });

      this.dayBoxes = new Map();
      this.mValue = null;
      this.mEditorDate = null;
      this.mExtraDate = null;
      this.mPixelScrollDelta = 0;
      this.mObservesComposite = false;
      this.mToday = null;
      this.mSelected = null;
      this.mExtra = null;
      this.mValue = new Date(); // Default to "today".
      this.mFocused = null;

      let width = 0;
      // Start loop from 1 as it is needed to get the first month name string
      // and avoid extra computation of adding one.
      for (let i = 1; i <= 12; i++) {
        const dateString = cal.l10n.getDateFmtString(`month.${i}.name`);
        width = Math.max(dateString.length, width);
      }
      this.querySelector(".minimonth-month-name").style.width = `${width + 1}ch`;

      this.refreshDisplay();
      if (this.hasAttribute("freebusy")) {
        this._setFreeBusy(this.getAttribute("freebusy") == "true");
      }

      // Add event listeners.
      this.addEventListener("click", event => {
        if (event.button == 0 && event.target.classList.contains("minimonth-day")) {
          this.onDayActivate(event);
        }
      });

      this.addEventListener("keypress", event => {
        if (event.target.classList.contains("minimonth-day")) {
          if (event.altKey || event.metaKey) {
            return;
          }
          switch (event.keyCode) {
            case KeyEvent.DOM_VK_LEFT:
              this.onDayMovement(event, 0, 0, -1);
              break;
            case KeyEvent.DOM_VK_RIGHT:
              this.onDayMovement(event, 0, 0, 1);
              break;
            case KeyEvent.DOM_VK_UP:
              this.onDayMovement(event, 0, 0, -7);
              break;
            case KeyEvent.DOM_VK_DOWN:
              this.onDayMovement(event, 0, 0, 7);
              break;
            case KeyEvent.DOM_VK_PAGE_UP:
              if (event.shiftKey) {
                this.onDayMovement(event, -1, 0, 0);
              } else {
                this.onDayMovement(event, 0, -1, 0);
              }
              break;
            case KeyEvent.DOM_VK_PAGE_DOWN:
              if (event.shiftKey) {
                this.onDayMovement(event, 1, 0, 0);
              } else {
                this.onDayMovement(event, 0, 1, 0);
              }
              break;
            case KeyEvent.DOM_VK_ESCAPE:
              this.focusDate(this.mValue || this.mExtraDate);
              event.stopPropagation();
              event.preventDefault();
              break;
            case KeyEvent.DOM_VK_HOME: {
              const today = new Date();
              this.update(today);
              this.focusDate(today);
              event.stopPropagation();
              event.preventDefault();
              break;
            }
            case KeyEvent.DOM_VK_RETURN:
              this.onDayActivate(event);
              break;
          }
        }
      });

      this.addEventListener("wheel", event => {
        const pixelThreshold = 150;
        let deltaView = 0;
        if (this.getAttribute("readonly") == "true") {
          // No scrolling on readonly months.
          return;
        }
        if (event.deltaMode == event.DOM_DELTA_LINE || event.deltaMode == event.DOM_DELTA_PAGE) {
          if (event.deltaY != 0) {
            deltaView = event.deltaY > 0 ? 1 : -1;
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
          const classList = event.target.classList;

          if (
            classList.contains("years-forward-button") ||
            classList.contains("yearcell") ||
            classList.contains("years-back-button")
          ) {
            this.advanceYear(deltaView);
          } else if (!classList.contains("today-button")) {
            this.advanceMonth(deltaView);
          }
        }

        event.stopPropagation();
        event.preventDefault();
      });
    }

    set value(val) {
      this.update(val);
    }

    get value() {
      return this.mValue;
    }

    set extra(val) {
      this.mExtraDate = val;
    }

    get extra() {
      return this.mExtraDate;
    }

    /**
     * Returns the first (inclusive) date of the minimonth as a calIDateTime object.
     */
    get firstDate() {
      const date = this._getCalBoxNode(1, 1).date;
      return cal.dtz.jsDateToDateTime(date);
    }

    /**
     * Returns the last (exclusive) date of the minimonth as a calIDateTime object.
     */
    get lastDate() {
      const date = this._getCalBoxNode(6, 7).date;
      const lastDateTime = cal.dtz.jsDateToDateTime(date);
      lastDateTime.day = lastDateTime.day + 1;
      return lastDateTime;
    }

    get mReadOnlyHeader() {
      return this.querySelector(".minimonth-readonly-header");
    }

    setBusyDaysForItem(aItem, aState) {
      const items = aItem.recurrenceInfo
        ? aItem.getOccurrencesBetween(this.firstDate, this.lastDate)
        : [aItem];
      items.forEach(item => this.setBusyDaysForOccurrence(item, aState));
    }

    parseBoxBusy(aBox) {
      const boxBusy = {};

      const busyStr = aBox.getAttribute("busy");
      if (busyStr && busyStr.length > 0) {
        const calChunks = busyStr.split("\u001A");
        for (const chunk of calChunks) {
          const expr = chunk.split("=");
          boxBusy[expr[0]] = parseInt(expr[1], 10);
        }
      }

      return boxBusy;
    }

    updateBoxBusy(aBox, aBoxBusy) {
      const calChunks = [];

      for (const calId in aBoxBusy) {
        if (aBoxBusy[calId]) {
          calChunks.push(calId + "=" + aBoxBusy[calId]);
        }
      }

      if (calChunks.length > 0) {
        const busyStr = calChunks.join("\u001A");
        aBox.setAttribute("busy", busyStr);
      } else {
        aBox.removeAttribute("busy");
      }
    }

    removeCalendarFromBoxBusy(aBox, aCalendar) {
      const boxBusy = this.parseBoxBusy(aBox);
      if (boxBusy[aCalendar.id]) {
        delete boxBusy[aCalendar.id];
      }
      this.updateBoxBusy(aBox, boxBusy);
    }

    setBusyDaysForOccurrence(aOccurrence, aState) {
      if (aOccurrence.getProperty("TRANSP") == "TRANSPARENT") {
        // Skip transparent events.
        return;
      }
      let start = aOccurrence[cal.dtz.startDateProp(aOccurrence)] || aOccurrence.dueDate;
      let end = aOccurrence[cal.dtz.endDateProp(aOccurrence)] || start;
      if (!start) {
        return;
      }

      if (start.compare(this.firstDate) < 0) {
        start = this.firstDate.clone();
      }

      if (end.compare(this.lastDate) > 0) {
        end = this.lastDate.clone();
        end.day++;
      }

      // We need to compare with midnight of the current day, so reset the
      // time here.
      const current = start.clone().getInTimezone(cal.dtz.defaultTimezone);
      current.hour = 0;
      current.minute = 0;
      current.second = 0;

      // Cache the result so the compare isn't called in each iteration.
      const compareResult = start.compare(end) == 0 ? 1 : 0;

      // Setup the busy days.
      while (current.compare(end) < compareResult) {
        const box = this.getBoxForDate(current);
        if (box) {
          const busyCalendars = this.parseBoxBusy(box);
          if (!busyCalendars[aOccurrence.calendar.id]) {
            busyCalendars[aOccurrence.calendar.id] = 0;
          }
          busyCalendars[aOccurrence.calendar.id] += aState ? 1 : -1;
          this.updateBoxBusy(box, busyCalendars);
        }
        current.day++;
      }
    }

    // calIObserver methods.
    calendarsInBatch = new Set();

    onStartBatch(aCalendar) {
      this.calendarsInBatch.add(aCalendar);
    }

    onEndBatch(aCalendar) {
      this.calendarsInBatch.delete(aCalendar);
    }

    onLoad(aCalendar) {
      this.getItems(aCalendar);
    }

    onAddItem(aItem) {
      if (this.calendarsInBatch.has(aItem.calendar)) {
        return;
      }

      this.setBusyDaysForItem(aItem, true);
    }

    onDeleteItem(aItem) {
      this.setBusyDaysForItem(aItem, false);
    }

    onModifyItem(aNewItem, aOldItem) {
      if (this.calendarsInBatch.has(aNewItem.calendar)) {
        return;
      }

      this.setBusyDaysForItem(aOldItem, false);
      this.setBusyDaysForItem(aNewItem, true);
    }

    onError() {}

    onPropertyChanged(aCalendar, aName) {
      switch (aName) {
        case "disabled":
          this.resetAttributesForDate();
          this.getItems();
          break;
      }
    }

    onPropertyDeleting(aCalendar, aName) {
      this.onPropertyChanged(aCalendar, aName, null, null);
    }

    // End of calIObserver methods.
    // calICompositeObserver methods.

    onCalendarAdded(aCalendar) {
      if (!aCalendar.getProperty("disabled")) {
        this.getItems(aCalendar);
      }
    }

    onCalendarRemoved(aCalendar) {
      if (!aCalendar.getProperty("disabled")) {
        for (const box of this.dayBoxes.values()) {
          this.removeCalendarFromBoxBusy(box, aCalendar);
        }
      }
    }

    onDefaultCalendarChanged() {}

    // End calICompositeObserver methods.

    refreshDisplay() {
      if (!this.mValue) {
        this.mValue = new Date();
      }
      this.setHeader();
      this.showMonth(this.mValue);
      this.updateAccessibleLabel();
    }

    _getCalBoxNode(aRow, aCol) {
      if (!this.mCalBox) {
        this.mCalBox = this.querySelector(".minimonth-calendar");
      }
      return this.mCalBox.children[aRow].children[aCol];
    }

    setHeader() {
      // Reset the headers.
      const dayList = new Array(7);
      const longDayList = new Array(7);
      const tempDate = new Date();
      let i, j;
      let useOSFormat;
      tempDate.setDate(tempDate.getDate() - (tempDate.getDay() - this.weekStart));
      for (i = 0; i < 7; i++) {
        // If available, use UILocale days, else operating system format.
        try {
          dayList[i] = cal.l10n.getDateFmtString(`day.${tempDate.getDay() + 1}.short`);
        } catch (e) {
          dayList[i] = tempDate.toLocaleDateString(undefined, { weekday: "short" });
          useOSFormat = true;
        }
        longDayList[i] = tempDate.toLocaleDateString(undefined, { weekday: "long" });
        tempDate.setDate(tempDate.getDate() + 1);
      }

      if (useOSFormat) {
        // To keep datepicker popup compact, shrink localized weekday
        // abbreviations down to 1 or 2 chars so each column of week can
        // be as narrow as 2 digits.
        //
        // 1. Compute the minLength of the day name abbreviations.
        const minLength = dayList.map(name => name.length).reduce((min, len) => Math.min(min, len));

        // 2. If some day name abbrev. is longer than 2 chars (not Catalan),
        //    and ALL localized day names share same prefix (as in Chinese),
        //    then trim shared "day-" prefix.
        if (dayList.some(dayAbbr => dayAbbr.length > 2)) {
          for (let endPrefix = 0; endPrefix < minLength; endPrefix++) {
            const suffix = dayList[0][endPrefix];
            if (dayList.some(dayAbbr => dayAbbr[endPrefix] != suffix)) {
              if (endPrefix > 0) {
                for (i = 0; i < dayList.length; i++) {
                  // trim prefix chars.
                  dayList[i] = dayList[i].substring(endPrefix);
                }
              }
              break;
            }
          }
        }
        // 3. Trim each day abbreviation to 1 char if unique, else 2 chars.
        for (i = 0; i < dayList.length; i++) {
          let foundMatch = 1;
          for (j = 0; j < dayList.length; j++) {
            if (i != j) {
              if (dayList[i].substring(0, 1) == dayList[j].substring(0, 1)) {
                foundMatch = 2;
                break;
              }
            }
          }
          dayList[i] = dayList[i].substring(0, foundMatch);
        }
      }

      this._getCalBoxNode(0, 0).hidden = !this.showWeekNumber;
      for (let column = 1; column < 8; column++) {
        const node = this._getCalBoxNode(0, column);
        node.textContent = dayList[column - 1];
        node.setAttribute("aria-label", longDayList[column - 1]);
      }
    }

    showMonth(aDate) {
      // Use mExtraDate if aDate is null.
      aDate = new Date(aDate || this.mExtraDate);

      aDate.setDate(1);
      // We set the hour and minute to something highly unlikely to be the
      // exact change point of DST, so timezones like America/Sao Paulo
      // don't display some days twice.
      aDate.setHours(12);
      aDate.setMinutes(34);
      aDate.setSeconds(0);
      aDate.setMilliseconds(0);
      // Don't fire onmonthchange event upon initialization
      const monthChanged = this.mEditorDate && this.mEditorDate.valueOf() != aDate.valueOf();
      this.mEditorDate = aDate; // Only place mEditorDate is set.

      if (this.mSelected) {
        this.mSelected.removeAttribute("selected");
        this.mSelected = null;
      }

      // Get today's date.
      const today = new Date();

      if (!monthChanged && this.dayBoxes.size > 0) {
        this.mSelected = this.getBoxForDate(this.value);
        if (this.mSelected) {
          this.mSelected.setAttribute("selected", "true");
        }

        const todayBox = this.getBoxForDate(today);
        if (this.mToday != todayBox) {
          if (this.mToday) {
            this.mToday.removeAttribute("today");
          }
          this.mToday = todayBox;
          if (this.mToday) {
            this.mToday.setAttribute("today", "true");
          }
        }
        return;
      }

      if (this.mToday) {
        this.mToday.removeAttribute("today");
        this.mToday = null;
      }

      if (this.mExtra) {
        this.mExtra.removeAttribute("extra");
        this.mExtra = null;
      }

      // Update the month and year title.
      this.setAttribute("year", aDate.getFullYear());
      this.setAttribute("month", aDate.getMonth());

      const miniMonthName = this.querySelector(".minimonth-month-name");
      const dateString = cal.l10n.getDateFmtString(`month.${aDate.getMonth() + 1}.name`);
      miniMonthName.setAttribute("value", dateString);
      miniMonthName.setAttribute("monthIndex", aDate.getMonth());
      this.mReadOnlyHeader.textContent = dateString + " " + aDate.getFullYear();

      // Update the calendar.
      const calbox = this.querySelector(".minimonth-calendar");
      const date = this._getStartDate(aDate);

      if (aDate.getFullYear() == (this.mValue || this.mExtraDate).getFullYear()) {
        calbox.setAttribute("aria-label", dateString);
      } else {
        const monthName = cal.l10n.formatMonth(aDate.getMonth() + 1, "calendar", "month-in-year");
        document.l10n.setAttributes(calbox, "month-in-year-label", {
          month: monthName,
          year: aDate.getFullYear(),
        });
      }

      this.dayBoxes.clear();
      const defaultTz = cal.dtz.defaultTimezone;
      for (let k = 1; k < 7; k++) {
        // Set the week number.
        const firstElement = this._getCalBoxNode(k, 0);
        firstElement.hidden = !this.showWeekNumber;
        if (this.showWeekNumber) {
          const weekNumber = cal.weekInfoService.getWeekTitle(
            cal.dtz.jsDateToDateTime(date, defaultTz)
          );
          firstElement.textContent = weekNumber;
          document.l10n.setAttributes(firstElement, "week-title-label", { title: weekNumber });
        }

        for (let i = 1; i < 8; i++) {
          const day = this._getCalBoxNode(k, i);
          this.setBoxForDate(date, day);

          if (this.getAttribute("readonly") != "true") {
            day.setAttribute("interactive", "true");
          }

          if (aDate.getMonth() == date.getMonth()) {
            day.removeAttribute("othermonth");
          } else {
            day.setAttribute("othermonth", "true");
          }

          // Highlight today.
          if (this._sameDay(today, date)) {
            this.mToday = day;
            day.setAttribute("today", "true");
          }

          // Highlight the current date.
          const val = this.value;
          if (this._sameDay(val, date)) {
            this.mSelected = day;
            day.setAttribute("selected", "true");
          }

          // Highlight the extra date.
          if (this._sameDay(this.mExtraDate, date)) {
            this.mExtra = day;
            day.setAttribute("extra", "true");
          }

          if (aDate.getMonth() == date.getMonth() && aDate.getFullYear() == date.getFullYear()) {
            day.setAttribute("aria-label", dayFormatter.format(date));
          } else {
            day.setAttribute("aria-label", dateFormatter.format(date));
          }

          day.removeAttribute("busy");

          day.date = new Date(date);
          day.textContent = date.getDate();
          date.setDate(date.getDate() + 1);

          this.resetAttributesForBox(day);
        }
      }

      if (!this.mFocused) {
        this.setFocusedDate(this.mValue || this.mExtraDate);
      }

      this.fireEvent("monthchange");

      if (this.getAttribute("freebusy") == "true") {
        this.getItems();
      }
    }

    /**
     * Attention - duplicate!!!!
     */
    fireEvent(aEventName) {
      this.dispatchEvent(new CustomEvent(aEventName, { bubbles: true }));
    }

    _boxKeyForDate(aDate) {
      if (aDate instanceof lazy.CalDateTime || aDate instanceof Ci.calIDateTime) {
        return aDate.getInTimezone(cal.dtz.defaultTimezone).toString().substring(0, 10);
      }
      return [
        aDate.getFullYear(),
        (aDate.getMonth() + 1).toString().padStart(2, "0"),
        aDate.getDate().toString().padStart(2, "0"),
      ].join("-");
    }

    /**
     * Fetches the table cell for the given date, or null if the date isn't displayed.
     *
     * @param {calIDateTime|Date} aDate
     * @returns {HTMLTableCellElement|null}
     */
    getBoxForDate(aDate) {
      return this.dayBoxes.get(this._boxKeyForDate(aDate)) ?? null;
    }

    /**
     * Stores the table cell for the given date.
     *
     * @param {Date} aDate
     * @param {HTMLTableCellElement} aBox
     */
    setBoxForDate(aDate, aBox) {
      this.dayBoxes.set(this._boxKeyForDate(aDate), aBox);
    }

    /**
     * Remove attributes that may have been added to a table cell.
     *
     * @param {HTMLTableCellElement} aBox
     */
    resetAttributesForBox(aBox) {
      let allowedAttributes = 0;
      while (aBox.attributes.length > allowedAttributes) {
        switch (aBox.attributes[allowedAttributes].nodeName) {
          case "selected":
          case "othermonth":
          case "today":
          case "extra":
          case "interactive":
          case "class":
          case "tabindex":
          case "role":
          case "aria-label":
            allowedAttributes++;
            break;
          default:
            aBox.removeAttribute(aBox.attributes[allowedAttributes].nodeName);
            break;
        }
      }
    }

    /**
     * Remove attributes that may have been added to a table cell, or all table cells.
     *
     * @param {Date} [aDate] - If specified, the date of the cell to reset,
     *   otherwise all date cells will be reset.
     */
    resetAttributesForDate(aDate) {
      if (aDate) {
        const box = this.getBoxForDate(aDate);
        if (box) {
          this.resetAttributesForBox(box);
        }
      } else {
        for (let k = 1; k < 7; k++) {
          for (let i = 1; i < 8; i++) {
            this.resetAttributesForBox(this._getCalBoxNode(k, i));
          }
        }
      }
    }

    _setFreeBusy(aFreeBusy) {
      if (aFreeBusy) {
        if (!this.mObservesComposite) {
          cal.view.getCompositeCalendar(window).addObserver(this.calICompositeObserver);
          this.mObservesComposite = true;
          this.getItems();
        }
      } else if (this.mObservesComposite) {
        cal.view.getCompositeCalendar(window).removeObserver(this.calICompositeObserver);
        this.mObservesComposite = false;
      }
    }

    removeAttribute(aAttr) {
      if (aAttr == "freebusy") {
        this._setFreeBusy(false);
      }
      return super.removeAttribute(aAttr);
    }

    setAttribute(aAttr, aVal) {
      if (aAttr == "freebusy") {
        this._setFreeBusy(aVal == "true");
      }
      return super.setAttribute(aAttr, aVal);
    }

    async getItems(aCalendar) {
      // The minimonth automatically clears extra styles on a month change.
      // Therefore we only need to fill the minimonth with new info.

      const calendar = aCalendar || cal.view.getCompositeCalendar(window);
      const filter =
        calendar.ITEM_FILTER_COMPLETED_ALL |
        calendar.ITEM_FILTER_CLASS_OCCURRENCES |
        calendar.ITEM_FILTER_ALL_ITEMS;

      // Get new info.
      for await (const items of cal.iterate.streamValues(
        calendar.getItems(filter, 0, this.firstDate, this.lastDate)
      )) {
        items.forEach(item => this.setBusyDaysForOccurrence(item, true));
      }
    }

    updateAccessibleLabel() {
      if (this.mValue) {
        this.removeAttribute("data-l10n-id");
        this.setAttribute("aria-label", dateFormatter.format(this.mValue));
      } else {
        document.l10n.setAttributes(this, "minimonth-no-selected-date");
      }
    }

    update(aValue) {
      const changed =
        this.mValue &&
        aValue &&
        (this.mValue.getFullYear() != aValue.getFullYear() ||
          this.mValue.getMonth() != aValue.getMonth() ||
          this.mValue.getDate() != aValue.getDate());

      this.mValue = aValue;
      if (changed) {
        this.fireEvent("change");
      }
      this.showMonth(aValue);
      if (aValue) {
        this.setFocusedDate(aValue);
      }
      this.updateAccessibleLabel();
    }

    setFocusedDate(aDate, aForceFocus) {
      const newFocused = this.getBoxForDate(aDate);
      if (!newFocused) {
        return;
      }
      if (this.mFocused) {
        this.mFocused.setAttribute("tabindex", "-1");
      }
      this.mFocused = newFocused;
      this.mFocused.setAttribute("tabindex", "0");
      // Only actually move the focus if it is already in the calendar box.
      if (!aForceFocus) {
        const calbox = this.querySelector(".minimonth-calendar");
        aForceFocus = calbox.contains(document.commandDispatcher.focusedElement);
      }
      if (aForceFocus) {
        this.mFocused.focus();
      }
    }

    focusDate(aDate) {
      this.showMonth(aDate);
      this.setFocusedDate(aDate);
    }

    switchMonth(aMonth) {
      const newMonth = new Date(this.mEditorDate);
      newMonth.setMonth(aMonth);
      this.showMonth(newMonth);
    }

    switchYear(aYear) {
      const newMonth = new Date(this.mEditorDate);
      newMonth.setFullYear(aYear);
      this.showMonth(newMonth);
    }

    selectDate(aDate, aMainDate) {
      if (
        !aMainDate ||
        aDate < this._getStartDate(aMainDate) ||
        aDate > this._getEndDate(aMainDate)
      ) {
        aMainDate = new Date(aDate);
        aMainDate.setDate(1);
      }
      // Note that aMainDate and this.mEditorDate refer to the first day
      // of the corresponding month.
      const sameMonth = this._sameDay(aMainDate, this.mEditorDate);
      const sameDate = this._sameDay(aDate, this.mValue);
      if (!sameMonth && !sameDate) {
        // Change month and select day.
        this.mValue = aDate;
        this.showMonth(aMainDate);
      } else if (!sameMonth) {
        // Change month only.
        this.showMonth(aMainDate);
      } else if (!sameDate) {
        // Select day only.
        const day = this.getBoxForDate(aDate);
        if (this.mSelected) {
          this.mSelected.removeAttribute("selected");
        }
        this.mSelected = day;
        day.setAttribute("selected", "true");
        this.mValue = aDate;
        this.setFocusedDate(aDate);
      }
    }

    _getStartDate(aMainDate) {
      const date = new Date(aMainDate);
      const firstWeekday = (7 + aMainDate.getDay() - this.weekStart) % 7;
      date.setDate(date.getDate() - firstWeekday);
      return date;
    }

    _getEndDate(aMainDate) {
      const date = this._getStartDate(aMainDate);
      const calbox = this.querySelector(".minimonth-calendar");
      const days = (calbox.children.length - 1) * 7;
      date.setDate(date.getDate() + days - 1);
      return date;
    }

    _sameDay(aDate1, aDate2) {
      if (
        aDate1 &&
        aDate2 &&
        aDate1.getDate() == aDate2.getDate() &&
        aDate1.getMonth() == aDate2.getMonth() &&
        aDate1.getFullYear() == aDate2.getFullYear()
      ) {
        return true;
      }
      return false;
    }

    advanceMonth(aDir) {
      const advEditorDate = new Date(this.mEditorDate); // At 1st of month.
      const advMonth = this.mEditorDate.getMonth() + aDir;
      advEditorDate.setMonth(advMonth);
      this.showMonth(advEditorDate);
    }

    advanceYear(aDir) {
      const advEditorDate = new Date(this.mEditorDate); // At 1st of month.
      const advYear = this.mEditorDate.getFullYear() + aDir;
      advEditorDate.setFullYear(advYear);
      this.showMonth(advEditorDate);
    }

    moveDateByOffset(aYears, aMonths, aDays) {
      const date = new Date(
        this.mFocused.date.getFullYear() + aYears,
        this.mFocused.date.getMonth() + aMonths,
        this.mFocused.date.getDate() + aDays
      );
      this.focusDate(date);
    }

    focusCalendar() {
      this.mFocused.focus();
    }

    onDayActivate(aEvent) {
      // The associated date might change when setting this.value if month changes.
      const date = aEvent.target.date;
      if (this.getAttribute("readonly") != "true") {
        this.value = date;
        this.fireEvent("select");
      }
      this.setFocusedDate(date, true);
      aEvent.stopPropagation();
      aEvent.preventDefault();
    }

    onDayMovement(event, years, months, days) {
      this.moveDateByOffset(years, months, days);
      event.stopPropagation();
      event.preventDefault();
    }

    disconnectedCallback() {
      if (this.mObservesComposite) {
        cal.view.getCompositeCalendar(window).removeObserver(this.calICompositeObserver);
      }
    }
  }

  MozXULElement.implementCustomInterface(CalendarMinimonth, [
    Ci.calIObserver,
    Ci.calICompositeObserver,
  ]);
  customElements.define("calendar-minimonth", CalendarMinimonth);
}
