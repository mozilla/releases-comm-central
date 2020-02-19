/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/*
 * Calendar window helpers, e.g. to open our dialogs
 */

// NOTE: This module should not be loaded directly, it is available when
// including calUtils.jsm under the cal.window namespace.

this.EXPORTED_SYMBOLS = ["calwindow"]; /* exported calwindow */

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
      "chrome://calendar/content/calendarCreation.xhtml",
      "caEditServer",
      // Workaround for Bug 1151440 - the HTML color picker won't work
      // in linux when opened from modal dialog
      AppConstants.platform == "linux"
        ? "chrome,titlebar,resizable"
        : "modal,chrome,titlebar,resizable",
      aCallback
    );
  },

  /**
   * Opens the calendar properties window for aCalendar
   *
   * @param aWindow    the window to open the dialog on, or null for the main calendar window
   * @param aCalendar  the calendar whose properties should be displayed
   */
  openCalendarProperties(aWindow, aCalendar) {
    let window = aWindow || calwindow.getCalendarWindow();
    window.openDialog(
      "chrome://calendar/content/calendar-properties-dialog.xhtml",
      "CalendarPropertiesDialog",
      "modal,chrome,titlebar,resizable",
      { calendar: aCalendar }
    );
  },

  /**
   * Opens the print dialog
   *
   * @param aWindow    the window to open the dialog on, or null for the main calendar window
   */
  openPrintDialog(aWindow = null) {
    let window = aWindow || calwindow.getCalendarWindow();
    window.openDialog(
      "chrome://calendar/content/calendar-print-dialog.xhtml",
      "Print",
      "centerscreen,chrome,resizable"
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
