/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

function run_test() {
  do_calendar_startup(run_next_test);
}

add_task(async function test_setDefaultValues_events() {
  let item, alarm;

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 60);
  item = cal.createEvent();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "yards");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 20);
  item = cal.createEvent();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-PT20M");

  Services.prefs.setIntPref("calendar.alarms.onforevents", 0);
  item = cal.createEvent();
  cal.alarms.setDefaultValues(item);
  equal(item.getAlarms().length, 0);

  let mockCalendar = {
    getProperty() {
      return ["SHOUT"];
    },
  };

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 60);
  item = cal.createEvent();
  item.calendar = mockCalendar;
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "SHOUT");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.clearUserPref("calendar.alarms.onforevents");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmlen");
});

add_task(async function test_setDefaultValues_tasks() {
  let item, alarm;
  let calnow = cal.dtz.now;
  let nowDate = cal.createDateTime("20150815T120000");
  cal.dtz.now = function() {
    return nowDate;
  };

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 60);
  item = cal.createTodo();
  equal(item.entryDate, null);
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-P2DT12H");
  equal(item.entryDate, nowDate);

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "yards");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 20);
  item = cal.createTodo();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-PT20M");

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 0);
  item = cal.createTodo();
  cal.alarms.setDefaultValues(item);
  equal(item.getAlarms().length, 0);

  let mockCalendar = {
    getProperty() {
      return ["SHOUT"];
    },
  };

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 60);
  item = cal.createTodo();
  item.calendar = mockCalendar;
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, alarm.ALARM_RELATED_START);
  equal(alarm.action, "SHOUT");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.clearUserPref("calendar.alarms.onfortodos");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmlen");
  cal.dtz.now = calnow;
});

add_task(async function test_calculateAlarmDate() {
  let item = cal.createEvent();
  item.startDate = cal.createDateTime("20150815T120000");
  item.endDate = cal.createDateTime("20150815T130000");

  let calculateAlarmDate = cal.alarms.calculateAlarmDate.bind(cal.alarms, item);

  let alarm = cal.createAlarm();
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

add_task(async function test_calculateAlarmOffset() {
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

add_task(async function test_addReminderImages() {
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
    equal(box.children.length, actions.length);
    for (let i = 0, len = box.children.length; i < len; i++) {
      let actionvalue = box.children[i].getAttribute("value");
      equal(box.children[i].localName, "image", msg + " (is image)");
      ok(actionset.has(actionvalue), msg + " (has action)");
      equal(box.children[i].getAttribute("class"), "reminder-icon", msg + " (has class)");
      actionset.delete(actionvalue);
    }
  }

  let xul_ns = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  let doc = cal.xml.parseString("<window xmlns='" + xul_ns + "'><box/></window>");
  let box = doc.documentElement.firstElementChild;

  let actions = ["DISPLAY"];
  let reminders = createReminders(actions);
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
