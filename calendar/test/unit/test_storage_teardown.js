/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

add_setup(async function () {
  do_get_profile();
});

/**
 * Tests that a calendar which has been torn down does not use its finalized
 * statements. Reads can still arrive after profile-change-teardown, and binding
 * parameters of a finalized statement crashes debug builds.
 */
add_task(async function testReadAfterTeardown() {
  const calendar = cal.manager.createCalendar(
    "storage",
    Services.io.newURI("moz-storage-calendar://")
  );
  calendar.id = cal.getUUID();

  // Nothing may read from the calendar before the teardown. The parameters of a
  // statement are only resolved on first use, and that first use is what
  // crashes once the statement has been finalized.
  Assert.ok(!!calendar.wrappedJSObject.mStatements, "the calendar is ready to be used");

  calendar.wrappedJSObject.observe(null, "profile-change-teardown");

  const items = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    null,
    null
  );
  Assert.equal(items.length, 0, "reading after teardown returns nothing");
});
