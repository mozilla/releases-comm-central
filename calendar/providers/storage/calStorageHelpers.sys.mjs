/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { CalTimezone } from "resource:///modules/CalTimezone.sys.mjs";

var { ICAL } = ChromeUtils.import("resource:///modules/calendar/Ical.jsm");

// Storage flags. These are used in the Database |flags| column to give
// information about the item's features. For example, if the item has
// attachments, the HAS_ATTACHMENTS flag is added to the flags column.
export var CAL_ITEM_FLAG = {
  PRIVATE: 1,
  HAS_ATTENDEES: 2,
  HAS_PROPERTIES: 4,
  EVENT_ALLDAY: 8,
  HAS_RECURRENCE: 16,
  HAS_EXCEPTIONS: 32,
  HAS_ATTACHMENTS: 64,
  HAS_RELATIONS: 128,
  HAS_ALARMS: 256,
  RECURRENCE_ID_ALLDAY: 512,
};

// The cache of foreign timezones
var gForeignTimezonesCache = {};

/**
 * Transforms the text representation of this date object to a calIDateTime
 * object.
 *
 * @param text  The text to transform.
 * @returns The resulting calIDateTime.
 */
export function textToDate(text) {
  let textval;
  let timezone = "UTC";

  if (text[0] == "Z") {
    const strs = text.substr(2).split(":");
    textval = parseInt(strs[0], 10);
    timezone = strs[1].replace(/%:/g, ":").replace(/%%/g, "%");
  } else {
    textval = parseInt(text.substr(2), 10);
  }

  let date;
  if (text[0] == "U" || text[0] == "Z") {
    date = newDateTime(textval, timezone);
  } else if (text[0] == "L") {
    // is local time
    date = newDateTime(textval, "floating");
  }

  if (text[1] == "D") {
    date.isDate = true;
  }
  return date;
}

/**
 * Gets the timezone for the given definition or identifier
 *
 * @param aTimezone     The timezone data
 * @returns The calITimezone object
 */
export function getTimezone(aTimezone) {
  let timezone = null;
  if (aTimezone.startsWith("BEGIN:VTIMEZONE")) {
    timezone = gForeignTimezonesCache[aTimezone]; // using full definition as key
    if (!timezone) {
      timezone = new CalTimezone(
        ICAL.Timezone.fromData({
          component: aTimezone,
        })
      );
      gForeignTimezonesCache[aTimezone] = timezone;
    }
  } else {
    timezone = cal.timezoneService.getTimezone(aTimezone);
  }
  return timezone;
}

/**
 * Creates a new calIDateTime from the given native time and optionally
 * the passed timezone. The timezone can either be the TZID of the timezone (in
 * this case the timezone service will be asked for the definition), or a string
 * representation of the timezone component (i.e a VTIMEZONE component).
 *
 * @param aNativeTime       The native time, in microseconds
 * @param aTimezone         The timezone identifier or definition.
 */
export function newDateTime(aNativeTime, aTimezone) {
  let date = cal.createDateTime();

  // Bug 751821 - Dates before 1970 were incorrectly stored with an unsigned nativeTime value, we need to
  // convert back to a negative value
  if (aNativeTime > 9223372036854776000) {
    cal.WARN("[calStorageCalendar] Converting invalid native time value: " + aNativeTime);
    aNativeTime = -9223372036854776000 + (aNativeTime - 9223372036854776000);
    // Round to nearest second to fix microsecond rounding errors
    aNativeTime = Math.round(aNativeTime / 1000000) * 1000000;
  }

  date.nativeTime = aNativeTime;
  if (aTimezone) {
    const timezone = getTimezone(aTimezone);
    if (timezone) {
      date = date.getInTimezone(timezone);
    } else {
      cal.ASSERT(false, "Timezone not available: " + aTimezone);
    }
  } else {
    date.timezone = cal.dtz.floating;
  }
  return date;
}
