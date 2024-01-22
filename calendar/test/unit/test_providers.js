/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* eslint no-useless-concat: "off" */

var icalStringArray = [
  // Comments refer to the range defined in testGetItems().
  // 1: one-hour event
  "BEGIN:VEVENT\n" + "DTSTART:20020402T114500Z\n" + "DTEND:20020402T124500Z\n" + "END:VEVENT\n",
  // 2: Test a zero-length event with DTSTART and DTEND
  "BEGIN:VEVENT\n" + "DTSTART:20020402T000000Z\n" + "DTEND:20020402T000000Z\n" + "END:VEVENT\n",
  // 3: Test a zero-length event with DTSTART and no DTEND
  "BEGIN:VEVENT\n" + "DTSTART:20020402T000000Z\n" + "END:VEVENT\n",
  // 4: Test a zero-length event with DTEND set and no  DTSTART. Invalid!
  "BEGIN:VEVENT\n" + "DTEND:20020402T000000Z\n" + "END:VEVENT\n",
  // 5: one-hour event that is outside the range
  "BEGIN:VEVENT\n" + "DTSTART:20020401T114500Z\n" + "DTEND:20020401T124500Z\n" + "END:VEVENT\n",
  // 6: one-hour event that starts outside the range and ends inside.
  "BEGIN:VEVENT\n" + "DTSTART:20020401T114500Z\n" + "DTEND:20020402T124500Z\n" + "END:VEVENT\n",
  // 7:  one-hour event that starts inside the range and ends outside.
  "BEGIN:VEVENT\n" + "DTSTART:20020402T114500Z\n" + "DTEND:20020403T124500Z\n" + "END:VEVENT\n",
  // 8: one-hour event that starts at the end of the range.
  "BEGIN:VEVENT\n" + "DTSTART:20020403T000000Z\n" + "DTEND:20020403T124500Z\n" + "END:VEVENT\n",
  // 9: allday event that starts at start of range and ends at end of range.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020402\n" +
    "DTEND;VALUE=DATE:20020403\n" +
    "END:VEVENT\n",
  // 10: allday event that starts at end of range.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020403\n" +
    "DTEND;VALUE=DATE:20020404\n" +
    "END:VEVENT\n",
  // 11: allday event that ends at start of range. See bug 333363.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020401\n" +
    "DTEND;VALUE=DATE:20020402\n" +
    "END:VEVENT\n",
  // 12: daily recurring allday event. parent item in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020402\n" +
    "DTEND;VALUE=DATE:20020403\n" +
    "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=10\n" +
    "END:VEVENT\n",
  // 13: daily recurring allday event. First occurrence in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020401\n" +
    "DTEND;VALUE=DATE:20020402\n" +
    "RRULE:FREQ=DAILY;COUNT=10\n" +
    "END:VEVENT\n",
  // 14: two-daily recurring allday event. Not in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART;VALUE=DATE:20020401\n" +
    "DTEND;VALUE=DATE:20020402\n" +
    "RRULE:FREQ=DAILY;INTERVAL=2;COUNT=10\n" +
    "END:VEVENT\n",
  // 15: daily recurring one-hour event. Parent in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART:20020402T100000Z\n" +
    "DTEND:20020402T110000Z\n" +
    "RRULE:FREQ=DAILY;COUNT=10\n" +
    "END:VEVENT\n",
  // 16: daily recurring one-hour event. Occurrence in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART:20020401T100000Z\n" +
    "DTEND:20020401T110000Z\n" +
    "RRULE:FREQ=DAILY;COUNT=10\n" +
    "END:VEVENT\n",
  // 17: zero-length task with DTSTART and DUE set at start of range.
  "BEGIN:VTODO\n" + "DTSTART:20020402T000000Z\n" + "DUE:20020402T000000Z\n" + "END:VTODO\n",
  // 18: zero-length event with only DTSTART set at start of range.
  "BEGIN:VTODO\n" + "DTSTART:20020402T000000Z\n" + "END:VTODO\n",
  // 19: zero-length event with only DUE set at start of range.
  "BEGIN:VTODO\n" + "DUE:20020402T000000Z\n" + "END:VTODO\n",
  // 20: one-hour todo within the range.
  "BEGIN:VTODO\n" + "DTSTART:20020402T110000Z\n" + "DUE:20020402T120000Z\n" + "END:VTODO\n",
  // 21: zero-length todo that starts at end of range.
  "BEGIN:VTODO\n" + "DTSTART:20020403T000000Z\n" + "DUE:20020403T010000Z\n" + "END:VTODO\n",
  // 22: one-hour todo that ends at start of range.
  "BEGIN:VTODO\n" + "DTSTART:20020401T230000Z\n" + "DUE:20020402T000000Z\n" + "END:VTODO\n",
  // 23: daily recurring one-hour event. Parent in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART:20020402T000000\n" +
    "DTEND:20020402T010000\n" +
    "RRULE:FREQ=DAILY;COUNT=10\n" +
    "END:VEVENT\n",
  // 24: daily recurring 24-hour event. Parent in the range.
  "BEGIN:VEVENT\n" +
    "DTSTART:20020402T000000\n" +
    "DTEND:20020403T000000\n" +
    "RRULE:FREQ=DAILY;COUNT=10\n" +
    "END:VEVENT\n",
  // 25: todo that has neither start nor due date set.
  // Should be returned on every getItems() call. See bug 405459.
  "BEGIN:VTODO\n" + "SUMMARY:Todo\n" + "END:VTODO\n",
  // 26: todo that has neither start nor due date but
  // a completion time set after range. See bug 405459.
  "BEGIN:VTODO\n" + "SUMMARY:Todo\n" + "COMPLETED:20030404T000001\n" + "END:VTODO\n",
  // 27: todo that has neither start nor due date but a
  // completion time set in the range. See bug 405459.
  "BEGIN:VTODO\n" + "SUMMARY:Todo\n" + "COMPLETED:20020402T120001\n" + "END:VTODO\n",
  // 28: todo that has neither start nor due date but a
  // completion time set before the range. See bug 405459.
  "BEGIN:VTODO\n" + "SUMMARY:Todo\n" + "COMPLETED:20020402T000000\n" + "END:VTODO\n",
  // 29: todo that has neither start nor due date set,
  // has the status "COMPLETED" but no completion time. See bug 405459.
  "BEGIN:VTODO\n" + "SUMMARY:Todo\n" + "STATUS:COMPLETED\n" + "END:VTODO\n",
  // 30: one-hour event with duration (in the range). See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020402T114500Z\n" + "DURATION:PT1H\n" + "END:VEVENT\n",
  // 31: one-hour event with duration (after the range). See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020403T000000Z\n" + "DURATION:PT1H\n" + "END:VEVENT\n",
  // 32: one-hour event with duration (before the range). See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020401T230000Z\n" + "DURATION:PT1H\n" + "END:VEVENT\n",
  // 33: one-day event with duration. Starts in the range, Ends outside. See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020402T120000Z\n" + "DURATION:P1D\n" + "END:VEVENT\n",
  // 34: one-day event with duration. Starts before the range. Ends inside. See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020401T120000Z\n" + "DURATION:P1D\n" + "END:VEVENT\n",
  // 35: one-day event with duration (before the range). See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020401T000000Z\n" + "DURATION:P1D\n" + "END:VEVENT\n",
  // 36: one-day event with duration (after the range). See bug 390492.
  "BEGIN:VEVENT\n" + "DTSTART:20020403T000000Z\n" + "DURATION:P1D\n" + "END:VEVENT\n",
];

add_task(async function testIcalData() {
  // First entry is test number, second item is expected result for testGetItems().
  const wantedArray = [
    [1, 1],
    [2, 1],
    [3, 1],
    [5, 0],
    [6, 1],
    [7, 1],
    [8, 0],
    [9, 1],
    [10, 0],
    [11, 0],
    [12, 1],
    [13, 1],
    [14, 0],
    [15, 1],
    [16, 1],
    [17, 1],
    [18, 1],
    [19, 1],
    [20, 1],
    [21, 0],
    [22, 0],
    [23, 1],
    [24, 1],
    [25, 1],
    [26, 1],
    [27, 1],
    [28, 0],
    [29, 1],
    [30, 1],
    [31, 0],
    [32, 0],
    [33, 1],
    [34, 1],
    [35, 0],
    [36, 0],
  ];

  for (let i = 0; i < wantedArray.length; i++) {
    const itemArray = wantedArray[i];
    // Correct for 1 to stay in synch with test numbers.
    const calItem = icalStringArray[itemArray[0] - 1];

    let item;
    if (calItem.search(/VEVENT/) != -1) {
      item = createEventFromIcalString(calItem);
    } else if (calItem.search(/VTODO/) != -1) {
      item = createTodoFromIcalString(calItem);
    }

    print("Test " + wantedArray[i][0]);
    await testGetItems(item, itemArray[1]);
    await testGetItem(item);
  }

  /**
   * Adds aItem to a calendar and performs a getItems() call using the
   * following range:
   *   2002/04/02 0:00 - 2002/04/03 0:00
   * The amount of returned items is compared with expected amount (aResult).
   * Additionally, the properties of the returned item are compared with aItem.
   */
  async function testGetItems(aItem, aResult) {
    for (const calendar of [getStorageCal(), getMemoryCal()]) {
      await checkCalendar(calendar, aItem, aResult);
    }
  }

  async function checkCalendar(calendar, aItem, aResult) {
    // add item to calendar
    await calendar.addItem(aItem);

    // construct range
    const rangeStart = createDate(2002, 3, 2); // 3 = April
    const rangeEnd = rangeStart.clone();
    rangeEnd.day += 1;

    // filter options
    const filter =
      Ci.calICalendar.ITEM_FILTER_TYPE_ALL |
      Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES |
      Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;

    // implement listener
    let count = 0;
    for await (const items of cal.iterate.streamValues(
      calendar.getItems(filter, 0, rangeStart, rangeEnd)
    )) {
      if (items.length) {
        count += items.length;
        for (let i = 0; i < items.length; i++) {
          // Don't check creationDate as it changed when we added the item to the database.
          compareItemsSpecific(items[i].parentItem, aItem, [
            "start",
            "end",
            "duration",
            "title",
            "priority",
            "privacy",
            "status",
            "alarmLastAck",
            "recurrenceStartDate",
          ]);
        }
      }
    }
    equal(count, aResult);
  }

  /**
   * (1) Add aItem to a calendar.
   * The properties of the added item are compared with the passed item.
   * (2) Perform a getItem() call.
   * The properties of the returned item are compared with the passed item.
   */
  async function testGetItem(aItem) {
    // get calendars
    const calArray = [];
    calArray.push(getStorageCal());
    calArray.push(getMemoryCal());
    for (const calendar of calArray) {
      let count = 0;
      let returnedItem = null;

      const aDetail = await calendar.addItem(aItem);
      compareItemsSpecific(aDetail, aItem);
      // perform getItem() on calendar
      returnedItem = await calendar.getItem(aDetail.id);
      count = returnedItem ? 1 : 0;

      equal(count, 1);
      // Don't check creationDate as it changed when we added the item to the database.
      compareItemsSpecific(returnedItem, aItem, [
        "start",
        "end",
        "duration",
        "title",
        "priority",
        "privacy",
        "status",
        "alarmLastAck",
        "recurrenceStartDate",
      ]);
    }
  }
});

add_task(async function testMetaData() {
  async function testMetaData_(aCalendar) {
    dump("testMetaData_() calendar type: " + aCalendar.type + "\n");
    const event1 = createEventFromIcalString(
      "BEGIN:VEVENT\n" + "DTSTART;VALUE=DATE:20020402\n" + "END:VEVENT\n"
    );

    event1.id = "item1";
    await aCalendar.addItem(event1);

    aCalendar.setMetaData("item1", "meta1");
    equal(aCalendar.getMetaData("item1"), "meta1");
    equal(aCalendar.getMetaData("unknown"), null);

    const event2 = event1.clone();
    event2.id = "item2";
    await aCalendar.addItem(event2);

    aCalendar.setMetaData("item2", "meta2-");
    equal(aCalendar.getMetaData("item2"), "meta2-");

    aCalendar.setMetaData("item2", "meta2");
    equal(aCalendar.getMetaData("item2"), "meta2");

    let ids = aCalendar.getAllMetaDataIds();
    let values = aCalendar.getAllMetaDataValues();
    equal(values.length, 2);
    equal(ids.length, 2);
    ok(ids[0] == "item1" || ids[1] == "item1");
    ok(ids[0] == "item2" || ids[1] == "item2");
    ok(values[0] == "meta1" || values[1] == "meta1");
    ok(values[0] == "meta2" || values[1] == "meta2");

    await aCalendar.deleteItem(event1);

    equal(aCalendar.getMetaData("item1"), null);
    ids = aCalendar.getAllMetaDataIds();
    values = aCalendar.getAllMetaDataValues();
    equal(values.length, 1);
    equal(ids.length, 1);
    Assert.equal(ids[0], "item2");
    Assert.equal(values[0], "meta2");

    aCalendar.deleteMetaData("item2");
    equal(aCalendar.getMetaData("item2"), null);
    values = aCalendar.getAllMetaDataValues();
    ids = aCalendar.getAllMetaDataIds();
    equal(values.length, 0);
    equal(ids.length, 0);

    aCalendar.setMetaData("item2", "meta2");
    equal(aCalendar.getMetaData("item2"), "meta2");
    await new Promise(resolve => {
      aCalendar.QueryInterface(Ci.calICalendarProvider).deleteCalendar(aCalendar, {
        onCreateCalendar: () => {},
        onDeleteCalendar: resolve,
      });
    });
    values = aCalendar.getAllMetaDataValues();
    ids = aCalendar.getAllMetaDataIds();
    equal(values.length, 0);
    equal(ids.length, 0);

    aCalendar.deleteMetaData("unknown"); // check graceful return
  }

  await testMetaData_(getMemoryCal());
  await testMetaData_(getStorageCal());
});

/*
async function testOfflineStorage(storageGetter, isRecurring) {
    let storage = storageGetter();
    print(`Running offline storage test for ${storage.type} calendar for ${isRecurring ? "recurring" : "normal"} item`);

    let event1 = createEventFromIcalString("BEGIN:VEVENT\n" +
                                           "DTSTART;VALUE=DATE:20020402\n" +
                                           "DTEND;VALUE=DATE:20020403\n" +
                                           "SUMMARY:event1\n" +
                                           (isRecurring ? "RRULE:FREQ=DAILY;INTERVAL=1;COUNT=10\n" : "") +
                                           "END:VEVENT\n");

    event1 = await storage.addItem(event1);

    // Make sure the event is really in the calendar
    let result = await storage.getAllItems();
    equal(result.length, 1);

    // When searching for offline added items, there are none
    let filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 0);

    // Mark the item as offline added
    await storage.addOfflineItem(event1);

    // Now there should be an offline item
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 1);

    let event2 = event1.clone();
    event2.title = "event2";

    event2 = await storage.modifyItem(event2, event1);

    await storage.modifyOfflineItem(event2);

    // The flag should still be offline added, as it was already marked as such
    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 1);

    // Reset the flag
    await storage.resetItemOfflineFlag(event2);

    // No more offline items after resetting the flag
    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 0);

    // Setting modify flag without one set should actually set that flag
    await storage.modifyOfflineItem(event2);
    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_CREATED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 0);

    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_MODIFIED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 1);

    // Setting the delete flag should modify the flag accordingly
    await storage.deleteOfflineItem(event2);
    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_MODIFIED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 0);

    filter = Ci.calICalendar.ITEM_FILTER_ALL_ITEMS | Ci.calICalendar.ITEM_FILTER_OFFLINE_DELETED;
    result = await storage.getItems(filter, 0, null, null);
    equal(result.length, 1);

    // Setting the delete flag on an offline added item should remove it
    await storage.resetItemOfflineFlag(event2);
    await storage.addOfflineItem(event2);
    await storage.deleteOfflineItem(event2);
    result = await storage.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
    equal(result.length, 0);
}

add_task(testOfflineStorage.bind(null, () => getMemoryCal(), false));
add_task(testOfflineStorage.bind(null, () => getStorageCal(), false));
add_task(testOfflineStorage.bind(null, () => getMemoryCal(), true));
add_task(testOfflineStorage.bind(null, () => getStorageCal(), true));
*/
