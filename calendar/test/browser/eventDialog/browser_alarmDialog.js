/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var mozmill = ChromeUtils.import("resource://testing-common/mozmill/mozmill.jsm");

var {
  ALLDAY,
  CALENDARNAME,
  EVENTPATH,
  TIMEOUT_MODAL_DIALOG,
  closeAllEventDialogs,
  createCalendar,
  deleteCalendars,
  goToDate,
  helpersForController,
  invokeEventDialog,
  switchToView,
  viewForward,
} = ChromeUtils.import("resource://testing-common/mozmill/CalendarUtils.jsm");
var { setData } = ChromeUtils.import("resource://testing-common/mozmill/ItemEditingHelpers.jsm");
var { plan_for_modal_dialog, wait_for_modal_dialog } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var controller = mozmill.getMail3PaneController();
var { lookupEventBox } = helpersForController(controller);

add_task(async function testAlarmDialog() {
  let now = new Date();

  createCalendar(controller, CALENDARNAME);
  switchToView(controller, "day");
  goToDate(controller, now.getFullYear(), now.getMonth() + 1, now.getDate());
  viewForward(controller, 1);

  controller.click(lookupEventBox("day", ALLDAY, undefined, 1));
  controller.mainMenu.click("#calendar-new-event-menuitem");

  // Create a new all-day event tomorrow.
  await invokeEventDialog(controller, null, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    await setData(event, iframe, {
      allday: true,
      reminder: "1day",
    });

    // Prepare to dismiss the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
      let { eid: alarmid } = helpersForController(alarm);
      alarm.waitThenClick(alarmid("alarm-dismiss-all-button"));
      // The dialog will close itself if we wait long enough.
      alarm.sleep(500);
    });

    event.click(eventid("button-saveandclose"));
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  // Change the reminder duration, this resets the alarm.
  let eventBox = lookupEventBox("day", ALLDAY, undefined, 1, undefined, EVENTPATH);
  await invokeEventDialog(controller, eventBox, async (event, iframe) => {
    let { eid: eventid } = helpersForController(event);

    await setData(event, iframe, { reminder: "2days" });

    // Prepare to snooze the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
      let { eid: alarmid } = helpersForController(alarm);
      let snoozeAllButton = alarmid("alarm-snooze-all-button");
      let popup = alarmid("alarm-snooze-all-popup").getNode();
      let menuitems = popup.querySelectorAll(":scope > menuitem");

      alarm.waitThenClick(snoozeAllButton);
      menuitems[5].click();
      // The dialog will close itself if we wait long enough.
      alarm.sleep(500);
    });

    event.click(eventid("button-saveandclose"));
  });
  wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

  Assert.ok(true, "Test ran to completion");
});

registerCleanupFunction(function teardownModule(module) {
  deleteCalendars(controller, CALENDARNAME);
  closeAllEventDialogs();
});
