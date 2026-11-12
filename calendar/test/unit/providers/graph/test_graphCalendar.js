/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../head.js */

const { GraphCalendarEvent, GraphCalendarAttendee, EmailAddress } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/GraphTypes.sys.mjs"
);

let graphServer;
let incomingServer;

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
    const attendee = new GraphCalendarAttendee(
      new EmailAddress(`Name ${index}`, `${index}@example.com`),
      "accepted",
      "required"
    );
    const event = new GraphCalendarEvent(
      `id${index}`,
      `subject ${index}`,
      { dateTime: "2039-01-01T01:00:00.0000000" },
      { dateTime: "2039-01-01T02:00:00.0000000" },
      [attendee]
    );

    graphServer.addCalendarEvent(calendarId, event);
    return event;
  });
}

async function refreshAndCheck(calendar) {
  calendarObserver._onLoadPromise = Promise.withResolvers();
  calendar.refresh();
  await calendarObserver._onLoadPromise.promise;
  Assert.equal(
    calendar.getProperty("currentStatus"),
    Cr.NS_OK,
    "Should have completed successfully"
  );
}

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
});

// Test memory-backed calendar.

async function testMemoryCalendar(testFn) {
  const calendar = createGraphCalendar(incomingServer, false);
  try {
    await testFn(graphServer, calendar);
  } finally {
    cal.manager.unregisterCalendar(calendar);
  }
}

add_task(async function testMaxPageGraphMem() {
  await testMemoryCalendar(testMaxPage);
});
add_task(async function testEventBatchingGraphMem() {
  await testMemoryCalendar(testEventBatching);
});
add_task(async function testSyncChangesWithClientGraphMem() {
  await testMemoryCalendar(testSyncChangesWithClient);
});

// Test local storage-backed calendar.

async function testCachedCalendar(testFn) {
  const calendar = createGraphCalendar(incomingServer, true);
  try {
    await testFn(graphServer, calendar);
  } finally {
    cal.manager.unregisterCalendar(calendar);
  }
}

add_task(async function testMaxPageGraphCached() {
  await testCachedCalendar(testMaxPage);
});
add_task(async function testEventBatchingGraphCached() {
  await testCachedCalendar(testEventBatching);
});
add_task(async function testSyncChangesWithClientGraphCached() {
  await testCachedCalendar(testSyncChangesWithClient);
});
add_task(async function testPersistanceGraphCached() {
  await testPersistence(graphServer);
});

add_task(async function testGraphEventTimeZones() {
  await testMemoryCalendar(testReadTimeZones);
});

add_task(async function testGraphEventTimeZonesCached() {
  await testCachedCalendar(testReadTimeZones);
});

async function testReadTimeZones(server, calendar) {
  calendar.name = "Graph time zone test";
  server.clearItems();
  const events = [
    new GraphCalendarEvent(
      "windows-zone",
      "Summer",
      {
        dateTime: "2039-07-15T09:00:00.0000000",
        timeZone: "Eastern Standard Time",
      },
      {
        dateTime: "2039-07-15T10:00:00.0000000",
        timeZone: "Eastern Standard Time",
      }
    ),
    new GraphCalendarEvent(
      "iana-zone",
      "Winter",
      { dateTime: "2039-01-15T09:00:00", timeZone: "America/New_York" },
      { dateTime: "2039-01-15T10:00:00", timeZone: "America/Los_Angeles" }
    ),
    new GraphCalendarEvent(
      "missing-zone",
      "Missing zone",
      { dateTime: "2039-01-15T09:00:00" },
      { dateTime: "2039-01-15T10:00:00", timeZone: null }
    ),
    new GraphCalendarEvent(
      "suffix-zone",
      "Explicit offsets",
      { dateTime: "2039-01-15T09:00:00Z", timeZone: "America/New_York" },
      { dateTime: "2039-01-15T10:00:00-05:00", timeZone: "America/New_York" }
    ),
    new GraphCalendarEvent(
      "mismatched-offset",
      "Mismatched offset",
      { dateTime: "2039-01-15T09:00:00-08:00", timeZone: "America/New_York" },
      { dateTime: "2039-01-15T10:00:00-08:00", timeZone: "America/New_York" }
    ),
    new GraphCalendarEvent(
      "spring-transition",
      "Spring transition",
      { dateTime: "2026-03-08T01:30:00", timeZone: "America/New_York" },
      { dateTime: "2026-03-08T03:30:00", timeZone: "America/New_York" }
    ),
    new GraphCalendarEvent(
      "fall-transition",
      "Fall transition",
      { dateTime: "2026-11-01T00:30:00", timeZone: "America/New_York" },
      { dateTime: "2026-11-01T02:30:00", timeZone: "America/New_York" }
    ),
  ];
  for (const event of events) {
    server.addCalendarEvent(calendar.id, event);
  }

  await refreshAndCheck(calendar);

  const items = await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_TYPE_ALL, 0, null, null);
  Assert.equal(items.length, events.length, "All events should be synchronized");
  let item = items.find(event => event.id == "windows-zone");
  Assert.ok(item, "The Windows time zone event should be present");
  Assert.equal(
    item.startDate.getInTimezone(cal.dtz.UTC).icalString,
    "20390715T130000Z",
    "A Windows time zone applies the correct daylight offset"
  );
  item = items.find(event => event.id == "iana-zone");
  Assert.ok(item, "The IANA time zone event should be present");
  Assert.equal(
    item.startDate.getInTimezone(cal.dtz.UTC).icalString,
    "20390115T140000Z",
    "An IANA time zone applies the correct winter offset"
  );
  Assert.equal(
    item.endDate.getInTimezone(cal.dtz.UTC).icalString,
    "20390115T180000Z",
    "The end time uses its own time zone"
  );
  item = items.find(event => event.id == "missing-zone");
  Assert.ok(item, "The event with missing time zones should be present");
  Assert.equal(
    item.startDate.icalString,
    "20390115T090000Z",
    "A missing start zone defaults to UTC"
  );
  Assert.equal(item.endDate.icalString, "20390115T100000Z", "A null end zone defaults to UTC");

  item = items.find(event => event.id == "suffix-zone");
  Assert.ok(item, "The event with explicit offsets should be present");
  Assert.equal(item.startDate.icalString, "20390115T090000Z", "Z selects UTC");
  Assert.equal(
    item.endDate.getInTimezone(cal.dtz.UTC).icalString,
    "20390115T150000Z",
    "A matching numeric offset preserves the instant"
  );
  item = items.find(event => event.id == "mismatched-offset");
  Assert.ok(item, "The event with a mismatched offset should be present");
  Assert.equal(
    item.startDate.getInTimezone(cal.dtz.UTC).icalString,
    "20390115T170000Z",
    "A numeric offset takes precedence over a mismatched time zone"
  );

  item = items.find(event => event.id == "spring-transition");
  Assert.ok(item, "The spring transition event should be present");
  Assert.equal(
    item.startDate.getInTimezone(cal.dtz.UTC).icalString,
    "20260308T063000Z",
    "Spring start uses standard time"
  );
  Assert.equal(
    item.endDate.getInTimezone(cal.dtz.UTC).icalString,
    "20260308T073000Z",
    "Spring end uses daylight time"
  );
  item = items.find(event => event.id == "fall-transition");
  Assert.ok(item, "The fall transition event should be present");
  Assert.equal(
    item.startDate.getInTimezone(cal.dtz.UTC).icalString,
    "20261101T043000Z",
    "Fall start uses daylight time"
  );
  Assert.equal(
    item.endDate.getInTimezone(cal.dtz.UTC).icalString,
    "20261101T073000Z",
    "Fall end uses standard time"
  );

  const graphCal = getGraphCalendar(calendar);
  const syncStateToken = graphCal.syncStateToken;
  server.addCalendarEvent(
    calendar.id,
    new GraphCalendarEvent(
      "unknown-zone",
      "Unknown",
      { dateTime: "2039-01-15T09:00:00", timeZone: "Invalid/TimeZone" },
      { dateTime: "2039-01-15T10:00:00", timeZone: "UTC" }
    )
  );
  calendarObserver._onLoadPromise = Promise.withResolvers();
  calendar.refresh();
  await calendarObserver._onLoadPromise.promise;
  Assert.notEqual(
    calendar.getProperty("currentStatus"),
    Cr.NS_OK,
    "Unknown zones should fail sync"
  );
  Assert.equal(graphCal.syncStateToken, syncStateToken, "A failed sync should keep its token");
}

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

  await refreshAndCheck(calendar);

  Assert.equal(
    server.lastMaxMessagePageSize,
    expectedMaxPageSize,
    "initial calendar sync should be performed with the expected maximum page size"
  );

  const graphCal = getGraphCalendar(calendar);
  Assert.ok(graphCal.syncStateToken, "initial sync should generate token");

  // Case 2: Sync state token, too few items to sync to warrant more pages.
  generateEvents(calendar.id, expectedMaxPageSize);

  await refreshAndCheck(calendar);

  Assert.equal(
    server.lastMaxMessagePageSize,
    expectedMaxPageSize,
    "later calendar syncs should be performed with the expected maximum page size"
  );

  // Case 3: Enough items to sync to warrant more pages.
  generateEvents(calendar.id, expectedMaxPageSize + 8);

  await refreshAndCheck(calendar);

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

  await refreshAndCheck(calendar);

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

  Assert.deepEqual(
    // When we pass the email into the ID, CalAttendee prepends "mailto:"
    items.map(i => i.getAttendees().map(a => a.id.substr(7))),
    events.map(e => e.attendees.map(a => a.emailAddress.address)),
    "event attendees should match given email addresses"
  );

  Assert.deepEqual(
    items.map(i => i.getAttendees().map(a => a.commonName)),
    events.map(e => e.attendees.map(a => a.emailAddress.name)),
    "event attendees should match given email addresses"
  );

  Assert.deepEqual(
    items.map(i => i.getAttendees().map(a => a.role)),
    events.map(e => e.attendees.map(_ => "REQ-PARTICIPANT")),
    "event attendee roles should match the expected role"
  );

  Assert.deepEqual(
    items.map(i => i.getAttendees().map(a => a.participationStatus)),
    events.map(e => e.attendees.map(_ => "ACCEPTED")),
    "event attendee participation status should match the expected participation status"
  );

  const graphCal = getGraphCalendar(calendar);
  Assert.ok(graphCal.syncStateToken, "the sync token should have been recorded");

  server.maxSyncItems = Infinity;
}

/**
 * Test what happens if an event is moved or deleted.
 */
async function testSyncChangesWithClient(server, calendar) {
  server.clearItems();

  const events = generateEvents(calendar.id, 6);

  // Initial sync.

  await refreshAndCheck(calendar);

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

  const graphCal = getGraphCalendar(calendar);
  Assert.ok(graphCal.syncStateToken, "the sync token should have been recorded");
  const syncStateToken = graphCal.syncStateToken;

  // Change an event, delete an event.

  events[5].subject = "Scary Monster Under Your Bed";
  server.updateCalendarEvent(events[5]);

  const itemIdToDelete = events[2].id;
  server.deleteCalendarEvent(itemIdToDelete);
  events.splice(2, 1);

  // Sync again to pick up the changes.

  await refreshAndCheck(calendar);

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

  Assert.ok(graphCal.syncStateToken, "the sync token should have been recorded");
  Assert.notEqual(
    graphCal.syncStateToken,
    syncStateToken,
    "the sync token should differ from the previous one"
  );
}

/**
 * Test that changes to the calendar persist when reopened
 */
async function testPersistence(server) {
  const calendar = createGraphCalendar(incomingServer, true);
  const calUri = calendar.uri;

  let syncStateToken;
  let events;
  try {
    server.clearItems();

    events = generateEvents(calendar.id, 6);

    // Initial sync.

    await refreshAndCheck(calendar);

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

    const graphCal = getGraphCalendar(calendar);
    Assert.ok(graphCal.syncStateToken, "the sync token should have been recorded");

    syncStateToken = graphCal.syncStateToken;
  } finally {
    // Tear down the calendar and reopen it.
    cal.manager.unsetupCalendar(calendar);
  }

  const reopened = createGraphCalendar(incomingServer, true, calUri);

  try {
    const items2 = await reopened.getItemsAsArray(
      Ci.calICalendar.ITEM_FILTER_TYPE_ALL,
      0,
      null,
      null
    );

    Assert.equal(items2.length, events.length, "all items should still remain");
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

    const graphCal = getGraphCalendar(reopened);
    Assert.ok(graphCal.syncStateToken, "the sync token should have been recorded");
    Assert.equal(
      graphCal.syncStateToken,
      syncStateToken,
      "the sync token should be the same as the saved one"
    );
  } finally {
    cal.manager.unregisterCalendar(reopened);
  }
}
