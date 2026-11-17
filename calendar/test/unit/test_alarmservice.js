/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalAlarm: "resource:///modules/CalAlarm.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
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

  onNotification() {},

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

  async doOnAlarmsLoaded(aCalendar) {
    this.checkLoadStatus();
    if (
      aCalendar.id in this.service.mLoadedCalendars &&
      this.service.mLoadedCalendars[aCalendar.id]
    ) {
      // the calendar's alarms have already been loaded
    } else {
      await new Promise(resolve => {
        // the calendar hasn't been fully loaded yet, set as a pending operation
        this.pendingOps[aCalendar.id] = resolve;
      });
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
    const expectedAndTitle = {
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

    for (const expected of aExpectedArray) {
      const occ = aItem.recurrenceInfo.getNextOccurrence(date);
      occ.QueryInterface(Ci.calIEvent);
      date = occ.startDate;
      this.expectResult(aCalendar, occ, aAlarm, expected);
    }
  },

  checkExpected(aMessage) {
    for (const calId in this.expectedMap) {
      for (const id in this.expectedMap[calId]) {
        for (const icalString in this.expectedMap[calId][id]) {
          const expectedAndTitle = this.expectedMap[calId][id][icalString];
          // if no explicit message has been passed, take the item title
          const message = typeof aMessage == "string" ? aMessage : expectedAndTitle.title;
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
    for (const calId in this.service.mLoadedCalendars) {
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

add_setup(async function () {
  do_get_profile();
  alarmObserver.service = Cc["@mozilla.org/calendar/alarm-service;1"].getService(
    Ci.calIAlarmService
  ).wrappedJSObject;
  ok(!alarmObserver.service.mStarted);
  alarmObserver.service.startup(null);
  ok(alarmObserver.service.mStarted);

  // we need to replace the existing observers with our observer
  for (const obs of alarmObserver.service.mObservers.values()) {
    alarmObserver.service.removeObserver(obs);
  }
  alarmObserver.service.addObserver(alarmObserver);
});

function createAlarmFromDuration(aOffset) {
  const alarm = new CalAlarm();

  alarm.related = Ci.calIAlarm.ALARM_RELATED_START;
  alarm.offset = cal.createDuration(aOffset);

  return alarm;
}

function createEventWithAlarm(aCalendar, aStart, aEnd, aOffset, aRRule) {
  let alarm = null;
  const item = new CalEvent();

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

async function addTestItems(aCalendar) {
  let item, alarm;

  // alarm on an item starting more than a month in the past should not fire
  let date = cal.dtz.now();
  date.day -= 32;
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "P7D");
  item.title = "addTestItems Test 1";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  await aCalendar.addItem(item);

  // alarm 15 minutes ago should fire
  date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M");
  item.title = "addTestItems Test 2";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  await aCalendar.addItem(item);

  // alarm within 6 hours should have a timer set
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT1H");
  item.title = "addTestItems Test 3";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  await aCalendar.addItem(item);

  // alarm more than 6 hours in the future should not have a timer set
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT7H");
  item.title = "addTestItems Test 4";
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  await aCalendar.addItem(item);

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
  await aCalendar.addItem(item);

  // Bug 1344068 - Alarm with lastAck on exception, should take parent lastAck.
  // Alarm 15 minutes ago should fire.
  date = cal.dtz.now();
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M", "RRULE:FREQ=DAILY;COUNT=1");
  item.title = "addTestItems Test 6";

  // Parent item is acknowledged before alarm, so it should fire.
  const lastAck = item.startDate.clone();
  lastAck.hour -= 1;
  item.alarmLastAck = lastAck;

  // Occurrence is acknowledged after alarm (start date), so if the alarm
  // service wrongly uses the exception occurrence then we catch it.
  const occ = item.recurrenceInfo.getOccurrenceFor(item.startDate);
  occ.alarmLastAck = item.startDate.clone();
  item.recurrenceInfo.modifyException(occ, true);

  alarmObserver.expectOccurrences(aCalendar, item, alarm, [EXPECT_FIRED]);
  await aCalendar.addItem(item);

  // daily repeating event starting almost 2 full days ago. The alarms on the first 2 occurrences
  // should fire, and a timer should be set for the next occurrence only
  date = cal.dtz.now();
  date.hour -= 47;
  date.hour; // Will cause the date to normalize. Otherwise fails on Jan 1.
  [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT15M", "RRULE:FREQ=DAILY");
  item.title = "addTestItems Test 7";
  alarmObserver.expectOccurrences(aCalendar, item, alarm, [
    EXPECT_FIRED,
    EXPECT_FIRED,
    EXPECT_TIMER,
    EXPECT_NONE,
    EXPECT_NONE,
  ]);
  await aCalendar.addItem(item);

  // monthly repeating event starting 2 months and a day ago. The alarms on the first 2 occurrences
  // should be ignored, the alarm on the next occurrence only should fire.
  // Missing recurrences of the event in particular days of the year generate exceptions to the
  // regular sequence of alarms.
  date = cal.dtz.now();
  const statusAlarmSequences = {
    reg: [EXPECT_NONE, EXPECT_NONE, EXPECT_FIRED, EXPECT_NONE, EXPECT_NONE],
    excep1: [EXPECT_NONE, EXPECT_FIRED, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE],
    excep2: [EXPECT_NONE, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE, EXPECT_NONE],
  };
  let expected = [];
  if (date.day == 1) {
    // Exceptions for missing occurrences on months with 30 days when the event starts on 31st.
    const sequence = [
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
    const leapYear = date.endOfYear.yearday == 366;
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
  await aCalendar.addItem(item);
}

async function doModifyItemTest(aCalendar) {
  // begin with item starting before the alarm date range
  const date = cal.dtz.now();
  date.day -= 32;
  const [item, alarm] = createEventWithAlarm(aCalendar, date, date, "PT0S");
  await aCalendar.addItem(item);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("doModifyItemTest Test 1");

  // move event into the fired range
  let oldItem = item.clone();
  date.day += 31;
  item.startDate = date.clone();
  item.generation++;
  await aCalendar.modifyItem(item, oldItem);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("doModifyItemTest Test 2");

  // move event into the timer range
  oldItem = item.clone();
  date.hour += 25;
  item.startDate = date.clone();
  item.generation++;
  await aCalendar.modifyItem(item, oldItem);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 3");

  // move event past the timer range
  oldItem = item.clone();
  date.hour += 6;
  item.startDate = date.clone();
  item.generation++;
  await aCalendar.modifyItem(item, oldItem);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("doModifyItemTest Test 4");

  // re-move the event in the timer range and verify that the timer
  // doesn't change when the timezone changes to floating (bug 1300493).
  oldItem = item.clone();
  date.hour -= 6;
  item.startDate = date.clone();
  item.generation++;
  await aCalendar.modifyItem(item, oldItem);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 5");
  const oldTimer = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  oldItem = item.clone();
  // change the timezone to floating
  item.startDate.timezone = cal.dtz.floating;
  item.generation++;
  await aCalendar.modifyItem(item, oldItem);
  // the alarm must still be timer and with the same value (apart from milliseconds)
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doModifyItemTest Test 5, floating timezone");
  const newTimer = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  Assert.lessOrEqual(
    newTimer.delay - oldTimer.delay,
    1000,
    "doModifyItemTest Test 5, floating timezone; check timer value"
  );
}

async function doDeleteItemTest(aCalendar) {
  alarmObserver.clear();

  // create a fired alarm and a timer
  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  const [item2, alarm2] = createEventWithAlarm(aCalendar, date, date, "PT1H");
  item.title = "doDeleteItemTest item Test 1";
  item2.title = "doDeleteItemTest item2 Test 1";
  await aCalendar.addItem(item);
  await aCalendar.addItem(item2);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_TIMER);
  alarmObserver.checkExpected();

  // item deletion should clear the fired alarm and timer
  await aCalendar.deleteItem(item);
  await aCalendar.deleteItem(item2);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_NONE);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_NONE);
  alarmObserver.checkExpected("doDeleteItemTest, cleared fired alarm and timer");
}

async function doAcknowledgeTest(aCalendar) {
  alarmObserver.clear();

  // create the fired alarms
  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  const [item2, alarm2] = createEventWithAlarm(aCalendar, date, date, "-PT5M");
  item.title = "doAcknowledgeTest item Test 1";
  item2.title = "doAcknowledgeTest item2 Test 1";
  await aCalendar.addItem(item);
  await aCalendar.addItem(item2);
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_FIRED);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_FIRED);
  alarmObserver.checkExpected();

  // test snooze alarm
  alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  alarmObserver.expectResult(aCalendar, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("doAcknowledgeTest, test snooze alarm");

  // the snoozed alarm timer delay should be close to an hour
  const tmr = alarmObserver.getTimer(aCalendar.id, item.hashId, alarm.icalString);
  Assert.lessOrEqual(
    Math.abs(tmr.delay - 3600000),
    1000,
    "doAcknowledgeTest, snoozed alarm timer delay close to an hour"
  );

  // test dismiss alarm
  alarmObserver.service.dismissAlarm(item2, alarm2);
  alarmObserver.expectResult(aCalendar, item2, alarm2, EXPECT_NONE);
  alarmObserver.checkExpected("doAcknowledgeTest, test dismiss alarm");
}

async function doRunTest(aOnCalendarCreated) {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  if (aOnCalendarCreated) {
    await aOnCalendarCreated(memory);
  }

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);
  return memory;
}

/**
 * Test the initial alarm loading of a calendar with existing data.
 */
add_task(async function test_loadCalendar() {
  await doRunTest(async memory => addTestItems(memory));
  alarmObserver.checkExpected();
});

/**
 * Test adding alarm data to a calendar already registered.
 */
add_task(async function test_addItems() {
  const memory = await doRunTest();
  await addTestItems(memory);
  alarmObserver.checkExpected();
});

/**
 * Test response to modification of alarm data.
 */
add_task(async function test_modifyItems() {
  const memory = await doRunTest();
  await doModifyItemTest(memory);
  await doDeleteItemTest(memory);
  await doAcknowledgeTest(memory);
});

/**
 * Test that snoozing and dismissing update the alarms when the calendar
 * notifies the modification inside a batch, where the alarm service ignores
 * item notifications. CalDAV calendars reload a modified item in a batch.
 */
add_task(async function test_acknowledgeDuringBatch() {
  const memory = await doRunTest();

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  const [item2, alarm2] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "test_acknowledgeDuringBatch snooze";
  item2.title = "test_acknowledgeDuringBatch dismiss";
  await memory.addItem(item);
  await memory.addItem(item2);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.expectResult(memory, item2, alarm2, EXPECT_FIRED);
  alarmObserver.checkExpected();

  memory.startBatch();
  await alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  await alarmObserver.service.dismissAlarm(item2, alarm2);
  memory.endBatch();

  alarmObserver.expectResult(memory, item, alarm, EXPECT_TIMER);
  alarmObserver.expectResult(memory, item2, alarm2, EXPECT_NONE);
  alarmObserver.checkExpected("test_acknowledgeDuringBatch");
});

/**
 * Test that a dismissed alarm leaves the dialog as soon as the dismiss is
 * requested, before the calendar confirms the modification, so a repeated
 * dismiss cannot race the pending one.
 */
add_task(async function test_dismissRemovesAlarmImmediately() {
  const memory = await doRunTest();

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "test_dismissRemovesAlarmImmediately";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  // The batch keeps the calendar from confirming the modification through the
  // observer, so the removal can only come from dismissAlarm itself.
  memory.startBatch();
  const dismissed = alarmObserver.service.dismissAlarm(item, alarm);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("test_dismissRemovesAlarmImmediately, before confirmation");
  await dismissed;
  memory.endBatch();
  alarmObserver.checkExpected("test_dismissRemovesAlarmImmediately, after confirmation");
});

/**
 * Test that a snooze the calendar rejects removes the alarm from the dialog.
 */
add_task(async function test_failedSnoozeRemovesAlarm() {
  const memory = await doRunTest(calendar => {
    // The alarm service calls modifyItem through the XPCOM interface, which
    // dispatches to the provider's wrappedJSObject.
    calendar.wrappedJSObject.modifyItem = async () => {
      throw new Error("modification rejected");
    };
  });

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("test_failedSnoozeRemovesAlarm, before snooze");

  await alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));

  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("test_failedSnoozeRemovesAlarm, after snooze");
});

/**
 * Test an array of timers has expected delay values.
 *
 * @param {nsITimer[]} timers - An array of nsITimer.
 * @param {number[]} expected - Expected delays in seconds.
 */
function matchTimers(timers, expected) {
  const delays = timers.map(timer => timer.delay / 1000);
  let matched = true;
  for (let i = 0; i < delays.length; i++) {
    if (Math.abs(delays[i] - expected[i]) > 2) {
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
add_task(async function test_notificationTimers() {
  const memory = await doRunTest();
  // Add an item.
  const date = cal.dtz.now();
  date.hour += 1;
  const [item] = createEventWithAlarm(memory, date, date, null);
  await memory.addItem(item);
  equal(
    alarmObserver.service.mNotificationTimerMap[item.calendar.id],
    undefined,
    "should have no notification timer"
  );

  // Set the pref to have one notification.
  Services.prefs.setCharPref("calendar.notifications.times", "-PT1H");
  let oldItem = item.clone();
  date.hour += 1;
  item.startDate = date.clone();
  item.generation++;
  await memory.modifyItem(item, oldItem);
  // Should have one notification timer
  matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [3600]);

  // Set the pref to have three notifications.
  Services.prefs.setCharPref("calendar.notifications.times", "END:PT2M,PT0M,END:-PT30M,-PT5M");
  oldItem = item.clone();
  date.hour -= 1;
  item.startDate = date.clone();
  date.hour += 1;
  item.endDate = date.clone();
  item.generation++;
  await memory.modifyItem(item, oldItem);
  // Should have four notification timers.
  matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [
    3300, // 55 minutes
    3600, // 60 minutes
    5400, // 90 minutes, which is 30 minutes before the end (END:-PT30M)
    7320, // 122 minutes, which is 2 minutes after the end (END:PT2M)
  ]);

  alarmObserver.service.removeFiredNotificationTimer(item);
  // Should have three notification timers.
  matchTimers(
    alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId],
    [3600, 5400, 7320]
  );

  await memory.deleteItem(item);
  equal(
    alarmObserver.service.mNotificationTimerMap[item.calendar.id],
    undefined,
    "notification timers should be removed"
  );

  Services.prefs.clearUserPref("calendar.notifications.times");
});

/**
 * Test notification timers are set up correctly according to the calendar level
 * notifications.times config.
 */
add_task(async function test_calendarLevelNotificationTimers() {
  let loaded = false;
  let item;
  const memory = await doRunTest();

  if (!loaded) {
    loaded = true;
    // Set the global pref to have one notification.
    Services.prefs.setCharPref("calendar.notifications.times", "-PT1H");

    // Add an item.
    const date = cal.dtz.now();
    date.hour += 2;
    [item] = createEventWithAlarm(memory, date, date, null);
    await memory.addItem(item);

    // Should have one notification timer.
    matchTimers(alarmObserver.service.mNotificationTimerMap[item.calendar.id][item.hashId], [3600]);
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

/**
 * Bug 2051453: when a CalDAV server silently drops X-MOZ-LASTACK on the
 * round-trip (Google Calendar does this), dismissing a single alarm must not
 * cause the alarm service to permanently ignore every future alarm for the
 * whole event. This reproduces the over-suppression: the event ends up in the
 * calendar's "alarms.ignored" list after one dismiss.
 */
add_task(async function test_dismissDoesNotOverSuppressWhenServerStripsAck() {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  // Mimic a server that does not persist the acknowledgement. The alarm
  // service calls modifyItem through the XPCOM interface, which dispatches to
  // the provider's wrappedJSObject, so the override has to live there.
  const impl = memory.wrappedJSObject;
  let modifyRoutedThroughStrip = false;
  const innerModifyItem = impl.modifyItem.bind(impl);
  impl.modifyItem = function (newItem, oldItem) {
    modifyRoutedThroughStrip = true;
    const stripped = newItem.clone();
    stripped.alarmLastAck = null;
    stripped.deleteProperty("X-MOZ-LASTACK");
    return innerModifyItem(stripped, oldItem);
  };

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "bug 2051453 over-suppression";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  await alarmObserver.service.dismissAlarm(item, alarm);

  // Guard: if the override is not actually exercised the assertion below would
  // pass for the wrong reason (the ack would have been persisted normally).
  Assert.ok(modifyRoutedThroughStrip, "dismiss routed through the ack-stripping modifyItem");

  const ignored = (memory.getProperty("alarms.ignored") || "").split(",");
  Assert.ok(
    !ignored.includes(item.parentItem.hashId),
    "event must not be permanently ignore-listed after a single server-stripped dismiss"
  );

  cal.manager.unregisterCalendar(memory);
});

/**
 * Bug 2051453 (fix): after a server-stripped dismiss records a local ack time,
 * future occurrences of a recurring event must still arm while past occurrences
 * stay dismissed. Re-arming here mimics the resync/restart that triggers the
 * over-suppression in the wild.
 */
add_task(async function test_dismissKeepsFutureOccurrencesArmed() {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  const impl = memory.wrappedJSObject;
  const innerModifyItem = impl.modifyItem.bind(impl);
  impl.modifyItem = function (newItem, oldItem) {
    const stripped = newItem.clone();
    stripped.alarmLastAck = null;
    stripped.deleteProperty("X-MOZ-LASTACK");
    return innerModifyItem(stripped, oldItem);
  };

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  date.hour -= 47;
  date.hour; // Force normalization, as in addTestItems Test 7.
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT15M", "RRULE:FREQ=DAILY");
  item.title = "bug 2051453 future occurrences";
  await memory.addItem(item);

  const probe = item.startDate.clone();
  probe.second -= 1;
  const firstOcc = item.recurrenceInfo.getNextOccurrence(probe);
  firstOcc.QueryInterface(Ci.calIEvent);
  await alarmObserver.service.dismissAlarm(firstOcc, alarm);

  // Clear armed timers and re-arm from scratch, as a resync/restart would. This
  // is the moment the over-suppression bites: the blanket ignore-list entry
  // stops every occurrence from being re-armed.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);

  alarmObserver.expectOccurrences(memory, item, alarm, [
    EXPECT_NONE,
    EXPECT_NONE,
    EXPECT_TIMER,
    EXPECT_NONE,
    EXPECT_NONE,
  ]);
  alarmObserver.checkExpected("future occurrences still arm after a stripped dismiss");

  cal.manager.unregisterCalendar(memory);
});

/**
 * Bug 2051453 (fix): when both a server-persisted alarmLastAck and a locally
 * recorded ack (ignoredAck) exist, the more recent one wins. A dismiss made
 * offline is stored locally and can be newer than the server's ack, so it must
 * still suppress its occurrence even though the older server ack predates the
 * alarm. Reproduces first-truthy `alarmLastAck || ignoredAck`, which would let
 * the alarm fire again.
 */
add_task(async function test_newerLocalAckWinsOverServerAck() {
  alarmObserver.clear();
  Services.prefs.setBoolPref("calendar.alarms.showmissed", true);

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();
  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT15M");
  item.title = "bug 2051453 newer local ack wins";

  // The alarm fired 15 minutes ago.
  const alarmDate = item.startDate.clone();
  alarmDate.minute -= 15;

  // Server persisted an ack from before the alarm (would let it fire again).
  const staleServerAck = alarmDate.clone();
  staleServerAck.minute -= 1;
  item.alarmLastAck = staleServerAck;

  // A later offline dismiss recorded locally, at/after the alarm.
  const localAck = alarmDate.clone();
  localAck.second += 1;
  memory.setProperty("alarms.ignored", `${item.parentItem.hashId}|${localAck.icalString}`);

  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  await memory.addItem(item);
  alarmObserver.checkExpected(
    "newer local ack must suppress the missed alarm (most recent of alarmLastAck and ignoredAck)"
  );

  cal.manager.unregisterCalendar(memory);
  Services.prefs.clearUserPref("calendar.alarms.showmissed");
});

/**
 * Bug 2051453 (fix): the one-time migration clears only legacy ignore-list
 * entries (stored without an ack time, the ones over-suppressing) and leaves
 * ack-bearing entries alone, and only runs when missed alarms are not shown.
 */
add_task(async function test_migrateClearsOnlyLegacyIgnoredEntries() {
  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();
  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const legacyId = "legacy-hash";
  const ackId = "ack-hash";
  const ackTime = cal.dtz.now().icalString;
  memory.setProperty("alarms.ignored", `${legacyId},${ackId}|${ackTime}`);

  Services.prefs.setBoolPref("calendar.alarms.showmissed", false);
  Services.prefs.clearUserPref("calendar.alarms.ignored.legacyCleared");

  alarmObserver.service.migrateClearIgnoredAlarms();

  const remaining = (memory.getProperty("alarms.ignored") || "").split(",");
  Assert.ok(!remaining.includes(legacyId), "legacy no-ack entry cleared");
  Assert.ok(remaining.includes(`${ackId}|${ackTime}`), "ack-bearing entry kept");
  Assert.ok(
    Services.prefs.getBoolPref("calendar.alarms.ignored.legacyCleared", false),
    "migration marked done"
  );

  cal.manager.unregisterCalendar(memory);
  Services.prefs.clearUserPref("calendar.alarms.showmissed");
  Services.prefs.clearUserPref("calendar.alarms.ignored.legacyCleared");
});

/**
 * Bug 2051453 (fix): with missed alarms shown, the migration must not clear the
 * ignore list (that would resurface a burst of past alarms), and must leave
 * itself un-run so it can still clear later if the user turns the pref off.
 */
add_task(async function test_migrateSkipsClearWhenShowMissedTrue() {
  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();
  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const legacyId = "legacy-hash-kept";
  memory.setProperty("alarms.ignored", legacyId);

  Services.prefs.setBoolPref("calendar.alarms.showmissed", true);
  Services.prefs.clearUserPref("calendar.alarms.ignored.legacyCleared");

  alarmObserver.service.migrateClearIgnoredAlarms();

  Assert.equal(
    memory.getProperty("alarms.ignored"),
    legacyId,
    "legacy entry left intact when missed alarms are shown"
  );
  Assert.ok(
    !Services.prefs.getBoolPref("calendar.alarms.ignored.legacyCleared", false),
    "migration left un-run so it can still clear if showmissed is turned off later"
  );

  cal.manager.unregisterCalendar(memory);
  Services.prefs.clearUserPref("calendar.alarms.showmissed");
  Services.prefs.clearUserPref("calendar.alarms.ignored.legacyCleared");
});

/**
 * Dismiss must record a local ack before modifyItem resolves so a concurrent
 * calendar reload (CalDAV onModifyItem/onLoad) cannot re-fire the same alarm.
 * Reproduces the Nextcloud "Dismiss does nothing" race.
 */
add_task(async function test_dismissSurvivesReloadDuringModify() {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  const impl = memory.wrappedJSObject;
  let releaseModify;
  const modifyGate = new Promise(resolve => {
    releaseModify = resolve;
  });
  const innerModifyItem = impl.modifyItem.bind(impl);
  impl.modifyItem = async function (newItem, oldItem) {
    await modifyGate;
    // Mimic a server that drops X-MOZ-LASTACK on the round-trip.
    const stripped = newItem.clone();
    stripped.alarmLastAck = null;
    stripped.deleteProperty("X-MOZ-LASTACK");
    return innerModifyItem(stripped, oldItem);
  };

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "dismiss survives reload during modify";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  const dismissPromise = alarmObserver.service.dismissAlarm(item, alarm);
  // UI/observer removal is synchronous.
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("removed before modify resolves");

  // Simulate the CalDAV re-fetch/reload that races the still-pending PUT.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("reload during in-flight dismiss must not re-fire");

  releaseModify();
  await dismissPromise;

  // After the stripped response, the alarm must still stay dismissed.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("still dismissed after stripped modify completes");

  cal.manager.unregisterCalendar(memory);
});

/**
 * Failed dismiss still removes the fired alarm from observers immediately.
 */
add_task(async function test_failedDismissRemovesAlarm() {
  const memory = await doRunTest(calendar => {
    calendar.wrappedJSObject.modifyItem = async () => {
      throw new Error("modification rejected");
    };
  });

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "test_failedDismissRemovesAlarm";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("test_failedDismissRemovesAlarm, before dismiss");

  await alarmObserver.service.dismissAlarm(item, alarm);

  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("test_failedDismissRemovesAlarm, after dismiss");

  // Local ack must keep it dismissed across a re-arm.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("test_failedDismissRemovesAlarm, after re-arm");
});

/**
 * Snooze removes the alarm from the dialog before the provider confirms the
 * write, matching dismiss.
 */
add_task(async function test_snoozeRemovesAlarmImmediately() {
  const memory = await doRunTest();

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "test_snoozeRemovesAlarmImmediately";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  memory.startBatch();
  const snoozed = alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("test_snoozeRemovesAlarmImmediately, before confirmation");
  await snoozed;
  memory.endBatch();
  // After a successful snooze outside the observer path, a timer is armed.
  alarmObserver.expectResult(memory, item, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("test_snoozeRemovesAlarmImmediately, after confirmation");
});

/**
 * Snooze must record a local ack before modifyItem resolves so a concurrent
 * calendar reload cannot re-fire the same alarm while the write is pending
 * (parity with dismiss / D340771 review).
 */
add_task(async function test_snoozeSurvivesReloadDuringModify() {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  const impl = memory.wrappedJSObject;
  let releaseModify;
  const modifyGate = new Promise(resolve => {
    releaseModify = resolve;
  });
  const innerModifyItem = impl.modifyItem.bind(impl);
  impl.modifyItem = async function (newItem, oldItem) {
    await modifyGate;
    // Mimic a server that drops the snooze property on the round-trip.
    const stripped = newItem.clone();
    stripped.alarmLastAck = null;
    stripped.deleteProperty("X-MOZ-LASTACK");
    stripped.deleteProperty("X-MOZ-SNOOZE-TIME");
    return innerModifyItem(stripped, oldItem);
  };

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "snooze survives reload during modify";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  const snoozePromise = alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("removed before modify resolves");

  // Simulate the CalDAV re-fetch/reload that races the still-pending PUT.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("reload during in-flight snooze must not re-fire");

  releaseModify();
  await snoozePromise;

  // After the stripped response, the alarm must still stay clear of the dialog.
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("still clear after stripped snooze completes");

  cal.manager.unregisterCalendar(memory);
});

/**
 * Review scenario: reload re-adds the reminder while snooze modifyItem is
 * pending, then the write fails. The re-added fired alarm must be cleared —
 * a late IgnoredAlarmsStore entry alone is not enough if the widget is already
 * back in the dialog.
 */
add_task(async function test_failedSnoozeClearsReloadRefire() {
  alarmObserver.clear();

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();

  const impl = memory.wrappedJSObject;
  let releaseModify;
  const modifyGate = new Promise(resolve => {
    releaseModify = resolve;
  });
  impl.modifyItem = async function () {
    await modifyGate;
    throw new Error("modification rejected");
  };

  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "failed snooze clears reload re-fire";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected();

  const snoozePromise = alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));

  // Reload while the write is in flight (would re-fire without a pre-await ack).
  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);

  releaseModify();
  await snoozePromise;

  // Regardless of whether the reload re-fired, the failure path must leave the
  // alarm cleared from observers (dialog) and suppressed on re-arm.
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("failed snooze must clear any reload re-fire");

  alarmObserver.service.removeAlarmsForOccurrences(item);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_NONE);
  alarmObserver.checkExpected("failed snooze stays suppressed after re-arm");

  cal.manager.unregisterCalendar(memory);
});

/**
 * Local acknowledgement is occurrence-scoped via ack time: dismissing Monday
 * must not make Tuesday's reminder look "already handled" for snooze-all.
 * Bare IgnoredAlarmsStore.has() is series-wide and is the wrong check.
 */
add_task(async function test_occurrenceAckDoesNotBlockLaterReminder() {
  alarmObserver.clear();

  const memory = await doRunTest();

  // Two past daily occurrences: dismiss of the first is recorded with that
  // occurrence's alarm time (as a local ack). A parent alarmLastAck of "now"
  // would cover every already-due occurrence; the dialog bug is series-level
  // has() after an earlier occurrence was acknowledged.
  const date = cal.dtz.now();
  date.hour -= 47;
  date.hour; // Force normalization, as in addTestItems Test 7.
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT15M", "RRULE:FREQ=DAILY");
  item.title = "occurrence ack does not block later reminder";
  await memory.addItem(item);

  const probe = item.startDate.clone();
  probe.second -= 1;
  const firstOcc = item.recurrenceInfo.getNextOccurrence(probe);
  firstOcc.QueryInterface(Ci.calIEvent);
  probe.day = firstOcc.startDate.day;
  probe.month = firstOcc.startDate.month;
  probe.year = firstOcc.startDate.year;
  probe.hour = firstOcc.startDate.hour;
  probe.minute = firstOcc.startDate.minute;
  probe.second = firstOcc.startDate.second;
  probe.second += 1;
  const secondOcc = item.recurrenceInfo.getNextOccurrence(probe);
  secondOcc.QueryInterface(Ci.calIEvent);

  let firstAlarmDate = cal.alarms.calculateAlarmDate(firstOcc, alarm);
  firstAlarmDate = firstAlarmDate.getInTimezone(cal.dtz.UTC);
  // Local ack at the first occurrence's fire time only — later occurrences with
  // a newer alarm date must remain snoozeable (Toby's Snooze All case).
  alarmObserver.service.IgnoredAlarmsStore.add(firstOcc, firstAlarmDate);

  Assert.ok(
    alarmObserver.service.IgnoredAlarmsStore.has(secondOcc),
    "series-level has() is true for later occurrences after an earlier dismiss"
  );
  Assert.ok(
    alarmObserver.service.isOccurrenceAlarmAcknowledged(firstOcc, alarm),
    "first occurrence is acknowledged"
  );
  Assert.ok(
    !alarmObserver.service.isOccurrenceAlarmAcknowledged(secondOcc, alarm),
    "later occurrence must not be treated as already acknowledged"
  );

  // Snooze-all must still be able to schedule the later reminder.
  await alarmObserver.service.snoozeAlarm(secondOcc, alarm, cal.createDuration("PT1H"));
  alarmObserver.expectResult(memory, secondOcc, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("later occurrence snoozes after earlier dismiss");
});

/**
 * After a successful dismiss the local ignore store holds an ack time of "now".
 * Changing the reminder (as saveReminder does: new VALARM + alarmLastAck=null)
 * must clear that entry so the new still-past offset can fire again. Without
 * this, browser_alarmDialog.js hangs waiting for the second alarm dialog.
 */
add_task(async function test_changedAlarmRefiresAfterDismiss() {
  alarmObserver.clear();
  Services.prefs.setBoolPref("calendar.alarms.showmissed", true);

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();
  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  // All-day-ish past offset like "1 day before tomorrow": fire immediately.
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "changed alarm refires after dismiss";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("initial alarm fired");

  await alarmObserver.service.dismissAlarm(item, alarm);
  Assert.ok(
    alarmObserver.service.IgnoredAlarmsStore.has(item),
    "dismiss records a local ignore entry"
  );

  // Mimic saveReminder(): replace the VALARM and clear alarmLastAck.
  const stored = await memory.getItem(item.id);
  const edited = stored.clone();
  edited.clearAlarms();
  const newAlarm = createAlarmFromDuration("-PT15M");
  edited.addAlarm(newAlarm);
  edited.alarmLastAck = null;
  edited.deleteProperty("X-MOZ-LASTACK");
  const modified = await memory.modifyItem(edited, stored);

  Assert.ok(
    !alarmObserver.service.IgnoredAlarmsStore.has(modified),
    "ignore entry cleared when the alarm definition changes"
  );

  alarmObserver.clear();
  // onModifyItem already re-armed; also force a clean check.
  alarmObserver.service.removeAlarmsForOccurrences(modified);
  alarmObserver.clear();
  alarmObserver.service.addAlarmsForOccurrences(modified);
  alarmObserver.expectResult(memory, modified, newAlarm, EXPECT_FIRED);
  alarmObserver.checkExpected("new offset fires after reminder change");

  cal.manager.unregisterCalendar(memory);
  Services.prefs.clearUserPref("calendar.alarms.showmissed");
});

/**
 * Same as above, but the reminder edit is delivered inside a calendar batch,
 * where calendarObserver.onModifyItem used to return before touching alarms.
 * The local ignore entry must still be dropped (D340771 review, CI browser
 * test selects 2days inside a batch).
 */
add_task(async function test_changedAlarmInBatchClearsIgnoreEntry() {
  alarmObserver.clear();
  Services.prefs.setBoolPref("calendar.alarms.showmissed", true);

  const memory = cal.manager.createCalendar("memory", Services.io.newURI("moz-memory-calendar://"));
  memory.id = cal.getUUID();
  cal.manager.registerCalendar(memory);
  await alarmObserver.doOnAlarmsLoaded(memory);

  const date = cal.dtz.now();
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
  item.title = "changed alarm in batch clears ignore";
  await memory.addItem(item);
  alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  alarmObserver.checkExpected("initial alarm fired");

  await alarmObserver.service.dismissAlarm(item, alarm);
  Assert.ok(
    alarmObserver.service.IgnoredAlarmsStore.has(item),
    "dismiss records a local ignore entry"
  );

  const stored = await memory.getItem(item.id);
  const edited = stored.clone();
  edited.clearAlarms();
  edited.addAlarm(createAlarmFromDuration("-PT15M"));
  edited.alarmLastAck = null;
  edited.deleteProperty("X-MOZ-LASTACK");

  memory.startBatch();
  try {
    const modified = await memory.modifyItem(edited, stored);
    Assert.ok(
      !alarmObserver.service.IgnoredAlarmsStore.has(modified),
      "ignore entry cleared when the alarm changes inside a batch"
    );
  } finally {
    memory.endBatch();
  }

  cal.manager.unregisterCalendar(memory);
  Services.prefs.clearUserPref("calendar.alarms.showmissed");
});

/**
 * Several independent fired alarms can all be snoozed when the caller works
 * from a snapshot of targets (as snooze-all must). Ensures remove-on-snooze
 * does not depend on live-collection iteration order in the service path.
 */
add_task(async function test_snoozeAllIndependentAlarmsFromSnapshot() {
  const memory = await doRunTest();

  const date = cal.dtz.now();
  const items = [];
  for (let i = 0; i < 3; i++) {
    const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT5M");
    item.title = `snooze snapshot ${i}`;
    await memory.addItem(item);
    items.push({ item, alarm });
  }
  for (const { item, alarm } of items) {
    alarmObserver.expectResult(memory, item, alarm, EXPECT_FIRED);
  }
  alarmObserver.checkExpected("three independent alarms fired");

  // Snapshot first (dialog must do the same with richlist children), then act.
  const snapshot = items.slice();
  for (const { item, alarm } of snapshot) {
    if (alarmObserver.service.isOccurrenceAlarmAcknowledged(item, alarm)) {
      alarmObserver.service.removeAlarmsForItem(item);
      continue;
    }
    // Fire-and-forget like the dialog; await below.
    alarmObserver.service.snoozeAlarm(item, alarm, cal.createDuration("PT1H"));
  }
  await Promise.resolve();
  // Let the async snoozes settle.
  await TestUtils.waitForCondition(() =>
    snapshot.every(
      ({ item, alarm }) => !!alarmObserver.getTimer(memory.id, item.hashId, alarm.icalString)
    )
  );

  for (const { item, alarm } of snapshot) {
    alarmObserver.expectResult(memory, item, alarm, EXPECT_TIMER);
  }
  alarmObserver.checkExpected("all three independent alarms snoozed from snapshot");
});

/**
 * Snooze-all must not let an already-acknowledged older occurrence claim the
 * series for parent dedupe. Otherwise a newer occurrence of the same series is
 * excluded and only the stale reminder is removed (D340771 inline review).
 */
add_task(async function test_snoozeAllSkipsAckedBeforeParentDedupe() {
  alarmObserver.clear();

  const memory = await doRunTest();

  const date = cal.dtz.now();
  date.hour -= 47;
  date.hour; // Force normalization, as in addTestItems Test 7.
  const [item, alarm] = createEventWithAlarm(memory, date, date, "-PT15M", "RRULE:FREQ=DAILY");
  item.title = "snooze-all acked before parent dedupe";
  await memory.addItem(item);

  const probe = item.startDate.clone();
  probe.second -= 1;
  const firstOcc = item.recurrenceInfo.getNextOccurrence(probe);
  firstOcc.QueryInterface(Ci.calIEvent);
  probe.day = firstOcc.startDate.day;
  probe.month = firstOcc.startDate.month;
  probe.year = firstOcc.startDate.year;
  probe.hour = firstOcc.startDate.hour;
  probe.minute = firstOcc.startDate.minute;
  probe.second = firstOcc.startDate.second;
  probe.second += 1;
  const secondOcc = item.recurrenceInfo.getNextOccurrence(probe);
  secondOcc.QueryInterface(Ci.calIEvent);

  let firstAlarmDate = cal.alarms.calculateAlarmDate(firstOcc, alarm);
  firstAlarmDate = firstAlarmDate.getInTimezone(cal.dtz.UTC);
  alarmObserver.service.IgnoredAlarmsStore.add(firstOcc, firstAlarmDate);

  // Display order: older acked occurrence first, then the newer live one.
  const selected = alarmObserver.service.selectSnoozeAllEntries([
    { item: firstOcc, alarm },
    { item: secondOcc, alarm },
  ]);

  Assert.deepEqual(
    selected.map(entry => [entry.item.hashId, entry.action]),
    [
      [firstOcc.hashId, "remove"],
      [secondOcc.hashId, "snooze"],
    ],
    "acked older occurrence is removed without blocking snooze of the newer one"
  );

  for (const entry of selected) {
    if (entry.action == "remove") {
      alarmObserver.service.removeAlarmsForItem(entry.item);
    } else {
      await alarmObserver.service.snoozeAlarm(entry.item, entry.alarm, cal.createDuration("PT1H"));
    }
  }

  alarmObserver.expectResult(memory, firstOcc, alarm, EXPECT_NONE);
  alarmObserver.expectResult(memory, secondOcc, alarm, EXPECT_TIMER);
  alarmObserver.checkExpected("newer occurrence snoozed after acked older was dropped");
});

registerCleanupFunction(() => {
  Services.prefs.clearUserPref("calendar.notifications.times");
});
