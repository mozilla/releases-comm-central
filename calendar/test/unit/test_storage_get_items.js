/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for the CalStorageCalendar.getItems method.
 */

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
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
  return calendar;
}

/**
 * Tests that recurring event/todo exceptions have their properties properly
 * loaded. See bug 1664731.
 *
 * @param {number} filterType - Number indicating the filter type.
 * @param {calIITemBase} originalItem - The original item to add to the calendar.
 * @param {object} originalProps - The initial properites of originalItem to
 *  expect.
 * @param {object[]} changedProps - A list containing property values to update
 *  each occurrence with or null. The length indicates how many occurrences to
 *  expect.
 */
async function doPropertiesTest(filterType, originalItem, originalProps, changedPropList) {
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

  let savedItems = await calendar.getItemsAsArray(
    filter,
    0,
    cal.createDateTime("20201201T000000Z"),
    cal.createDateTime("20201231T000000Z")
  );

  Assert.equal(
    savedItems.length,
    changedPropList.length,
    `created ${changedPropList.length} items successfully`
  );

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

  // Modify the occurrences that have new properties set in changedPropList.
  for (let idx = 0; idx < changedPropList.length; idx++) {
    let changedProps = changedPropList[idx];
    if (changedProps) {
      let targetOccurrence = savedItems[idx];
      let targetException = targetOccurrence.clone();

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

      // Refresh the saved items list after the change.
      savedItems = await calendar.getItemsAsArray(
        filter,
        0,
        cal.createDateTime("20201201T000000Z"),
        cal.createDateTime("20201231T000000Z")
      );
    }
  }

  // Get a fresh copy of the occurrences by using a new calendar with the
  // same id.
  let itemsAfterUpdate = await createStorageCalendar(calId).getItemsAsArray(
    filter,
    0,
    cal.createDateTime("20201201T000000Z"),
    cal.createDateTime("20201231T000000Z")
  );

  Assert.equal(
    itemsAfterUpdate.length,
    changedPropList.length,
    `count of occurrences retrieved after update is ${changedPropList.length}`
  );

  // Compare each property of each occurrence to ensure the changed
  // occurrences have the values we expect.
  for (let i = 0; i < itemsAfterUpdate.length; i++) {
    let item = itemsAfterUpdate[i];
    let isException = changedPropList[i] != null;
    let label = isException ? `modified occurrence ${i}` : `unmodified occurrence ${i}`;
    let checkedProps = isException ? changedPropList[i] : originalProps;

    for (let [key, value] of Object.entries(checkedProps)) {
      if (key == "CATEGORIES") {
        Assert.equal(
          item.getCategories().join(),
          value.join(),
          `item categories has value "${value}"`
        );
      } else {
        Assert.equal(
          item.getProperty(key),
          value,
          `property "${key}" has value "${value}" for "${label}"`
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

  let changedProps = [
    null,
    null,
    {
      DESCRIPTION: "This is an edited occurrence.",
      CATEGORIES: ["Holiday"],
      LOCATION: "Georgetown",
    },
    null,
    null,
  ];

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

  let changedProps = [
    null,
    null,
    {
      DESCRIPTION: "This is an edited occurrence.",
      CATEGORIES: ["Holiday"],
      LOCATION: "Georgetown",
      STATUS: "COMPLETE",
    },
    null,
    null,
  ];

  return doPropertiesTest(Ci.calICalendar.ITEM_FILTER_TYPE_TODO, todo, originalProps, changedProps);
});

/**
 * Tests calling getItems() does not overwrite subsequent event occurrence
 * exceptions with their parent item. See bug 1686466.
 */
add_task(async function testRecurringEventChangesAreNotHiddenByCache() {
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
    LOCATION: "San Juan",
  };

  let changedProps = [
    null,
    {
      LOCATION: "Buenos Aries",
    },
    {
      LOCATION: "Bridgetown",
    },
    {
      LOCATION: "Freetown",
    },
    null,
  ];

  return doPropertiesTest(
    Ci.calICalendar.ITEM_FILTER_TYPE_EVENT,
    event,
    originalProps,
    changedProps,
    true
  );
});

/**
 * Tests calling getItems() does not overwrite subsequent todo occurrence
 * exceptions with their parent item. See bug 1686466.
 */
add_task(async function testRecurringTodoChangesNotHiddenByCache() {
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

  let changedProps = [
    null,
    {
      STATUS: "COMPLETE",
    },
    {
      STATUS: "COMPLETE",
    },
    {
      STATUS: "COMPLETE",
    },
    null,
  ];

  return doPropertiesTest(Ci.calICalendar.ITEM_FILTER_TYPE_TODO, todo, originalProps, changedProps);
});
