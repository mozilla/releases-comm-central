/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "timezone-utils"];

var helpersForController, switchToView, goToDate, deleteCalendars, CALENDARNAME;
var verify, DATES, TIMEZONES;

var { preferences } = require("../shared-modules/prefs");

/* rows - dates
   columns - correct time for each event */
var times = [
    [[18, 30], [19, 30], [20, 30], [21, 30], [22, 30], [23, 30], [0, 30, +1], [1, 30, +1]],
    [[17, 30], [19, 30], [20, 30], [20, 30], [22, 30], [22, 30], [0, 30, +1], [1, 30, +1]],
    [[16, 30], [18, 30], [19, 30], [19, 30], [21, 30], [21, 30], [23, 30], [1, 30, +1]],
    [[16, 30], [18, 30], [19, 30], [19, 30], [21, 30], [21, 30], [23, 30], [1, 30, +1]],
    [[16, 30], [18, 30], [19, 30], [19, 30], [21, 30], [21, 30], [23, 30], [1, 30, +1]],
    [[17, 30], [19, 30], [20, 30], [20, 30], [22, 30], [22, 30], [0, 30, +1], [1, 30, +1]],
    [[17, 30], [19, 30], [20, 30], [20, 30], [22, 30], [23, 30], [0, 30, +1], [1, 30, +1]],
    [[18, 30], [19, 30], [20, 30], [21, 30], [22, 30], [23, 30], [0, 30, +1], [1, 30, +1]]
];

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ helpersForController, switchToView, goToDate, deleteCalendars, CALENDARNAME } =
        collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    ({ verify, DATES, TIMEZONES } = collector.getModule("timezone-utils"));
    collector.getModule("timezone-utils").setupModule();
}

function testTimezones10_checkAdelaide() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 1);

    verify(controller, dates, DATES, TIMEZONES, times);
}

function teardownTest(module) {
    preferences.clearUserPref("calendar.timezone.local");
    deleteCalendars(controller, CALENDARNAME);
}
