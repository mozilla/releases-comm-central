/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalTodo: "resource:///modules/CalTodo.sys.mjs",
});

function run_test() {
  do_calendar_startup(run_next_test);
}

add_task(async function test_setDefaultValues_events() {
  let item, alarm;

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 60);
  item = new CalEvent();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "yards");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 20);
  item = new CalEvent();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-PT20M");

  Services.prefs.setIntPref("calendar.alarms.onforevents", 0);
  item = new CalEvent();
  cal.alarms.setDefaultValues(item);
  equal(item.getAlarms().length, 0);

  const mockCalendar = {
    getProperty() {
      return ["SHOUT"];
    },
  };

  Services.prefs.setIntPref("calendar.alarms.onforevents", 1);
  Services.prefs.setStringPref("calendar.alarms.eventalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.eventalarmlen", 60);
  item = new CalEvent();
  item.calendar = mockCalendar;
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "SHOUT");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.clearUserPref("calendar.alarms.onforevents");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.eventalarmlen");
});

add_task(async function test_setDefaultValues_tasks() {
  let item, alarm;
  const calnow = cal.dtz.now;
  const nowDate = cal.createDateTime("20150815T120000");
  cal.dtz.now = function () {
    return nowDate;
  };

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 60);
  item = new CalTodo();
  equal(item.entryDate, null);
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-P2DT12H");
  equal(item.entryDate.icalString, nowDate.icalString);

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "yards");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 20);
  item = new CalTodo();
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "DISPLAY");
  equal(alarm.offset.icalString, "-PT20M");

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 0);
  item = new CalTodo();
  cal.alarms.setDefaultValues(item);
  equal(item.getAlarms().length, 0);

  const mockCalendar = {
    getProperty() {
      return ["SHOUT"];
    },
  };

  Services.prefs.setIntPref("calendar.alarms.onfortodos", 1);
  Services.prefs.setStringPref("calendar.alarms.todoalarmunit", "hours");
  Services.prefs.setIntPref("calendar.alarms.todoalarmlen", 60);
  item = new CalTodo();
  item.calendar = mockCalendar;
  cal.alarms.setDefaultValues(item);
  alarm = item.getAlarms()[0];
  ok(alarm);
  equal(alarm.related, Ci.calIAlarm.ALARM_RELATED_START);
  equal(alarm.action, "SHOUT");
  equal(alarm.offset.icalString, "-P2DT12H");

  Services.prefs.clearUserPref("calendar.alarms.onfortodos");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmunit");
  Services.prefs.clearUserPref("calendar.alarms.todoalarmlen");
  cal.dtz.now = calnow;
});

add_task(async function test_calculateAlarmDate() {
  const item = new CalEvent();
  item.startDate = cal.createDateTime("20150815T120000");
  item.endDate = cal.createDateTime("20150815T130000");

  const calculateAlarmDate = cal.alarms.calculateAlarmDate.bind(cal.alarms, item);

  let alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_ABSOLUTE;
  alarm.alarmDate = cal.createDateTime("20150815T110000");
  equal(calculateAlarmDate(alarm).icalString, "20150815T110000");

  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration("-PT1H");
  equal(calculateAlarmDate(alarm).icalString, "20150815T110000Z");

  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_END;
  alarm.offset = cal.createDuration("-PT2H");
  equal(calculateAlarmDate(alarm).icalString, "20150815T110000Z");

  item.startDate.isDate = true;
  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration("-PT1H");
  equal(calculateAlarmDate(alarm).icalString, "20150814T230000Z");
  item.startDate.isDate = false;

  item.endDate.isDate = true;
  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_END;
  alarm.offset = cal.createDuration("-PT2H");
  equal(calculateAlarmDate(alarm).icalString, "20150814T220000Z");
  item.endDate.isDate = false;

  alarm = new CalAlarm();
  alarm.related = Ci.calIAlarm.ALARM_RELATED_END;
  equal(calculateAlarmDate(alarm), null);
});
