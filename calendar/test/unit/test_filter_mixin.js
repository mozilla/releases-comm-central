/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

const { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
const { CalRecurrenceInfo } = ChromeUtils.importESModule(
  "resource:///modules/CalRecurrenceInfo.sys.mjs"
);
const { CalTodo } = ChromeUtils.importESModule("resource:///modules/CalTodo.sys.mjs");

/* globals CalendarFilteredViewMixin, CalReadableStreamFactory */
Services.scriptloader.loadSubScript("chrome://calendar/content/widgets/calendar-filter.js");

class TestCalFilter extends CalendarFilteredViewMixin(class {}) {
  addedItems = [];
  removedItems = [];
  removedCalendarIds = [];

  clearItems() {
    info("clearItems");
    this.addedItems.length = 0;
    this.removedItems.length = 0;
    this.removedCalendarIds.length = 0;
  }

  addItems(items) {
    info("addItems");
    this.addedItems.push(...items);
  }

  removeItems(items) {
    info("removeItems");
    this.removedItems.push(...items);
  }

  removeItemsFromCalendar(calendarId) {
    info("removeItemsFromCalendar");
    this.removedCalendarIds.push(calendarId);
  }
}

const testItems = {};
const addedTestItems = {};

add_setup(async function () {
  await new Promise(resolve => do_calendar_startup(resolve));

  for (const [title, startDate, endDate] of [
    ["before", "20210720", "20210721"],
    ["during", "20210820", "20210821"],
    ["after", "20210920", "20210921"],
    ["overlaps_start", "20210720", "20210804"],
    ["overlaps_end", "20210820", "20210904"],
    ["overlaps_both", "20210720", "20210904"],
  ]) {
    const item = new CalEvent();
    item.id = cal.getUUID();
    item.title = title;
    item.startDate = cal.createDateTime(startDate);
    item.endDate = cal.createDateTime(endDate);
    testItems[title] = item;
  }

  const repeatingItem = new CalEvent();
  repeatingItem.id = cal.getUUID();
  repeatingItem.title = "repeating";
  repeatingItem.startDate = cal.createDateTime("20210818T120000");
  repeatingItem.endDate = cal.createDateTime("20210818T130000");
  repeatingItem.recurrenceInfo = new CalRecurrenceInfo(repeatingItem);
  repeatingItem.recurrenceInfo.appendRecurrenceItem(
    cal.createRecurrenceRule("RRULE:FREQ=DAILY;INTERVAL=5;COUNT=4")
  );
  testItems.repeating = repeatingItem;
});

add_task(async function testAddItems() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  for (const title of ["before", "after"]) {
    testWidget.clearItems();
    addedTestItems[title] = await calendar.addItem(testItems[title]);
    Assert.equal(testWidget.addedItems.length, 0);
  }

  for (const title of ["during", "overlaps_start", "overlaps_end", "overlaps_both"]) {
    testWidget.clearItems();
    addedTestItems[title] = await calendar.addItem(testItems[title]);

    Assert.equal(testWidget.addedItems.length, 1);
    Assert.equal(testWidget.addedItems[0].title, title);
  }

  testWidget.clearItems();
  addedTestItems.repeating = await calendar.addItem(testItems.repeating);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "repeating");
  Assert.equal(testWidget.addedItems[0].startDate.icalString, "20210818T120000");
  Assert.equal(testWidget.addedItems[0].endDate.icalString, "20210818T130000");
  Assert.equal(testWidget.addedItems[1].title, "repeating");
  Assert.equal(testWidget.addedItems[1].startDate.icalString, "20210823T120000");
  Assert.equal(testWidget.addedItems[1].endDate.icalString, "20210823T130000");
  Assert.equal(testWidget.addedItems[2].title, "repeating");
  Assert.equal(testWidget.addedItems[2].startDate.icalString, "20210828T120000");
  Assert.equal(testWidget.addedItems[2].endDate.icalString, "20210828T130000");

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testRefresh() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  // Add all calendar items.
  const promises = [];
  for (const key in testItems) {
    promises.push(calendar.addItem(testItems[key]));
  }
  await Promise.all(promises);

  testWidget.startDate = cal.createDateTime("20210801");
  testWidget.endDate = cal.createDateTime("20210831");
  await testWidget.refreshItems();

  Assert.equal(testWidget.addedItems.length, 7, "getItems returns expected number of items");
  Assert.equal(testWidget.addedItems[0].title, "during", "correct item returned");
  Assert.equal(testWidget.addedItems[1].title, "overlaps_start", "correct item returned");
  Assert.equal(testWidget.addedItems[2].title, "overlaps_end", "correct item returned");
  Assert.equal(testWidget.addedItems[3].title, "overlaps_both", "correct item returned");
  Assert.equal(testWidget.addedItems[4].title, "repeating");
  Assert.equal(testWidget.addedItems[4].startDate.icalString, "20210818T120000");
  Assert.equal(testWidget.addedItems[4].endDate.icalString, "20210818T130000");
  Assert.equal(testWidget.addedItems[5].title, "repeating");
  Assert.equal(testWidget.addedItems[5].startDate.icalString, "20210823T120000");
  Assert.equal(testWidget.addedItems[5].endDate.icalString, "20210823T130000");
  Assert.equal(testWidget.addedItems[6].title, "repeating");
  Assert.equal(testWidget.addedItems[6].startDate.icalString, "20210828T120000");
  Assert.equal(testWidget.addedItems[6].endDate.icalString, "20210828T130000");

  testWidget.startDate = cal.createDateTime("20210825");
  testWidget.endDate = cal.createDateTime("20210905");
  await testWidget.refreshItems();

  Assert.equal(testWidget.addedItems.length, 4, "getItems returns expected number of items");
  Assert.equal(testWidget.addedItems[0].title, "overlaps_end", "correct item returned");
  Assert.equal(testWidget.addedItems[1].title, "overlaps_both", "correct item returned");
  Assert.equal(testWidget.addedItems[2].title, "repeating");
  Assert.equal(testWidget.addedItems[2].startDate.icalString, "20210828T120000");
  Assert.equal(testWidget.addedItems[2].endDate.icalString, "20210828T130000");
  Assert.equal(testWidget.addedItems[3].title, "repeating");
  Assert.equal(testWidget.addedItems[3].startDate.icalString, "20210902T120000");
  Assert.equal(testWidget.addedItems[3].endDate.icalString, "20210902T130000");

  // Verify that refreshing while the widget is inactive doesn't prevent later
  // attempts to refresh from succeeding.
  testWidget.deactivate();
  testWidget.clearItems();
  Assert.equal(
    testWidget.addedItems.length,
    0,
    "there should be no items after deactivation and clearing"
  );

  await testWidget.refreshItems();
  Assert.equal(testWidget.addedItems.length, 0, "refreshing while inactive should not add items");

  await testWidget.activate();
  Assert.equal(testWidget.addedItems.length, 4, "getItems returns expected number of items");
  Assert.equal(testWidget.addedItems[0].title, "overlaps_end", "correct item returned");
  Assert.equal(testWidget.addedItems[1].title, "overlaps_both", "correct item returned");
  Assert.equal(testWidget.addedItems[2].title, "repeating");
  Assert.equal(testWidget.addedItems[2].startDate.icalString, "20210828T120000");
  Assert.equal(testWidget.addedItems[2].endDate.icalString, "20210828T130000");
  Assert.equal(testWidget.addedItems[3].title, "repeating");
  Assert.equal(testWidget.addedItems[3].startDate.icalString, "20210902T120000");
  Assert.equal(testWidget.addedItems[3].endDate.icalString, "20210902T130000");

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testRemoveItems() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  for (const title of ["before", "after"]) {
    testWidget.clearItems();
    await calendar.deleteItem(addedTestItems[title]);
    Assert.equal(testWidget.removedItems.length, 0);
  }

  for (const title of ["during", "overlaps_start", "overlaps_end", "overlaps_both"]) {
    testWidget.clearItems();
    await calendar.deleteItem(addedTestItems[title]);

    Assert.equal(testWidget.removedItems.length, 1);
    Assert.equal(testWidget.removedItems[0].title, title);
  }

  testWidget.clearItems();
  await calendar.deleteItem(addedTestItems.repeating);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "repeating");
  Assert.equal(testWidget.removedItems[0].startDate.icalString, "20210818T120000");
  Assert.equal(testWidget.removedItems[0].endDate.icalString, "20210818T130000");
  Assert.equal(testWidget.removedItems[1].title, "repeating");
  Assert.equal(testWidget.removedItems[1].startDate.icalString, "20210823T120000");
  Assert.equal(testWidget.removedItems[1].endDate.icalString, "20210823T130000");
  Assert.equal(testWidget.removedItems[2].title, "repeating");
  Assert.equal(testWidget.removedItems[2].startDate.icalString, "20210828T120000");
  Assert.equal(testWidget.removedItems[2].endDate.icalString, "20210828T130000");

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testModifyItem() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "change me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "change me");

  const changedItem = item.clone();
  changedItem.title = "changed";

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "changed");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.equal(testWidget.removedItems.length, 1);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));

  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 1);
  Assert.equal(testWidget.removedItems[0].title, "changed");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveItemWithinRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "move me");

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210805T180000");
  changedItem.endDate = cal.createDateTime("20210805T190000");

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.equal(testWidget.removedItems.length, 1);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));

  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 1);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveItemOutOfRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "move me");

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210905T170000");
  changedItem.endDate = cal.createDateTime("20210905T180000");

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 1);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));

  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 0);

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveItemInToRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210705T170000");
  item.endDate = cal.createDateTime("20210705T180000");

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 0);

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210805T170000");
  changedItem.endDate = cal.createDateTime("20210805T180000");

  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems.length, 0);

  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 1);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(testWidget.addedItems[0]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testModifyRecurringItem() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "change me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "change me");
  Assert.equal(testWidget.addedItems[1].title, "change me");
  Assert.equal(testWidget.addedItems[2].title, "change me");

  const changedItem = item.clone();
  changedItem.title = "changed";

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "changed");
  Assert.equal(testWidget.addedItems[1].title, "changed");
  Assert.equal(testWidget.addedItems[2].title, "changed");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.addedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.addedItems[2].hasSameIds(addedItems[2]));
  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "changed");
  Assert.equal(testWidget.removedItems[1].title, "changed");
  Assert.equal(testWidget.removedItems[2].title, "changed");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveRecurringItemWithinRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210805T180000");
  changedItem.endDate = cal.createDateTime("20210805T190000");

  let addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  // This maybe should call modifyItems, but instead it calls addItems and removeItems.

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems[1].title, "move me");
  Assert.equal(testWidget.removedItems[2].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");
  Assert.equal(testWidget.addedItems[0].startDate.icalString, "20210805T180000");
  Assert.equal(testWidget.addedItems[1].startDate.icalString, "20210806T180000");
  Assert.equal(testWidget.addedItems[2].startDate.icalString, "20210807T180000");
  Assert.equal(testWidget.addedItems[0].endDate.icalString, "20210805T190000");
  Assert.equal(testWidget.addedItems[1].endDate.icalString, "20210806T190000");
  Assert.equal(testWidget.addedItems[2].endDate.icalString, "20210807T190000");

  addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems[1].title, "move me");
  Assert.equal(testWidget.removedItems[2].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveRecurringItemOutOfRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210905T170000");
  changedItem.endDate = cal.createDateTime("20210905T180000");

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems[1].title, "move me");
  Assert.equal(testWidget.removedItems[2].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  testWidget.clearItems();
  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 0);

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveRecurringItemInToRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210705T170000");
  item.endDate = cal.createDateTime("20210705T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 0);

  const changedItem = item.clone();
  changedItem.startDate = cal.createDateTime("20210805T170000");
  changedItem.endDate = cal.createDateTime("20210805T180000");

  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");
  Assert.equal(testWidget.removedItems.length, 0);

  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems[1].title, "move me");
  Assert.equal(testWidget.removedItems[2].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(testWidget.addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(testWidget.addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(testWidget.addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testModifyOccurrence() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "change me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "change me");
  Assert.equal(testWidget.addedItems[1].title, "change me");
  Assert.equal(testWidget.addedItems[2].title, "change me");

  const occurrences = item.recurrenceInfo.getOccurrences(
    testWidget.startDate,
    testWidget.endDate,
    100
  );
  const changedOccurrence = occurrences[1].clone();
  changedOccurrence.title = "changed";

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(
    cal.itip.prepareSequence(changedOccurrence, occurrences[1]),
    occurrences[1]
  );

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "change me");
  Assert.equal(testWidget.addedItems[1].title, "changed");
  Assert.equal(testWidget.addedItems[2].title, "change me");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.addedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.addedItems[2].hasSameIds(addedItems[2]));
  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  testWidget.clearItems();
  await calendar.deleteItem(item);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testDeleteOccurrence() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "change me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "change me");
  Assert.equal(testWidget.addedItems[1].title, "change me");
  Assert.equal(testWidget.addedItems[2].title, "change me");

  const changedItem = item.clone();
  const occurrences = changedItem.recurrenceInfo.getOccurrences(
    testWidget.startDate,
    testWidget.endDate,
    100
  );
  changedItem.recurrenceInfo.removeOccurrenceAt(occurrences[1].recurrenceId);

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 2);
  Assert.equal(testWidget.addedItems[0].title, "change me");
  Assert.equal(testWidget.addedItems[1].title, "change me");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.addedItems[1].hasSameIds(addedItems[2]));
  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  testWidget.clearItems();
  await calendar.deleteItem(item);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testMoveOccurrenceWithinRange() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "move me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");
  item.recurrenceInfo = new CalRecurrenceInfo(item);
  item.recurrenceInfo.appendRecurrenceItem(cal.createRecurrenceRule("RRULE:FREQ=DAILY;COUNT=3"));

  testWidget.clearItems();
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");

  const occurrences = item.recurrenceInfo.getOccurrences(
    testWidget.startDate,
    testWidget.endDate,
    100
  );
  const changedOccurrence = occurrences[1].clone();
  changedOccurrence.startDate = cal.createDateTime("20210806T173000");
  changedOccurrence.endDate = cal.createDateTime("20210806T183000");

  const addedItems = testWidget.addedItems.slice();
  testWidget.clearItems();
  await calendar.modifyItem(
    cal.itip.prepareSequence(changedOccurrence, occurrences[1]),
    occurrences[1]
  );

  Assert.equal(testWidget.addedItems.length, 3);
  Assert.equal(testWidget.addedItems[0].title, "move me");
  Assert.equal(testWidget.addedItems[1].title, "move me");
  Assert.equal(testWidget.addedItems[2].title, "move me");
  Assert.equal(testWidget.addedItems[0].startDate.icalString, "20210805T170000");
  Assert.equal(testWidget.addedItems[1].startDate.icalString, "20210806T173000");
  Assert.equal(testWidget.addedItems[2].startDate.icalString, "20210807T170000");
  Assert.equal(testWidget.addedItems[0].endDate.icalString, "20210805T180000");
  Assert.equal(testWidget.addedItems[1].endDate.icalString, "20210806T183000");
  Assert.equal(testWidget.addedItems[2].endDate.icalString, "20210807T180000");
  Assert.ok(testWidget.addedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.addedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.addedItems[2].hasSameIds(addedItems[2]));
  Assert.equal(testWidget.removedItems.length, 3);
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  testWidget.clearItems();
  await calendar.deleteItem(item);

  Assert.equal(testWidget.removedItems.length, 3);
  Assert.equal(testWidget.removedItems[0].title, "move me");
  Assert.equal(testWidget.removedItems[1].title, "move me");
  Assert.equal(testWidget.removedItems[2].title, "move me");
  Assert.ok(testWidget.removedItems[0].hasSameIds(addedItems[0]));
  Assert.ok(testWidget.removedItems[1].hasSameIds(addedItems[1]));
  Assert.ok(testWidget.removedItems[2].hasSameIds(addedItems[2]));

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testChangeTaskCompletion() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let incompleteTask = new CalTodo();
  incompleteTask.id = cal.getUUID();
  incompleteTask.title = "incomplete task";
  incompleteTask.startDate = cal.createDateTime("20210805T170000");
  incompleteTask.endDate = cal.createDateTime("20210805T180000");

  // Set the widget to only show incomplete tasks.

  testWidget.itemType =
    Ci.calICalendar.ITEM_FILTER_TYPE_TODO | Ci.calICalendar.ITEM_FILTER_COMPLETED_NO;

  // Add an incomplete task to the calendar.

  testWidget.clearItems();
  incompleteTask = await calendar.addItem(incompleteTask);

  Assert.equal(testWidget.addedItems.length, 1, "incomplete item was added");
  Assert.equal(testWidget.addedItems[0].title, "incomplete task");

  // Complete the task. It should be removed from the widget.

  let completeTask = incompleteTask.clone();
  completeTask.title = "complete task";
  completeTask.percentComplete = 100;

  testWidget.clearItems();
  completeTask = await calendar.modifyItem(completeTask, incompleteTask);

  Assert.equal(testWidget.removedItems.length, 1, "complete item was removed");
  Assert.equal(testWidget.removedItems[0].title, "incomplete task");

  // Mark the task as incomplete again. It should be added back to the widget.

  const incompleteAgainItem = completeTask.clone();
  incompleteAgainItem.title = "incomplete again task";
  incompleteAgainItem.percentComplete = 50;

  testWidget.clearItems();
  await calendar.modifyItem(incompleteAgainItem, completeTask);

  Assert.equal(testWidget.addedItems.length, 1, "incomplete item was added");
  Assert.equal(testWidget.addedItems[0].title, "incomplete again task");

  // Clean up.

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testDisableEnableCalendar() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  addedTestItems.during = await calendar.addItem(testItems.during);

  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.equal(testWidget.removedCalendarIds.length, 0);

  // Test disabling and enabling the calendar.

  testWidget.clearItems();
  calendar.setProperty("disabled", true);
  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.deepEqual(testWidget.removedCalendarIds, [calendar.id]);

  testWidget.clearItems();
  calendar.setProperty("disabled", false);
  await TestUtils.waitForCondition(() => testWidget.addedItems.length == 1);
  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.equal(testWidget.removedCalendarIds.length, 0);

  // Test hiding and showing the calendar.

  testWidget.clearItems();
  calendar.setProperty("calendar-main-in-composite", false);
  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.deepEqual(testWidget.removedCalendarIds, [calendar.id]);

  testWidget.clearItems();
  calendar.setProperty("calendar-main-in-composite", true);
  await TestUtils.waitForCondition(() => testWidget.addedItems.length == 1);
  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.equal(testWidget.removedCalendarIds.length, 0);

  // Test disabling and enabling the calendar while it is hidden.

  testWidget.clearItems();
  calendar.setProperty("calendar-main-in-composite", false);
  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.deepEqual(testWidget.removedCalendarIds, [calendar.id]);

  testWidget.clearItems();
  calendar.setProperty("disabled", true);
  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.deepEqual(testWidget.removedCalendarIds, [calendar.id]);

  testWidget.clearItems();
  calendar.setProperty("disabled", false);
  await new Promise(resolve => do_timeout(500, resolve));
  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.equal(testWidget.removedCalendarIds.length, 0);

  testWidget.clearItems();
  calendar.setProperty("calendar-main-in-composite", true);
  await TestUtils.waitForCondition(() => testWidget.addedItems.length == 1);
  Assert.equal(testWidget.addedItems.length, 1);
  Assert.equal(testWidget.removedItems.length, 0);
  Assert.equal(testWidget.removedCalendarIds.length, 0);

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testChangeWhileHidden() {
  const { calendar, testWidget } = await initializeCalendarAndTestWidget();

  let item = new CalEvent();
  item.id = cal.getUUID();
  item.title = "change me";
  item.startDate = cal.createDateTime("20210805T170000");
  item.endDate = cal.createDateTime("20210805T180000");

  testWidget.clearItems();
  calendar.setProperty("calendar-main-in-composite", false);
  item = await calendar.addItem(item);

  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);

  const changedItem = item.clone();
  changedItem.title = "changed";
  await calendar.modifyItem(changedItem, item);

  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);

  await calendar.deleteItem(changedItem);

  Assert.equal(testWidget.addedItems.length, 0);
  Assert.equal(testWidget.removedItems.length, 0);

  CalendarTestUtils.removeCalendar(calendar);
  testWidget.deactivate();
});

add_task(async function testChangeWhileRefreshing() {
  // Create a calendar we can control the output of.

  const pumpCalendar = {
    type: "pump",
    uri: Services.io.newURI("pump:test-calendar"),
    getProperty(name) {
      switch (name) {
        case "disabled":
          return false;
        case "calendar-main-in-composite":
          return true;
      }
      return null;
    },
    addObserver() {},

    getItems() {
      return CalReadableStreamFactory.createReadableStream({
        async start(controller) {
          pumpCalendar.controller = controller;
        },
      });
    },
  };
  cal.manager.registerCalendar(pumpCalendar);

  // Create a new widget and a Promise waiting for it to be ready.

  const widget = new TestCalFilter();
  widget.id = "test-filter";

  // Before setting an item type, start date and end date, `activate` should resolve immediately.
  // There shouldn't be a new `ready` Promise, because we're still not ready.

  const ready1 = widget.ready;
  let ready1Resolved, ready1Rejected;
  ready1.then(
    () => {
      ready1Resolved = true;
    },
    () => {
      ready1Rejected = true;
    }
  );

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  const activate0A = widget.activate();
  Assert.notEqual(activate0A, ready1, ".activate should return a different Promise");
  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  await activate0A;
  widget.deactivate();

  // Try again with the item type set.

  widget.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  const activate0B = widget.activate();
  Assert.notEqual(activate0B, ready1, ".activate should return a different Promise");
  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  await activate0B;
  widget.deactivate();

  // Try again with only one date set.

  widget.startDate = cal.createDateTime("20200801");

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  const activate0C = widget.activate();
  Assert.notEqual(activate0C, ready1, ".activate should return a different Promise");
  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  await activate0C;
  widget.deactivate();

  Assert.equal(ready1Resolved, undefined, "Promise did not yet resolve");
  Assert.equal(ready1Rejected, undefined, "Promise did not yet reject");

  // Set the other date.

  widget.endDate = cal.createDateTime("20230831");

  // Ask the calendars for items. Get a waiting Promise before and after doing so.
  // These should be the same as the earlier Promise.

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  Assert.equal(widget.activate(), ready1, ".activate should return the same Promise");
  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");

  // Return some items from the calendar. They would be sent to addItems,
  // unless the stream is closed before;

  pumpCalendar.controller.enqueue([testItems.during]);

  // Make the widget inactive. This invalidates the earlier call to `refreshItems`
  // ... which means the stream gets closed.
  widget.deactivate();

  // Since the stream was not finished, should have no items.
  Assert.equal(widget.addedItems.length, 0, "should have no items");

  // Return some more items from the calendar. These should be ignored.

  // Even though the data is now invalid the original Promise should not have been replaced with a
  // new one.

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");

  pumpCalendar.controller.enqueue([testItems.after]);
  pumpCalendar.controller.close();

  // We're testing that nothing happens. Give it time to potentially happen.
  await new Promise(resolve => do_timeout(500, resolve));

  Assert.equal(widget.addedItems.length, 0, "no more items added");
  Assert.equal(ready1Resolved, undefined, "Promise did not yet resolve");
  Assert.equal(ready1Rejected, undefined, "Promise did not yet reject");

  // Make the widget active again so we can test some other things.

  widget.clearItems();

  Assert.equal(widget.activate(), ready1, ".activate should return the same Promise");
  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");

  pumpCalendar.controller.enqueue([testItems.during]);

  // Since the stream was not finished, should have no items.
  Assert.equal(widget.addedItems.length, 0, "should have no items");

  // ... then before it finishes, force another refresh. We're still waiting for the original
  // Promise because no refresh has completed yet.
  // Return a different item, just to be sure we got the one we expected.

  Assert.equal(widget.refreshItems(true), ready1, ".refreshItems should return the same Promise");
  Assert.equal(widget.addedItems.length, 0, "items were cleared");

  pumpCalendar.controller.enqueue([testItems.before]);
  pumpCalendar.controller.close();

  // Finally we have a completed refresh. The Promise should resolve now.

  await ready1;
  await TestUtils.waitForCondition(() => widget.addedItems.length == 1, "first added item");
  Assert.equal(widget.addedItems[0].title, testItems.before.title, "added item was expected");

  // The Promise should not be replaced until the dates or item type change, or we force a refresh.

  Assert.equal(widget.ready, ready1, ".ready should return the same Promise");
  Assert.equal(widget.refreshItems(), ready1, ".refreshItems should return the same Promise");

  // Force refresh again. There should be a new ready Promise, since the old one was resolved and
  // we forced a refresh.

  const ready2 = widget.refreshItems(true);
  Assert.notEqual(ready2, ready1, ".refreshItems should return a new Promise");
  Assert.equal(widget.addedItems.length, 0, "items were cleared");

  pumpCalendar.controller.enqueue([testItems.after]);
  pumpCalendar.controller.close();

  await ready2;
  await TestUtils.waitForCondition(() => widget.addedItems.length == 1, "first added item");
  Assert.equal(widget.addedItems[0].title, testItems.after.title, "added item was expected");

  // Change the item type. There should be a new ready Promise, since the old one was resolved and
  // the item type changed.

  widget.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_EVENT;
  const ready3 = widget.ready;
  Assert.notEqual(ready3, ready2, ".ready should return a new Promise");
  Assert.equal(widget.refreshItems(), ready3, ".refreshItems should return the same Promise");
  Assert.equal(widget.addedItems.length, 0, "items were cleared");

  pumpCalendar.controller.enqueue([testItems.during]);
  pumpCalendar.controller.close();

  await ready3;
  await TestUtils.waitForCondition(() => widget.addedItems.length == 1, "first added item");
  Assert.equal(widget.addedItems[0].title, testItems.during.title, "added item was expected");

  // Change the start date. There should be a new ready Promise, since the old one was resolved and
  // the start date changed.

  widget.startDate = cal.createDateTime("20220317");
  const ready4 = widget.ready;
  Assert.notEqual(ready4, ready3, ".ready should return a new Promise");
  Assert.equal(widget.refreshItems(), ready4, ".refreshItems should return the same Promise");

  pumpCalendar.controller.close();
  await ready4;

  // Change the end date. There should be a new ready Promise, since the old one was resolved and
  // the end date changed.

  widget.endDate = cal.createDateTime("20220318");
  const ready5 = widget.ready;
  Assert.notEqual(ready5, ready4, ".ready should return a new Promise");
  Assert.equal(widget.refreshItems(), ready5, ".refreshItems should return the same Promise");

  pumpCalendar.controller.close();
  await ready5;
});

async function initializeCalendarAndTestWidget() {
  const calendar = CalendarTestUtils.createCalendar("test", "storage");
  calendar.setProperty("calendar-main-in-composite", true);

  const testWidget = new TestCalFilter();
  testWidget.startDate = cal.createDateTime("20210801");
  testWidget.endDate = cal.createDateTime("20210831");
  testWidget.itemType = Ci.calICalendar.ITEM_FILTER_TYPE_ALL;
  await testWidget.activate();

  return { calendar, testWidget };
}
