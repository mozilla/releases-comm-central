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
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
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
 * @property {Window} iframeWindow - The contentWindow property of the embedded
 *  iframe.
 * @property {HTMLDocument} iframeDocument - The contentDocument of the embedded
 *  iframe.
 */

/**
 * Helper class for testing the day view of the calendar.
 */
class CalendarDayViewTestUtils {
  _helper = new CalendarWeekViewTestUtils("#day-view");

  /**
   * Provides the calendar-event-column for the day displayed.
   *
   * @param {Window} win - The window the calendar is displayed in.
   *
   * @return {MozCalendarEventColumn} - The column.
   */
  getEventColumn(win) {
    return this._helper.getEventColumn(win, 1);
  }

  /**
   * Provides the calendar-event-box elements for the day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   *
   * @return {MozCalendarEventBox[]} - The event boxes.
   */
  getEventBoxes(win) {
    return this._helper.getEventBoxes(win, 1);
  }

  /**
   * Provides the calendar-event-box at "index" located in the event column for
   * the day displayed.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which event box to select.
   *
   * @return {MozCalendarEventBox|undefined} - The event box, if it exists.
   */
  getEventBoxAt(win, index) {
    return this._helper.getEventBoxAt(win, 1, index);
  }

  /**
   * Provides the .multiday-hour-box element for the specified hour. This
   * element can be double clicked to create a new event at that hour.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} hour - Must be between 0-23.
   *
   * @returns {XULElement} - The hour box.
   */
  getHourBoxAt(win, hour) {
    return this._helper.getHourBoxAt(win, 1, hour);
  }

  /**
   * Provides the all-day header, which can be double clicked to create a new
   * all-day event.
   *
   * @param {Window} win - The window the calendar is displayed in.
   *
   * @returns {CalendarHeaderContainer} - The all-day header.
   */
  getAllDayHeader(win) {
    return this._helper.getAllDayHeader(win, 1);
  }

  /**
   * Provides the all-day calendar-editable-item located at index for the
   * current day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which item to select (1-based).
   *
   * @returns {MozCalendarEditableItem|undefined} - The all-day item, if it
   *   exists.
   */
  getAllDayItemAt(win, index) {
    return this._helper.getAllDayItemAt(win, 1, index);
  }

  /**
   * Waits for the calendar-event-box at "index", located in the event
   * column for the day displayed to appear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which item to select (1-based).
   *
   * @return {MozCalendarEventBox} - The event box.
   */
  async waitForEventBoxAt(win, index) {
    return this._helper.waitForEventBoxAt(win, 1, index);
  }

  /**
   * Waits for the calendar-event-box at "index", located in the event column
   * for the current day to disappear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates the event box (1-based).
   */
  async waitForNoEventBoxAt(win, index) {
    return this._helper.waitForNoEventBoxAt(win, 1, index);
  }

  /**
   * Wait for the all-day calendar-editable-item for the day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which item to select (1-based).
   *
   * @returns {MozCalendarEditableItem} - The all-day item.
   */
  async waitForAllDayItemAt(win, index) {
    return this._helper.waitForAllDayItemAt(win, 1, index);
  }

  /**
   * Opens the event dialog for viewing for the event box located at the
   * specified index.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which event to select.
   *
   * @returns {Window} - The summary event dialog window.
   */
  async viewEventAt(win, index) {
    return this._helper.viewEventAt(win, 1, index);
  }

  /**
   * Opens the event dialog for editing for the event box located at the
   * specified index.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which event to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventAt(win, index) {
    return this._helper.editEventAt(win, 1, index);
  }

  /**
   * Opens the event dialog for editing for a single occurrence of the event
   * box located at the specified index.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which event box to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventOccurrenceAt(win, index) {
    return this._helper.editEventOccurrenceAt(win, 1, index);
  }

  /**
   * Opens the event dialog for editing all occurrences of the event box
   * located at the specified index.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} index - Indicates which event box to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventOccurrencesAt(win, index) {
    return this._helper.editEventOccurrencesAt(win, 1, index);
  }
}

/**
 * Helper class for testing the week view of the calendar.
 */
class CalendarWeekViewTestUtils {
  constructor(rootSelector = "#week-view") {
    this.rootSelector = rootSelector;
  }

  /**
   * Provides the calendar-event-column for the day specified.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7
   *
   * @throws - If the day parameter is out of range.
   * @return {MozCalendarEventColumn} - The column.
   */
  getEventColumn(win, day) {
    if (day < 1 || day > 7) {
      throw new Error(`Invalid parameter to getEventColumn(): expected day=1-7, got day=${day}.`);
    }

    let columns = win.document.documentElement.querySelectorAll(
      `${this.rootSelector} calendar-event-column`
    );
    return columns[day - 1];
  }

  /**
   * Provides the calendar-event-box elements for the day specified.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   *
   * @return {MozCalendarEventBox[]} - The event boxes.
   */
  getEventBoxes(win, day) {
    let column = this.getEventColumn(win, day);
    return column.querySelectorAll(".multiday-events-list calendar-event-box");
  }

  /**
   * Provides the calendar-event-box at "index" located in the event column for
   * the specified day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which event box to select.
   *
   * @return {MozCalendarEventBox|undefined} - The event box, if it exists.
   */
  getEventBoxAt(win, day, index) {
    return this.getEventBoxes(win, day)[index - 1];
  }

  /**
   * Provides the .multiday-hour-box element for the specified hour. This
   * element can be double clicked to create a new event at that hour.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   * @param {number} hour - Must be between 0-23.
   *
   * @throws If the day or hour are out of range.
   * @returns {XULElement} - The hour box.
   */
  getHourBoxAt(win, day, hour) {
    let column = this.getEventColumn(win, day);
    return column.querySelectorAll(".multiday-hour-box")[hour];
  }

  /**
   * Provides the all-day header, which can be double clicked to create a new
   * all-day event for the specified day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   *
   * @throws If the day is out of range.
   * @returns {CalendarHeaderContainer} - The all-day header.
   */
  getAllDayHeader(win, day) {
    if (!(day >= 1 && day <= 7)) {
      throw new Error(`Invalid parameter to getAllDayHeader(): expected day=1-7, got day=${day}`);
    }

    let headers = win.document.documentElement.querySelectorAll(
      `${this.rootSelector} calendar-header-container`
    );
    return headers[day - 1];
  }

  /**
   * Provides the all-day calendar-editable-item located at "index" for the
   * specified day.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   * @param {number} index - Indicates which item to select (starting from 1).
   *
   * @throws If the day or index are out of range.
   * @returns {MozCalendarEditableItem|undefined} - The all-day item, if it
   *   exists.
   */
  getAllDayItemAt(win, day, index) {
    let allDayHeader = this.getAllDayHeader(win, day);
    return allDayHeader.querySelectorAll(`calendar-editable-item`)[index - 1];
  }

  /**
   * Waits for the calendar-event-box at "index", located in the event column
   * for the day specified to appear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   * @param {number} index - Indicates which event box to select.
   *
   * @returns {MozCalendarEventBox} - The event box.
   */
  async waitForEventBoxAt(win, day, index) {
    return TestUtils.waitForCondition(
      () => this.getEventBoxAt(win, day, index),
      `calendar-event-box at day=${day}, index=${index} did not appear in time`
    );
  }

  /**
   * Waits until the calendar-event-box at "index", located in the event column
   * for the day specified disappears.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   * @param {number} index - Indicates which event box to select.
   */
  async waitForNoEventBoxAt(win, day, index) {
    await TestUtils.waitForCondition(
      () => !this.getEventBoxAt(win, day, index),
      `calendar-event-box at day=${day}, index=${index} still present`
    );
  }

  /**
   * Waits for the all-day calendar-editable-item at "index", located in the
   * event column for the day specified to appear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Day of the week, between 1-7.
   * @param {number} index - Indicates which item to select (starting from 1).
   *
   * @returns {MozCalendarEditableItem} - The all-day item.
   */
  async waitForAllDayItemAt(win, day, index) {
    return TestUtils.waitForCondition(
      () => this.getAllDayItemAt(win, day, index),
      `All-day calendar-editable-item at day=${day}, index=${index} did not appear in time`
    );
  }

  /**
   * Opens the event dialog for viewing for the event box located at the
   * specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which event to select.
   *
   * @returns {Window} - The summary event dialog window.
   */
  async viewEventAt(win, day, index) {
    let item = await this.waitForEventBoxAt(win, day, index);
    return CalendarTestUtils.viewItem(win, item);
  }

  /**
   * Opens the event dialog for editing for the event box located at the
   * specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which event to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventAt(win, day, index) {
    let item = await this.waitForEventBoxAt(win, day, index);
    return CalendarTestUtils.editItem(win, item);
  }

  /**
   * Opens the event dialog for editing for a single occurrence of the event
   * box located at the specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which event box to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventOccurrenceAt(win, day, index) {
    let item = await this.waitForEventBoxAt(win, day, index);
    return CalendarTestUtils.editItemOccurrence(win, item);
  }

  /**
   * Opens the event dialog for editing all occurrences of the event box
   * located at the specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which event box to select.
   *
   * @returns {EditItemAtResult}
   */
  async editEventOccurrencesAt(win, day, index) {
    let item = await this.waitForEventBoxAt(win, day, index);
    return CalendarTestUtils.editItemOccurrences(win, item);
  }
}

/**
 * Helper class for testing the multiweek and month views of the calendar.
 */
class CalendarMonthViewTestUtils {
  /**
   * @param {string} rootSelector
   */
  constructor(rootSelector) {
    this.rootSelector = rootSelector;
  }

  /**
   * Provides the calendar-month-day-box element located at the specified day,
   * week combination.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6. The cap may be as low as 1
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

    return win.document.documentElement.querySelector(
      `${this.rootSelector} .monthbody > tr:nth-of-type(${week}) >
        td:nth-of-type(${day}) > calendar-month-day-box`
    );
  }

  /**
   * Get the calendar-month-day-box-item located in the specified day box, at
   * the target index.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @throws If the index, day or week parameters are out of range.
   * @return {MozCalendarMonthDayBoxItem}
   */
  getItemAt(win, week, day, index) {
    if (!(index >= 1)) {
      throw new Error(`Invalid parameters to getItemAt(): expected index>=1, got index=${index}.`);
    }

    let dayBox = this.getDayBox(win, week, day);
    return dayBox.querySelector(`li:nth-of-type(${index}) calendar-month-day-box-item`);
  }

  /**
   * Waits for the calendar-month-day-box-item at "index", located in the
   * specified week,day combination to appear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @return {MozCalendarMonthDayBoxItem}
   */
  async waitForItemAt(win, week, day, index) {
    return TestUtils.waitForCondition(
      () => this.getItemAt(win, week, day, index),
      `calendar-month-day-box-item at week=${week}, day=${day}, index=${index} did not appear in time`
    );
  }

  /**
   * Waits for the calendar-month-day-box-item at "index", located in the
   * specified week,day combination to disappear.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates the item that should no longer be present.
   */
  async waitForNoItemAt(win, week, day, index) {
    await TestUtils.waitForCondition(
      () => !this.getItemAt(win, week, day, index),
      `calendar-month-day-box-item at week=${week}, day=${day}, index=${index} still present`
    );
  }

  /**
   * Opens the event dialog for viewing for the item located at the specified
   * parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @returns {Window} - The summary event dialog window.
   */
  async viewItemAt(win, week, day, index) {
    let item = await this.waitForItemAt(win, week, day, index);
    return CalendarTestUtils.viewItem(win, item);
  }

  /**
   * Opens the event dialog for editing for the item located at the specified
   * parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @returns {EditItemAtResult}
   */
  async editItemAt(win, week, day, index) {
    let item = await this.waitForItemAt(win, week, day, index);
    return CalendarTestUtils.editItem(win, item);
  }

  /**
   * Opens the event dialog for editing for a single occurrence of the item
   * located at the specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @returns {EditItemAtResult}
   */
  async editItemOccurrenceAt(win, week, day, index) {
    let item = await this.waitForItemAt(win, week, day, index);
    return CalendarTestUtils.editItemOccurrence(win, item);
  }

  /**
   * Opens the event dialog for editing all occurrences of the item
   * located at the specified parameters.
   *
   * @param {Window} win - The window the calendar is displayed in.
   * @param {number} week - Must be between 1-6.
   * @param {number} day - Must be between 1-7.
   * @param {number} index - Indicates which item to select.
   *
   * @returns {EditItemAtResult}
   */
  async editItemOccurrencesAt(win, week, day, index) {
    let item = await this.waitForItemAt(win, week, day, index);
    return CalendarTestUtils.editItemOccurrences(win, item);
  }
}

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
   * Helpers specific to the day view.
   */
  dayView: new CalendarDayViewTestUtils(),

  /**
   * Helpers specific to the week view.
   */
  weekView: new CalendarWeekViewTestUtils(),

  /**
   * Helpers specific to the multiweek view.
   */
  multiweekView: new CalendarMonthViewTestUtils("#multiweek-view"),

  /**
   * Helpers specific to the month view.
   */
  monthView: new CalendarMonthViewTestUtils("#month-view"),

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
   * Creates and registers a new calendar with the calendar manager. The
   * created calendar will be set as the default calendar.
   * @param {string} - name
   * @param {string} - type
   *
   * @returns {calICalendar}
   */
  createCalendar(name = "Test", type = "storage") {
    let manager = cal.getCalendarManager();
    let calendar = manager.createCalendar(type, Services.io.newURI(`moz-${type}-calendar://`));
    calendar.name = name;
    calendar.setProperty("calendar-main-default", true);
    manager.registerCalendar(calendar);
    return calendar;
  },

  /**
   * Convenience method for removing a calendar using its proxy.
   *
   * @param {calICalendar} calendar - A calendar to remove.
   */
  removeCalendar(calendar) {
    let manager = cal.getCalendarManager();
    manager.unregisterCalendar(calendar);
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
      let calendarTabButton = win.document.getElementById("calendarButton");
      EventUtils.synthesizeMouseAtCenter(calendarTabButton, { clickCount: 1 }, win);
    }

    Assert.equal(calendarMode.tabs.length, 1, "calendar tab is open");
    Assert.equal(tabmail.selectedTab, calendarMode.tabs[0], "calendar tab is selected");

    await new Promise(resolve => win.setTimeout(resolve));
  },

  /**
   * Make sure the current view has finished loading.
   *
   * @param {Window} win
   */
  async ensureViewLoaded(win) {
    await TestUtils.waitForCondition(() => win.currentView().mPendingRefreshJobs.size == 0);
    // After the queue is empty the view needs a moment to settle.
    await new Promise(resolve => win.setTimeout(resolve, 200));
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

    await CalendarTestUtils.ensureViewLoaded(win);
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
    await CalendarTestUtils.ensureViewLoaded(win);
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
    await CalendarTestUtils.ensureViewLoaded(win);
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

  async _editNewItem(win, target, type) {
    let dialogPromise = CalendarTestUtils.waitForEventDialog("edit");

    if (target) {
      this.scrollViewToTarget(target, true);
      EventUtils.synthesizeMouse(target, 1, 1, { clickCount: 2 }, win);
    } else {
      EventUtils.synthesizeMouseAtCenter(
        win.document.getElementById(`calendar-new${type}-button`),
        {},
        win
      );
    }

    let dialogWindow = await dialogPromise;
    let iframe = dialogWindow.document.querySelector("#calendar-item-panel-iframe");
    Assert.report(false, undefined, undefined, "New event dialog opened");
    return {
      dialogWindow,
      dialogDocument: dialogWindow.document,
      iframeWindow: iframe.contentWindow,
      iframeDocument: iframe.contentDocument,
    };
  },

  /**
   * Opens the dialog for editing a new event. An optional day/week view
   * hour box or multiweek/month view calendar-month-day-box can be specified
   * to simulate creation of the event at that target.
   *
   * @param {Window} win - The window containing the calendar.
   * @param {XULElement?} target - The <spacer> or <calendar-month-day-box>
   *                               to click on, if not specified, the new event
   *                               button is used.
   */
  async editNewEvent(win, target) {
    return this._editNewItem(win, target, "event");
  },

  /**
   * Opens the dialog for editing a new task.
   *
   * @param {Window} win - The window containing the task tree.
   */
  async editNewTask(win) {
    return this._editNewItem(win, null, "task");
  },

  async _editItem(win, item, selector) {
    let summaryWin = await this.viewItem(win, item);
    let promise = this.waitForEventDialog("edit");
    let button = summaryWin.document.querySelector(selector);
    button.click();

    let dialogWindow = await promise;
    let iframe = dialogWindow.document.querySelector("#calendar-item-panel-iframe");
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
        let iframe = win.document.getElementById("calendar-item-panel-iframe");
        await BrowserTestUtils.waitForEvent(iframe.contentWindow, "load");
        iframe.focus();
        await TestUtils.waitForCondition(
          () => Services.focus.focusedWindow == iframe.contentWindow,
          "waiting for iframe to be focused"
        );
      }
      return true;
    });
  },

  /**
   * Go to a specific date using the minimonth.
   *
   * @param {Window} win - Main window
   * @param {number} year - Four-digit year
   * @param {number} month - 1-based index of a month
   * @param {number} day - 1-based index of a day
   */
  async goToDate(win, year, month, day) {
    let miniMonth = win.document.getElementById("calMinimonth");

    let activeYear = miniMonth.querySelector(".minimonth-year-name").value;

    let activeMonth = miniMonth.querySelector(".minimonth-month-name").getAttribute("monthIndex");

    async function doScroll(name, difference, sleepTime) {
      if (difference === 0) {
        return;
      }
      let query = `.${name}s-${difference > 0 ? "back" : "forward"}-button`;
      let scrollArrow = await TestUtils.waitForCondition(
        () => miniMonth.querySelector(query),
        `Query for scroll: ${query}`
      );

      for (let i = 0; i < Math.abs(difference); i++) {
        scrollArrow.doCommand();
        await new Promise(resolve => win.setTimeout(resolve, sleepTime));
      }
    }

    await doScroll("year", activeYear - year, 10);
    await doScroll("month", activeMonth - (month - 1), 25);

    function getMiniMonthDay(week, day) {
      return miniMonth.querySelector(
        `.minimonth-cal-box > tr.minimonth-row-body:nth-of-type(${week + 1}) > ` +
          `td.minimonth-day:nth-of-type(${day})`
      );
    }

    let positionOfFirst = 7 - getMiniMonthDay(1, 7).textContent;
    let weekDay = ((positionOfFirst + day - 1) % 7) + 1;
    let week = Math.floor((positionOfFirst + day - 1) / 7) + 1;

    // Pick day.
    EventUtils.synthesizeMouseAtCenter(getMiniMonthDay(week, weekDay), {}, win);
    await CalendarTestUtils.ensureViewLoaded(win);
  },

  /**
   * Go to today.
   *
   * @param {Window} window - Main window
   */
  async goToToday(win) {
    EventUtils.synthesizeMouseAtCenter(win.document.getElementById("today-view-button"), {}, win);
    await CalendarTestUtils.ensureViewLoaded(win);
  },

  /**
   * Assert whether the given event box's edges are visually draggable (and
   * hence, editable) at its edges or not.
   *
   * @param {MozCalendarEventBox} eventBox - The event box to test.
   * @param {boolean} startDraggable - Whether we expect the start edge to be
   *   draggable.
   * @param {boolean} endDraggable - Whether we expect the end edge to be
   *   draggable.
   * @param {string} message - A message for assertions.
   */
  async assertEventBoxDraggable(eventBox, startDraggable, endDraggable, message) {
    this.scrollViewToTarget(eventBox, true);
    // Hover to see if the drag gripbars appear.
    let enterPromise = BrowserTestUtils.waitForEvent(eventBox, "mouseenter");
    // Hover over start.
    EventUtils.synthesizeMouse(eventBox, 8, 8, { type: "mouseover" }, eventBox.ownerGlobal);
    await enterPromise;
    Assert.equal(
      BrowserTestUtils.is_visible(eventBox.startGripbar),
      startDraggable,
      `Start gripbar should be ${startDraggable ? "visible" : "hidden"} on hover: ${message}`
    );
    Assert.equal(
      BrowserTestUtils.is_visible(eventBox.endGripbar),
      endDraggable,
      `End gripbar should be ${endDraggable ? "visible" : "hidden"} on hover: ${message}`
    );
  },

  /**
   * Scroll the calendar view to show the given target.
   *
   * @param {Element} target - The target to scroll to. A descendent of a
   *    calendar view.
   * @param {boolean} alignStart - Whether to scroll the inline and block start
   *   edges of the target into view, else scrolls the end edges into view.
   */
  scrollViewToTarget(target, alignStart) {
    let multidayView = target.closest("calendar-day-view, calendar-week-view");
    if (multidayView) {
      // Multiday view has sticky headers, so scrollIntoView doesn't actually
      // scroll far enough.
      let scrollRect = multidayView.getScrollAreaRect();
      let targetRect = target.getBoundingClientRect();
      // We want to move the view by the difference between the starting/ending
      // edge of the view and the starting/ending edge of the target.
      let yDiff = alignStart
        ? targetRect.top - scrollRect.top
        : targetRect.bottom - scrollRect.bottom;
      // In left-to-right, starting edge is the left edge. Otherwise, it is the
      // right edge.
      let xDiff =
        alignStart == (target.ownerDocument.dir == "ltr")
          ? targetRect.left - scrollRect.left
          : targetRect.right - scrollRect.right;
      multidayView.grid.scrollBy(xDiff, yDiff);
    } else {
      target.scrollIntoView(alignStart);
    }
  },

  /**
   * Save the current calendar views' UI states to be restored later.
   *
   * This is used with restoreCalendarViewsState to reset the view back to its
   * initial loaded state after a test, so that later tests in the same group
   * will receive the calendar view as if it was first opened after launching.
   *
   * @param {Window} win - The window that contains the calendar views.
   *
   * @return {Object} - An opaque object with data to pass to
   *   restoreCalendarViewsState.
   */
  saveCalendarViewsState(win) {
    return {
      multidayViewsData: ["day", "week"].map(viewName => {
        // Save the scroll state since test utilities may change the scroll
        // position, and this is currently not reset on re-opening the tab.
        let view = win.document.getElementById(`${viewName}-view`);
        return { view, viewName, scrollMinute: view.scrollMinute };
      }),
    };
  },

  /**
   * Clean up the calendar views after a test by restoring their UI to the saved
   * state, and close the calendar tab.
   *
   * @param {Window} win - The window that contains the calendar views.
   * @param {Object} data - The data returned by saveCalendarViewsState.
   */
  async restoreCalendarViewsState(win, data) {
    for (let { view, viewName, scrollMinute } of data.multidayViewsData) {
      await this.setCalendarView(win, viewName);
      // The scrollMinute is rounded to the nearest integer.
      // As is the scroll pixels.
      // When we scrollToMinute, the scroll position is rounded to the nearest
      // integer, as is the subsequent scroll minute. So calling
      //   scrollToMinute(min)
      // will set
      //   scrollMinute = round(round(min * P) / P)
      // where P is the pixelsPerMinute of the view. Thus
      //   scrollMinute = min +- round(0.5 / P)
      let roundingError = Math.round(0.5 / view.pixelsPerMinute);
      view.scrollToMinute(scrollMinute);
      await TestUtils.waitForCondition(
        () => Math.abs(view.scrollMinute - scrollMinute) <= roundingError,
        "Waiting for scroll minute to restore"
      );
    }
    await CalendarTestUtils.closeCalendarTab(win);
  },
};
