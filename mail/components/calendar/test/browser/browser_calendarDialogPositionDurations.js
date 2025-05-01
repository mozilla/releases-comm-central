/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * globals createCalendar, createEvent, CalendarTestUtils, setupPositioning
 * resizeWindow, originalWidth, originalHeight, sizes, positionTest
 */

"use strict";

add_setup(setupPositioning);

const durationTests = [
  {
    duration: 3,
    hours: [0, 11, 21],
  },
  {
    duration: 6,
    hours: [0, 11, 18],
  },
  {
    duration: 12,
    hours: [0, 11],
  },
  {
    duration: 24,
    hours: [0],
  },
  {
    duration: 36,
    hours: [0, 12, 23],
  },
  {
    duration: 72,
    hours: [0, 12, 23],
  },
  {
    duration: 144,
    hours: [0, 12, 23],
  },
];

add_task(async function test_cornerScrollPositions() {
  // Only do the primary and outlier sizes to limit tests.

  const calendar = createCalendar();

  for (const size of sizes.slice(0, 4)) {
    await resizeWindow(size);
    for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
      for (const { duration, hours } of durationTests) {
        for (const hour of hours) {
          await positionTest({ calendar, duration, hour, offset, size });
        }
      }
    }

    window.moveTo(0, 0);
    await resizeWindow(originalWidth, originalHeight);
  }

  CalendarTestUtils.removeCalendar(calendar);
});
