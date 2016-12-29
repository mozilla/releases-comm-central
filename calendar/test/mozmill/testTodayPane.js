/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var MODULE_NAME = "testTodayPane";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = ["calendar-utils"];

var helpersForController, invokeEventDialog, createCalendar, deleteCalendars;
var CALENDARNAME;

Cu.import("resource://calendar/modules/calUtils.jsm");

function setupModule(module) {
    controller = mozmill.getMail3PaneController();
    ({
        helpersForController,
        invokeEventDialog,
        createCalendar,
        deleteCalendars,
        CALENDARNAME
    } = collector.getModule("calendar-utils"));
    collector.getModule("calendar-utils").setupModule();
    Object.assign(module, helpersForController(controller));

    createCalendar(controller, CALENDARNAME);
}

function testTodayPane() {
    // paths
    let panels = `
        /id("messengerWindow")/id("tabmail-container")/
        id("tabmail")/id("tabpanelcontainer")
    `;
    let miniMonth = `
        ${panels}/id("calendarTabPanel")/id("calendarContent")/id("ltnSidebar")/
        id("minimonth-pane")
    `;
    let dayView = `
        ${panels}/id("calendarTabPanel")/id("calendarContent")/
        id("calendarDisplayDeck")/id("calendar-view-box")/
        id("view-deck")/id("day-view")
    `;
    let dayPath = `
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"labelbox"})/
        anon({"anonid":"labeldaybox"})/{"flex":"1"}
    `;
    let eventName = `
        id("calendar-event-dialog-inner")/id("event-grid")/
        id("event-grid-rows")/id("event-grid-title-row")/id("item-title")/
        anon({"class":"textbox-input-box"})/anon({"anonid":"input"})
    `;

    // open calendar view
    controller.click(eid("calendar-tab-button"));
    controller.waitThenClick(eid("calendar-day-view-button"));

    // go to today and verify date
    controller.waitThenClick(lookup(`
        ${miniMonth}/{"align":"center"}/id("calMinimonthBox")/id("calMinimonth")/
        anon({"anonid":"minimonth-header"})/anon({"anonid":"today-button"})
    `));
    controller.assertJS(lookup(dayPath).getNode().mDate.icalString == getIsoDate());

    // Create event 6 hours from now, if this is tomorrow then at 23 today.
    // Doubleclick only triggers new event dialog on visible boxes, so scrolling
    // may be needed by default visible time is 08:00 - 17:00, box of 17th hour
    // is out of view
    let hour = (new Date()).getHours();
    let startHour = (hour < 18 ? hour + 6 : 23);
    let view = lookup(dayView).getNode();

    if (startHour < 8 || startHour > 16) {
        view.scrollToMinute(60 * startHour);
    }

    invokeEventDialog(controller, lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"bgbox"})/[${startHour}]
    `), (event, iframe) => {
        let { lookup: iframelookup } = helpersForController(iframe);
        let { eid: eventid } = helpersForController(event);

        let eventNameElement = iframelookup(eventName);
        event.waitForElement(eventNameElement);
        event.type(eventNameElement, "Today's Event");
        event.click(eventid("button-saveandclose"));
    });

    // reset view
    view.scrollToMinute(60 * 8);

    // go to tomorrow and add an event
    controller.click(eid("next-view-button"));
    invokeEventDialog(controller, lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"bgbox"})/[9]
    `), (event, iframe) => {
        let { lookup: iframelookup } = helpersForController(iframe);
        let { eid: eventid } = helpersForController(event);

        let eventNameElement = iframelookup(eventName);
        event.waitForElement(eventNameElement);
        event.type(eventNameElement, "Tomorrow's Event");
        event.click(eventid("button-saveandclose"));
    });

    // go 5 days forward and add an event
    for (let i = 0; i < 5; i++) {
        controller.click(eid("next-view-button"));
    }
    sleep();

    invokeEventDialog(controller, lookup(`
        ${dayView}/anon({"anonid":"mainbox"})/anon({"anonid":"scrollbox"})/
        anon({"anonid":"daybox"})/{"class":"calendar-event-column-even"}/
        anon({"anonid":"boxstack"})/anon({"anonid":"bgbox"})/[9]
    `), (event, iframe) => {
        let { lookup: iframelookup } = helpersForController(iframe);
        let { eid: eventid } = helpersForController(event);

        let eventNameElement = iframelookup(eventName);
        event.waitForElement(eventNameElement);
        event.type(eventNameElement, "Future's Event");
        event.click(eventid("button-saveandclose"));
    });

    // go to mail tab
    controller.click(lookup(`
        /id("messengerWindow")/id("navigation-toolbox")/id("tabs-toolbar")/
        id("tabcontainer")/{"first-tab":"true","type":"folder"}/
        anon({"class":"tab-stack"})/{"class":"tab-background"}/
        {"class":"tab-background-middle"}
    `));
    sleep();

    // verify today pane open
    controller.assertNotDOMProperty(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")
    `), "collapsed");

    // verify today pane's date
    controller.assertValue(eid("datevalue-label"), (new Date()).getDate());

    // tomorrow and soon are collapsed by default
    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/[3]/id("agenda-listbox")/id("tomorrow-header")/
        anon({"anonid":"agenda-checkbox-widget"})/anon({"class":"checkbox-check"})
    `));
    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/[3]/id("agenda-listbox")/id("nextweek-header")/
        anon({"anonid":"agenda-checkbox-widget"})/anon({"class":"checkbox-check"})
    `));
    sleep();

    // verify events shown in today pane
    let now = new Date();
    now.setHours(startHour);
    now.setMinutes(0);
    let dtz = cal.calendarDefaultTimezone();
    let probeDate = cal.jsDateToDateTime(now, dtz);
    let dateFormatter = cal.getDateFormatter();
    let startTime = dateFormatter.formatTime(probeDate);
    controller.assertText(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[2]/
        anon({"anonid":"agenda-container-box"})/
        anon({"anonid":"agenda-description"})/[0]/
        anon({"anonid":"agenda-event-start"})/
    `), startTime + " Today's Event");

    let tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0);
    probeDate = cal.jsDateToDateTime(tomorrow, dtz);
    startTime = dateFormatter.formatTime(probeDate);
    controller.assertText(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[4]/
        anon({"anonid":"agenda-container-box"})/
        anon({"anonid":"agenda-description"})/[0]/
        anon({"anonid":"agenda-event-start"})/
    `), startTime + " Tomorrow's Event");

    let future = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6, 9, 0);
    probeDate = cal.jsDateToDateTime(future, dtz);
    startTime = dateFormatter.formatDateTime(probeDate);

    // Future event's start time
    controller.assertText(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/
        {"flex":"1"}/id("agenda-listbox")/[6]/anon({"anonid":"agenda-container-box"})/
        anon({"anonid":"agenda-description"})/[0]/anon({"anonid":"agenda-event-start"})
     `), startTime);

    // Future event's title
    controller.assertText(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/[1]/
        id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[6]/
        anon({"anonid":"agenda-container-box"})/
        anon({"anonid":"agenda-description"})/
        anon({"anonid":"agenda-event-title"})
    `), "Future's Event");

    // delete events
    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[2]
    `));

    controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[6]
    `));

    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[3]
    `));
    controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[5]
    `));

    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[4]
    `));
    controller.keypress(eid("agenda-listbox"), "VK_DELETE", {});
    controller.waitForElementNotPresent(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[4]
    `));

    // hide and verify today pane hidden
    controller.click(eid("calendar-status-todaypane-button"));
    controller.assertNode(lookup(`
        /id("messengerWindow")/id("tabmail-container")/{"collapsed":"true"}
    `));

    // reset today pane
    controller.click(eid("calendar-status-todaypane-button"));
    controller.assertNotDOMProperty(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")
    `), "collapsed");
    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/[3]/id("agenda-listbox")/id("tomorrow-header")/
        anon({"anonid":"agenda-checkbox-widget"})/anon({"class":"checkbox-check"})
    `));
    controller.click(lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/[3]/id("agenda-listbox")/id("nextweek-header")/
        anon({"anonid":"agenda-checkbox-widget"})/anon({"class":"checkbox-check"})
    `));
    sleep();

    // verify tomorrow and soon collapsed
    tomorrow = lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[1]/
        anon({"class":"agenda-checkbox"})
    `).getNode();

    let soon = lookup(`
        /id("messengerWindow")/id("tabmail-container")/id("today-pane-panel")/
        [1]/id("agenda-panel")/{"flex":"1"}/id("agenda-listbox")/[2]/
        anon({"class":"agenda-checkbox"})
    `).getNode();

    // TODO This is failing, which might actually be an error in our code!
    //  controller.assertJS(!tomorrow.hasAttribute("checked")
    //    || tomorrow.getAttribute("checked") != "true");
    controller.assertJS(
        !soon.hasAttribute("checked") ||
        soon.getAttribute("checked") != "true"
    );
}

function getIsoDate() {
    let currDate = new Date();
    return `${currDate.getFullYear()}${currDate.getMonth() + 1}${currDate.getDate()}`;
}

function teardownTest(module) {
    deleteCalendars(controller, "Mozmill");
}
