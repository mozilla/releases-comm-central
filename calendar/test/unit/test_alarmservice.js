/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { TestUtils } = ChromeUtils.import("resource://testing-common/TestUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.jsm",
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.jsm",
});

var EXPECT_NONE = 0;
var EXPECT_FIRED = 1;
var EXPECT_TIMER = 2;

function do_check_xor(a, b, aMessage) {
  return ok((a && !b) || (!a && b), aMessage);
}

var alarmObserver = {
  QueryInterface: ChromeUtils.generateQI(["calIAlarmServiceObserver"]),

  service: null,
  firedMap: {},
  expectedMap: {},
  pendingOps: {},

  onAlarm(aItem, aAlarm) {
    this.firedMap[aItem.hashId] = this.firedMap[aItem.hashId] || {};
    this.firedMap[aItem.hashId][aAlarm.icalString] = true;
  },

  onNotification(item) {},

  onRemoveAlarmsByItem(aItem) {
    if (aItem.hashId in this.firedMap) {
      delete this.firedMap[aItem.hashId];
    }
  },

  onRemoveAlarmsByCalendar() {},

  onAlarmsLoaded(aCalendar) {
    this.checkLoadStatus();
    if (aCalendar.id in this.pendingOps) {
      this.pendingOps[aCalendar.id].call();
    }
  },

  doOnAlarmsLoaded(aCalendar, aOperation) {
    this.checkLoadStatus();
    if (
      aCalendar.id in this.service.mLoadedCalendars &&
      this.service.mLoadedCalendars[aCalendar.id]
    ) {
      // the calendar's alarms have already been loaded, do the callback now
      aOperation.call();
    } else {
      // the calendar hasn't been fully loaded yet, set as a pending operation
      this.pendingOps[aCalendar.id] = aOperation;
    }
  },

  getTimer(aCalendarId, aItemId, aAlarmStr) {
    return aCalendarId in this.service.mTimerMap &&
      aItemId in this.service.mTimerMap[aCalendarId] &&
      aAlarmStr in this.service.mTimerMap[aCalendarId][aItemId]
      ? this.service.mTimerMap[aCalendarId][aItemId][aAlarmStr]
      : null;
  },

  expectResult(aCalendar, aItem, aAlarm, aExpected) {
    let expectedAndTitle = {
      expected: aExpected,
      title: aItem.title,
    };
    this.expectedMap[aCalendar.id] = this.expectedMap[aCalendar.id] || {};
    this.expectedMap[aCalendar.id][aItem.hashId] =
      this.expectedMap[aCalendar.id][aItem.hashId] || {};
    this.expectedMap[aCalendar.id][aItem.hashId][aAlarm.icalString] = expectedAndTitle;
  },

  expectOccurrences(aCalendar, aItem, aAlarm, aExpectedArray) {
    // we need to be earlier than the first occurrence
    let date = aItem.startDate.clone();
    date.second -= 1;

    for (let expected of aExpectedArray) {
      let occ = aItem.recurrenceInfo.getNextOccurrence(date);
      occ.QueryInterface(Ci.calIEvent);
      date = occ.startDate;
      this.expectResult(aCalendar, occ, aAlarm, expected);
    }
  },

  checkExpected(aMessage) {
    for (let calId in this.expectedMap) {
      for (let id in this.expectedMap[calId]) {
        for (let icalString in this.expectedMap[calId][id]) {
          let expectedAndTitle = this.expectedMap[calId][id][icalString];
          // if no explicit message has been passed, take the item title
          let message = typeof aMessage == "string" ? aMessage : expectedAndTitle.title;
          // only alarms expected as fired should exist in our fired alarm map
          do_check_xor(
            expectedAndTitle.expected != EXPECT_FIRED,
            id in this.firedMap && icalString in this.firedMap[id],
            message + "; check fired"
          );
          // only alarms expected as timers should exist in the service's timer map
          do_check_xor(
            expectedAndTitle.expected != EXPECT_TIMER,
            !!this.getTimer(calId, id, icalString),
            message + "; check timer"
          );
        }
      }
    }
  },

  checkLoadStatus() {
    for (let calId in this.service.mLoadedCalendars) {
      if (!this.service.mLoadedCalendars[calId]) {
        // at least one calendar hasn't finished loading alarms
        ok(this.service.isLoading);
        return;
      }
    }
    ok(!this.service.isLoading);
  },

  clear() {
    this.firedMap = {};
    this.pendingOps = {};
    this.expectedMap = {};
  },
};

function run_test() {
  do_get_profile();

  add_test(() => {
    // initialization needs to be done within the first test in order for
    // the subsequent tests to run properly
    do_calendar_startup(() => {
      initializeAlarmService();
      run_next_test();
    });
  });
  add_test(test_addItems);
  add_test(test_loadCalendar);
  add_test(test_modifyItems);
  add_test(test_notificationTimers);
  add_test(test_calendarLevelNotificationTimers);

  run_next_test();
}

function initializeAlarmService() {
  alarmObserver.service = Cc["@mozilla.org/calendar/alarm-service;1"].getService(
    Ci.calIAlarmService
  ).wrappedJSObject;
  ok(!alarmObserver.service.mStarted);
  alarmObserver.service.startup(null);
  ok(alarmObserver.service.mStarted);

  // we need to replace the existing observers with our observer
  for (let obs of alarmObserver.service.mObservers.values()) {
    alarmObserver.service.removeObserver(obs);
  }
  alarmObserver.service.addObserver(alarmObserver);
}

function createAlarmFromDuration(aOffset) {
  let alarm = new CalAlarm();

  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration(aOffset);

  return alarm;
}

function createEventWithAlarm(aCalendar, aStart, aEnd, aOffset, aRRule) {
  let alarm = null;
  let item = new CalEvent();

  item.id = cal.getUUID();
  item.calendar = aCalendar;
  item.startDate = aStart || cal.dtz.now();
  item.endDate = aEnd || cal.dtz.now();
  if (aOffset) {
    alarm = createAlarmFromDuration(aOffset);
    item.addAlarm(alarm);
  }
  if (aRRule) {
    item.recurrenceInfo = new CalRecurrenceInfo(item);
    item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule(aRRule));
  }
  return [item, alarm];
}

function addTestItems(aCalendar) {
  let item, alarm;

  // alarm on an item starting more than a month in the past should not fire
  let date = cal.dtz.now();
  date.day -= 32;
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "P7D");
  item.title = "addTestItems Test 1";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  aCalendar.addItem(item, null);

  // alarm 15 minutes ago should fire
  date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M");
  item.title = "addTestItems Test 2";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  aCalendar.addItem(item, null);

  // alarm within 6 hours should have a timer set
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT1H");
  item.title = "addTestItems Test 3";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  aCalendar.addItem(item, null);

  // alarm more than 6 hours in the future should not have a timer set
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT7H");
  item.title = "addTestItems Test 4";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  aCalendar.addItem(item, null);

  // test multiple alarms on an item
  [item, alarm] = createEventWithAlarm(aCalendar, date, date);
  item.title = "addTestItems Test 5";
  const firedOffsets = [
    ["-PT1H", EXPECT_FIRED],
    ["-PT15M", EXPECT_FIRED],
    ["PT1H", EXPECT_TIMER],
    ["PT7H", EXPECT_NONE],
    ["P7D", EXPECT_NONE],
  ];

  firedOffsets.forEach(([offset, expected]) => {
    alarm = createAlarmFromDuration(offset);
    item.addAlarm(alarm);
    alarmObserver.expectResult(aCalendar, item, alarm, expected);
  });
  aCalendar.addItem(item, null);

  // Bug 1344068 - Alarm with lastAck on exception, should take parent lastAck.
  // Alarm 15 minutes ago should fire.
  date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M", "RRULE:FREQ=DAILY;COUNT=1");
  item.title = "addTestItems Test 6";

  // Parent item is acknowledged before alarm, so it should fire.
  let lastAck = item.startDate.clone();
  lastAck.hour -= 1;
  item.alarmLastAck = lastAck;

  // Occurrence is acknowledged after alarm (start date), so if the alarm
  // service wrongly uses the exception occurrence then we catch it.
  let occ = item.recurrenceInfo.getOccurrenceFor(item.startDate);
  occ.alarmLastAck = item.startDate.clone();
  item.recurrenceInfo.modifyException(occ, true);

  alarmObserver.expectOccurrences(aCalendar, item, alarm, [EXPECT_FIRED]);
  aCalendar.addItem(item, null);

  // daily repeating event starting almost 2 full days ago. The alarms on the first 2 occurrences
  // should fire, and a timer should be set for the next occurrence only
  date = cal.dtz.now();
  date.hour -= 47;
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M", "RRULE:FREQ=DAILY");
  item.title = "addTestItems Test 7";
  alarmObserver.expectOccurrences(aCalendar, item, alarm, [
    EXPECT_FIRED,
    EXPECT_FIRED,
    EXPECT_TIMER,
    EXPECT_NONE,
    EXPECT_NONE,
  ]);
  aCalendar.addItem(item, null);

  // monthly repeating event starting 2 months and a day ago. The alarms on the first 2 occurrences
  // should be ignored, the alarm on the next occurrence only should fire.
  // Missing recurrences of the event in particular days of the year generate exceptions to the
  // regular sequence of alarms.
  date = cal.dtz.now();
  let statusAlarmSequences = {
    reg: [EXPECT_NONE, EXPECT_NONE, EXPECT_FIRED, EXPECT_NONE, EXPECT_NONE],
    excep1: [EXPECT_NONE, EXPECT_FIRED, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE],
    excep2: [EXPECT_NONE, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE],
  };
  let expected = [];
  if (date.day == 1) {
    // Exceptions for missing occurrences on months with 30 days when the event starts on 31st.
    let sequence = [
      "excep1",
      "reg",
      "excep2",
      "excep1",
      "reg",
      "excep1",
      "reg",
      "excep1",
      "reg",
      "excep2",
      "excep1",
      "reg",
    ][date.month];
    expected = statusAlarmSequences[sequence];
  } else if (date.day == 30 && (date.month == 2 || date.month == 3)) {
    // Exceptions for missing occurrences or different start date caused by February.
    let leapYear = date.endOfYear.yearday == 366;
    expected = leapYear ? statusAlarmSequences.reg : statusAlarmSequences.excep1;
  } else if (date.day == 31 && date.month == 2) {
    // Exceptions for missing occurrences caused by February.
    expected = statusAlarmSequences.excep1;
  } else {
    // Regular sequence of alarms expected for all the others days.
    expected = statusAlarmSequences.reg;
  }
  date.month -= 2;
  date.day -= 1;
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M", "RRULE:FREQ=MONTHLY");
  item.title = "addTestItems Test 8";
  alarmObserver.expectOccurrences(aCalendar, item, alarm, expected);
  aCalendar.addItem(item, null);
}

function doModifyItemTest(aCalendar) {
  let item, alarm;

  // begin with item starting before the alarm date range
  let date = cal.dtz.now();
  date.day -= 32;
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT0S");
  aCalendar.addItem(item, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("doModifyItemTest Test 1");

  // move event into the fired range
  let oldItem = item.clone();
  date.day += 31;
  item.startDate = date.clone();
  item.generation++;
  aCalendar.modifyItem(item, oldItem, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("doModifyItemTest Test 2");

  // move event into the timer range
  oldItem = item.clone();
  date.hour += 25;
  item.startDate = date.clone();
  item.generation++;
  aCalendar.modifyItem(item, oldItem, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 3");

  // move event past the timer range
  oldItem = item.clone();
  date.hour += 6;
  item.startDate = date.clone();
  item.generation++;
  aCalendar.modifyItem(item, oldItem, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("doModifyItemTest Test 4");

  // re-move the event in the timer range and verify that the timer
  // doesn't change when the timezone changes to floating (bug 1300493).
  oldItem = item.clone();
  date.hour -= 6;
  item.startDate = date.clone();
  item.generation++;
  aCalendar.modifyItem(item, oldItem, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 5");
  let oldTimer = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  oldItem = item.clone();
  // change the timezone to floating
  item.startDate.timezone = cal.dtz.floating;
  item.generation++;
  aCalendar.modifyItem(item, oldItem, null);
  // the alarm must still be timer and with the same value (apart from milliseconds)
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 5, floating timezone");
  let newTimer = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  ok(
    newTimer.delay - oldTimer.delay <= 1000,
    "doModifyItemTest Test 5, floating timezone; check timer value"
  );
}

function doDeleteItemTest(aCalendar) {
  alarmObserver.clear();
  let item, alarm;
  let item2, alarm2;

  // create a fired alarm and a timer
  let date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  [item2, alarm2] = createEventWithAlarm(aCalendar, date, date, "PT1H");
  item.title = "doDeleteItemTest item Test 1";
  item2.title = "doDeleteItemTest item2 Test 1";
  aCalendar.addItem(item, null);
  aCalendar.addItem(item2, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_TIMER);
  alarmObserver.checkExpected();

  // item deletion should clear the fired alarm and timer
  aCalendar.deleteItem(item, null);
  aCalendar.deleteItem(item2, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_NONE);
  alarmObserver.checkExpected("doDeleteItemTest, cleared fired alarm and timer");
}

function doAcknowledgeTest(aCalendar) {
  alarmObserver.clear();
  let item, alarm;
  let item2, alarm2;

  // create the fired alarms
  let date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  [item2, alarm2] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  item.title = "doAcknowledgeTest item Test 1";
  item2.title = "doAcknowledgeTest item2 Test 1";
  aCalendar.addItem(item, null);
  aCalendar.addItem(item2, null);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_FIRED);
  alarmObserver.checkExpected();

  // test snooze alarm
  alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doAcknowledgeTest, test snooze alarm");

  // the snoozed alarm timer delay should be close to an hour
  let tmr = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  ok(
    Math.abs(tmr.delay - 3600000) <= 1000,
    "doAcknowledgeTest, snoozed alarm timer delay close to an hour"
  );

  // test dismiss alarm
  alarmObserver.service.dismissAlarm(item2, alarm2);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_NONE);
  alarmObserver.checkExpected("doAcknowledgeTest, test dismiss alarm");
}

function doRunTest(aOnCalendarCreated, aOnAlarmsLoaded) {
  alarmObserver.clear();

  let calmgr = cal.getCalendarManager();
  let memory = calmgr.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  if (aOnCalendarCreated) {
    aOnCalendarCreated.call(aOnCalendarCreated, memory);
  }

  calmgr.registerCalendar(memory);

  alarmObserver.doOnAlarmsLoaded(memory, async () => {
    if (aOnAlarmsLoaded) {
      await aOnAlarmsLoaded(memory);
    }

    run_next_test();
  });
}

// Test the initial alarm loading of a calendar with existing data
function test_loadCalendar() {
  doRunTest(addTestItems, alarmObserver.checkExpected.bind(alarmObserver));
}

// Test adding alarm data to a calendar already registered
function test_addItems() {
  doRunTest(null, memory => {
    addTestItems(memory);
    alarmObserver.checkExpected();
  });
}

// Test response to modification of alarm data
function test_modifyItems() {
  doRunTest(null, memory => {
    doModifyItemTest(memory);
    doDeleteItemTest(memory);
    doAcknowledgeTest(memory);
  });
}

/**
 * Test an array of timers has expected delay values.
 * @param {nsITimer[]} timers - An array of nsITimer.
 * @param {number[]} expected - Expected delays in seconds.
 */
function matchTimers(timers, expected) {
  let delays = timers.map(timer => timer.delay / 1000);
  let matched = true;
  for (let i = 0; i < delays.length; i++) {
    if (Math.abs(delays[i] - expected[i]) > 1) {
      matched = false;
      break;
    }
  }
  ok(matched, `Delays=${delays} should match Expected=${expected}`);
}

/**
 * Test notification timers are set up correctly when add/modify/remove a
 * calendar item.
 */
function test_notificationTimers() {
  doRunTest(null, memory => {
    // Add an item.
    let date = cal.dtz.now();
    date.hour += 1;
    let item, oldItem;
    [item] = createEventWithAlarm(memory, date, date, null);
    memory.addItem(item, null);
    equal(
      alarmObserver.service.mNotificationTimerMap[item.calendar.id],
      undefined,
      "should have no notification timer"
    );

    // Set the pref to have one notifiaction.
    Services.prefs.setCharPref("calendar.notifications.times", "-PT1H");
    oldItem = item.clone();
    date.hour += 1;
    item.startDate = date.clone();
    item.generation++;
    memory.modifyItem(item, oldItem, null);
    // Should have one notification timer
    matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [3600]);

    // Set the pref to have three notifiactions.
    Services.prefs.setCharPref("calendar.notifications.times", "END:PT2M,PT0M,END:-PT30M,-PT5M");
    oldItem = item.clone();
    date.hour -= 1;
    item.startDate = date.clone();
    date.hour += 1;
    item.endDate = date.clone();
    item.generation++;
    memory.modifyItem(item, oldItem, null);
    // Should have four notification timers.
    matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [
      3300, // 55 minutes
      3600, // 60 minutes
      5400, // 90 minutes, which is 30 minutes before the end (END:-PT30M)
      7320, // 122 minutes, which is 2 minutes after the end (END:PT2M)
    ]);

    alarmObserver.service.removeFiredNotificationTimer(item);
    // Should have three notification timers.
    matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [
      3600,
      5400,
      7320,
    ]);

    memory.deleteItem(item, null);
    equal(
      alarmObserver.service.mNotificationTimerMap[item.calendar.id],
      undefined,
      "notification timers should be removed"
    );

    Services.prefs.clearUserPref("calendar.notifications.times");
  });
}

/**
 * Test notification timers are set up correctly according to the calendar level
 * notifications.times config.
 */
function test_calendarLevelNotificationTimers() {
  let loaded = false;
  let item;
  doRunTest(null, async memory => {
    if (!loaded) {
      loaded = true;
      // Set the global pref to have one notifiaction.
      Services.prefs.setCharPref("calendar.notifications.times", "-PT1H");

      // Add an item.
      let date = cal.dtz.now();
      date.hour += 2;
      [item] = createEventWithAlarm(memory, date, date, null);
      memory.addItem(item, null);

      // Should have one notification timer.
      matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [
        3600,
      ]);
      // Set the calendar level pref to have two notification timers.
      memory.setProperty("notifications.times", "-PT5M,PT0M");
    }

    await TestUtils.waitForCondition(
      () => alarmObserver.service.mNotificationTimerMap[item.calendar.id]?.[item.hashId].length == 2
    );
    // Should have two notification timers
    matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [
      6900, // 105 minutes
      7200, // 120 minutes
    ]);

    Services.prefs.clearUserPref("calendar.notifications.times");
  });
}

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("calendar.notifications.times");
});
