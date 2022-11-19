/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = [
  "SHORT_SLEEP",
  "MID_SLEEP",
  "TIMEOUT_MODAL_DIALOG",
  "handleDeleteOccurrencePrompt",
  "execEventDialogCallback",
  "checkMonthAlarmIcon",
  "closeAllEventDialogs",
];

var { Assert } = ChromeUtils.importESModule("resource://testing-common/Assert.sys.mjs");
var { BrowserTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/BrowserTestUtils.sys.mjs"
);
var EventUtils = ChromeUtils.import("resource://testing-common/mozmill/EventUtils.jsm");
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

const lazy = {};

ChromeUtils.defineModuleGetter(
  lazy,
  "CalendarTestUtils",
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var SHORT_SLEEP = 100;
var MID_SLEEP = 500;
var TIMEOUT_MODAL_DIALOG = 30000;
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
    eventWindow = await lazy.CalendarTestUtils.waitForEventDialog("edit");
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
  let dayBox = lazy.CalendarTestUtils.monthView.getItemAt(window, week, day, 1);
  Assert.ok(dayBox.querySelector(".alarm-icons-box > .reminder-icon"));
}
