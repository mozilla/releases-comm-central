/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from calItemBase.js */
/* import-globals-from calCachedCalendar.js */
/* import-globals-from calAlarm.js */
/* import-globals-from calAlarmMonitor.js */
/* import-globals-from calAlarmService.js */
/* import-globals-from calAttendee.js */
/* import-globals-from calAttachment.js */
/* import-globals-from calCalendarManager.js */
/* import-globals-from calCalendarSearchService.js */
/* import-globals-from calDateTimeFormatter.js */
/* import-globals-from calDeletedItems.js */
/* import-globals-from calEvent.js */
/* import-globals-from calFreeBusyService.js */
/* import-globals-from calIcsParser.js */
/* import-globals-from calIcsSerializer.js */
/* import-globals-from calItipItem.js */
/* import-globals-from calProtocolHandler.js */
/* import-globals-from calRecurrenceDate.js */
/* import-globals-from calRecurrenceInfo.js */
/* import-globals-from calRelation.js */
/* import-globals-from calStartupService.js */
/* import-globals-from calTransactionManager.js */
/* import-globals-from calTodo.js */
/* import-globals-from calWeekInfoService.js */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

this._NSGetFactory = cid => {
  let scriptLoadOrder = [
    "resource://calendar/calendar-js/calItemBase.js",
    "resource://calendar/calendar-js/calCachedCalendar.js",

    "resource://calendar/calendar-js/calAlarm.js",
    "resource://calendar/calendar-js/calAlarmMonitor.js",
    "resource://calendar/calendar-js/calAlarmService.js",
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
    "resource://calendar/calendar-js/calWeekInfoService.js",
  ];

  for (let script of scriptLoadOrder) {
    Services.scriptloader.loadSubScript(script, this);
  }

  let components = [
    calAlarm,
    calAlarmMonitor,
    calAlarmService,
    calAttendee,
    calAttachment,
    calCalendarManager,
    calCalendarSearchService,
    calDateTimeFormatter,
    calDeletedItems,
    calEvent,
    calFreeBusyService,
    calIcsParser,
    calIcsSerializer,
    calItipItem,
    calProtocolHandlerWebcal,
    calProtocolHandlerWebcals,
    calRecurrenceDate,
    calRecurrenceInfo,
    calRelation,
    calStartupService,
    calTransaction,
    calTransactionManager,
    calTodo,
    calWeekInfoService,
  ];

  this._NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
  return this._NSGetFactory(cid);
};

// This version of NSGetFactory is used every time, even if it is replaced. Instead, we use a shim
// calling an internal function. The internal function is replaced after the first run.
this.NSGetFactory = cid => {
  return this._NSGetFactory(cid);
};
