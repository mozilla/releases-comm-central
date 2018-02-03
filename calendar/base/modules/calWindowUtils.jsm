/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

this.EXPORTED_SYMBOLS = ["calwindow"]; /* exported calwindow */

var calwindow = {
    /**
     * Opens the Create Calendar wizard
     *
     * @param aCallback  a function to be performed after calendar creation
     */
    openCalendarWizard: function(aCallback, aWindow=null) {
        let window = aWindow || calwindow.getCalendarWindow();
        window.openDialog("chrome://calendar/content/calendarCreation.xul", "caEditServer",
                          // Workaround for Bug 1151440 - the HTML color picker won't work
                          // in linux when opened from modal dialog
                          AppConstants.platform == "linux"
                              ? "chrome,titlebar,resizable"
                              : "modal,chrome,titlebar,resizable",
                          aCallback);
    },

    /**
     * Opens the calendar properties window for aCalendar
     *
     * @param aCalendar  the calendar whose properties should be displayed
     */
    openCalendarProperties: function(aCalendar, aWindow=null) {
        let window = aWindow || calwindow.getCalendarWindow();
        window.openDialog("chrome://calendar/content/calendar-properties-dialog.xul",
                          "CalendarPropertiesDialog",
                          // Workaround for Bug 1151440 - the HTML color picker won't work
                          // in linux when opened from modal dialog
                          AppConstants.platform == "linux"
                              ? "chrome,titlebar,resizable"
                              : "modal,chrome,titlebar,resizable",
                          { calendar: aCalendar });
    },

    /**
     * Opens the print dialog
     */
    openPrintDialog: function(aWindow=null) {
        let window = aWindow || calwindow.getCalendarWindow();
        window.openDialog("chrome://calendar/content/calendar-print-dialog.xul", "Print",
                          "centerscreen,chrome,resizable");
    },

    /**
     * Returns the most recent calendar window in an application independent way
     */
    getCalendarWindow: function() {
        return Services.wm.getMostRecentWindow("calendarMainWindow") ||
               Services.wm.getMostRecentWindow("mail:3pane");
    }
};
