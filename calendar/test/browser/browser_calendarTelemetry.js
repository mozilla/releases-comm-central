/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/* global reportCalendars */

/**
 * Test telemetry related to calendar.
 */

let { TelemetryTestUtils } = ChromeUtils.import("resource://testing-common/TelemetryTestUtils.jsm");

/**
 * Check that we're counting calendars and read only calendars.
 */
add_task(async function test_calendar_count() {
  Services.telemetry.clearScalars();

  let manager = cal.getCalendarManager();
  let uri = Services.io.newURI("moz-memory-calendar://");
  let calendars = manager.getCalendars();
  for (let i = 1; i <= 3; i++) {
    calendars[i] = manager.createCalendar("memory", uri);
    calendars[i].name = `Mochitest ${i}`;
    if (i === 1 || i === 3) {
      calendars[i].readOnly = true;
    }
    manager.registerCalendar(calendars[i]);
  }

  reportCalendars();

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.calendar.calendar_count"].memory,
    3,
    "Count of calendars must be correct."
  );
  Assert.equal(
    scalars["tb.calendar.read_only_calendar_count"].memory,
    2,
    "Count of readonly calendars must be correct."
  );

  // Clean up.
  for (let i = 1; i <= 3; i++) {
    manager.removeCalendar(calendars[i]);
  }
});
