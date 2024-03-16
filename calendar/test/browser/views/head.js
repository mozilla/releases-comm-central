/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

const calendarViewsInitialState = CalendarTestUtils.saveCalendarViewsState(window);

registerCleanupFunction(async () => {
  await CalendarTestUtils.restoreCalendarViewsState(window, calendarViewsInitialState);
});
