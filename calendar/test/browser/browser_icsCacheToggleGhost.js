/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that enabling the offline support (cache) on an already subscribed
 * ICS calendar does not leave ghost copies of its events in the view. The
 * toggle re-creates the calendar under a new id; the events of the old
 * instance must disappear from the view together with it.
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const calendarName = "toggleGhost-" + Date.now();
var calendarFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
calendarFile.append(calendarName + ".ics");

async function writeIcsFile() {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Test//EN",
    "BEGIN:VEVENT",
    "UID:toggle-ghost-event",
    "SUMMARY:Toggle Ghost",
    "DTSTART:20260708T120000Z",
    "DTEND:20260708T130000Z",
    "DTSTAMP:20260701T080000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  await IOUtils.write(calendarFile.path, new TextEncoder().encode(ics));
}

add_task(async function testCacheToggleLeavesNoGhost() {
  await writeIcsFile();

  // Subscribe without offline support, like the calendar creation dialog does.
  let calendar = cal.manager.createCalendar("ics", Services.io.newFileURI(calendarFile));
  calendar.name = calendarName;
  cal.manager.registerCalendar(calendar);
  calendar = cal.manager.getCalendarById(calendar.id);
  const oldId = calendar.id;

  registerCleanupFunction(async () => {
    for (const cur of cal.manager.getCalendars()) {
      if (cur.name == calendarName) {
        cal.manager.unregisterCalendar(cur);
      }
    }
    await IOUtils.remove(calendarFile.path, { ignoreAbsence: true });
  });

  await CalendarTestUtils.setCalendarView(window, "month");
  await CalendarTestUtils.goToDate(window, 2026, 7, 8);

  // 2026-07-08 is the Wednesday of the second displayed week.
  const item = await CalendarTestUtils.monthView.waitForItemAt(window, 2, 4, 1);
  Assert.equal(item.item.title, "Toggle Ghost", "the event is shown");

  // Enable the offline support, as the calendar properties dialog does on
  // accept: it first writes the other dialog fields - including "disabled" -
  // and sets "cache.enabled" last. The cache toggle makes the manager remove
  // the calendar and register a re-created, cached one under a new id.
  calendar.setProperty("disabled", false);
  calendar.setProperty("cache.enabled", true);

  const newCalendar = await TestUtils.waitForCondition(
    () => cal.manager.getCalendars().find(c => c.name == calendarName && c.id != oldId),
    "the calendar was re-created under a new id"
  );
  Assert.ok(newCalendar.getProperty("cache.enabled"), "the new calendar is cached");

  const idsAtCell = () =>
    CalendarTestUtils.monthView.getItemsAt(window, 2, 4).map(el => el.item.calendar.id);

  // The re-created calendar loads asynchronously; wait for its event.
  await TestUtils.waitForCondition(
    () => idsAtCell().includes(newCalendar.id),
    "the event of the re-created calendar is shown"
  );

  // Give a late re-add of the old calendar's items time to appear, then assert
  // only the new calendar's event remains.
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 1000));
  Assert.deepEqual(
    idsAtCell(),
    [newCalendar.id],
    `only the new calendar's event remains (old id was ${oldId})`
  );
});
