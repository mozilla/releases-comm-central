/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "timezone-utils";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

Cu.import("resource://gre/modules/Preferences.jsm");

var DATES = [
    [2009, 1, 1], [2009, 4, 2], [2009, 4, 16], [2009, 4, 30],
    [2009, 7, 2], [2009, 10, 15], [2009, 10, 29], [2009, 11, 5]
];

var TIMEZONES = ["America/St_Johns", "America/Caracas", "America/Phoenix", "America/Los_Angeles",
                 "America/Argentina/Buenos_Aires", "Europe/Paris", "Asia/Kathmandu", "Australia/Adelaide"];

var helpersForController, goToDate, viewForward, viewBack, findEventsInNode;

function setupModule() {
    ({ helpersForController, goToDate, viewForward, viewBack, findEventsInNode } =
        collector.getModule("calendar-utils"));
}

function installInto(module) {
    // copy constants into module
    module.DATES = DATES;
    module.TIMEZONES = TIMEZONES;

    // Now copy helper functions
    module.switchAppTimezone = switchAppTimezone;
    module.verify = verify;
}


function switchAppTimezone(timezone) {
    // change directly as Mac has different Lookup & XPath than Windows & Linux, bug 536605
    Preferences.set("calendar.timezone.local", timezone);
}

function verify(controller, dates, timezones, times) {
    function* datetimes() {
        for (let idx = 0; idx < dates.length; idx++) {
            yield [dates[idx][0], dates[idx][1], dates[idx][2], times[idx]];
        }
    }

    let { lookup } = helpersForController(controller);

    let dayView = `
        /id("messengerWindow")/id("tabmail-container")/id("tabmail")/
        id("tabpanelcontainer")/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/id("view-deck")/
        id("day-view")
    `;
    let dayStack = `
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/[0]/anon({"anonid":"boxstack"})/
        anon({"anonid":"topbox"})/{"flex":"1"}
    `;
    let timeLine = `
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"timebar"})/anon({"anonid":"topbox"})
    `;
    let allowedDifference = 3;

    /* Event box' time can't be deduced from it's position in                    ----------------
       xul element tree because for each event a box is laid over whole day and  |___spacer_____|
       a spacer is added to push the event to it's correct location.             |__event_box___|
       But timeline can be used to retrieve the position of a particular hour    |day continues |
       on screen and it can be compared against the position of the event.       ----------------
    */

    for (let [selectedYear, selectedMonth, selectedDay, selectedTime] of datetimes()) {
        goToDate(controller, selectedYear, selectedMonth, selectedDay);

        // find event with timezone tz
        for (let tzIdx = 0; tzIdx < timezones.length; tzIdx++) {
            let [correctHour, minutes, day] = selectedTime[tzIdx];
            let found = false;

            let timeNode = lookup(`${timeLine}/[${correctHour}]`).getNode();
            let timeY = timeNode.boxObject.y + timeNode.boxObject.height * (minutes / 60);

            let stackNode;
            let eventNodes = [];

            // same day
            if (day == undefined) {
                stackNode = lookup(dayStack).getNode();
            }

            // following day
            if (day != undefined && day == 1) {
                viewForward(controller, 1);
                stackNode = lookup(dayStack).getNode();
            }

            // previous day
            if (day != undefined && day == -1) {
                viewBack(controller, 1);
                stackNode = lookup(dayStack).getNode();
            }

            findEventsInNode(stackNode, eventNodes);

            for (let node of eventNodes) {
                if (Math.abs(timeY - node.boxObject.y) < allowedDifference &&
                    timezones[tzIdx] == node.mOccurrence.title) {
                    found = true;
                    break;
                }
            }

            if (day != undefined && day == 1) {
                viewBack(controller, 1);
            }

            if (day != undefined && day == -1) {
                viewForward(controller, 1);
            }
            controller.assertJS(found == true);
        }
    }
}
