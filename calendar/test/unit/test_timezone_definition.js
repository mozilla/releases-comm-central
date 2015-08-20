/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    do_test_pending();
    cal.getTimezoneService().startup({onResult: function() {
        do_test_finished();
        run_next_test();
    }});
}

//check tz database version
add_task(function* version_test() {
    let tzs = cal.getTimezoneService();
    notEqual(tzs.version, null, "Checking for a timezone version");
});

//check whether all tz definitions have all properties
add_task(function* zone_test() {
    function resolveZone(aZoneId) {
        let tz = tzs.getTimezone(aZoneId);
        notEqual(tz, null, aZoneId + "exists");
        ok(tz.icalComponent.serializeToICS().startsWith("BEGIN:VTIMEZONE"),
                 "ics property contains VTIMEZONE for " + aZoneId);
        ok(tz.latitude && !!tz.latitude.match(/^[+-]\d{7}$/), "Correct latitude on " + aZoneId);
        ok(tz.longitude && !!tz.longitude.match(/^[+-]\d{7}$/), "Correct longitude on " + aZoneId);
    }

    let tzs = cal.getTimezoneService();
    let zones = tzs.timezoneIds;
    let foundZone = false;
    while (zones.hasMore()) {
        foundZone = true;
        resolveZone(zones.getNext());
        zones.getNext();
    }

    ok(foundZone, "There is at least one timezone");
});

// check whether all tz aliases resolve to a tz definition
add_task(function alias_test() {
    function resolveAlias(aAliasId) {
        let tz = tzs.getTimezone(aAliasId);
        notEqual(tz, null, "Zone " + aAliasId + " exists in " + tzs.version);
    }
    let tzs = cal.getTimezoneService();
    let aliases = tzs.aliasIds;

    let foundAlias = false;
    while (aliases.hasMore()) {
        foundAlias = true;
        resolveAlias(aliases.getNext());
        aliases.getNext();
    }

    ok(foundAlias, "There is at least one alias");
});
