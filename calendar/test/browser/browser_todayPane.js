/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals TodayPane */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { formatDate, formatTime } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ItemEditingHelpers.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  CalDateTime: "resource:///modules/CalDateTime.sys.mjs",
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalRecurrenceInfo: "resource:///modules/CalRecurrenceInfo.sys.mjs",
});

const TODAY_HEADER = { args: null, id: "calendar-today" };
const TOMORROW_HEADER = { args: null, id: "calendar-tomorrow" };

const calendar = CalendarTestUtils.createCalendar();
Services.prefs.setIntPref("calendar.agenda.days", 7);
registerCleanupFunction(() => {
  CalendarTestUtils.removeCalendar(calendar);
  Services.prefs.clearUserPref("calendar.agenda.days");
});

const today = cal.dtz.now();
const startHour = today.hour;
today.hour = today.minute = today.second = 0;

const todayPanePanel = document.getElementById("today-pane-panel");
const todayPaneStatusButton = document.getElementById("calendar-status-todaypane-button");

// Go to mail tab.
selectFolderTab();

// Verify today pane open.
if (todayPanePanel.hasAttribute("collapsed")) {
  EventUtils.synthesizeMouseAtCenter(todayPaneStatusButton, {});
}
Assert.ok(!todayPanePanel.hasAttribute("collapsed"), "Today Pane is open");

// Verify today pane's date.
Assert.equal(document.getElementById("datevalue-label").value, today.day, "Today Pane shows today");

async function addEvent(title, relativeStart, relativeEnd, isAllDay) {
  const event = new CalEvent();
  event.id = cal.getUUID();
  event.title = title;
  event.startDate = today.clone();
  event.startDate.addDuration(cal.createDuration(relativeStart));
  event.startDate.isDate = isAllDay;
  event.endDate = today.clone();
  event.endDate.addDuration(cal.createDuration(relativeEnd));
  event.endDate.isDate = isAllDay;
  return calendar.addItem(event);
}

function checkEvent(row, { dateHeader, time, title, relative, overlap, classes = [] }) {
  const dateHeaderElement = row.querySelector(".agenda-date-header");
  if (dateHeader) {
    Assert.ok(BrowserTestUtils.isVisible(dateHeaderElement), "date header is visible");
    if (dateHeader instanceof CalDateTime || dateHeader instanceof Ci.calIDateTime) {
      Assert.equal(
        dateHeaderElement.textContent,
        cal.dtz.formatter.formatDateLongWithoutYear(dateHeader),
        "date header has correct value"
      );
    } else {
      Assert.deepEqual(
        document.l10n.getAttributes(dateHeaderElement),
        dateHeader,
        "date header has correct string"
      );
    }
  } else {
    Assert.ok(BrowserTestUtils.isHidden(dateHeaderElement), "date header is hidden");
  }

  const calendarElement = row.querySelector(".agenda-listitem-calendar");
  const timeElement = row.querySelector(".agenda-listitem-time");
  if (time) {
    Assert.ok(BrowserTestUtils.isVisible(calendarElement), "calendar is visible");
    Assert.ok(BrowserTestUtils.isVisible(timeElement), "time is visible");
    if (time instanceof CalDateTime || time instanceof Ci.calIDateTime) {
      time = cal.dtz.formatter.formatTime(time);
    }
    Assert.equal(timeElement.textContent, time, "time has correct value");
  } else if (time === "") {
    Assert.ok(BrowserTestUtils.isVisible(calendarElement), "calendar is visible");
    Assert.ok(BrowserTestUtils.isHidden(timeElement), "time is hidden");
  } else {
    Assert.ok(BrowserTestUtils.isHidden(calendarElement), "calendar is hidden");
    Assert.ok(BrowserTestUtils.isHidden(timeElement), "time is hidden");
  }

  const titleElement = row.querySelector(".agenda-listitem-title");
  Assert.ok(BrowserTestUtils.isVisible(titleElement), "title is visible");
  Assert.equal(titleElement.textContent, title, "title has correct value");

  const relativeElement = row.querySelector(".agenda-listitem-relative");
  if (Array.isArray(relative)) {
    Assert.ok(BrowserTestUtils.isVisible(relativeElement), "relative time is visible");
    Assert.report(
      !relative.includes(relativeElement.textContent),
      relative,
      relativeElement.textContent,
      "relative time is correct",
      "includes"
    );
  } else if (relative !== undefined) {
    Assert.ok(BrowserTestUtils.isHidden(relativeElement), "relative time is hidden");
  }

  const overlapElement = row.querySelector(".agenda-listitem-overlap");
  if (overlap) {
    Assert.ok(BrowserTestUtils.isVisible(overlapElement), "overlap is visible");
    Assert.equal(
      overlapElement.src,
      `chrome://messenger/skin/icons/new/event-${overlap}.svg`,
      "overlap has correct image"
    );
    Assert.equal(
      overlapElement.dataset.l10nId,
      `calendar-editable-item-multiday-event-icon-${overlap}`,
      "overlap has correct alt text"
    );
  } else {
    Assert.ok(BrowserTestUtils.isHidden(overlapElement), "overlap is hidden");
  }

  for (const className of classes) {
    Assert.ok(row.classList.contains(className), `row has ${className} class`);
  }
}

function checkEvents(...expectedEvents) {
  Assert.equal(TodayPane.agenda.rowCount, expectedEvents.length, "expected number of rows shown");
  for (let i = 0; i < expectedEvents.length; i++) {
    Assert.ok(TodayPane.agenda.rows[i].getAttribute("is"), "agenda-listitem");
    checkEvent(TodayPane.agenda.rows[i], expectedEvents[i]);
  }
}

add_task(async function testBasicAllDay() {
  const todaysEvent = await addEvent("Today's Event", "P0D", "P1D", true);
  checkEvents({ dateHeader: TODAY_HEADER, title: "Today's Event" });

  const tomorrowsEvent = await addEvent("Tomorrow's Event", "P1D", "P2D", true);
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Today's Event" },
    { dateHeader: TOMORROW_HEADER, title: "Tomorrow's Event" }
  );

  const events = [];
  for (let i = 2; i < 7; i++) {
    events.push(await addEvent(`Event ${i + 1}`, `P${i}D`, `P${i + 1}D`, true));
    checkEvents(
      { dateHeader: TODAY_HEADER, title: "Today's Event" },
      { dateHeader: TOMORROW_HEADER, title: "Tomorrow's Event" },
      ...events.map(e => {
        return { dateHeader: e.startDate, title: e.title };
      })
    );
  }

  await calendar.deleteItem(todaysEvent);
  checkEvents(
    { dateHeader: TOMORROW_HEADER, title: "Tomorrow's Event" },
    ...events.map(e => {
      return { dateHeader: e.startDate, title: e.title };
    })
  );
  await calendar.deleteItem(tomorrowsEvent);
  checkEvents(
    ...events.map(e => {
      return { dateHeader: e.startDate, title: e.title };
    })
  );

  while (events.length) {
    await calendar.deleteItem(events.shift());
    checkEvents(
      ...events.map(e => {
        return { dateHeader: e.startDate, title: e.title };
      })
    );
  }
});

add_task(async function testBasic() {
  const time = today.clone();
  time.hour = 23;

  const todaysEvent = await addEvent("Today's Event", "P0DT23H", "P1D");
  checkEvents({ dateHeader: TODAY_HEADER, time, title: "Today's Event" });

  const tomorrowsEvent = await addEvent("Tomorrow's Event", "P1DT23H", "P2D");
  checkEvents(
    { dateHeader: TODAY_HEADER, time, title: "Today's Event" },
    { dateHeader: TOMORROW_HEADER, time, title: "Tomorrow's Event" }
  );

  const events = [];
  for (let i = 2; i < 7; i++) {
    events.push(await addEvent(`Event ${i + 1}`, `P${i}DT23H`, `P${i + 1}D`));
    checkEvents(
      { dateHeader: TODAY_HEADER, time, title: "Today's Event" },
      { dateHeader: TOMORROW_HEADER, time, title: "Tomorrow's Event" },
      ...events.map(e => {
        return { dateHeader: e.startDate, time, title: e.title };
      })
    );
  }

  await calendar.deleteItem(todaysEvent);
  checkEvents(
    { dateHeader: TOMORROW_HEADER, time, title: "Tomorrow's Event" },
    ...events.map(e => {
      return { dateHeader: e.startDate, time, title: e.title };
    })
  );
  await calendar.deleteItem(tomorrowsEvent);
  checkEvents(
    ...events.map(e => {
      return { dateHeader: e.startDate, time, title: e.title };
    })
  );

  while (events.length) {
    await calendar.deleteItem(events.shift());
    checkEvents(
      ...events.map(e => {
        return { dateHeader: e.startDate, time, title: e.title };
      })
    );
  }
});

/**
 * Adds and removes events in a different order from which they occur.
 * This checks that the events are inserted in the right place, and that the
 * date header is shown/hidden appropriately.
 */
add_task(async function testSortOrder() {
  const afternoonEvent = await addEvent("Afternoon Event", "P1DT13H", "P1DT17H");
  checkEvents({
    dateHeader: TOMORROW_HEADER,
    time: afternoonEvent.startDate,
    title: "Afternoon Event",
  });

  const morningEvent = await addEvent("Morning Event", "P1DT8H", "P1DT12H");
  checkEvents(
    { dateHeader: TOMORROW_HEADER, time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" }
  );

  const allDayEvent = await addEvent("All Day Event", "P1D", "P2D", true);
  checkEvents(
    { dateHeader: TOMORROW_HEADER, title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" }
  );

  const eveningEvent = await addEvent("Evening Event", "P1DT18H", "P1DT22H");
  checkEvents(
    { dateHeader: TOMORROW_HEADER, title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: afternoonEvent.startDate, title: "Afternoon Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(afternoonEvent);
  checkEvents(
    { dateHeader: TOMORROW_HEADER, title: "All Day Event" },
    { time: morningEvent.startDate, title: "Morning Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(morningEvent);
  checkEvents(
    { dateHeader: TOMORROW_HEADER, title: "All Day Event" },
    { time: eveningEvent.startDate, title: "Evening Event" }
  );

  await calendar.deleteItem(allDayEvent);
  checkEvents({
    dateHeader: TOMORROW_HEADER,
    time: eveningEvent.startDate,
    title: "Evening Event",
  });

  await calendar.deleteItem(eveningEvent);
  checkEvents();
});

/**
 * Check events that begin and end on different days inside the date range.
 * All-day events are still sorted ahead of non-all-day events.
 */
add_task(async function testOverlapInside() {
  const allDayEvent = await addEvent("All Day Event", "P0D", "P2D", true);
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "All Day Event", overlap: "start" },
    { dateHeader: TOMORROW_HEADER, title: "All Day Event", overlap: "end" }
  );

  const timedEvent = await addEvent("Timed Event", "P1H", "P1D23H");
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "All Day Event", overlap: "start" },
    { time: timedEvent.startDate, title: "Timed Event", overlap: "start" },
    { dateHeader: TOMORROW_HEADER, title: "All Day Event", overlap: "end" },
    { time: timedEvent.endDate, title: "Timed Event", overlap: "end" }
  );

  await calendar.deleteItem(allDayEvent);
  await calendar.deleteItem(timedEvent);
});

/**
 * Check events that begin and end on different days and that end at midnight.
 * The list item for the end of the event should be the last one on the day
 * before the end midnight, and its time label should display "24:00".
 */
add_task(async function testOverlapEndAtMidnight() {
  // Start with an event that begins outside the displayed dates.

  const timedEvent = await addEvent("Timed Event", "-P1D", "P1D");
  // Ends an hour before `timedEvent` to prove the ordering is correct.
  const duringEvent = await addEvent("During Event", "P22H", "P23H");
  // Starts at the same time as `timedEvent` ends to prove the ordering is correct.
  const nextEvent = await addEvent("Next Event", "P1D", "P2D", true);

  checkEvents(
    { dateHeader: TODAY_HEADER, time: duringEvent.startDate, title: "During Event" },
    {
      // Should show "24:00" as the time and end today.
      time: cal.dtz.formatter.formatTime(timedEvent.endDate, true),
      title: "Timed Event",
      overlap: "end",
    },
    { dateHeader: TOMORROW_HEADER, title: "Next Event" }
  );

  // Move the event fully into the displayed range.

  const timedClone = timedEvent.clone();
  timedClone.startDate.day += 2;
  timedClone.endDate.day += 2;
  await calendar.modifyItem(timedClone, timedEvent);

  const duringClone = duringEvent.clone();
  duringClone.startDate.day += 2;
  duringClone.endDate.day += 2;
  await calendar.modifyItem(duringClone, duringEvent);

  const nextClone = nextEvent.clone();
  nextClone.startDate.day += 2;
  nextClone.endDate.day += 2;
  await calendar.modifyItem(nextClone, nextEvent);

  const realEndDate = today.clone();
  realEndDate.day += 2;
  checkEvents(
    {
      dateHeader: TOMORROW_HEADER,
      time: timedClone.startDate,
      title: "Timed Event",
      overlap: "start",
    },
    { dateHeader: realEndDate, time: duringClone.startDate, title: "During Event" },
    {
      // Should show "24:00" as the time and end on the day after tomorrow.
      time: cal.dtz.formatter.formatTime(timedClone.endDate, true),
      title: "Timed Event",
      overlap: "end",
    },
    { dateHeader: nextClone.startDate, title: "Next Event" }
  );

  await calendar.deleteItem(timedClone);
  await calendar.deleteItem(duringClone);
  await calendar.deleteItem(nextClone);
});

/**
 * Check events that begin and/or end outside the date range. Events that have
 * already started are listed as "Today", but still sorted by start time.
 * All-day events are still sorted ahead of non-all-day events.
 */
add_task(async function testOverlapOutside() {
  const before = await addEvent("Starts Before", "-P1D", "P1D", true);
  checkEvents({ dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" });

  const after = await addEvent("Ends After", "P0D", "P9D", true);
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" },
    { title: "Ends After", overlap: "start" }
  );

  const both = await addEvent("Beyond Start and End", "-P2D", "P9D", true);
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Beyond Start and End", overlap: "continue" },
    { title: "Starts Before", overlap: "end" },
    { title: "Ends After", overlap: "start" }
  );

  // Change `before` to begin earlier than `both`. They should swap places.

  const startClone = before.clone();
  startClone.startDate.day -= 2;
  await calendar.modifyItem(startClone, before);
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" }
  );

  const beforeWithTime = await addEvent("Starts Before with time", "-PT5H", "PT15H");
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  const afterWithTime = await addEvent("Ends After with time", "PT6H", "P8DT12H");
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    { time: afterWithTime.startDate, title: "Ends After with time", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  const bothWithTime = await addEvent("Beyond Start and End with time", "-P2DT10H", "P9DT1H");
  checkEvents(
    { dateHeader: TODAY_HEADER, title: "Starts Before", overlap: "end" },
    { title: "Beyond Start and End", overlap: "continue" },
    { title: "Ends After", overlap: "start" },
    { time: "", title: "Beyond Start and End with time", overlap: "continue" },
    { time: afterWithTime.startDate, title: "Ends After with time", overlap: "start" },
    // This is the end of the event so the end time is used.
    { time: beforeWithTime.endDate, title: "Starts Before with time", overlap: "end" }
  );

  await calendar.deleteItem(before);
  await calendar.deleteItem(after);
  await calendar.deleteItem(both);
  await calendar.deleteItem(beforeWithTime);
  await calendar.deleteItem(afterWithTime);
  await calendar.deleteItem(bothWithTime);
});

/**
 * Checks that events that happened earlier today are marked as in the past,
 * and events happening now are marked as such.
 *
 * This test may fail if run within a minute either side of midnight.
 *
 * It would be nice to test that as time passes events are changed
 * appropriately, but that means waiting around for minutes and probably won't
 * be very reliable, so we don't do that.
 */
add_task(async function testActive() {
  const now = cal.dtz.now();

  const pastEvent = await addEvent("Past Event", "PT0M", "PT1M");
  const presentEvent = await addEvent("Present Event", `PT${now.hour}H`, `PT${now.hour + 1}H`);
  const futureEvent = await addEvent("Future Event", "PT23H59M", "PT24H");
  checkEvents(
    { dateHeader: TODAY_HEADER, time: pastEvent.startDate, title: "Past Event" },
    { time: presentEvent.startDate, title: "Present Event" },
    { time: futureEvent.startDate, title: "Future Event" }
  );

  const [pastRow, presentRow, futureRow] = TodayPane.agenda.rows;
  Assert.ok(pastRow.classList.contains("agenda-listitem-past"), "past event is marked past");
  Assert.ok(!pastRow.classList.contains("agenda-listitem-now"), "past event is not marked now");
  Assert.ok(
    !presentRow.classList.contains("agenda-listitem-past"),
    "present event is not marked past"
  );
  Assert.ok(presentRow.classList.contains("agenda-listitem-now"), "present event is marked now");
  Assert.ok(
    !futureRow.classList.contains("agenda-listitem-past"),
    "future event is not marked past"
  );
  Assert.ok(!futureRow.classList.contains("agenda-listitem-now"), "future event is not marked now");

  await calendar.deleteItem(pastEvent);
  await calendar.deleteItem(presentEvent);
  await calendar.deleteItem(futureEvent);
});

/**
 * Checks events in different time zones are displayed correctly.
 */
add_task(async function testOtherTimeZones() {
  // Johannesburg is UTC+2.
  const johannesburg = cal.timezoneService.getTimezone("Africa/Johannesburg");
  // Panama is UTC-5.
  const panama = cal.timezoneService.getTimezone("America/Panama");

  // All-day events are displayed on the day of the event, the time zone is ignored.

  let allDayEvent = new CalEvent();
  allDayEvent.id = cal.getUUID();
  allDayEvent.title = "All-day event in Johannesburg";
  allDayEvent.startDate = cal.createDateTime();
  allDayEvent.startDate.resetTo(today.year, today.month, today.day + 1, 0, 0, 0, johannesburg);
  allDayEvent.startDate.isDate = true;
  allDayEvent.endDate = cal.createDateTime();
  allDayEvent.endDate.resetTo(today.year, today.month, today.day + 2, 0, 0, 0, johannesburg);
  allDayEvent.endDate.isDate = true;
  allDayEvent = await calendar.addItem(allDayEvent);

  checkEvents({
    dateHeader: TOMORROW_HEADER,
    title: "All-day event in Johannesburg",
  });

  await calendar.deleteItem(allDayEvent);

  // The event time must be displayed in the local time zone, and the event must be sorted correctly.

  const beforeEvent = await addEvent("Before", "P1DT5H", "P1DT6H");
  const afterEvent = await addEvent("After", "P1DT7H", "P1DT8H");

  let timedEvent = new CalEvent();
  timedEvent.id = cal.getUUID();
  timedEvent.title = "Morning in Johannesburg";
  timedEvent.startDate = cal.createDateTime();
  timedEvent.startDate.resetTo(today.year, today.month, today.day + 1, 8, 0, 0, johannesburg);
  timedEvent.endDate = cal.createDateTime();
  timedEvent.endDate.resetTo(today.year, today.month, today.day + 1, 12, 0, 0, johannesburg);
  timedEvent = await calendar.addItem(timedEvent);

  checkEvents(
    {
      dateHeader: TOMORROW_HEADER,
      time: beforeEvent.startDate,
      title: "Before",
    },
    {
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T060000Z")), // The date used here is irrelevant.
      title: "Morning in Johannesburg",
    },
    {
      time: afterEvent.startDate,
      title: "After",
    }
  );
  Assert.stringContains(
    TodayPane.agenda.rows[1].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T08:00:00+02:00"
  );

  await calendar.deleteItem(beforeEvent);
  await calendar.deleteItem(afterEvent);
  await calendar.deleteItem(timedEvent);

  // Events that cross midnight in the local time zone (but not in the event time zone)
  // must have a start row and an end row.

  let overnightEvent = new CalEvent();
  overnightEvent.id = cal.getUUID();
  overnightEvent.title = "Evening in Panama";
  overnightEvent.startDate = cal.createDateTime();
  overnightEvent.startDate.resetTo(today.year, today.month, today.day, 17, 0, 0, panama);
  overnightEvent.endDate = cal.createDateTime();
  overnightEvent.endDate.resetTo(today.year, today.month, today.day, 23, 0, 0, panama);
  overnightEvent = await calendar.addItem(overnightEvent);

  checkEvents(
    {
      dateHeader: TODAY_HEADER,
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T220000Z")), // The date used here is irrelevant.
      title: "Evening in Panama",
      overlap: "start",
    },
    {
      dateHeader: TOMORROW_HEADER,
      time: cal.dtz.formatter.formatTime(cal.createDateTime("20000101T040000Z")), // The date used here is irrelevant.
      title: "Evening in Panama",
      overlap: "end",
    }
  );
  Assert.stringContains(
    TodayPane.agenda.rows[0].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T17:00:00-05:00"
  );
  Assert.stringContains(
    TodayPane.agenda.rows[1].querySelector(".agenda-listitem-time").getAttribute("datetime"),
    "T23:00:00-05:00"
  );

  await calendar.deleteItem(overnightEvent);
});

/**
 * Checks events in different time zones are displayed correctly.
 */
add_task(async function testRelativeTime() {
  const formatter = new Intl.RelativeTimeFormat(undefined, { style: "short" });
  const now = cal.dtz.now();
  now.second = 0;
  info(`The time is now ${now}`);

  const testData = [
    {
      name: "two hours ago",
      start: "-PT1H55M",
      expected: {
        classes: ["agenda-listitem-past"],
      },
      minHour: 2,
    },
    {
      name: "one hour ago",
      start: "-PT1H5M",
      expected: {
        classes: ["agenda-listitem-past"],
      },
      minHour: 2,
    },
    {
      name: "23 minutes ago",
      start: "-PT23M",
      expected: {
        classes: ["agenda-listitem-past"],
      },
      minHour: 1,
    },
    {
      name: "now",
      start: "-PT5M",
      expected: {
        relative: ["now"],
        classes: ["agenda-listitem-now"],
      },
      minHour: 1,
      maxHour: 22,
    },
    {
      name: "19 minutes ahead",
      start: "PT19M",
      expected: {
        relative: [formatter.format(19, "minute"), formatter.format(18, "minute")],
      },
      maxHour: 22,
    },
    {
      name: "one hour ahead",
      start: "PT1H25M",
      expected: {
        relative: [formatter.format(85, "minute"), formatter.format(84, "minute")],
      },
      maxHour: 21,
    },
    {
      name: "one and half hours ahead",
      start: "PT1H35M",
      expected: {
        relative: [formatter.format(2, "hour")],
      },
      maxHour: 21,
    },
    {
      name: "two hours ahead",
      start: "PT1H49M",
      expected: {
        relative: [formatter.format(2, "hour")],
      },
      maxHour: 21,
    },
  ];

  const events = [];
  const expectedEvents = [];
  for (const { name, start, expected, minHour, maxHour } of testData) {
    if (minHour && now.hour < minHour) {
      info(`Skipping ${name} because it's too early.`);
      continue;
    }
    if (maxHour && now.hour > maxHour) {
      info(`Skipping ${name} because it's too late.`);
      continue;
    }

    const event = new CalEvent();
    event.id = cal.getUUID();
    event.title = name;
    event.startDate = now.clone();
    event.startDate.addDuration(cal.createDuration(start));
    event.endDate = event.startDate.clone();
    event.endDate.addDuration(cal.createDuration("PT10M"));
    events.push(await calendar.addItem(event));

    expectedEvents.push({ ...expected, title: name, time: event.startDate });
  }

  expectedEvents[0].dateHeader = TODAY_HEADER;
  checkEvents(...expectedEvents);

  for (const event of events) {
    await calendar.deleteItem(event);
  }
});

/**
 * Tests the today pane opens events in the summary dialog for both
 * non-recurring and recurring events.
 */
add_task(async function testOpenEvent() {
  const noRepeatEvent = new CalEvent();
  noRepeatEvent.id = "no repeat event";
  noRepeatEvent.title = "No Repeat Event";
  noRepeatEvent.startDate = today.clone();
  noRepeatEvent.startDate.hour = startHour;
  noRepeatEvent.endDate = noRepeatEvent.startDate.clone();
  noRepeatEvent.endDate.hour++;

  const repeatEvent = new CalEvent();
  repeatEvent.id = "repeated event";
  repeatEvent.title = "Repeated Event";
  repeatEvent.startDate = today.clone();
  repeatEvent.startDate.hour = startHour;
  repeatEvent.endDate = noRepeatEvent.startDate.clone();
  repeatEvent.endDate.hour++;
  repeatEvent.recurrenceInfo = new CalRecurrenceInfo(repeatEvent);
  repeatEvent.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=5")
  );

  for (const event of [noRepeatEvent, repeatEvent]) {
    const addedEvent = await calendar.addItem(event);

    if (event == noRepeatEvent) {
      Assert.equal(TodayPane.agenda.rowCount, 1);
    } else {
      Assert.equal(TodayPane.agenda.rowCount, 5);
    }
    Assert.equal(
      TodayPane.agenda.rows[0].querySelector(".agenda-listitem-title").textContent,
      event.title,
      "event title is correct"
    );

    const dialogWindowPromise = CalendarTestUtils.waitForEventDialog();
    EventUtils.synthesizeMouseAtCenter(TodayPane.agenda.rows[0], { clickCount: 2 });

    const dialogWindow = await dialogWindowPromise;
    const docUri = dialogWindow.document.documentURI;
    Assert.ok(
      docUri === "chrome://calendar/content/calendar-summary-dialog.xhtml",
      "event summary dialog shown"
    );

    await BrowserTestUtils.closeWindow(dialogWindow);
    await calendar.deleteItem(addedEvent);
  }
});

/**
 * Tests that the "New Event" button begins creating an event on the date
 * selected in the Today Pane.
 */
add_task(async function testNewEvent() {
  async function checkEventDialogDate() {
    const dialogWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
    EventUtils.synthesizeMouseAtCenter(newEventButton, {}, window);
    await dialogWindowPromise.then(async function (dialogWindow) {
      const iframe = dialogWindow.document.querySelector("#calendar-item-panel-iframe");
      const iframeDocument = iframe.contentDocument;

      const startDate = iframeDocument.getElementById("event-starttime");
      Assert.equal(
        startDate._datepicker._inputField.value,
        formatDate(expectedDate),
        "date should match the expected date"
      );
      Assert.equal(
        startDate._timepicker._inputField.value,
        formatTime(expectedDate),
        "time should be the next hour after now"
      );

      await BrowserTestUtils.closeWindow(dialogWindow);
    });
  }

  const newEventButton = document.getElementById("todaypane-new-event-button");

  // Check today with the "day" view.

  TodayPane.displayMiniSection("miniday");
  EventUtils.synthesizeMouseAtCenter(document.getElementById("today-button"), {}, window);

  const expectedDate = cal.dtz.now();
  expectedDate.hour++;
  expectedDate.minute = 0;

  await checkEventDialogDate();

  // Check tomorrow with the "day" view.

  EventUtils.synthesizeMouseAtCenter(document.getElementById("next-day-button"), {}, window);
  expectedDate.day++;

  await checkEventDialogDate();

  // Check today with the "month" view;

  TodayPane.displayMiniSection("minimonth");
  const minimonth = document.getElementById("today-minimonth");
  minimonth.value = new Date();
  expectedDate.day--;

  await checkEventDialogDate();

  // Check a date in the past with the "month" view;

  minimonth.value = new Date(Date.UTC(2018, 8, 1));
  expectedDate.resetTo(2018, 8, 1, expectedDate.hour, 0, 0, cal.dtz.UTC);

  await checkEventDialogDate();
}).skip(new Date().getUTCHours() == 23);
