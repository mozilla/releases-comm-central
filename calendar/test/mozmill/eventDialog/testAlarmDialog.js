/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testAlarmDialog";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "item-editing-helpers", "window-helpers"];

var TIMEOUT_MODAL_DIALOG, CALENDARNAME, EVENTPATH, ALLDAY;
var helpersForController, switchToView, goToDate, lookupEventBox;
var invokeEventDialog, viewForward, closeAllEventDialogs, deleteCalendars;
var createCalendar;
var setData;
var plan_for_modal_dialog, wait_for_modal_dialog;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));
    ({
        TIMEOUT_MODAL_DIALOG,
        CALENDARNAME,
        EVENTPATH,
        ALLDAY,
        helpersForController,
        switchToView,
        goToDate,
        lookupEventBox,
        invokeEventDialog,
        viewForward,
        closeAllEventDialogs,
        deleteCalendars,
        createCalendar,
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ setData } = collector.getModule("item-editing-helpers"));
    collector.getModule("item-editing-helpers").setupModule(module);

    createCalendar(controller, CALENDARNAME);
}

function testAlarmDialog() {
    let now = new Date();

    switchToView(controller, "day");
    goToDate(controller, now.getFullYear(), now.getMonth() + 1, now.getDate());
    viewForward(controller, 1);

    controller.click(lookupEventBox("day", ALLDAY, undefined, 1));
    controller.mainMenu.click("#ltnNewEvent");

    // Create a new all-day event tomorrow.
    invokeEventDialog(controller, null, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        setData(event, iframe, {
            allday: true,
            reminder: "1day",
        });

        event.click(eventid("button-saveandclose"));
    });

    // Dismiss the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
        let { eid: alarmid } = helpersForController(alarm);
        alarm.waitThenClick(alarmid("alarm-dismiss-all-button"));
    });
    wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);

    // Change the reminder duration, this resets the alarm.
    let eventBox = lookupEventBox("day", ALLDAY, undefined, 1, undefined, EVENTPATH);
    invokeEventDialog(controller, eventBox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        setData(event, iframe, { reminder: "2days" });

        event.click(eventid("button-saveandclose"));
    });

    // Snooze the alarm.
    plan_for_modal_dialog("Calendar:AlarmWindow", alarm => {
        let { eid: alarmid } = helpersForController(alarm);
        let snoozeAllButton = alarmid("alarm-snooze-all-button");
        let popup = alarmid("alarm-snooze-all-popup").getNode();
        let menuitems = popup.querySelectorAll(":scope > menuitem");

        alarm.waitThenClick(snoozeAllButton);
        menuitems[5].click();
    });
    wait_for_modal_dialog("Calendar:AlarmWindow", TIMEOUT_MODAL_DIALOG);
}

function teardownModule(module) {
    deleteCalendars(controller, CALENDARNAME);
    closeAllEventDialogs();
}
