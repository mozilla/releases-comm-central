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
  helpersForController,
  invokeNewEventDialog,
  invokeEditingEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");

var elib = ChromeUtils.import("resource://testing-common/mozmill/elementslib.jsm");

var { saveAndCloseItemDialog, setData } = ChromeUtils.import(
  "resource://testing-common/mozmill/ItemEditingHelpers.jsm"
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
  controller.click(new elib.Elem(allDayHeader));

  // Create a new all-day event tomorrow.
  await invokeNewEventDialog(controller, null, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, {
      allday: true,
      reminder: "1day",
      title: TITLE,
    });

    // Prepare to dismiss the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
      let { eid: alarmid } = helpersForController(alarm);
      let button = alarmid("alarm-dismiss-all-button");
      alarm.waitForElement(button);
      alarm.click(button);
      // The dialog will close itself if we wait long enough.
      alarm.sleep(500);
    });

    saveAndCloseItemDialog(eventWindow);
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  // Change the reminder duration, this resets the alarm.
  let eventBox = await dayView.waitForAllDayItemAt(controller.window, 1);
  await invokeEditingEventDialog(controller, eventBox, async (eventWindow, iframeWindow) => {
    await setData(eventWindow, iframeWindow, { reminder: "2days", title: TITLE });

    // Prepare to snooze the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
      let { eid: alarmid } = helpersForController(alarm);
      let snoozeAllButton = alarmid("alarm-snooze-all-button");
      let popup = alarmid("alarm-snooze-all-popup").getNode();
      let menuitems = popup.querySelectorAll(":scope > menuitem");

      alarm.waitForElement(snoozeAllButton);
      alarm.click(snoozeAllButton);
      menuitems[5].click();
      // The dialog will close itself if we wait long enough.
      alarm.sleep(500);
    });

    saveAndCloseItemDialog(eventWindow);
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
