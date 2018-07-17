/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test default alarm settings for events and tasks
 */

var MODULE_NAME = "testAlarmDefaultValue";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "keyboard-helpers"];

ChromeUtils.import("resource://calendar/modules/calUtils.jsm");
ChromeUtils.import("resource://gre/modules/PluralForm.jsm");
ChromeUtils.import("resource://gre/modules/Preferences.jsm");

const DEFVALUE = 43;

var helpersForController, invokeEventDialog, openLightningPrefs, menulistSelect;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        openLightningPrefs,
        menulistSelect
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    collector.getModule("content-tab-helpers").installInto(module);
    Object.assign(module, helpersForController(controller));
}

function testDefaultAlarms() {
    let localeUnitString = cal.l10n.getCalString("unitDays");
    let unitString = PluralForm.get(DEFVALUE, localeUnitString).replace("#1", DEFVALUE);
    let alarmString = (...args) => cal.l10n.getString("calendar-alarms", ...args);
    let originStringEvent = alarmString("reminderCustomOriginBeginBeforeEvent");
    let originStringTask = alarmString("reminderCustomOriginBeginBeforeTask");
    let expectedEventReminder = alarmString("reminderCustomTitle", [unitString, originStringEvent]);
    let expectedTaskReminder = alarmString("reminderCustomTitle", [unitString, originStringTask]);

    // Configure the lightning preferences
    openLightningPrefs(handlePrefDialog, controller);

    // Create New Event
    controller.click(eid("newMsgButton-calendar-menuitem"));

    // Set up the event dialog controller
    invokeEventDialog(controller, null, (event, iframe) => {
        let { xpath: eventpath, eid: eventid } = helpersForController(event);

        // Check if the "custom" item was selected
        event.assertDOMProperty(eventid("item-alarm"), "value", "custom");
        let reminderDetailsVisible = eventpath(`
            //*[@id="reminder-details"]/
            *[local-name()="label" and (not(@hidden) or @hidden="false")]
        `);
        event.assertDOMProperty(reminderDetailsVisible, "value", expectedEventReminder);

        // Close the event dialog
        event.window.close();
    });

    // Create New Task
    controller.click(eid("newMsgButton-task-menuitem"));
    invokeEventDialog(controller, null, (task, iframe) => {
        let { xpath: taskpath, eid: taskid } = helpersForController(task);

        // Check if the "custom" item was selected
        task.assertDOMProperty(taskid("item-alarm"), "value", "custom");
        reminderDetailsVisible = taskpath(`
            //*[@id="reminder-details"]/
            *[local-name()="label" and (not(@hidden) or @hidden="false")]
        `);
        task.assertDOMProperty(reminderDetailsVisible, "value", expectedTaskReminder);

        // Close the task dialog
        task.window.close();
    });
}

function handlePrefDialog(tab) {
    // Click on the alarms tab
    content_tab_e(tab, "calPreferencesTabAlarms").click();

    // Turn on alarms for events and tasks
    menulistSelect(content_tab_eid(tab, "eventdefalarm"), "1", controller);
    menulistSelect(content_tab_eid(tab, "tododefalarm"), "1", controller);

    // Selects "days" as a unit
    menulistSelect(content_tab_eid(tab, "tododefalarmunit"), "days", controller);
    menulistSelect(content_tab_eid(tab, "eventdefalarmunit"), "days", controller);

    // Sets default alarm length for events to DEFVALUE
    let eventdefalarmlen = content_tab_eid(tab, "eventdefalarmlen");
    controller.click(eventdefalarmlen);
    controller.keypress(eventdefalarmlen, "a", { accelKey: true });
    controller.type(eventdefalarmlen, DEFVALUE.toString());

    let tododefalarmlen = content_tab_eid(tab, "tododefalarmlen");
    controller.click(tododefalarmlen);
    controller.keypress(tododefalarmlen, "a", { accelKey: true });
    controller.type(tododefalarmlen, DEFVALUE.toString());
}

function teardownTest(module) {
    Preferences.resetBranch("calendar.alarms");
}
