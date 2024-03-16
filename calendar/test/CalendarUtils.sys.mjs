/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import * as EventUtils from "resource://testing-common/mozmill/EventUtils.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  CalendarTestUtils: "resource://testing-common/calendar/CalendarTestUtils.sys.mjs",
});

export var SHORT_SLEEP = 100;
export var MID_SLEEP = 500;
export var TIMEOUT_MODAL_DIALOG = 30000;
var EVENT_DIALOG_NAME = "Calendar:EventDialog";

/**
 * Delete one or all occurrences using the prompt.
 *
 * @param {Window} window - Main window.
 * @param {Element} element - Element which will open the dialog.
 * @param {boolean} selectParent - true if all occurrences should be deleted.
 */
export async function handleDeleteOccurrencePrompt(window, element, selectParent) {
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
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
        const acceptButton = dialogWindow.document.getElementById(buttonId);
        EventUtils.synthesizeMouseAtCenter(acceptButton, {}, dialogWindow);
      },
    }
  );

  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await dialogPromise;
}

export async function execEventDialogCallback(callback) {
  let eventWindow = Services.wm.getMostRecentWindow(EVENT_DIALOG_NAME);

  if (!eventWindow) {
    eventWindow = await lazy.CalendarTestUtils.waitForEventDialog("edit");
  }

  const iframe = eventWindow.document.getElementById("calendar-item-panel-iframe");
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
export function checkMonthAlarmIcon(window, week, day) {
  const dayBox = lazy.CalendarTestUtils.monthView.getItemAt(window, week, day, 1);
  Assert.ok(dayBox.querySelector(".alarm-icons-box > .reminder-icon"));
}
