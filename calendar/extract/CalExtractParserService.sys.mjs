/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalExtractParser } from "resource:///modules/calendar/extract/CalExtractParser.sys.mjs";

const defaultRules = [
  [
    // Start clean up patterns.

    // remove last line preceding quoted message and first line of the quote
    [/^(\r?\n[^>].*\r?\n>+.*$)/, ""],

    // remove the rest of quoted content
    [/^(>+.*$)/, ""],

    // urls often contain dates dates that can confuse extraction
    [/^(https?:\/\/[^\s]+\s)/, ""],
    [/^(www\.[^\s]+\s)/, ""],

    // remove phone numbers
    [/^(\d-\d\d\d-\d\d\d-\d\d\d\d)/, ""],

    // remove standard signature
    [/^(\r?\n-- \r?\n[\S\s]+$)/, ""],

    // XXX remove timezone info, for now
    [/^(gmt[+-]\d{2}:\d{2})/i, ""],

    // End clean up patterns.

    [/^meet\b/i, "MEET"],
    [/^(we will|we'll|we)\b/i, "WE"],

    // Meridiem
    [/^(a[.]?m[.]?)/i, "AM"],
    [/^(p[.]?m[.]?)/i, "PM"],

    [/^(hours|hour|hrs|hr)\b/i, "HOURS"],
    [/^(minutes|min|mins)\b/i, "MINUTES"],
    [/^(days|day)\b/i, "DAYS"],

    // Words commonly used when specifying begin/end time or duration.
    [/^at\b/i, "AT"],
    [/^until\b/i, "UNTIL"],
    [/^for\b/i, "FOR"],

    // Units of time
    [/^(((0|1)?[0-9])|(2[0-4]))\b/, "HOUR_VALUE"],

    [/^\d+\b/, "NUMBER"],

    // Any text we don't know the meaning of.
    [/^\S+/, "TEXT"],

    // Whitespace
    [/^\s+/, ""],
  ],
  [
    {
      name: "event-guess",
      patterns: ["subject", "meet", "start-time", "text*", "end-time"],
      action: ([, , startTime, , endTime]) => ({
        type: "event-guess",
        startTime,
        endTime,
        priority: 0,
      }),
    },
    {
      name: "event-guess",
      patterns: ["subject", "meet", "start-time", "text*", "duration-time"],
      action: ([, , startTime, , endTime]) => ({
        type: "event-guess",
        startTime,
        endTime,
        priority: 0,
      }),
    },
    {
      name: "subject",
      patterns: ["WE"],
      action: ([subject]) => ({
        type: "subject",
        subject: subject.text,
      }),
    },
    {
      name: "start-time",
      patterns: ["start-time-prefix", "meridiem-time"],
      action: ([, time]) => time,
    },
    {
      name: "start-time-prefix",
      patterns: ["AT"],
      action: ([prefix]) => prefix.text,
    },
    {
      name: "end-time",
      patterns: ["end-time-prefix", "meridiem-time"],
      action: ([, time]) => time,
    },
    {
      name: "end-time-prefix",
      patterns: ["UNTIL"],
      action: ([prefix]) => prefix.text,
    },
    {
      name: "meridiem-time",
      patterns: ["HOUR_VALUE", "meridiem"],
      action: ([hour, meridiem]) => ({
        type: "meridiem-time",
        hour: Number(hour.text),
        meridiem,
      }),
    },
    {
      name: "meridiem",
      patterns: ["AM"],
      action: () => "am",
    },
    {
      name: "meridiem",
      patterns: ["PM"],
      action: () => "pm",
    },

    {
      name: "duration-time",
      patterns: ["duration-prefix", "duration"],
      action: ([, duration]) => ({
        type: "duration-time",
        duration,
      }),
    },
    {
      name: "duration-prefix",
      patterns: ["FOR"],
      action: ([prefix]) => prefix.text,
    },
    {
      name: "duration",
      patterns: ["NUMBER", "MINUTES"],
      action: ([value]) => Number(value.text),
    },
    {
      name: "duration",
      patterns: ["NUMBER", "HOURS"],
      action: ([value]) => Number(value.text) * 60,
    },
    {
      name: "duration",
      patterns: ["NUMBER", "DAYS"],
      action: ([value]) => Number(value.text) * 60 * 24,
    },
    {
      name: "meet",
      patterns: ["MEET"],
      action: () => "meet",
    },
    {
      name: "text",
      patterns: ["TEXT"],
      action: ([text]) => text,
    },
  ],
];

/**
 * CalExtractParserServiceContext represents the context parsing and extraction
 * takes place in. It holds values used in various calculations. For example,
 * the current date.
 *
 * @typedef  {object} CalExtractParserServiceContext
 * @property {Date} now - The Date to use when calculating start and relative
 *                       times.
 */

/**
 * CalExtractParserService provides a frontend to the CalExtractService.
 * It holds lexical and parse rules for multiple locales (or any string
 * identifier) that can be used on demand when parsing text.
 */
export class CalExtractParserService {
  rules = new Map([["en-US", defaultRules]]);

  /**
   * Parses and extract the most relevant event creation data based on the
   * rules of the locale given.
   *
   * @param {string} source
   * @param {CalExtractParserServiceContext} context
   * @param {string} locale
   */
  extract(source, ctx = { now: new Date() }, locale = "en-US") {
    const rules = this.rules.get(locale);
    if (!rules) {
      return null;
    }

    const [lex, parse] = rules;
    const parser = CalExtractParser.createInstance(lex, parse);
    const result = parser.parse(source).sort((a, b) => a - b)[0];
    return result && convertDurationToEndTime(populateTimes(result, ctx.now));
  }
}

/**
 * Populates the missing values of the startTime and endTime.
 *
 * @param {object?} guess - The result of CalExtractParserService.extract().
 * @param {Date}    now   - A Date object representing the contextual date and
 *                          time.
 *
 * @returns {object} The result with the populated startTime and endTime.
 */
function populateTimes(guess, now) {
  return populateTime(populateTime(guess, now, "startTime"), now, "endTime");
}

/**
 * Populates the missing values of the specified time property based on the Date
 * provided.
 *
 * @param {object?} guess
 * @param {Date}    now
 * @param {string}  prop
 *
 * @returns {object}
 */
function populateTime(guess, now, prop) {
  const time = guess[prop];

  if (!time) {
    return guess;
  }
  if (time.hour && time.meridiem) {
    time.hour = normalizeHour(time.hour, time.meridiem);
  }

  time.year = time.year || now.getFullYear();
  time.month = time.month || now.getMonth() + 1;
  time.day = time.day || now.getDay();
  time.hour = time.hour || now.getHours();
  time.minute = time.minute || now.getMinutes();
  return guess;
}

/**
 * Coverts an hour using the Meridiem to a 24 hour value.
 *
 * @param {number} hour - The hour value.
 * @param {string} meridiem - "am" or "pm"
 *
 * @returns {number}
 */
function normalizeHour(hour, meridiem) {
  if (meridiem == "am" && hour == 12) {
    return hour - 12;
  } else if (meridiem == "pm" && hour != 12) {
    return hour + 12;
  }

  const dayStart = Services.prefs.getIntPref("calendar.view.daystarthour", 6);
  if (hour < dayStart && hour <= 11) {
    return hour + 12;
  }

  return hour;
}

/**
 * Takes care of converting an end duration to an actual time relative to the
 * start time detected (if any).
 *
 * @param {object} guess - Results from CalExtractParserService#extract()
 *
 * @returns {object} The result with the endTime property expanded.
 */
function convertDurationToEndTime(guess) {
  if (guess.startTime && guess.endTime && guess.endTime.type == "duration-time") {
    const startTime = guess.startTime;
    const duration = guess.endTime.duration;
    if (duration != 0) {
      const startDate = new Date(startTime.year, startTime.month - 1, startTime.day);
      if ("hour" in startTime) {
        startDate.setHours(startTime.hour);
        startDate.setMinutes(startTime.minute);
      }

      const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
      const endTime = { type: "date-time" };
      endTime.year = endDate.getFullYear();
      endTime.month = endDate.getMonth() + 1;
      endTime.day = endDate.getDate();
      if (endDate.getHours() != 0 || endDate.getMinutes() != 0) {
        endTime.hour = endDate.getHours();
        endTime.minute = endDate.getMinutes();
      }
      guess.endTime = endTime;
    }
  }
  return guess;
}
