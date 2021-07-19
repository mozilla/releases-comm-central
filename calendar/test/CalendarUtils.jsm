/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "SHORT_SLEEP",
  "MID_SLEEP",
  "TIMEOUT_MODAL_DIALOG",
  "CALENDARNAME",
  "handleDeleteOccurrencePrompt",
  "execEventDialogCallback",
  "checkMonthAlarmIcon",
  "closeAllEventDialogs",
  "deleteCalendars",
  "createCalendar",
];

var { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
var { BrowserTestUtils } = ChromeUtils.import("resource://testing-common/BrowserTestUtils.jsm");
var EventUtils = ChromeUtils.import("resource://testing-common/mozmill/EventUtils.jsm");
var { TestUtils } = ChromeUtils.import("resource://testing-common/TestUtils.jsm");

// This still needs to load for some tests to pass. I'm not sure exactly why,
// but this file loads a bunch of other things and one of them must be used.
ChromeUtils.import("resource://testing-common/mozmill/FolderDisplayHelpers.jsm");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.defineModuleGetter(
  this,
  "CalendarTestUtils",
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var SHORT_SLEEP = 100;
var MID_SLEEP = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
var CALENDARNAME = "Mozmill";
var EVENT_DIALOG_NAME = "Calendar:EventDialog";

/**
 * Delete one or all occurrences using the prompt.
 *
 * @param {Window} window - Main window.
 * @param {Element} element - Element which will open the dialog.
 * @param {boolean} selectParent - true if all occurrences should be deleted.
 */
async function handleDeleteOccurrencePrompt(window, element, selectParent) {
  let dialogPromise = BrowserTestUtils.promiseAlertDialog(
    undefined,
    "chrome://calendar/content/calendar-occurrence-prompt.xhtml",
    {
      callback(dialogWindow) {
        let buttonId;
        if (selectParent) {
          buttonId = "accept-parent-button";
        } else {
          buttonId = "accept-occurrence-button";
        }
        let acceptButton = dialogWindow.document.getElementById(buttonId);
        EventUtils.synthesizeMouseAtCenter(acceptButton, {}, dialogWindow);
      },
    }
  );

  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await dialogPromise;
}

async function execEventDialogCallback(callback) {
  let eventWindow = Services.wm.getMostRecentWindow(EVENT_DIALOG_NAME);

  if (!eventWindow) {
    eventWindow = await CalendarTestUtils.waitForEventDialog("edit");
  }

  let iframe = eventWindow.document.getElementById("calendar-item-panel-iframe");
  await TestUtils.waitForCondition(() => iframe.contentWindow.onLoad?.hasLoaded);

  await callback(eventWindow, iframe.contentWindow);
}

/**
 * Checks if Alarm-Icon is shown on a given Event-Box.
 *
 * @param {Window} window - Main window.
 * @param {number} week - Week to check between 1-6.
 * @param {number} day - Day to check between 1-7.
 */
function checkMonthAlarmIcon(window, week, day) {
  let dayBox = CalendarTestUtils.monthView.getItemAt(window, week, day, 1);
  Assert.ok(dayBox.querySelector(".alarm-icons-box > .reminder-icon"));
}

/**
 * Deletes all calendars with given name.
 *
 * @param {Window} window - Main window.
 * @param {string} name - Calendar name.
 */
function deleteCalendars(window, name) {
  let manager = window.cal.getCalendarManager();

  for (let calendar of manager.getCalendars()) {
    if (calendar.name == name) {
      manager.removeCalendar(calendar);
    }
  }
}

/**
 * Creates local calendar with given name and select it in calendars list.
 *
 * @param {Window} window - Main window.
 * @param {string} name - Calendar name.
 */
function createCalendar(window, name) {
  let manager = window.cal.getCalendarManager();

  let url = Services.io.newURI("moz-storage-calendar://");
  let calendar = manager.createCalendar("storage", url);
  calendar.name = name;
  calendar.setProperty("calendar-main-default", true);
  manager.registerCalendar(calendar);
  return calendar.id;
}
