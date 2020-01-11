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
    "resource:///components/calItemBase.js",
    "resource:///components/calCachedCalendar.js",

    "resource:///components/calAlarm.js",
    "resource:///components/calAlarmMonitor.js",
    "resource:///components/calAlarmService.js",
    "resource:///components/calAttendee.js",
    "resource:///components/calAttachment.js",
    "resource:///components/calCalendarManager.js",
    "resource:///components/calCalendarSearchService.js",
    "resource:///components/calDateTimeFormatter.js",
    "resource:///components/calDeletedItems.js",
    "resource:///components/calEvent.js",
    "resource:///components/calFreeBusyService.js",
    "resource:///components/calIcsParser.js",
    "resource:///components/calIcsSerializer.js",
    "resource:///components/calItipItem.js",
    "resource:///components/calProtocolHandler.js",
    "resource:///components/calRecurrenceDate.js",
    "resource:///components/calRecurrenceInfo.js",
    "resource:///components/calRelation.js",
    "resource:///components/calStartupService.js",
    "resource:///components/calTransactionManager.js",
    "resource:///components/calTodo.js",
    "resource:///components/calWeekInfoService.js",
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
