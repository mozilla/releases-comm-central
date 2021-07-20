/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/*
 * Calendar window helpers, e.g. to open our dialogs
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.window namespace.

const EXPORTED_SYMBOLS = ["calwindow"]; /* exported calwindow */

var calwindow = {
  /**
   * Opens the Create Calendar wizard
   *
   * @param aWindow    the window to open the dialog on, or null for the main calendar window
   * @param aCallback  a function to be performed after calendar creation
   */
  openCalendarWizard(aWindow, aCallback) {
    let window = aWindow || calwindow.getCalendarWindow();
    window.openDialog(
      "chrome://calendar/content/calendar-creation.xhtml",
      "caEditServer",
      "chrome,titlebar,resizable,centerscreen",
      aCallback
    );
  },

  /**
   * Opens the calendar properties window for aCalendar.
   *
   * @param {ChromeWindow | null} aWindow   The window to open the dialog on,
   *                                          or null for the main calendar window.
   * @param {calICalendar} aCalendar  The calendar whose properties should be displayed.
   * @param {boolean} [aCanDisable]   True if the calendar can be disabled, else false.
   */
  openCalendarProperties(aWindow, aCalendar, aCanDisable = true) {
    let window = aWindow || calwindow.getCalendarWindow();
    window.openDialog(
      "chrome://calendar/content/calendar-properties-dialog.xhtml",
      "CalendarPropertiesDialog",
      "chrome,titlebar,resizable,centerscreen",
      { calendar: aCalendar, canDisable: aCanDisable }
    );
  },

  /**
   * Returns the most recent calendar window in an application independent way
   */
  getCalendarWindow() {
    return (
      Services.wm.getMostRecentWindow("calendarMainWindow") ||
      Services.wm.getMostRecentWindow("mail:3pane")
    );
  },
};
