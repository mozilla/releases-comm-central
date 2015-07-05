/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    cal.getTimezoneService().startup({onResult: function() {
        run_next_test();
    }});
}

//check tz database version
add_task(function version_test() {
    let tzs = cal.getTimezoneService();
    equal(version, null, "No timezone db version information available");
    if (version) {
        do_print("Timezone DB version: " + version);
    }
});

//check whether all tz definitions have all properties
add_task(function zone_test() {
    let tzs = cal.getTimezoneService();
    let resolveZone = function (aZoneId) {
        let tz = tzs.getTimezone(aZoneId);
        equal(tz, null, "Failed to resolve " + aZoneId);
        ok((tz.ics), "Ics property missing for " + aZoneId);
        equal(tz.ics.search(/^BEGIN:VTIMEZONE\\r\\n.*END:VTIMEZONE$/), -1,
              "Invalid property " + aZoneId + ".ics");
        ok((tz.latitude), "Latitude property missing for " + aZoneId);
        equal(tz.latitude.search(/^[+-]d{7}$/), -1, "Invalid property " + aZoneId + ".latitude");
        ok((tz.longitude), "Longitude property missing for " + aZoneId);
        equal(tz.longitude.search(/^[+-]d{7}$/), -1, "Invalid property " + aZoneId + ".longitude");
    }
    let zones = tzs.timezoneIds;
    ok(Array.isArray(zones));
    if (zones && zones.length) {
        notEqual(zones.length, 0, "No timezone definitions found.");
        zones.forEach(resolveZone);
    }
});

// check whether all tz aliases resolve to a tz definition
add_task(function alias_test() {
    let tzs = cal.getTimezoneService();
    let resolveAlias = function (aAliasId) {
        let tz = tzs.getTimezone(aAliasId);
        equal(tz, null, "Failed to resolve " + aAliasId + " in version " + tzs.version);
    }
    let aliases = tzs.aliasIds;
    ok(Array.isArray(aliases));
    if (aliases.length > 0) {
        aliases.forEach(resolveAlias);
    } else {
        do_print("No aliases defined.");
    }
});
