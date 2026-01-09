/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
  do_calendar_startup(run_next_test);
}

// check tz database version
add_task(async function version_test() {
  ok(cal.timezoneService.version, "service should provide timezone version");
});

// check whether all tz definitions have all properties
add_task(async function zone_test() {
  function resolveZone(aZoneId) {
    const timezone = cal.timezoneService.getTimezone(aZoneId);
    equal(aZoneId, timezone.tzid, "Zone test " + aZoneId);
    ok(
      timezone.icalComponent.serializeToICS().startsWith("BEGIN:VTIMEZONE"),
      "VTIMEZONE test " + aZoneId
    );
  }

  let foundZone = false;
  for (const zone of cal.timezoneService.timezoneIds) {
    foundZone = true;
    resolveZone(zone);
  }

  ok(foundZone, "There is at least one timezone");
});

// check Windows timezone ID conversion
add_task(async function windows_timezone_test() {
  // Test that Windows timezone names (used by Exchange/Office 365) resolve to
  // the same timezone rules as their corresponding IANA IDs.
  // We verify this by comparing UTC offsets at a known date.
  const windowsToIana = [
    ["AUS Central Standard Time", "Australia/Darwin"],
    ["Cuba Standard Time", "America/Havana"],
    ["Egypt Standard Time", "Africa/Cairo"],
    ["Pacific SA Standard Time", "America/Santiago"],
    ["Sri Lanka Standard Time", "Asia/Colombo"],
    ["Taipei Standard Time", "Asia/Taipei"],
    ["Tonga Standard Time", "Pacific/Tongatapu"],
  ];

  // Test date: 2024-06-15 12:00:00 UTC (mid-year to catch DST differences)
  const testDate = cal.createDateTime("20240615T120000Z");

  for (const [windowsId, ianaId] of windowsToIana) {
    const windowsTz = cal.timezoneService.getTimezone(windowsId);
    const ianaTz = cal.timezoneService.getTimezone(ianaId);

    notEqual(windowsTz, null, `Windows timezone "${windowsId}" should resolve`);
    notEqual(ianaTz, null, `IANA timezone "${ianaId}" should resolve`);

    if (windowsTz && ianaTz) {
      // Verify both produce valid VTIMEZONE components
      ok(
        windowsTz.icalComponent.serializeToICS().startsWith("BEGIN:VTIMEZONE"),
        `Windows timezone "${windowsId}" should produce valid VTIMEZONE`
      );

      // Verify both have the same UTC offset at the test date
      const testDateWindows = testDate.clone();
      testDateWindows.timezone = windowsTz;
      const testDateIana = testDate.clone();
      testDateIana.timezone = ianaTz;

      equal(
        testDateWindows.timezoneOffset,
        testDateIana.timezoneOffset,
        `Windows timezone "${windowsId}" should have same offset as IANA "${ianaId}"`
      );
    }
  }
});
