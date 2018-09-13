/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar;
var deleteCalendars, switchToView, goToDate, setData;
var CALENDARNAME, EVENT_BOX, CANVAS_BOX;

var savePromptAppeared = false;
var { date1, date2, date3, data, newlines } = setupData();

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        switchToView,
        goToDate,
        setData,
        CALENDARNAME,
        EVENT_BOX,
        CANVAS_BOX,
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

// Test that closing an event dialog with no changes does not prompt for save
function testEventDialogModificationPrompt() {
    controller.click(eid("calendar-tab-button"));
    switchToView(controller, "day");
    goToDate(controller, 2009, 1, 1);

    // create new event
    let eventbox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
    invokeEventDialog(controller, eventbox, (event, iframe) => {
        let { eid: eventid } = helpersForController(event);

        // enter first set of data
        setData(event, iframe, data[0]);

        // save
        event.click(eventid("button-saveandclose"));
    });

    eventbox = lookupEventBox("day", EVENT_BOX, null, 1, 8, '/{"tooltip":"itemTooltip"}');
    invokeEventDialog(controller, eventbox, (event, iframe) => {
        // open, but change nothing
        // escape the event window, there should be no prompt to save event
        event.keypress(null, "VK_ESCAPE", {});
    });

    // open
    eventbox = lookupEventBox("day", EVENT_BOX, null, 1, 8, '/{"tooltip":"itemTooltip"}');
    invokeEventDialog(controller, eventbox, (event, iframe) => {
        // change all values
        setData(event, iframe, data[1]);

        // edit all values back to original
        setData(event, iframe, data[0]);

        // escape the event window, there should be no prompt to save event
        event.keypress(null, "VK_ESCAPE", {});
    });

    // delete event
    controller.click(lookupEventBox("day", EVENT_BOX, null, 1, 8, '/{"tooltip":"itemTooltip"}'));
    controller.keypress(eid("day-view"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookupEventBox("day", EVENT_BOX, null, 1, 8));

    for (let i = 0; i < newlines.length; i++) {
        // test set i
        eventbox = lookupEventBox("day", CANVAS_BOX, null, 1, 8);
        invokeEventDialog(controller, eventbox, (event, iframe) => {
            let { eid: eventid } = helpersForController(event);
            setData(event, iframe, newlines[i]);
            event.click(eventid("button-saveandclose"));
        });

        // open and close
        eventbox = lookupEventBox("day", EVENT_BOX, null, 1, 8, '/{"tooltip":"itemTooltip"}');
        invokeEventDialog(controller, eventbox, (event, iframe) => {
            setData(event, iframe, newlines[i]);
            event.keypress(null, "VK_ESCAPE", {});
        });

        // delete it
        // XXX somehow the event is selected at this point, this didn't use to
        // be the case and can't be reproduced manually
        controller.keypress(eid("day-view"), "VK_DELETE", {});
        controller.waitForElementNotPresent(lookupEventBox("day", EVENT_BOX, null, 1, 8));
    }
}

function teardownTest(module) {
    deleteCalendars(controller, CALENDARNAME);
    if (savePromptAppeared) {
        controller.assertJS('"Prompt appeared" == "Prompt didn\'t appear."');
    }
}

function setupData() {
    return {
        date1: new Date(2009, 0, 1, 8, 0),
        date2: new Date(2009, 0, 2, 9, 0),
        date3: new Date(2009, 0, 3, 10, 0),
        data: [{
            title: "title1",
            location: "location1",
            category: "Anniversary",
            description: "description1",
            allday: false,
            startdate: date1,
            starttime: date1,
            enddate: date2,
            endtime: date2,
            repeat: "none",
            priority: "normal",
            privacy: "public",
            status: "confirmed",
            freebusy: "busy",
            timezone: true,
        }, {
            title: "title2",
            location: "location2",
            category: "Birthday",
            description: "description2",
            allday: true,
            startdate: date2,
            starttime: date2,
            enddate: date3,
            endtime: date3,
            repeat: "daily",
            priority: "high",
            privacy: "private",
            status: "tentative",
            freebusy: "free",
            timezone: true,
        }],
        newlines: [
            { title: "title", description: "  test spaces  " },
            { title: "title", description: "\ntest newline\n" },
            { title: "title", description: "\rtest \\r\r" },
            { title: "title", description: "\r\ntest \\r\\n\r\n" },
            { title: "title", description: "\ttest \\t\t" }
        ]
    };
}
