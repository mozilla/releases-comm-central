/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

const { CalEvent } = ChromeUtils.import("resource:///modules/CalEvent.jsm");
const { CalTodo } = ChromeUtils.import("resource:///modules/CalTodo.jsm");

/* globals calFilter */
Services.scriptloader.loadSubScript("chrome://calendar/content/widgets/calendar-filter.js");

async function promiseItems(filter, calendar) {
  return cal.iterate.streamToArray(filter.getItems(calendar));
}

add_task(() => new Promise(resolve => do_calendar_startup(resolve)));

add_task(async function testDateRangeFilter() {
  let calendar = CalendarTestUtils.createProxyCalendar("test");

  let testItems = {};
  for (let [title, startDate, endDate] of [
    ["before", "20210720", "20210721"],
    ["during", "20210820", "20210821"],
    ["after", "20210920", "20210921"],
    ["overlaps_start", "20210720", "20210804"],
    ["overlaps_end", "20210820", "20210904"],
    ["overlaps_both", "20210720", "20210904"],
  ]) {
    let event = new CalEvent();
    event.id = cal.getUUID();
    event.title = title;
    event.startDate = cal.createDateTime(startDate);
    event.endDate = cal.createDateTime(endDate);
    await calendar.addItem(event);
    testItems[title] = event;
  }

  // Create a new filter.

  let filter = new calFilter();
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
  let calendar = CalendarTestUtils.createProxyCalendar("test");

  let event = new CalEvent();
  event.id = cal.getUUID();
  event.title = "New event";
  event.startDate = cal.createDateTime("20210803T205500Z");
  event.endDate = cal.createDateTime("20210803T210200Z");
  await calendar.addItem(event);

  let task = new CalTodo();
  task.id = cal.getUUID();
  task.title = "New task";
  task.entryDate = cal.createDateTime("20210806T090000Z");
  task.dueDate = cal.createDateTime("20210810T140000Z");
  await calendar.addItem(task);

  // Create a new filter.

  let filter = new calFilter();
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
