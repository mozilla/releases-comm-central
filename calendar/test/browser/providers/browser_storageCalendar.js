/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let calendar = createCalendar("storage", "moz-storage-calendar://");
registerCleanupFunction(() => {
  removeCalendar(calendar);
});

add_task(function testAlarms() {
  calendarObserver._batchRequired = false;
  return runTestAlarms(calendar);
});
