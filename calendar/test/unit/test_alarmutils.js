/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://calendar/modules/calAlarmUtils.jsm");
Components.utils.import("resource://gre/modules/Preferences.jsm");
Components.utils.import("resource://calendar/modules/calUtils.jsm");
Components.utils.import("resource://calendar/modules/calXMLUtils.jsm");

function run_test() {
    do_get_profile();
    do_test_pending();
    cal.getCalendarManager().startup({onResult: function() {
        cal.getTimezoneService().startup({onResult: function() {
            do_test_finished();
            run_next_test();
        }});
    }});
}

add_task(function* test_setDefaultValues_events() {
    let item, alarm;

    Preferences.set("calendar.alarms.onforevents", 1);
    Preferences.set("calendar.alarms.eventalarmunit", "hours");
    Preferences.set("calendar.alarms.eventalarmlen", 60);
    item = cal.createEvent();
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "DISPLAY");
    equal(alarm.offset.icalString, "-P2DT12H");

    Preferences.set("calendar.alarms.onforevents", 1);
    Preferences.set("calendar.alarms.eventalarmunit", "yards");
    Preferences.set("calendar.alarms.eventalarmlen", 20);
    item = cal.createEvent();
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "DISPLAY");
    equal(alarm.offset.icalString, "-PT20M");

    Preferences.set("calendar.alarms.onforevents", 0);
    item = cal.createEvent();
    cal.alarms.setDefaultValues(item);
    equal(item.getAlarms({}).length, 0);

    let mockCalendar = {
      getProperty: function() {
        return ["SHOUT"];
      }
    };

    Preferences.set("calendar.alarms.onforevents", 1);
    Preferences.set("calendar.alarms.eventalarmunit", "hours");
    Preferences.set("calendar.alarms.eventalarmlen", 60);
    item = cal.createEvent();
    item.calendar = mockCalendar;
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "SHOUT");
    equal(alarm.offset.icalString, "-P2DT12H");

    Preferences.reset("calendar.alarms.onforevents");
    Preferences.reset("calendar.alarms.eventalarmunit");
    Preferences.reset("calendar.alarms.eventalarmlen");

});

add_task(function* test_setDefaultValues_tasks() {
    let item, alarm;
    let calnow = cal.now;
    let nowDate = cal.createDateTime("20150815T120000");
    cal.now = function() {
      return nowDate;
    }

    Preferences.set("calendar.alarms.onfortodos", 1);
    Preferences.set("calendar.alarms.todoalarmunit", "hours");
    Preferences.set("calendar.alarms.todoalarmlen", 60);
    item = cal.createTodo();
    equal(item.entryDate, null);
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "DISPLAY");
    equal(alarm.offset.icalString, "-P2DT12H");
    equal(item.entryDate, nowDate);

    Preferences.set("calendar.alarms.onfortodos", 1);
    Preferences.set("calendar.alarms.todoalarmunit", "yards");
    Preferences.set("calendar.alarms.todoalarmlen", 20);
    item = cal.createTodo();
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "DISPLAY");
    equal(alarm.offset.icalString, "-PT20M");

    Preferences.set("calendar.alarms.onfortodos", 0);
    item = cal.createTodo();
    cal.alarms.setDefaultValues(item);
    equal(item.getAlarms({}).length, 0);

    let mockCalendar = {
      getProperty: function() {
        return ["SHOUT"];
      }
    };

    Preferences.set("calendar.alarms.onfortodos", 1);
    Preferences.set("calendar.alarms.todoalarmunit", "hours");
    Preferences.set("calendar.alarms.todoalarmlen", 60);
    item = cal.createTodo();
    item.calendar = mockCalendar;
    cal.alarms.setDefaultValues(item);
    alarm = item.getAlarms({})[0];
    ok(alarm);
    equal(alarm.related, alarm.ALARM_RELATED_START);
    equal(alarm.action, "SHOUT");
    equal(alarm.offset.icalString, "-P2DT12H");

    Preferences.reset("calendar.alarms.onfortodos");
    Preferences.reset("calendar.alarms.todoalarmunit");
    Preferences.reset("calendar.alarms.todoalarmlen");
    cal.now = calnow;
});

add_task(function* test_calculateAlarmDate() {
    let item = cal.createEvent();
    item.startDate = cal.createDateTime("20150815T120000");
    item.endDate = cal.createDateTime("20150815T130000");

    let calculateAlarmDate = cal.alarms.calculateAlarmDate.bind(cal.alarms, item);

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime("20150815T110000");
    equal(calculateAlarmDate(alarm).icalString, "20150815T110000");

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("-PT1H");
    equal(calculateAlarmDate(alarm).icalString, "20150815T110000");

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_END;
    alarm.offset = cal.createDuration("-PT2H");
    equal(calculateAlarmDate(alarm).icalString, "20150815T110000");

    item.startDate.isDate = true;
    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("-PT1H");
    equal(calculateAlarmDate(alarm).icalString, "20150814T230000");
    item.startDate.isDate = false;

    item.endDate.isDate = true;
    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_END;
    alarm.offset = cal.createDuration("-PT2H");
    equal(calculateAlarmDate(alarm).icalString, "20150814T220000");
    item.endDate.isDate = false;

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_END;
    equal(calculateAlarmDate(alarm), null);
});

add_task(function* test_calculateAlarmOffset() {
    let item = cal.createEvent();
    item.startDate = cal.createDateTime("20150815T120000");
    item.endDate = cal.createDateTime("20150815T130000");

    let calculateAlarmOffset = cal.alarms.calculateAlarmOffset.bind(cal.alarms, item);

    let alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_ABSOLUTE;
    alarm.alarmDate = cal.createDateTime("20150815T110000");
    equal(calculateAlarmOffset(alarm).icalString, "-PT1H");
    equal(calculateAlarmOffset(alarm, alarm.ALARM_RELATED_START).icalString, "-PT1H");
    equal(calculateAlarmOffset(alarm, alarm.ALARM_RELATED_END).icalString, "-PT2H");

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_START;
    alarm.offset = cal.createDuration("-PT1H");
    equal(calculateAlarmOffset(alarm).icalString, "-PT1H");

    alarm = cal.createAlarm();
    alarm.related = alarm.ALARM_RELATED_END;
    alarm.offset = cal.createDuration("-PT1H");
    equal(calculateAlarmOffset(alarm).icalString, "-PT1H");
});

add_task(function* test_addReminderImages() {
    function createReminders(actions) {
        let reminders = [];
        for (let action of actions) {
            let reminder = cal.createAlarm();
            reminder.action = action;
            reminders.push(reminder);
        }
        return reminders;
    }

    function checkReminder(node, actions, msg) {
        let actionset = new Set(actions);
        equal(box.childNodes.length, actions.length);
        for (let i = 0, len = box.childNodes.length; i < len; i++) {
            let actionvalue = box.childNodes[i].getAttribute("value");
            equal(box.childNodes[i].localName, "image", msg + " (is image)");
            ok(actionset.has(actionvalue), msg + " (has action)");
            equal(box.childNodes[i].getAttribute("class"), "reminder-icon", msg + " (has class)");
            actionset.delete(actionvalue);
        }
    }

    let xul_ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
    let doc = cal.xml.parseString("<window xmlns='" + xul_ns + "'><box/></window>");
    let box = doc.documentElement.firstChild;

    let actions = ["DISPLAY"];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "first addition");

    actions = ["DISPLAY"];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "same reminders again");

    actions = ["DISPLAY", "EMAIL", "SMS"];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "added email and sms reminder");

    actions = ["EMAIL", "SMS"];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "removed display reminder");

    actions = ["DISPLAY"];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "replaced all reminders");

    actions = [];
    reminders = createReminders(actions);
    cal.alarms.addReminderImages(box, reminders);
    checkReminder(box, actions, "removed all reminders");
});
