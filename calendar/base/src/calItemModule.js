/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");

this.NSGetFactory = (cid) => {
    let scriptLoadOrder = [
        "resource://calendar/calendar-js/calItemBase.js",
        "resource://calendar/calendar-js/calCachedCalendar.js",

        "resource://calendar/calendar-js/calAlarm.js",
        "resource://calendar/calendar-js/calAlarmService.js",
        "resource://calendar/calendar-js/calAlarmMonitor.js",
        "resource://calendar/calendar-js/calAttendee.js",
        "resource://calendar/calendar-js/calAttachment.js",
        "resource://calendar/calendar-js/calCalendarManager.js",
        "resource://calendar/calendar-js/calCalendarSearchService.js",
        "resource://calendar/calendar-js/calDateTimeFormatter.js",
        "resource://calendar/calendar-js/calDeletedItems.js",
        "resource://calendar/calendar-js/calEvent.js",
        "resource://calendar/calendar-js/calFreeBusyService.js",
        "resource://calendar/calendar-js/calIcsParser.js",
        "resource://calendar/calendar-js/calIcsSerializer.js",
        "resource://calendar/calendar-js/calItipItem.js",
        "resource://calendar/calendar-js/calProtocolHandler.js",
        "resource://calendar/calendar-js/calRecurrenceDate.js",
        "resource://calendar/calendar-js/calRecurrenceInfo.js",
        "resource://calendar/calendar-js/calRelation.js",
        "resource://calendar/calendar-js/calStartupService.js",
        "resource://calendar/calendar-js/calTransactionManager.js",
        "resource://calendar/calendar-js/calTodo.js",
        "resource://calendar/calendar-js/calWeekInfoService.js"
    ];

    for (let script of scriptLoadOrder) {
        Services.scriptloader.loadSubScript(script, this);
    }

    let components = [
        calAlarm, calAlarmService, calAlarmMonitor, calAttendee, calAttachment, calCalendarManager,
        calCalendarSearchService, calDateTimeFormatter, calDeletedItems, calEvent, calFreeBusyService,
        calIcsParser, calIcsSerializer, calItipItem, calProtocolHandlerWebcal,
        calProtocolHandlerWebcals, calRecurrenceDate, calRecurrenceInfo, calRelation,
        calStartupService, calTransaction, calTransactionManager, calTodo, calWeekInfoService,
    ];

    this.NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
    return this.NSGetFactory(cid);
};
