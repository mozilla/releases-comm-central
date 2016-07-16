/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function run_test() {
    do_calendar_startup(run_next_test);
}

/**
 * Checks whether the pased string is a valid tz version number
 * @param    {String}         aVersionString
 * @returns  {boolean}
 */
function valid_tz_version(aVersionString) {
    return aVersionString.match(/^2\.(\d{4})(z*[a-z])$/);
}

// check tz database version
add_task(function* version_test() {
    let tzs = cal.getTimezoneService();
    ok(valid_tz_version(tzs.version), "timezone version");
});

// check whether all tz definitions have all properties
add_task(function* zone_test() {
    function resolveZone(aZoneId) {
        let timezone = tzs.getTimezone(aZoneId);
        equal(aZoneId, timezone.tzid, "Zone test " + aZoneId);
        ok(timezone.icalComponent.serializeToICS().startsWith("BEGIN:VTIMEZONE"),
           "VTIMEZONE test " + aZoneId);
        ok(timezone.latitude && !!timezone.latitude.match(/^[+-]\d{7}$/), "Latitude test " + aZoneId);
        ok(timezone.longitude && !!timezone.longitude.match(/^[+-]\d{7}$/), "Longitude test " + aZoneId);
    }

    let tzs = cal.getTimezoneService();
    let zones = tzs.timezoneIds;
    let foundZone = false;
    while (zones.hasMore()) {
        foundZone = true;
        resolveZone(zones.getNext());
    }

    ok(foundZone, "There is at least one timezone");
});

// check whether all tz aliases resolve to a tz definition
add_task(function* alias_test() {
    function resolveAlias(aAliasId) {
        let timezone = tzs.getTimezone(aAliasId);
        let tzid = timezone && timezone.tzid ? timezone.tzid : "";
        notEqual(tzid, "", "Alias resolution " + aAliasId + " -> " + tzid);
    }

    let tzs = cal.getTimezoneService();
    let aliases = tzs.aliasIds;
    let foundAlias = false;
    while (aliases.hasMore()) {
        foundAlias = true;
        resolveAlias(aliases.getNext());
    }

    ok(foundAlias, "There is at least one alias");
});

// Check completeness to avoid unintended removing of zones/aliases when updating zones.json
// removed zones should at least remain as alias to not break UI like in bug 1210723.
// previous.json is generated automatically by executing update-zones.py script
add_task(function* completeness_test() {
    let jsonFile = do_get_file("data/previous.json");
    let test = readJSONFile(jsonFile);
    ok(test, "previous.json was loaded for completeness test");

    if (test) {
        // we check for valid version number of test data only - version number of tzs.version was
        // already checked in a separate test
        ok(valid_tz_version(test.version), "test data version.");
        // update-zones.py may create a dummy set of test data based on the current tz version for
        // convenience, that must not be used without being modified manually to comply with a
        // previous tz version.
        notEqual(test.version, "2.1969z", "Check for dummy test data.");
        let tzs = cal.getTimezoneService();
        let comp = Services.vc.compare(test.version, tzs.version);

        // some checks on the test data
        if (comp != -1) {
            switch (comp) {
                case 0:
                    do_print("Test data and timezone service use the same timezone version.");
                    break;
                case 1:
                    do_print("Test data use a newer timezone version than the timezone service.");
                    break;
            }
            do_print("test data: " + test.version);
            do_print("tz service: " + tzs.version);
            do_print("This indicates a problem in update-zones.py or manually additions to" +
                     "zones.json or previous.json");
        }
        equal(comp, -1, "timezone version of test data is older than the currently used version.");
        ok(test.aliases && test.aliases.length > 0, "test data have aliases.");
        ok(test.zones && test.zones.length > 0, "test data have zones.");

        // completeness check for aliases and zones (this covers also cases, when a previous zone
        // definition got transformed into alias linked to a valid zone - so, there's no need for
        // separate test step to cover that)
        for (let alias of test.aliases) {
            notEqual(tzs.getTimezone(alias), null, "Test Alias " + alias + " from " + test.version);
        }
        for (let zone of test.zones) {
            notEqual(tzs.getTimezone(zone), null, "Test Zone " + zone + " from " + test.version);
        }
    }
});
