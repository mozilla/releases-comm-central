/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_task(async function() {
  let calendar = createCalendar("storage", "moz-storage-calendar://");

  info("creating the item");
  calendarObserver._batchRequired = false;
  await runAddItem(calendar);

  info("modifying the item");
  await runModifyItem(calendar);

  info("deleting the item");
  await runDeleteItem(calendar);
});
