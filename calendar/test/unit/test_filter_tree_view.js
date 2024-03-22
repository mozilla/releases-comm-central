/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalRecurrenceInfo } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceInfo.sys.mjs"
);
const { CalRecurrenceRule } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceRule.sys.mjs"
);

const { TreeSelection } = ChromeUtils.importESModule(
  "chrome://messenger/content/tree-selection.mjs"
);

Services.scriptloader.loadSubScript("chrome://messenger/content/jsTreeView.js");
Services.scriptloader.loadSubScript("chrome://calendar/content/widgets/calendar-filter.js");
/* globals CalendarFilteredTreeView */
Services.scriptloader.loadSubScript(
  "chrome://calendar/content/widgets/calendar-filter-tree-view.js"
);

const testItems = {};

add_setup(async function () {
  await new Promise(resolve => do_calendar_startup(resolve));

  // Create events useful for testing.
  for (const [title, startDate, endDate] of [
    ["one", "20221126T010000", "20221126T013000"],
    ["two", "20221126T020000", "20221126T073000"],
    ["three", "20221126T030000", "20221126T033000"],
    ["four", "20221126T040000", "20221126T043000"],
    ["five", "20221126T050000", "20221126T053000"],
    ["six", "20221126T060000", "20221126T063000"],
  ]) {
    const item = new CalEvent();
    item.id = cal.getUUID();
    item.title = title;
    item.startDate = cal.createDateTime(startDate);
    item.endDate = cal.createDateTime(endDate);
    testItems[title] = item;
  }

  const recurring = new CalEvent();
  recurring.id = cal.getUUID();
  recurring.title = "recurring event";
  recurring.startDate = cal.createDateTime("20221124T053000");
  recurring.endDate = cal.createDateTime("20221124T063000");

  const recurRule = cal.createRecurrenceRule();
  recurRule.type = "DAILY";
  recurRule.byCount = true;
  recurRule.count = 5;

  const recurInfo = new CalRecurrenceInfo(recurring);
  recurInfo.appendRecurrenceItem(recurRule);

  recurring.recurrenceInfo = recurInfo;

  testItems.recurring = recurring;
});

add_task(async function testAddItemsAndSort() {
  const { calendar, view } = await initializeCalendarAndView();

  assertViewContainsItemsInOrder(view);

  await calendar.addItem(testItems.one);
  assertViewContainsItemsInOrder(view, "one");

  await calendar.addItem(testItems.three);
  await calendar.addItem(testItems.four);
  assertViewContainsItemsInOrder(view, "one", "three", "four");

  // Verify that items are sorted by start time by default.
  await calendar.addItem(testItems.two);
  assertViewContainsItemsInOrder(view, "one", "two", "three", "four");

  // Change sort to ascending by title.
  view.cycleHeader({ id: "title" });
  assertViewContainsItemsInOrder(view, "four", "one", "three", "two");

  // Verify that items are sorted appropriately on add.
  await calendar.addItem(testItems.five);
  assertViewContainsItemsInOrder(view, "five", "four", "one", "three", "two");

  // Change sort to descending by title.
  view.cycleHeader({ id: "title" });
  assertViewContainsItemsInOrder(view, "two", "three", "one", "four", "five");

  await calendar.addItem(testItems.six);
  assertViewContainsItemsInOrder(view, "two", "three", "six", "one", "four", "five");

  // Re-sort by start date for testing recurrences.
  view.cycleHeader({ id: "startDate" });

  // Verify that recurring events which occur more than once in the filter range
  // show up more than once. Also verify that occurrences outside the filter
  // range do not display.
  await calendar.addItem(testItems.recurring);
  assertViewContainsItemsInOrder(
    view,
    "one",
    "two",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

add_task(async function testInitializeWithExistingCalenderEvents() {
  const calendar = CalendarTestUtils.createCalendar("test", "storage");
  calendar.setProperty("calendar-main-in-composite", true);

  // Add items to the calendar before we initialize the view.
  await calendar.addItem(testItems.one);
  await calendar.addItem(testItems.three);
  await calendar.addItem(testItems.four);

  const view = new CalendarFilteredTreeView();
  view.startDate = cal.createDateTime("20221126");
  view.endDate = cal.createDateTime("20221128");
  view.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;

  const tree = {
    _batchUpdated: false,
    _batchDepth: false,

    beginUpdateBatch() {},
    endUpdateBatch() {},
    invalidateRow() {},
  };
  view.setTree(tree);

  // Wait for the view to fetch items and update.
  await view.activate();

  // Verify that items added to the calendar before initializing are displayed.
  assertViewContainsItemsInOrder(view, "one", "three", "four");

  // Verify that adding further items causes them to be displayed as well.
  await calendar.addItem(testItems.two);
  assertViewContainsItemsInOrder(view, "one", "two", "three", "four");

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

add_task(async function testRemoveItems() {
  const { calendar, view } = await initializeCalendarAndView();

  // Record the calendar items so we can use them to delete.
  const calendarItems = {};
  for (const key in testItems) {
    calendarItems[key] = await calendar.addItem(testItems[key]);
  }

  // Sanity check.
  assertViewContainsItemsInOrder(
    view,
    "one",
    "two",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  await calendar.deleteItem(calendarItems.two);
  assertViewContainsItemsInOrder(
    view,
    "one",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  // Verify that all occurrences of recurring items are removed.
  await calendar.deleteItem(calendarItems.recurring);
  assertViewContainsItemsInOrder(view, "one", "three", "four", "five", "six");

  await calendar.deleteItem(calendarItems.three);
  await calendar.deleteItem(calendarItems.four);
  assertViewContainsItemsInOrder(view, "one", "five", "six");

  // Verify that sort order doesn't impact removal.
  view.cycleHeader({ id: "title" });
  await calendar.deleteItem(calendarItems.five);
  assertViewContainsItemsInOrder(view, "one", "six");

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

add_task(async function testClearItems() {
  const { calendar, view } = await initializeCalendarAndView();

  // Add all calendar items.
  const promises = [];
  for (const key in testItems) {
    promises.push(calendar.addItem(testItems[key]));
  }
  await Promise.all(promises);

  // Sanity check.
  assertViewContainsItemsInOrder(
    view,
    "one",
    "two",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  // Directly call clear, as there isn't a convenient way to trigger it via the
  // calendar.
  view.clearItems();

  assertViewContainsItemsInOrder(view);

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

add_task(async function testFilterFunction() {
  const { calendar, view } = await initializeCalendarAndView();

  // Add some items which will match the filter and some which won't.
  const promises = [];
  for (const key of ["one", "two", "five", "recurring"]) {
    promises.push(calendar.addItem(testItems[key]));
  }
  await Promise.all(promises);

  // Add a selection to ensure that selections don't persist when filter changes.
  view.selection.toggleSelect(0);

  // Sanity check.
  assertViewContainsItemsInOrder(view, "one", "two", "five", "recurring event", "recurring event");
  Assert.ok(view.selection.isSelected(0), "item 'one' should be selected");

  // Verify that setting filter function appropriately hides non-matching items.
  view.setFilterFunction(item => {
    return item.title.includes("f");
  });
  assertViewContainsItemsInOrder(view, "five");
  Assert.ok(!view.selection.isSelected(0), "item 'five' should not be selected");

  // Verify that matching items display when added.
  await calendar.addItem(testItems.four);
  assertViewContainsItemsInOrder(view, "four", "five");

  // Verify that sorting respects filter.
  view.cycleHeader({ id: "title" });
  assertViewContainsItemsInOrder(view, "five", "four");

  // Verify that non-matching items don't display when added.
  await calendar.addItem(testItems.six);
  assertViewContainsItemsInOrder(view, "five", "four");

  // Verify that clearing the filter shows all items properly sorted.
  view.clearFilter();
  assertViewContainsItemsInOrder(
    view,
    "five",
    "four",
    "one",
    "recurring event",
    "recurring event",
    "six",
    "two"
  );

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

add_task(async function testRemoveItemsFromCalendar() {
  const { calendar, view } = await initializeCalendarAndView();

  const secondCalendar = CalendarTestUtils.createCalendar("test", "storage");
  secondCalendar.setProperty("calendar-main-in-composite", true);

  const promises = [];

  // Add some items to the first calendar.
  for (const key of ["one", "two", "five", "recurring"]) {
    promises.push(calendar.addItem(testItems[key]));
  }

  // Add the rest to the second calendar.
  for (const key of ["three", "four", "six"]) {
    promises.push(secondCalendar.addItem(testItems[key]));
  }

  await Promise.all(promises);

  // Verify that both calendars are displayed.
  assertViewContainsItemsInOrder(
    view,
    "one",
    "two",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  // Verify that removing items from a specific calendar removes exactly those
  // events from the view.
  view.removeItemsFromCalendar(calendar.id);

  assertViewContainsItemsInOrder(view, "three", "four", "six");

  CalendarTestUtils.removeCalendar(calendar);
  CalendarTestUtils.removeCalendar(secondCalendar);
  view.deactivate();
});

add_task(async function testSortRespectsSelection() {
  const { calendar, view } = await initializeCalendarAndView();

  // Add all calendar items.
  const promises = [];
  for (const key in testItems) {
    promises.push(calendar.addItem(testItems[key]));
  }
  await Promise.all(promises);

  view.selection.toggleSelect(1);
  view.selection.toggleSelect(5);
  view.selection.toggleSelect(6);

  view.selection.currentIndex = 1;

  // Sanity check.
  assertViewContainsItemsInOrder(
    view,
    "one",
    "two",
    "three",
    "four",
    "five",
    "recurring event",
    "six",
    "recurring event"
  );

  // Sanity check selection; two, recurring event, and six should be selected,
  // nothing else.
  Assert.ok(view.selection.isSelected(1), "item 'two' should be selected");
  Assert.ok(view.selection.isSelected(5), "item 'recurring event' should be selected");
  Assert.ok(view.selection.isSelected(6), "item 'three' should be selected");
  Assert.equal(view.selection.currentIndex, 1, "item 'two' should be the current selection");
  for (const row of [0, 2, 3, 4, 7]) {
    Assert.ok(!view.selection.isSelected(row), `row ${row} should not be selected`);
  }

  // Verify that sorting the tree keeps the same events selected.
  view.cycleHeader({ id: "title" });

  assertViewContainsItemsInOrder(
    view,
    "five",
    "four",
    "one",
    "recurring event",
    "recurring event",
    "six",
    "three",
    "two"
  );

  Assert.ok(view.selection.isSelected(7), "item 'two' should remain selected");
  Assert.ok(view.selection.isSelected(5), "item 'recurring event' should remain selected");
  Assert.ok(view.selection.isSelected(3), "item 'three' should remain selected");
  Assert.equal(view.selection.currentIndex, 7, "item 'two' should be the current selection");
  for (const row of [0, 1, 2, 4, 6]) {
    Assert.ok(!view.selection.isSelected(row), `row ${row} should not be selected`);
  }

  CalendarTestUtils.removeCalendar(calendar);
  view.deactivate();
});

function assertViewContainsItemsInOrder(view, ...expected) {
  const actual = [];
  for (let i = 0; i < view.rowCount; i++) {
    actual.push(view.getCellText(i, { id: "title" }));
  }

  // Check array length. We don't use Assert.equal() here in order to provide
  // better debugging output.
  if (actual.length != expected.length) {
    Assert.report(
      actual.length != expected.length,
      actual,
      expected,
      `${JSON.stringify(actual)} should have the same length as ${JSON.stringify(expected)}`
    );
  }

  Assert.deepEqual(actual, expected);
}

async function initializeCalendarAndView() {
  const calendar = CalendarTestUtils.createCalendar("test", "storage");
  calendar.setProperty("calendar-main-in-composite", true);

  const view = new CalendarFilteredTreeView();
  view.startDate = cal.createDateTime("20221126");
  view.endDate = cal.createDateTime("20221128");
  view.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
  view.activate();

  const tree = {
    _batchUpdated: false,
    _batchDepth: false,

    beginUpdateBatch() {},
    endUpdateBatch() {},
    invalidateRow() {},
  };
  view.setTree(tree);

  const selection = new TreeSelection(tree);
  selection.view = view;
  view.selection = selection;
  selection.clearSelection();

  return { calendar, view };
}
