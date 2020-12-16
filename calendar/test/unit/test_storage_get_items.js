/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalStorageCalendar.getItems method.
 */

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/CalendarTestUtils.jsm"
);
const { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
const { CalTodo } = ChromeUtils.import("resource:///modules/CalTodo.jsm");

do_get_profile();

/**
 * The bug we are interested in testing requires the calendar to clear its
 * caches in order to take effect. Since we can't directly access the internals
 * of the calendar here, we instead provide a custom function that lets us
 * create more than one calendar with the same id.
 */
function createStorageCalendar(id) {
  let db = Services.dirsvc.get("TmpD", Ci.nsIFile);
  db.append("test_storage.sqlite");
  let uri = Services.io.newFileURI(db);

  // Make sure timezone service is initialized
  Cc["@mozilla.org/calendar/timezone-service;1"].getService(Ci.calIStartupService).startup(null);

  let calendar = Cc["@mozilla.org/calendar/calendar;1?type=storage"].createInstance(
    Ci.calISyncWriteCalendar
  );

  calendar.uri = uri;
  calendar.id = id;
  return cal.async.promisifyCalendar(calendar);
}

/**
 * Tests that recurring event/todo exceptions have their properties properly
 * loaded. See bug 1664731.
 *
 * @param {number} filterType - Number indicating the filter type.
 * @param {calIITemBase} originalItem - The original item to add to the calendar.
 * @param {object} originalProps - The initial properites of originalItem we
 *  change.
 * @param {object} changedProps - The changed properties of originalItem..
 */
async function doPropertiesTest(filterType, originalItem, originalProps, changedProps) {
  for (let [key, value] of Object.entries(originalProps)) {
    if (key == "CATEGORIES") {
      originalItem.setCategories(value);
    } else {
      originalItem.setProperty(key, value);
    }
  }

  let calId = cal.getUUID();
  let calendar = createStorageCalendar(calId);
  await calendar.addItem(originalItem);

  let filter =
    filterType |
    Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL |
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;

  let savedItems = await calendar.getItems(
    filter,
    0,
    cal.createDateTime("20201201T000000Z"),
    cal.createDateTime("20201231T000000Z")
  );

  Assert.equal(savedItems.length, 5, `saved ${savedItems.length} items successfully`);

  // Ensure all occurrences have the correct properties initially.
  for (let item of savedItems) {
    for (let [key, value] of Object.entries(originalProps)) {
      if (key == "CATEGORIES") {
        Assert.equal(
          item.getCategories().join(),
          value.join(),
          `item categories are set to ${value}`
        );
      } else {
        Assert.equal(item.getProperty(key), value, `item property "${key}" is set to "${value}"`);
      }
    }
  }

  // Grab the occurrence whose properties we want to modify.
  let targetOccurrence = savedItems[2];
  let targetException = targetOccurrence.clone();

  let targetDate =
    filterType & Ci.calICalendar.ITEM_FILTER_TYPE_TODO
      ? targetOccurrence.entryDate
      : targetOccurrence.startDate;

  targetDate = targetDate.clone();

  // Make the changes to the properties.
  for (let [key, value] of Object.entries(changedProps)) {
    if (key == "CATEGORIES") {
      targetException.setCategories(value);
    } else {
      targetException.setProperty(key, value);
    }
  }

  await calendar.modifyItem(
    cal.itip.prepareSequence(targetException, targetOccurrence),
    targetOccurrence
  );

  // Get a fresh copy of the items by using a new calendar with the same id.
  let itemsAfterUpdate = await createStorageCalendar(calId).getItems(
    filter,
    0,
    cal.createDateTime("20201201T000000Z"),
    cal.createDateTime("20201231T000000Z")
  );

  Assert.equal(itemsAfterUpdate.length, 5, "expected occurrence count retrieved from query");

  // Compare each property we changed to ensure the target occurrence has
  // the properties we expect.
  for (let item of itemsAfterUpdate) {
    let isException = targetDate.compare(item.recurrenceId) == 0;
    let label = isException ? "occurrence exception" : "unmodified occurrence";
    let checkedProps = isException ? changedProps : originalProps;

    for (let [key, value] of Object.entries(checkedProps)) {
      if (key == "CATEGORIES") {
        Assert.equal(
          item.getCategories().join(),
          value.join(),
          `item categories are set to ${value}`
        );
      } else {
        Assert.equal(
          item.getProperty(key),
          value,
          `property "${key}" is set to "${value}" for ${label}`
        );
      }
    }
  }
}

/**
 * Test event exceptions load their properties.
 */
add_task(async function testEventPropertiesForRecurringExceptionsLoad() {
  let event = new CalEvent(CalendarTestUtils.dedent`
      BEGIN:VEVENT
      CREATED:20201211T000000Z
      LAST-MODIFIED:20201211T000000Z
      DTSTAMP:20201210T080410Z
      UID:c1a6cfe7-7fbb-4bfb-a00d-861e07c649a5
      SUMMARY:Original Test Event
      DTSTART:20201211T000000Z
      DTEND:20201211T110000Z
      RRULE:FREQ=DAILY;UNTIL=20201215T140000Z
      END:VEVENT
    `);

  let originalProps = {
    DESCRIPTION: "This is a test event.",
    CATEGORIES: ["Birthday"],
    LOCATION: "Castara",
  };

  let changedProps = {
    DESCRIPTION: "This is an edited occurrence.",
    CATEGORIES: ["Holiday"],
    LOCATION: "Georgetown",
  };

  return doPropertiesTest(
    Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
    event,
    originalProps,
    changedProps
  );
});

/**
 * Test todo exceptions load their properties.
 */
add_task(async function testTodoPropertiesForRecurringExceptionsLoad() {
  let todo = new CalTodo(CalendarTestUtils.dedent`
      BEGIN:VTODO
      CREATED:20201211T000000Z
      LAST-MODIFIED:20201211T000000Z
      DTSTAMP:20201210T080410Z
      UID:c1a6cfe7-7fbb-4bfb-a00d-861e07c649a5
      SUMMARY:Original Test Event
      DTSTART:20201211T000000Z
      DTEND:20201211T110000Z
      RRULE:FREQ=DAILY;UNTIL=20201215T140000Z
      END:VTODO
    `);

  let originalProps = {
    DESCRIPTION: "This is a test todo.",
    CATEGORIES: ["Birthday"],
    LOCATION: "Castara",
    STATUS: "NEEDS-ACTION",
  };

  let changedProps = {
    DESCRIPTION: "This is an edited occurrence.",
    CATEGORIES: ["Holiday"],
    LOCATION: "Georgetown",
    STATUS: "COMPLETE",
  };

  return doPropertiesTest(Ci.calICalendar.ITEM_FILTER_TYPE_TODO, todo, originalProps, changedProps);
});
