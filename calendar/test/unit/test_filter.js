/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");

/* globals calFilter, CalReadableStreamFactory */
Services.scriptloader.loadSubScript("chrome://calendar/content/widgets/calendar-filter.js");

async function promiseItems(filter, calendar) {
  return cal.iterate.streamToArray(filter.getItems(calendar));
}

add_task(() => new Promise(resolve => do_calendar_startup(resolve)));

add_task(async function testDateRangeFilter() {
  const calendar = CalendarTestUtils.createCalendar("test");

  const testItems = {};
  for (const [title, startDate, endDate] of [
    ["before", "20210720", "20210721"],
    ["during", "20210820", "20210821"],
    ["after", "20210920", "20210921"],
    ["overlaps_start", "20210720", "20210804"],
    ["overlaps_end", "20210820", "20210904"],
    ["overlaps_both", "20210720", "20210904"],
  ]) {
    const event = new CalEvent();
    event.id = cal.getUUID();
    event.title = title;
    event.startDate = cal.createDateTime(startDate);
    event.endDate = cal.createDateTime(endDate);
    await calendar.addItem(event);
    testItems[title] = event;
  }

  // Create a new filter.

  const filter = new calFilter();
  filter.startDate = cal.createDateTime("20210801");
  filter.endDate = cal.createDateTime("20210831");

  // Test dateRangeFilter.

  Assert.ok(!filter.dateRangeFilter(testItems.before), "task doesn't pass date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.during), "task passes date range filter");
  Assert.ok(!filter.dateRangeFilter(testItems.after), "task doesn't pass date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.overlaps_start), "task passes date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.overlaps_end), "task passes date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.overlaps_both), "task passes date range filter");

  // Test isItemInFilters.

  Assert.ok(!filter.isItemInFilters(testItems.before), "task doesn't pass all filters");
  Assert.ok(filter.isItemInFilters(testItems.during), "task passes all filters");
  Assert.ok(!filter.isItemInFilters(testItems.after), "task doesn't pass all filters");
  Assert.ok(filter.isItemInFilters(testItems.overlaps_start), "task passes all filters");
  Assert.ok(filter.isItemInFilters(testItems.overlaps_end), "task passes all filters");
  Assert.ok(filter.isItemInFilters(testItems.overlaps_both), "task passes all filters");

  // Test getItems.

  let items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 4, "getItems returns expected number of items");
  Assert.equal(items[0].title, "during", "correct item returned");
  Assert.equal(items[1].title, "overlaps_start", "correct item returned");
  Assert.equal(items[2].title, "overlaps_end", "correct item returned");
  Assert.equal(items[3].title, "overlaps_both", "correct item returned");

  // Change the date of the filter and test it all again.

  filter.startDate = cal.createDateTime("20210825");
  filter.endDate = cal.createDateTime("20210905");

  // Test dateRangeFilter.

  Assert.ok(!filter.dateRangeFilter(testItems.before), "task doesn't pass date range filter");
  Assert.ok(!filter.dateRangeFilter(testItems.during), "task passes date range filter");
  Assert.ok(!filter.dateRangeFilter(testItems.after), "task doesn't pass date range filter");
  Assert.ok(!filter.dateRangeFilter(testItems.overlaps_start), "task passes date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.overlaps_end), "task passes date range filter");
  Assert.ok(filter.dateRangeFilter(testItems.overlaps_both), "task passes date range filter");

  // Test isItemInFilters.

  Assert.ok(!filter.isItemInFilters(testItems.before), "task doesn't pass all filters");
  Assert.ok(!filter.isItemInFilters(testItems.during), "task passes all filters");
  Assert.ok(!filter.isItemInFilters(testItems.after), "task doesn't pass all filters");
  Assert.ok(!filter.isItemInFilters(testItems.overlaps_start), "task passes all filters");
  Assert.ok(filter.isItemInFilters(testItems.overlaps_end), "task passes all filters");
  Assert.ok(filter.isItemInFilters(testItems.overlaps_both), "task passes all filters");

  // Test getItems.

  items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 2, "getItems returns expected number of items");
  Assert.equal(items[0].title, "overlaps_end", "correct item returned");
  Assert.equal(items[1].title, "overlaps_both", "correct item returned");
});

add_task(async function testItemTypeFilter() {
  const calendar = CalendarTestUtils.createCalendar("test");

  const event = new CalEvent();
  event.id = cal.getUUID();
  event.title = "New event";
  event.startDate = cal.createDateTime("20210803T205500Z");
  event.endDate = cal.createDateTime("20210803T210200Z");
  await calendar.addItem(event);

  const task = new CalTodo();
  task.id = cal.getUUID();
  task.title = "New task";
  task.entryDate = cal.createDateTime("20210806T090000Z");
  task.dueDate = cal.createDateTime("20210810T140000Z");
  await calendar.addItem(task);

  // Create a new filter.

  const filter = new calFilter();
  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
  filter.startDate = cal.createDateTime("20210801");
  filter.endDate = cal.createDateTime("20210831");

  // Check both item types pass ITEM_FILTER_TYPE_ALL.

  Assert.ok(filter.itemTypeFilter(task), "task passes item type filter");
  Assert.ok(filter.itemTypeFilter(event), "event passes item type filter");

  Assert.ok(filter.isItemInFilters(task), "task passes all filters");
  Assert.ok(filter.isItemInFilters(event), "event passes all filters");

  let items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 2, "getItems returns expected number of items");
  Assert.equal(items[0].title, "New event", "correct item returned");
  Assert.equal(items[1].title, "New task", "correct item returned");

  // Check only tasks pass ITEM_FILTER_TYPE_TODO.

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;

  Assert.ok(filter.itemTypeFilter(task), "task passes item type filter");
  Assert.ok(!filter.itemTypeFilter(event), "event doesn't pass item type filter");

  Assert.ok(filter.isItemInFilters(task), "task passes all filters");
  Assert.ok(!filter.isItemInFilters(event), "event doesn't pass all filters");

  items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 1, "getItems returns expected number of items");
  Assert.equal(items[0].title, "New task", "correct item returned");

  // Check only events pass ITEM_FILTER_TYPE_EVENT.

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;

  Assert.ok(!filter.itemTypeFilter(task), "task doesn't pass item type filter");
  Assert.ok(filter.itemTypeFilter(event), "event passes item type filter");

  Assert.ok(!filter.isItemInFilters(task), "task doesn't pass all filters");
  Assert.ok(filter.isItemInFilters(event), "event passes all filters");

  items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 1, "getItems returns expected number of items");
  Assert.equal(items[0].title, "New event", "correct item returned");

  // Check neither tasks or events pass ITEM_FILTER_TYPE_JOURNAL.

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_JOURNAL;

  Assert.ok(!filter.itemTypeFilter(event), "event doesn't pass item type filter");
  Assert.ok(!filter.itemTypeFilter(task), "task doesn't pass item type filter");

  Assert.ok(!filter.isItemInFilters(task), "task doesn't pass all filters");
  Assert.ok(!filter.isItemInFilters(event), "event doesn't pass all filters");

  items = await promiseItems(filter, calendar);
  Assert.equal(items.length, 0, "getItems returns expected number of items");
});

add_task(async function testItemTypeFilterTaskCompletion() {
  const calendar = CalendarTestUtils.createCalendar("test");

  const completeTask = new CalTodo();
  completeTask.id = cal.getUUID();
  completeTask.title = "Complete Task";
  completeTask.entryDate = cal.createDateTime("20210806T090000Z");
  completeTask.dueDate = cal.createDateTime("20210810T140000Z");
  completeTask.percentComplete = 100;
  await calendar.addItem(completeTask);

  const incompleteTask = new CalTodo();
  incompleteTask.id = cal.getUUID();
  incompleteTask.title = "Incomplete Task";
  incompleteTask.entryDate = cal.createDateTime("20210806T090000Z");
  incompleteTask.dueDate = cal.createDateTime("20210810T140000Z");
  completeTask.completedDate = null;
  await calendar.addItem(incompleteTask);

  const filter = new calFilter();
  filter.startDate = cal.createDateTime("20210801");
  filter.endDate = cal.createDateTime("20210831");

  const checks = [
    { flags: Ci.calICalendar.ITEM_FILTER_TYPE_TODO, expectComplete: true, expectIncomplete: true },
    {
      flags: Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_YES,
      expectComplete: true,
      expectIncomplete: false,
    },
    {
      flags: Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_NO,
      expectComplete: false,
      expectIncomplete: true,
    },
    {
      flags: Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL,
      expectComplete: true,
      expectIncomplete: true,
    },
  ];

  for (const { flags, expectComplete, expectIncomplete } of checks) {
    info(`testing with flags = ${flags}`);
    filter.itemType = flags;

    Assert.equal(
      filter.itemTypeFilter(completeTask),
      expectComplete,
      "complete task matches item type filter"
    );
    Assert.equal(
      filter.itemTypeFilter(incompleteTask),
      expectIncomplete,
      "incomplete task matches item type filter"
    );

    Assert.equal(
      filter.isItemInFilters(completeTask),
      expectComplete,
      "complete task matches all filters"
    );
    Assert.equal(
      filter.isItemInFilters(incompleteTask),
      expectIncomplete,
      "incomplete task matches all filters"
    );

    const expectedTitles = [];
    if (expectComplete) {
      expectedTitles.push(completeTask.title);
    }
    if (expectIncomplete) {
      expectedTitles.push(incompleteTask.title);
    }
    const items = await promiseItems(filter, calendar);
    Assert.deepEqual(
      items.map(i => i.title),
      expectedTitles,
      "getItems returns correct items"
    );
  }
});

/**
 * Tests that calFilter.getItems uses the correct flags when calling
 * calICalendar.getItems. This is important because calFilter is used both by
 * setting the itemType filter and with a calFilterProperties object.
 */
add_task(async function testGetItemsFilterFlags() {
  const fakeCalendar = {
    getItems(filter, count, rangeStart, rangeEndEx) {
      Assert.equal(filter, expected.filter, "getItems called with the right filter");
      if (expected.rangeStart) {
        Assert.equal(
          rangeStart.compare(expected.rangeStart),
          0,
          "getItems called with the right start date"
        );
      }
      if (expected.rangeEndEx) {
        Assert.equal(
          rangeEndEx.compare(expected.rangeEndEx),
          0,
          "getItems called with the right end date"
        );
      }
      return CalReadableStreamFactory.createEmptyReadableStream();
    },
  };

  // Test the basic item types.
  // A request for TODO items requires one of the ITEM_FILTER_COMPLETED flags,
  // if none are supplied then ITEM_FILTER_COMPLETED_ALL is added.
  // (These flags have no effect on EVENT items.)

  const filter = new calFilter();
  const expected = {
    filter: Ci.calICalendar.ITEM_FILTER_TYPE_ALL | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL,
  };
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
  expected.filter = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  filter.getItems(fakeCalendar);

  // Test that we get occurrences if we have an end date.

  filter.startDate = cal.createDateTime("20220201T000000Z");
  filter.endDate = cal.createDateTime("20220301T000000Z");
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL |
    Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL |
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  expected.rangeStart = filter.startDate;
  expected.rangeEndEx = filter.endDate;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_EVENT | Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO |
    Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL |
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL |
    Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL |
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  filter.getItems(fakeCalendar);

  filter.startDate = null;
  filter.endDate = null;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  delete expected.rangeStart;
  delete expected.rangeEndEx;
  filter.getItems(fakeCalendar);

  // Test that completed tasks are correctly filtered.

  filter.itemType =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_YES;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_YES;
  filter.getItems(fakeCalendar);

  filter.itemType =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
  filter.getItems(fakeCalendar);

  filter.itemType =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  filter.getItems(fakeCalendar);

  filter.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_TODO;
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  filter.getItems(fakeCalendar);

  // Using `applyFilter` needs a selected date or the test dies trying to find the
  // `currentView` function, which doesn't exist in an XPCShell test.
  filter.selectedDate = cal.dtz.now();
  filter.applyFilter("completed");
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO |
    Ci.calICalendar.ITEM_FILTER_COMPLETED_YES |
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES;
  filter.getItems(fakeCalendar);

  filter.applyFilter("open");
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;
  filter.getItems(fakeCalendar);

  filter.applyFilter();
  expected.filter =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_ALL;
  filter.getItems(fakeCalendar);
});
