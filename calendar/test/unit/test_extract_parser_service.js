/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalExtractParserService. These are modified versions of the
 * text_extract.js tests, for now.
 */

// This test works with code that is not timezone-aware.
/* eslint-disable no-restricted-syntax */

var { CalExtractParserService } = ChromeUtils.importESModule(
  "resource:///modules/calendar/extract/CalExtractParserService.sys.mjs"
);

const service = new CalExtractParserService();

/**
 * Test the extraction of a start and end time using HOUR am/pm. Note: The
 * service currently only selects event information from one sentence so the
 * event title is not included here for now.
 */
add_task(function test_event_start_end() {
  const now = new Date(2012, 9, 1, 9, 0);
  const content = "We'll meet at 2 pm and discuss until 3 pm.";
  const result = service.extract(content, {
    now,
  });

  info(`Comparing extracted result for string "${content}"...`);
  compareExtractResults(
    result,
    {
      type: "event-guess",
      startTime: {
        type: "meridiem-time",
        year: 2012,
        month: 10,
        day: 1,
        hour: 14,
        minute: 0,
        meridiem: "pm",
      },
      endTime: {
        type: "meridiem-time",
        year: 2012,
        month: 10,
        day: 1,
        hour: 15,
        minute: 0,
        meridiem: "pm",
      },
      priority: 0,
    },
    "result"
  );
});

/**
 * Test the extraction of a start and end time using a meridiem time for start
 * and a duration for the end.
 */
add_task(function test_event_start_duration() {
  const now = new Date(2012, 9, 1, 9, 0);
  const content = "We'll meet at 2 pm and discuss for 30 minutes.";
  const result = service.extract(content, {
    now,
  });
  info(`Comparing extracted result for string "${content}"...`);
  compareExtractResults(
    result,
    {
      type: "event-guess",
      startTime: {
        type: "meridiem-time",
        year: 2012,
        month: 10,
        day: 1,
        hour: 14,
        minute: 0,
        meridiem: "pm",
      },
      endTime: {
        type: "date-time",
        year: 2012,
        month: 10,
        day: 1,
        hour: 14,
        minute: 30,
      },
      priority: 0,
    },
    "result"
  );
});
