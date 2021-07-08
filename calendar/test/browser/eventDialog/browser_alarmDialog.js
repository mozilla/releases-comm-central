/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {
  CALENDARNAME,
  TIMEOUT_MODAL_DIALOG,
  closeAllEventDialogs,
  controller,
  createCalendar,
  deleteCalendars,
  goToDate,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/calendar/CalendarUtils.jsm");

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/calendar/ItemEditingHelpers.jsm"
);
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { dayView } = CalendarTestUtils;

add_task(async function testAlarmDialog() {
  let now = new Date();

  const TITLE = "Event";

  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  viewForward(controller, 1);

  let allDayHeader = dayView.getAllDayHeader(controller.window);
  Assert.ok(allDayHeader);
  controller.click(allDayHeader);

  // Create a new all-day event tomorrow.

  // Prepare to dismiss the alarm.
  let alarmPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      async callback(alarmWindow) {
        await new Promise(resolve => alarmWindow.setTimeout(resolve, 500));

        let dismissButton = alarmWindow.document.getElementById("alarm-dismiss-all-button");
        EventUtils.synthesizeMouseAtCenter(dismissButton, {}, alarmWindow);
      },
    }
  );
  await invokeNewEventDialog(window, null, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      allday: true,
      reminder: "1day",
      title: TITLE,
    });

    await saveAndCloseItemDialog(eventWindow);
  });
  await alarmPromise;

  // Change the reminder duration, this resets the alarm.
  let eventBox = await dayView.waitForAllDayItemAt(controller.window, 1);

  // Prepare to snooze the alarm.
  alarmPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://calendar/content/calendar-alarm-dialog.xhtml",
    {
      async callback(alarmWindow) {
        await new Promise(resolve => alarmWindow.setTimeout(resolve, 500));

        let snoozeAllButton = alarmWindow.document.getElementById("alarm-snooze-all-button");
        let popup = alarmWindow.document.querySelector("#alarm-snooze-all-popup");
        let menuitems = alarmWindow.document.querySelectorAll("#alarm-snooze-all-popup > menuitem");

        let shownPromise = BrowserTestUtils.waitForEvent(snoozeAllButton, "popupshown");
        EventUtils.synthesizeMouseAtCenter(snoozeAllButton, {}, alarmWindow);
        await shownPromise;
        popup.activateItem(menuitems[5]);
      },
    }
  );
  await invokeEditingEventDialog(window, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { reminder: "2days", title: TITLE });
    await saveAndCloseItemDialog(eventWindow);
  });
  await alarmPromise;

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
