/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["CalendarTestUtils"];

const EventUtils = ChromeUtils.import("resource://testing-common/mozmill/EventUtils.jsm");
const { BrowserTestUtils } = ChromeUtils.import("resource://testing-common/BrowserTestUtils.jsm");
const { TestUtils } = ChromeUtils.import("resource://testing-common/TestUtils.jsm");
const { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
const { cancelItemDialog, saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
);

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

async function clickAndWait(win, button) {
  EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, win);
  await new Promise(resolve => win.setTimeout(resolve));
}

/**
 * @typedef EditItemAtResult
 * @property {Window} dialogWindow - The window of the dialog.
 * @property {HTMLDocument} dialogDocument - The document of the dialog window.
 * @property {Window} iframeWindow - The contentWindow property of the embeded
 *  iframe.
 * @property {HTMLDocument} iframeDocument - The contentDocument of the embeded
 *  iframe.
 */

/**
 * Non-mozmill calendar helper utility.
 */
const CalendarTestUtils = {
  /**
   * Helper methods for item editing.
   */
  items: {
    cancelItemDialog,
    saveAndCloseItemDialog,
    setData,
  },
  /**
   * Helper methods specific to the day view.
   */
  dayView: {
    /**
     * Provides the element located at the specified hour, which can be double
     * clicked to create a new event at the specified hour.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} hour - Must be between 0-23.
     *
     * @throws If the hour is out of range.
     * @returns {XULElement}
     */
    getHourBox(win, hour) {
      if (!(hour >= 0 && hour <= 23)) {
        throw new Error(
          `Invalid parameters to getHourBox(): expected hour=0-23, got hour=${hour},`
        );
      }

      return win.document.querySelector(
        `#day-view .multiday-column-bg-box > spacer:nth-of-type(${hour + 1})`
      );
    },

    /**
     * Provides the calendar-event-box elements for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     *
     * @returns {NodeList} A list of all events in the day.
     */
    getEventBoxes(win) {
      return win.document.querySelectorAll("#day-view .multiday-column-top-box calendar-event-box");
    },

    /**
     * Provides the single calendar-event-box element for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     *
     * @throws If more than one event found on the day.
     * @returns {MozCalendarEventBox} The single event, or null if none found.
     */
    getEventBox(win) {
      let found = CalendarTestUtils.dayView.getEventBoxes(win);
      switch (found.length) {
        case 0:
          return null;
        case 1:
          return found[0];
        default:
          throw new Error(`Found ${found.length} events in the day-view, rather than one`);
      }
    },

    /**
     * Wait for the single calendar-event-box element for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     *
     * @throws If more than one event found on the day.
     * @returns {MozCalendarEventBox}
     */
    async waitForEventBox(win) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.dayView.getEventBox(win),
        "Day event box in the day-view"
      );
    },

    /**
     * Wait for the day to contain no events.
     *
     * @param {Window} win - The window the calendar is displayed in.
     */
    async waitForNoEvents(win) {
      await TestUtils.waitForCondition(
        () => !CalendarTestUtils.dayView.getEventBoxes(win).length,
        "No events in the day-view"
      );
    },

    /**
     * Provides the all-day header, which can be double clicked to create a new
     * all-day event.
     *
     * @param {Window} win - The window the calendar is displayed in.
     *
     * @returns {CalendarHeaderContainer}
     */
    getAllDayHeader(win) {
      return win.document.querySelector("#day-view .headerdaybox > calendar-header-container");
    },

    /**
     * Provides the all-day calendar-editable-item for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the index is out of range.
     *
     * @returns {MozCalendarEditableItem}
     */
    getAllDayItem(win, index = 1) {
      if (!(index >= 1)) {
        throw new Error(
          `Invalid parameter to getAllDayItem(): expected index>=1, got index=${index}`
        );
      }
      let allDayHeader = CalendarTestUtils.dayView.getAllDayHeader(win);
      return allDayHeader.querySelector(`calendar-editable-item:nth-of-type(${index})`);
    },

    /**
     * Wait for the all-day calendar-editable-item for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the index is out of range.
     *
     * @returns {MozCalendarEditableItem}
     */
    async waitForAllDayItem(win, index = 1) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.dayView.getAllDayItem(win, index),
        `All-day item for index ${index}, in the day-view`
      );
    },
  },
  /**
   * Helper methods specific to the week view.
   */
  weekView: {
    /**
     * Provides the .multiday-column-bg-box element located at the specified
     * hour, which can be double clicked to create a new event at the specified
     * hour.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     * @param {number} hour - Must be between 0-23.
     *
     * @throws If the day or hour are out of range.
     * @returns {XULElement}
     */
    getHourBox(win, day, hour) {
      if (!(day >= 1 && day <= 7 && hour >= 0 && hour <= 23)) {
        throw new Error(
          `Invalid parameters to getHourBox(): ` +
            `expected day=1-7, hour=0-23, got day=${day}, hour=${hour},`
        );
      }

      return win.document.querySelector(
        `#week-view .daybox > calendar-event-column:nth-of-type(${day}) ` +
          `.multiday-column-bg-box > spacer:nth-of-type(${hour + 1})`
      );
    },

    /**
     * Provides the calendar-event-box elements for the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     *
     * @throws If the day is out of range.
     * @returns {NodeList} A list of all events in the day.
     */
    getEventBoxes(win, day) {
      if (!(day >= 1 && day <= 7)) {
        throw new Error(`Invalid parameter to getEventBox(): expected day=1-7, got day=${day}`);
      }
      return win.document.querySelectorAll(
        `#week-view .daybox > calendar-event-column:nth-of-type(${day}) ` +
          `.multiday-column-top-box calendar-event-box`
      );
    },

    /**
     * Provides the single calendar-event-box element for the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     *
     * @throws If more than one event found on the day.
     * @throws If the day is out of range.
     * @returns {MozCalendarEventBox} The single event, or null if none found.
     */
    getEventBox(win, day) {
      let found = CalendarTestUtils.weekView.getEventBoxes(win, day);
      switch (found.length) {
        case 0:
          return null;
        case 1:
          return found[0];
        default:
          throw new Error(
            `Found ${found.length} events in the week-view for day ${day}, rather than one`
          );
      }
    },

    /**
     * Wait for the single calendar-event-box element for the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     *
     * @throws If more than one event found on the day.
     * @throws If the day is out of range.
     * @returns {MozCalendarEventBox}
     */
    async waitForEventBox(win, day) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.weekView.getEventBox(win, day),
        `Day event box in the week-view for day ${day}`
      );
    },

    /**
     * Wait for the specified day to contain no events.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     *
     * @throws If the day is out of range.
     */
    async waitForNoEvents(win, day) {
      await TestUtils.waitForCondition(
        () => !CalendarTestUtils.weekView.getEventBoxes(win, day).length,
        `No events in the week-view day ${day}`
      );
    },

    /**
     * Provides the all-day header, which can be double clicked to create a new
     * all-day event for the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     *
     * @throws If the day is out of range.
     * @returns {CalendarHeaderContainer}
     */
    getAllDayHeader(win, day) {
      if (!(day >= 1 && day <= 7)) {
        throw new Error(`Invalid parameter to getAllDayHeader(): expected day=1-7, got day=${day}`);
      }
      return win.document.querySelector(
        `#day-view .headerdaybox > calendar-header-container:nth-of-type(${day})`
      );
    },

    /**
     * Provides the all-day calendar-editable-item for the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the day or index are out of range.
     * @returns {MozCalendarEditableItem}
     */
    getAllDayItem(win, day, index = 1) {
      if (!(index >= 1)) {
        throw new Error(
          `Invalid parameter to getAllDayItem(): expected index>=1, got index=${index}`
        );
      }
      let allDayHeader = CalendarTestUtils.weekView.getAllDayHeader(win, day);
      return allDayHeader.querySelector(`calendar-editable-item:nth-of-type(${index})`);
    },

    /**
     * Wait for the all-day calendar-editable-item for the day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} day - Day of the week, between 1-7.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the day or index are out of range.
     * @returns {MozCalendarEditableItem}
     */
    async waitForAllDayItem(win, day, index = 1) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.weekView.getAllDayItem(win, index),
        `All-day item for day ${day} and index ${index}, in the week-view`
      );
    },
  },
  /**
   * Helper methods specific to the multiweek view.
   */
  multiweekView: {
    /**
     * Provides the calendar-month-day-box element located at the specified day,
     * week combination.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6. The cap may be as low as 4
     * depending on the user preference calendar.weeks.inview.
     * @param {number} day - Must be between 1-7.
     *
     * @throws If the day or week parameters are out of range.
     * @returns {MozCalendarMonthDayBox}
     */
    getDayBox(win, week, day) {
      if (!(week >= 1 && week <= 6 && day >= 1 && day <= 7)) {
        throw new Error(
          `Invalid parameters to getDayBox(): ` +
            `expected week=1-6, day=1-7, got week=${week}, day=${day},`
        );
      }

      let weekRow = win.document.documentElement.querySelector(
        `#multiweek-view .monthgrid > tr:nth-of-type(${week})`
      );
      if (weekRow.hidden) {
        throw new Error(`The row for week ${week} is hidden in the multiweek-view`);
      }

      return weekRow.querySelector(`:scope > td:nth-of-type(${day}) > calendar-month-day-box`);
    },

    /**
     * Get the calendar-month-day-box-item located in the specified day box, at
     * the target index.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the index, day or week parameters are out of range.
     * @return {MozCalendarMonthDayBoxItem}
     */
    getItemAt(win, week, day, index = 1) {
      if (!(index >= 1)) {
        throw new Error(
          `Invalid parameters to getItemAt(): expected index>=1, got index=${index},`
        );
      }
      let dayBox = CalendarTestUtils.multiweekView.getDayBox(win, week, day);

      return dayBox.querySelector(`calendar-month-day-box-item:nth-of-type(${index})`);
    },

    /**
     * Attempts to provide the calendar-month-day-box-item located in the
     * specified day box, at the target index.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @return {MozCalendarMonthDayBoxItem}
     */
    async waitForItemAt(win, week, day, index = 1) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.multiweekView.getItemAt(win, week, day, index),
        `Multiweek item on week ${week}, day ${day}, index ${index}`
      );
    },

    /**
     * Wait for there to be no items on the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     *
     * @throws If the day or week parameters are out of range.
     */
    async waitForNoItemsAt(win, week, day) {
      await TestUtils.waitForCondition(
        () => !CalendarTestUtils.multiweekView.getItemAt(win, week, day),
        `No events in the multiweek-view week ${week}, day ${day}`
      );
    },
  },
  /**
   * Helper methods specific to the month view.
   */
  monthView: {
    /**
     * Provides the calendar-month-day-box element located at the specified day,
     * week combination.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6. The cap will be lower for
     * months that only span 4 or 5 weeks.
     * @param {number} day - Must be between 1-7.
     *
     * @throws If the day or week parameters are out of range.
     * @returns {MozCalendarMonthDayBox}
     */
    getDayBox(win, week, day) {
      if (!(week >= 1 && week <= 6 && day >= 1 && day <= 7)) {
        throw new Error(
          `Invalid parameters to getDayBox(): ` +
            `expected week=1-6, day=1-7, got week=${week}, day=${day},`
        );
      }

      let weekRow = win.document.documentElement.querySelector(
        `#month-view .monthgrid > tr:nth-of-type(${week})`
      );
      if (weekRow.hidden) {
        throw new Error(`The row for week ${week} is hidden in the month-view`);
      }

      return weekRow.querySelector(`:scope > td:nth-of-type(${day}) > calendar-month-day-box`);
    },

    /**
     * Get the calendar-month-day-box-item located in the specified day box, at
     * the target index.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select (starting from 1).
     *
     * @throws If the index, day or week parameters are out of range.
     * @return {MozCalendarMonthDayBoxItem}
     */
    getItemAt(win, week, day, index = 1) {
      if (!(index >= 1)) {
        throw new Error(
          `Invalid parameters to getItemAt(): expected index>=1, got index=${index},`
        );
      }
      let dayBox = CalendarTestUtils.monthView.getDayBox(win, week, day);

      return dayBox.querySelector(`calendar-month-day-box-item:nth-of-type(${index})`);
    },

    /**
     * Attempts to provide the calendar-month-day-box-item located in the
     * specified day box, at the target index.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @return {MozCalendarMonthDayBoxItem}
     */
    async waitForItemAt(win, week, day, index = 1) {
      return TestUtils.waitForCondition(
        () => CalendarTestUtils.monthView.getItemAt(win, week, day, index),
        `calendar-month-day-box-item at index:${index} in day box ${day},${week} did not appear in time`
      );
    },

    /**
     * Wait for there to be no items on the specified day.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     *
     * @throws If the day or week parameters are out of range.
     */
    async waitForNoItemsAt(win, week, day) {
      await TestUtils.waitForCondition(
        () => !CalendarTestUtils.monthView.getItemAt(win, week, day),
        `No events in the month-view week ${week}, day ${day}`
      );
    },

    /**
     * Opens the event dialog for viewing for the item located at the specified
     * parameters.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @returns {Window} - The summary event dialog window.
     */
    async viewItemAt(win, week, day, index) {
      let item = await this.waitForItemAt(win, week, day, index);
      return CalendarTestUtils.viewItem(win, item);
    },

    /**
     * Opens the event dialog for editing for the item located at the specified
     * parameters.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @returns {EditItemAtResult}
     */
    async editItemAt(win, week, day, index) {
      let item = await this.waitForItemAt(win, week, day, index);
      return CalendarTestUtils.editItem(win, item);
    },

    /**
     * Opens the event dialog for editing for a single occurrence of the item
     * located at the specified parameters.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @returns {EditItemAtResult}
     */
    async editItemOccurrenceAt(win, week, day, index) {
      let item = await this.waitForItemAt(win, week, day, index);
      return CalendarTestUtils.editItemOccurrence(win, item);
    },

    /**
     * Opens the event dialog for editing all occurrences of the item
     * located at the specified parameters.
     *
     * @param {Window} win - The window the calendar is displayed in.
     * @param {number} week - Must be between 1-6.
     * @param {number} day - Must be between 1-7.
     * @param {number} index - Indicates which item to select.
     *
     * @throws If the index, day or week parameters are out of range.
     * @returns {EditItemAtResult}
     */

    async editItemOccurrencesAt(win, week, day, index) {
      let item = await this.waitForItemAt(win, week, day, index);
      return CalendarTestUtils.editItemOccurrences(win, item);
    },
  },

  /**
   * Dedent the template string tagged with this function to make indented data
   * easier to read. Usage:
   *
   * let data = dedent`
   *     This is indented data it will be unindented so that the first line has
   *       no leading spaces and the second is indented by two spaces.
   * `;
   *
   * @param strings       The string fragments from the template string
   * @param ...values     The interpolated values
   * @return              The interpolated, dedented string
   */
  dedent(strings, ...values) {
    let parts = [];
    // Perform variable interpolation
    let minIndent = Infinity;
    for (let [i, string] of strings.entries()) {
      let innerparts = string.split("\n");
      if (i == 0) {
        innerparts.shift();
      }
      if (i == strings.length - 1) {
        innerparts.pop();
      }
      for (let [j, ip] of innerparts.entries()) {
        let match = ip.match(/^(\s*)\S*/);
        if (j != 0) {
          minIndent = Math.min(minIndent, match[1].length);
        }
      }
      parts.push(innerparts);
    }

    return parts
      .map((part, i) => {
        return (
          part
            .map((line, j) => {
              return j == 0 && i > 0 ? line : line.substr(minIndent);
            })
            .join("\n") + (i < values.length ? values[i] : "")
        );
      })
      .join("");
  },

  /**
   * Creates and registers a new calendar with the calendar manager. The value
   * returned is actually a Proxy with the CRUD calendar methods adapted to use
   * promises.
   *
   * @param {string} - name
   * @param {string} - type
   *
   * @returns {Proxy}
   */
  createProxyCalendar(name, type = "storage") {
    let manager = cal.getCalendarManager();
    let calendar = manager.createCalendar(type, Services.io.newURI(`moz-${type}-calendar://`));

    calendar.name = name;
    manager.registerCalendar(calendar);
    return cal.async.promisifyCalendar(calendar);
  },

  /**
   * Convenience method for removing a calendar using its proxy.
   *
   * @param {Proxy} calendar - A calendar Proxy created via promisifyCalendar().
   */
  removeProxyCalendar(calendar) {
    let manager = cal.getCalendarManager();
    manager.unregisterCalendar(manager.getCalendarById(calendar.id));
  },

  /**
   * Ensures the calendar tab is open
   *
   * @param {Window} win
   */
  async openCalendarTab(win) {
    let tabmail = win.document.getElementById("tabmail");
    let calendarMode = tabmail.tabModes.calendar;

    if (calendarMode.tabs.length == 1) {
      tabmail.selectedTab = calendarMode.tabs[0];
    } else {
      let calendarTabButton = win.document.getElementById("calendar-tab-button");
      EventUtils.synthesizeMouseAtCenter(calendarTabButton, { clickCount: 1 }, win);
    }

    Assert.equal(calendarMode.tabs.length, 1, "calendar tab is open");
    Assert.equal(tabmail.selectedTab, calendarMode.tabs[0], "calendar tab is selected");

    await new Promise(resolve => win.setTimeout(resolve));
  },

  /**
   * Ensures the calendar view is in the specified mode.
   *
   * @param {Window} win
   * @param {string} viewName
   */
  async setCalendarView(win, viewName) {
    await CalendarTestUtils.openCalendarTab(win);

    let viewTabButton = win.document.getElementById(`calendar-${viewName}-view-button`);
    EventUtils.synthesizeMouseAtCenter(viewTabButton, { clickCount: 1 }, win);
    Assert.equal(win.currentView().id, `${viewName}-view`);

    await new Promise(resolve => win.setTimeout(resolve));
  },

  /**
   * Step forward in the calendar view.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} n - Number of times to move the view forward.
   */
  async calendarViewForward(win, n) {
    let viewForwardButton = win.document.getElementById("next-view-button");
    for (let i = 0; i < n; i++) {
      await clickAndWait(win, viewForwardButton);
    }
  },

  /**
   * Step backward in the calendar view.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} n - Number of times to move the view backward.
   */
  async calendarViewBackward(win, n) {
    let viewBackwardButton = win.document.getElementById("previous-view-button");
    for (let i = 0; i < n; i++) {
      await clickAndWait(win, viewBackwardButton);
    }
  },

  /**
   * Ensures the calendar tab is not open.
   *
   * @param {Window} win
   */
  async closeCalendarTab(win) {
    let tabmail = win.document.getElementById("tabmail");
    let calendarMode = tabmail.tabModes.calendar;

    if (calendarMode.tabs.length == 1) {
      tabmail.closeTab(calendarMode.tabs[0]);
    }

    Assert.equal(calendarMode.tabs.length, 0, "calendar tab is not open");

    await new Promise(resolve => win.setTimeout(resolve));
  },

  /**
   * Opens the event dialog for viewing by clicking on the provided event item.
   *
   * @param {Window} win - The window containing the calendar.
   * @param {MozCalendarEditableItem} item - An event box item that can be
   * clicked on to open the dialog.
   *
   * @returns {Window}
   */
  async viewItem(win, item) {
    if (Services.focus.activeWindow != win) {
      await BrowserTestUtils.waitForEvent(win, "focus");
    }

    let promise = this.waitForEventDialog("view");
    EventUtils.synthesizeMouseAtCenter(item, { clickCount: 2 }, win);
    return promise;
  },

  async _editItem(win, item, selector) {
    let summaryWin = await this.viewItem(win, item);
    let promise = this.waitForEventDialog("edit");
    let button = summaryWin.document.querySelector(selector);
    button.click();

    let dialogWindow = await promise;
    let iframe = dialogWindow.document.querySelector("#lightning-item-panel-iframe");
    return {
      dialogWindow,
      dialogDocument: dialogWindow.document,
      iframeWindow: iframe.contentWindow,
      iframeDocument: iframe.contentDocument,
    };
  },

  /**
   * Opens the event dialog for editing by clicking on the provided event item.
   *
   * @param {Window} win - The window containing the calendar.
   * @param {MozCalendarEditableItem} item - An event box item that can be
   * clicked on to open the dialog.
   *
   * @returns {EditItemAtResult}
   */
  async editItem(win, item) {
    return this._editItem(win, item, "#calendar-summary-dialog-edit-button");
  },

  /**
   * Opens the event dialog for editing a single occurrence of a repeating event
   * by clicking on the provided event item.
   *
   * @param {Window} win - The window containing the calendar.
   * @param {MozCalendarEditableItem} item - An event box item that can be
   * clicked on to open the dialog.
   *
   * @returns {Window}
   */
  async editItemOccurrence(win, item) {
    return this._editItem(win, item, "#edit-button-context-menu-this-occurrence");
  },

  /**
   * Opens the event dialog for editing all occurrences of a repeating event
   * by clicking on the provided event box.
   *
   * @param {Window} win - The window containing the calendar.
   * @param {MozCalendarEditableItem} item - An event box item that can be
   * clicked on to open the dialog.
   *
   * @returns {Window}
   */
  async editItemOccurrences(win, item) {
    return this._editItem(win, item, "#edit-button-context-menu-all-occurrences");
  },

  /**
   * This produces a Promise for waiting on an event dialog to open.
   * The mode parameter can be specified to indicate which of the dialogs to
   * wait for.
   *
   * @param {string} [mode="view"] Determines which dialog we are waiting on,
   *  can be "view" for the summary or "edit" for the editing one.
   *
   * @returns {Promise<Window>}
   */
  waitForEventDialog(mode = "view") {
    let uri =
      mode === "edit"
        ? "chrome://calendar/content/calendar-event-dialog.xhtml"
        : "chrome://calendar/content/calendar-summary-dialog.xhtml";

    return BrowserTestUtils.domWindowOpened(null, async win => {
      await BrowserTestUtils.waitForEvent(win, "load");

      if (win.document.documentURI != uri) {
        return false;
      }

      if (mode === "edit") {
        let iframe = win.document.getElementById("lightning-item-panel-iframe");
        await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");
      }
      return true;
    });
  },
};
