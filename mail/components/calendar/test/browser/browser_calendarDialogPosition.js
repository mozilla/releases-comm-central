/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * globals createCalendar, createEvent, CalendarTestUtils,
 * resizeWindow, originalWidth, originalHeight, sizes, positionTest
 */

"use strict";

add_setup(setupPositioning);

add_task(async function test_scrollPositions() {
  const calendar = createCalendar();

  for (const size of sizes) {
    await resizeWindow(size);

    for (const offset of [0, 1, 2, 3, 4, 5, 6]) {
      for (const hour of [0, 6, 12, 18, 23]) {
        await positionTest({ calendar, hour, offset, size });
      }
    }

    window.moveTo(0, 0);
    await resizeWindow(originalWidth, originalHeight);
  }

  CalendarTestUtils.removeCalendar(calendar);
});
