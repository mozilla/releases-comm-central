/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

/**
 * Test telemetry related to calendar.
 */

const { MailTelemetryForTests } = ChromeUtils.importESModule(
  "resource:///modules/MailGlue.sys.mjs"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

/**
 * Check that we're counting calendars and read only calendars.
 */
add_task(async function testCalendarCount() {
  Services.fog.testResetFOG();

  const calendars = cal.manager.getCalendars();
  const homeCal = calendars.find(cal => cal.name == "Home");
  const readOnly = homeCal.readOnly;
  homeCal.readOnly = true;

  for (let i = 1; i <= 3; i++) {
    calendars[i] = CalendarTestUtils.createCalendar(`Mochitest ${i}`, "memory");
    if (i === 1 || i === 3) {
      calendars[i].readOnly = true;
    }
  }

  await MailTelemetryForTests.reportCalendars();

  Assert.equal(
    Glean.tb.calendarCount.memory.testGetValue(),
    3,
    "memory calendar count should be correct."
  );
  Assert.equal(
    Glean.tb.calendarCountReadOnly.memory.testGetValue(),
    2,
    "memory calendar read-only count should be correct."
  );

  Assert.equal(
    Glean.tb.calendarCount.storage.testGetValue(),
    null,
    "'Home' calendar should not be included in count while disabled"
  );

  Assert.equal(
    Glean.tb.calendarCountReadOnly.storage.testGetValue(),
    null,
    "'Home' calendar should not be included in read-only count while disabled"
  );

  for (let i = 1; i <= 3; i++) {
    CalendarTestUtils.removeCalendar(calendars[i]);
  }
  homeCal.readOnly = readOnly;
});

/**
 * Ensure the "Home" calendar is not ignored if it has been used.
 */
add_task(async function testHomeCalendar() {
  const calendar = cal.manager.getCalendars().find(cal => cal.name == "Home");
  const readOnly = calendar.readOnly;
  const disabled = calendar.getProperty("disabled");

  // Test when enabled with no events.
  calendar.setProperty("disabled", false);
  calendar.readOnly = true;

  Services.fog.testResetFOG();
  await MailTelemetryForTests.reportCalendars();

  Assert.equal(
    Glean.tb.calendarCount.storage.testGetValue(),
    null,
    "'Home' calendar should not be counted when unused"
  );
  Assert.equal(
    Glean.tb.calendarCountReadOnly.storage.testGetValue(),
    null,
    "'Home' calendar should not included in read-only count when unused"
  );

  // Now test with an event added to the calendar.
  calendar.readOnly = false;

  let event = new CalEvent();
  event.id = "bacd";
  event.title = "Test";
  event.startDate = cal.dtz.now();
  event = await calendar.addItem(event);

  calendar.readOnly = true;

  await TestUtils.waitForCondition(async () => {
    const result = await calendar.getItem("bacd");
    return result;
  }, "item added to calendar");

  Services.fog.testResetFOG();
  await MailTelemetryForTests.reportCalendars();

  Assert.equal(
    Glean.tb.calendarCount.storage.testGetValue(),
    1,
    "'Home' calendar should be counted when there are items"
  );
  Assert.equal(
    Glean.tb.calendarCountReadOnly.storage.testGetValue(),
    1,
    "'Home' calendar should be included in read-only count when used"
  );

  calendar.readOnly = false;
  await calendar.deleteItem(event);
  calendar.readOnly = readOnly;
  calendar.setProperty("disabled", disabled);
});
