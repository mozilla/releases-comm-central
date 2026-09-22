/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
const { GraphCalendar } = ChromeUtils.importESModule("resource:///modules/GraphCalendar.sys.mjs");
const { GraphCalendarEvent } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/GraphServer.sys.mjs"
);

let graphServer;
let incomingServer;
let graphCalendar;

let nextEventIndex = 0;

/**
 * Generates sequentially numbered events and adds them to a calendar.
 *
 * @param {string} calendarId - ID of the calendar to add events to.
 * @param {number} count - Number of events to add.
 * @returns {GraphCalendarEvent[]} The added events.
 */
function generateEvents(calendarId, count) {
  return Array.from({ length: count }, () => {
    const index = nextEventIndex++;
    const event = new GraphCalendarEvent(
      `id${index}`,
      `subject ${index}`,
      "2039-01-01T01:00:00.0000000",
      "2039-01-01T02:00:00.0000000"
    );

    graphServer.addCalendarEvent(calendarId, event);
    return event;
  });
}

function basicCalendar() {
  const calendar = new GraphCalendar();

  calendar.id = "AAMkAGI2TGuLAAA=";
  calendar.username = "user";
  calendar.location = "localhost";

  return calendar;
}

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
});

add_task(async function testMaxPageGraph() {
  await testMaxPage(graphServer, basicCalendar());
});
add_task(async function testEventBatchingGraph() {
  await testEventBatching(graphServer, basicCalendar());
});
add_task(async function testSyncChangesWithClientGraph() {
  await testSyncChangesWithClient(graphServer, basicCalendar());
});

/**
 * Test that we message sync requests that are sent request a correct number of
 * messages to be included in responses.
 */
async function testMaxPage(server, calendar) {
  // This value is defined in protocol_shared's `lib.rs`. It should be kept in
  // sync with that file.
  const expectedMaxPageSize = 256;

  server.setRemoteFolders(server.getWellKnownFolders());
  server.clearItems();
  server.maxSyncItems = expectedMaxPageSize;

  // Case 1: No sync state token, too few items to sync to warrant more pages.
  generateEvents(calendar.id, expectedMaxPageSize);

  const op1 = calendar.refresh();
  await TestUtils.waitForCondition(() => !op1.isPending, "Wait for refresh to complete");
  Assert.equal(op1.status, Cr.NS_OK, "Should have completed successfully");

  Assert.equal(
    server.lastMaxMessagePageSize,
    expectedMaxPageSize,
    "initial calendar sync should be performed with the expected maximum page size"
  );

  Assert.ok(calendar.syncStateToken, "initial sync should generate token");

  // Case 2: Sync state token, too few items to sync to warrant more pages.
  generateEvents(calendar.id, expectedMaxPageSize);

  const op2 = calendar.refresh();
  await TestUtils.waitForCondition(() => !op2.isPending, "Wait for refresh to complete");
  Assert.equal(op2.status, Cr.NS_OK, "Should have completed successfully");

  Assert.equal(
    server.lastMaxMessagePageSize,
    expectedMaxPageSize,
    "later calendar syncs should be performed with the expected maximum page size"
  );

  // Case 3: Enough items to sync to warrant more pages.
  generateEvents(calendar.id, expectedMaxPageSize + 8);

  const op3 = calendar.refresh();
  await TestUtils.waitForCondition(() => !op3.isPending, "Wait for refresh to complete");
  Assert.equal(op3.status, Cr.NS_OK, "Should have completed successfully");

  Assert.equal(
    server.lastMaxMessagePageSize,
    expectedMaxPageSize,
    "paged calendar syncs should be performed with the expected maximum page size"
  );
}

/**
 * Test sync wherein we sync more changes than the server will send in one
 * response and need to batch message header fetch.
 */
async function testEventBatching(server, calendar) {
  server.clearItems();
  server.maxSyncItems = 4;

  const events = generateEvents(calendar.id, 6);

  const op = calendar.refresh();
  await TestUtils.waitForCondition(() => !op.isPending, "Wait for refresh to complete");
  Assert.equal(op.status, Cr.NS_OK, "Should have completed successfully");

  const items = await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_TYPE_ALL, 0, null, null);

  Assert.deepEqual(items.length, events.length, "all of the created items should have been synced");
  Assert.deepEqual(
    items.map(e => e.id),
    events.map(e => e.id),
    "events should have been created with expected IDs"
  );
  Assert.deepEqual(
    items.map(e => e.title),
    events.map(e => e.subject),
    "events should have been created with expected titles"
  );
  Assert.ok(calendar.syncStateToken, "the sync token should have been recorded");

  server.maxSyncItems = Infinity;
}

/**
 * Test what happens if an event is moved or deleted.
 */
async function testSyncChangesWithClient(server, calendar) {
  server.clearItems();

  const events = generateEvents(calendar.id, 6);

  // Initial sync.

  const op1 = calendar.refresh();
  await TestUtils.waitForCondition(() => !op1.isPending, "Wait for refresh to complete");
  Assert.equal(op1.status, Cr.NS_OK, "Should have completed successfully");

  const items1 = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL,
    0,
    null,
    null
  );

  Assert.equal(items1.length, events.length, "all of the created items should have been synced");
  Assert.deepEqual(
    items1.map(e => e.id),
    events.map(e => e.id),
    "events should have been created with expected IDs"
  );
  Assert.deepEqual(
    items1.map(e => e.title),
    events.map(e => e.subject),
    "events should have been created with expected titles"
  );
  Assert.ok(calendar.syncStateToken, "the sync token should have been recorded");
  const syncStateToken = calendar.syncStateToken;

  // Change an event, delete an event.

  events[5].subject = "Scary Monster Under Your Bed";
  server.updateCalendarEvent(events[5]);

  const itemIdToDelete = events[2].id;
  server.deleteCalendarEvent(itemIdToDelete);
  events.splice(2, 1);

  // Sync again to pick up the changes.

  const op2 = calendar.refresh();
  await TestUtils.waitForCondition(() => !op2.isPending, "Wait for refresh to complete");
  Assert.equal(op2.status, Cr.NS_OK, "Should have completed successfully");

  const items2 = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_TYPE_ALL,
    0,
    null,
    null
  );

  Assert.equal(items2.length, events.length, "an item should have been removed");
  Assert.deepEqual(
    items2.map(e => e.id),
    events.map(e => e.id),
    "events should still have matching IDs"
  );
  Assert.deepEqual(
    items2.map(e => e.title),
    events.map(e => e.subject),
    "events should still have matching titles"
  );
  Assert.ok(calendar.syncStateToken, "the sync token should have been recorded");
  Assert.notEqual(
    calendar.syncStateToken,
    syncStateToken,
    "the sync token should differ from the previous one"
  );
}
