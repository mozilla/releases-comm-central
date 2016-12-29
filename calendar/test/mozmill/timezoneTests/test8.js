/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "timezone-utils"];

var helpersForController, switchToView, goToDate;
var switchAppTimezone, verify, DATES, TIMEZONES;

/* rows - dates
   columns - correct time for each event */
var times = [
    [[9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0]],
    [[9, 0], [11, 0], [12, 0], [12, 0], [14, 0], [14, 0], [16, 0], [17, 0]],
    [[9, 0], [11, 0], [12, 0], [12, 0], [14, 0], [14, 0], [16, 0], [18, 0]],
    [[9, 0], [11, 0], [12, 0], [12, 0], [14, 0], [14, 0], [16, 0], [18, 0]],
    [[9, 0], [11, 0], [12, 0], [12, 0], [14, 0], [14, 0], [16, 0], [18, 0]],
    [[9, 0], [11, 0], [12, 0], [12, 0], [14, 0], [14, 0], [16, 0], [17, 0]],
    [[8, 0], [10, 0], [11, 0], [11, 0], [13, 0], [14, 0], [15, 0], [16, 0]],
    [[9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0]]
];

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ helpersForController, switchToView, goToDate } =
        collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));
    ({ switchAppTimezone, verify, DATES, TIMEZONES } = collector.getModule("timezone-utils"));
    collector.getModule("timezone-utils").setupModule();
}

function testTimezones8_checkParis() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 1);

    verify(controller, DATES, TIMEZONES, times);
}

function teardownTest(module) {
    switchAppTimezone(TIMEZONES[6]);
}
