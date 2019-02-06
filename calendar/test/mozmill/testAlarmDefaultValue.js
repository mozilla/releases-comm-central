/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test default alarm settings for events and tasks
 */

var MODULE_NAME = "testAlarmDefaultValue";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "content-tab-helpers"];

var { cal } = ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
var { PluralForm } = ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
var { Preferences } = ChromeUtils.import("resource://gre/modules/Preferences.jsm");

const DEFVALUE = 43;

var helpersForController, invokeEventDialog, openLightningPrefs, menulistSelect;
var plan_for_modal_dialog, wait_for_modal_dialog;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        openLightningPrefs,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule(controller);
    Object.assign(module, helpersForController(controller));

    ({ plan_for_modal_dialog, wait_for_modal_dialog } =
        collector.getModule("window-helpers"));

    collector.getModule("content-tab-helpers").installInto(module);
}

function testDefaultAlarms() {
    let localeUnitString = cal.l10n.getCalString("unitDays");
    let unitString = PluralForm.get(DEFVALUE, localeUnitString).replace("#1", DEFVALUE);
    let alarmString = (...args) => cal.l10n.getString("calendar-alarms", ...args);
    let originStringEvent = alarmString("reminderCustomOriginBeginBeforeEvent");
    let originStringTask = alarmString("reminderCustomOriginBeginBeforeTask");
    let expectedEventReminder = alarmString("reminderCustomTitle", [unitString, originStringEvent]);
    let expectedTaskReminder = alarmString("reminderCustomTitle", [unitString, originStringTask]);

    let detailPath = `
        //*[@id="reminder-details"]/*[local-name()="label" and (not(@hidden) or @hidden="false")]
    `;

    // Configure the lightning preferences.
    openLightningPrefs(handlePrefTab, controller);

    // Create New Event.
    controller.click(eid("newMsgButton-calendar-menuitem"));

    // Set up the event dialog controller.
    invokeEventDialog(controller, null, (event, iframe) => {
        let { xpath: eventpath, eid: eventid } = helpersForController(event);

        // Check if the "custom" item was selected.
        event.assertDOMProperty(eventid("item-alarm"), "value", "custom");
        let reminderDetailsVisible = eventpath(detailPath);
        event.assertDOMProperty(reminderDetailsVisible, "value", expectedEventReminder);

        plan_for_modal_dialog("Calendar:EventDialog:Reminder", handleReminderDialog);
        event.click(reminderDetailsVisible);
        wait_for_modal_dialog("Calendar:EventDialog:Reminder");

        // Close the event dialog.
        event.window.close();
    });

    // Create New Task.
    controller.click(eid("newMsgButton-task-menuitem"));
    invokeEventDialog(controller, null, (task, iframe) => {
        let { xpath: taskpath, eid: taskid } = helpersForController(task);

        // Check if the "custom" item was selected.
        task.assertDOMProperty(taskid("item-alarm"), "value", "custom");
        let reminderDetailsVisible = taskpath(detailPath);
        task.assertDOMProperty(reminderDetailsVisible, "value", expectedTaskReminder);

        plan_for_modal_dialog("Calendar:EventDialog:Reminder", handleReminderDialog);
        task.click(reminderDetailsVisible);
        wait_for_modal_dialog("Calendar:EventDialog:Reminder");

        // Close the task dialog.
        task.window.close();
    });
}
testDefaultAlarms.EXCLUDED_PLATFORMS = ["winnt"];

function handlePrefTab(tab) {
    // Click on the alarms tab.
    content_tab_e(tab, "calPreferencesTabAlarms").click();

    // Turn on alarms for events and tasks.
    menulistSelect(content_tab_eid(tab, "eventdefalarm"), "1", controller);
    menulistSelect(content_tab_eid(tab, "tododefalarm"), "1", controller);

    // Selects "days" as a unit.
    menulistSelect(content_tab_eid(tab, "tododefalarmunit"), "days", controller);
    menulistSelect(content_tab_eid(tab, "eventdefalarmunit"), "days", controller);

    // Sets default alarm length for events to DEFVALUE.
    let eventdefalarmlen = content_tab_eid(tab, "eventdefalarmlen");
    replaceText(eventdefalarmlen, DEFVALUE.toString());

    let tododefalarmlen = content_tab_eid(tab, "tododefalarmlen");
    replaceText(tododefalarmlen, DEFVALUE.toString());
}

function handleReminderDialog(reminders) {
    let { eid: remindersid, replaceText } = helpersForController(reminders);

    let listbox = remindersid("reminder-listbox");
    let listboxElement = remindersid("reminder-listbox").getNode();
    reminders.waitFor(() => listboxElement.selectedCount == 1);
    reminders.assertJS(listboxElement.selectedItem.reminder.offset.days == DEFVALUE);

    reminders.click(remindersid("reminder-new-button"));
    reminders.waitFor(() => listboxElement.itemCount == 2);
    reminders.assertJS(listboxElement.selectedCount == 1);
    reminders.assertJS(listboxElement.selectedItem.reminder.offset.days == DEFVALUE);

    replaceText(remindersid("reminder-length"), "20");
    reminders.assertJS(listboxElement.selectedItem.reminder.offset.days == 20);

    reminders.click(listbox);
    reminders.keypress(listbox, "VK_UP", {});
    reminders.waitFor(() => listboxElement.selectedIndex == 0);

    reminders.assertJS(listboxElement.selectedItem.reminder.offset.days == DEFVALUE);

    reminders.window.close();
}

function teardownTest(module) {
    Preferences.resetBranch("calendar.alarms");
}
