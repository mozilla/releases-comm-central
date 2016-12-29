/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils", "timezone-utils"];

var createCalendar, CALENDARNAME;
var switchAppTimezone;

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({ createCalendar, CALENDARNAME } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    ({ switchAppTimezone } = collector.getModule("timezone-utils"));
    collector.getModule("timezone-utils").setupModule();
    createCalendar(controller, CALENDARNAME);
}

function testTimezones1_SetGMT() {
    switchAppTimezone("Europe/London");
}
