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
    let timezone = cal.timezoneService.getTimezone(aZoneId);
    equal(aZoneId, timezone.tzid, "Zone test " + aZoneId);
    ok(
      timezone.icalComponent.serializeToICS().startsWith("BEGIN:VTIMEZONE"),
      "VTIMEZONE test " + aZoneId
    );
  }

  let foundZone = false;
  for (let zone of cal.timezoneService.timezoneIds) {
    foundZone = true;
    resolveZone(zone);
  }

  ok(foundZone, "There is at least one timezone");
});
