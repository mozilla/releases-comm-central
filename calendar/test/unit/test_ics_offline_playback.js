/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that changes made to a cached ICS calendar while offline are played
 * back to the server by the next synchronization instead of being silently
 * discarded (bug 2052714), and that the playback does not corrupt other
 * events in the cache.
 */

var { ICSServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/ICSServer.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

// The synchronization chain can take a moment, so poll longer than the default.
const WAIT_INTERVAL = 200;
const WAIT_TRIES = 100;

const UID_A = "event-a";
const UID_B = "event-b";
const UID_C = "event-c";

// LAST-MODIFIED is deliberately in the past, so an offline edit is always the
// newer copy and the synchronization takes the plain modify path. The overwrite
// prompt on the other path is modal and would hang xpcshell (bug 2059370).
function buildVEvent(uid, summary, day) {
  return [
    "BEGIN:VEVENT",
    "UID:" + uid,
    "SUMMARY:" + summary,
    "LAST-MODIFIED:20220316T100000Z",
    "DTSTART:202203" + day + "T120000Z",
    "DTEND:202203" + day + "T130000Z",
    "DTSTAMP:20220316T100000Z",
    "END:VEVENT",
  ].join("\r\n");
}

function buildIcs(...events) {
  return (
    ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN"].join("\r\n") +
    "\r\n" +
    events.join("\r\n") +
    "\r\nEND:VCALENDAR"
  );
}

function registerTestCalendar() {
  const calendar = cal.manager.createCalendar("ics", Services.io.newURI(ICSServer.url));
  calendar.name = "offlinePlayback";
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", true);
  cal.manager.registerCalendar(calendar);
  const registered = cal.manager.getCalendarById(calendar.id);
  // Unregister the calendar if the task failed before doing it itself.
  registerCleanupFunction(() => {
    if (cal.manager.getCalendarById(registered.id)) {
      cal.manager.unregisterCalendar(registered);
    }
  });
  return new Promise(resolve => {
    const observer = {
      QueryInterface: ChromeUtils.generateQI(["calIObserver"]),
      onStartBatch() {},
      onEndBatch() {},
      onAddItem() {},
      onModifyItem() {},
      onDeleteItem() {},
      onError() {},
      onPropertyChanged() {},
      onPropertyDeleting() {},
      onLoad() {
        registered.removeObserver(observer);
        registered.setProperty("refreshInterval", "0");
        resolve(registered);
      },
    };
    registered.addObserver(observer);
  });
}

/**
 * Runs body() with the offline mode switched on.
 *
 * @param {Function} body - The asynchronous function to run while offline.
 */
async function whileOffline(body) {
  const wasManaged = Services.io.manageOfflineStatus;
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;
  try {
    await body();
  } finally {
    Services.io.offline = false;
    Services.io.manageOfflineStatus = wasManaged;
  }
}

/** Adds event C on the server, the way another client would. */
async function addEventCOnServer() {
  await ICSServer.putICSInternal(
    ICSServer.ics.replace("END:VCALENDAR", buildVEvent(UID_C, "C", "20") + "\r\nEND:VCALENDAR")
  );
}

/**
 * Asserts that event C survived the synchronization on both sides.
 *
 * @param {calICalendar} calendar - The registered cached calendar.
 */
async function assertEventCSurvived(calendar) {
  Assert.ok(ICSServer.ics.includes("UID:" + UID_C), "event C is still on the server");
  Assert.ok(await calendar.getItem(UID_C), "event C arrived in the cache");
}

/**
 * Waits until no synchronization is running, so the next step cannot interleave
 * with it. There is no public signal for this, hence the two guards: they fail
 * the test loudly if either member is ever renamed.
 *
 * @param {calICalendar} calendar - The registered cached calendar.
 */
function waitForSyncSettled(calendar) {
  const cached = calendar.wrappedJSObject;
  const uncached = cached.mUncachedCalendar.wrappedJSObject;
  Assert.ok("mPendingSync" in cached, "the cached calendar exposes mPendingSync");
  Assert.equal(typeof uncached._isLocked, "boolean", "the ICS calendar exposes _isLocked");
  return TestUtils.waitForCondition(
    () => !cached.mPendingSync && !uncached._isLocked,
    "waiting for the synchronization to settle",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
}

add_setup(async function () {
  do_get_profile();
  ICSServer.open();
  registerCleanupFunction(() => ICSServer.close());
});

/**
 * An offline modification reaches the server, and the event modified online
 * just before survives the playback - its cache callback must not leak into it.
 */
add_task(async function testOfflineModify() {
  // Put events A and B on the server and subscribe to the calendar.
  await ICSServer.putICSInternal(
    buildIcs(buildVEvent(UID_A, "A", "17"), buildVEvent(UID_B, "B", "18"))
  );
  const calendar = await registerTestCalendar();
  const a = await calendar.getItem(UID_A);
  Assert.ok(a && (await calendar.getItem(UID_B)), "both events were synced");

  // Modify A while online.
  const aChanged = a.clone();
  aChanged.title = "A modified";
  await calendar.modifyItem(aChanged, a);
  await TestUtils.waitForCondition(
    () => ICSServer.ics.includes("A modified"),
    "waiting for the online modification of A to reach the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
  await waitForSyncSettled(calendar);

  // Modify the offline copy of B.
  await whileOffline(async () => {
    // Read B again, the synchronization above recreated the cache.
    const bCached = await calendar.getItem(UID_B);
    const bChanged = bCached.clone();
    bChanged.title = "B modified";
    await calendar.modifyItem(bChanged, bCached);
  });

  // Add an event to the server, so that a refresh is necessary, and perform the refresh.
  await addEventCOnServer();
  await calendar.refresh();

  // Check the events are correct on the server and in the cache.
  await TestUtils.waitForCondition(
    () => ICSServer.ics.includes("B modified"),
    "waiting for the offline modification of B to reach the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
  await TestUtils.waitForCondition(
    async () => (await calendar.getItem(UID_B))?.title == "B modified",
    "waiting for the cache to keep the offline modification of B",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  // Check A survived the playback of B and nothing was duplicated.
  const aAfter = await calendar.getItem(UID_A);
  Assert.ok(aAfter, "event A still exists after the playback of B");
  Assert.equal(aAfter?.title, "A modified", "event A kept its modification");
  const all = await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
  Assert.equal(all.filter(item => item.id == UID_A).length, 1, "exactly one copy of A");
  Assert.equal(all.filter(item => item.id == UID_B).length, 1, "exactly one copy of B");
  Assert.ok(ICSServer.ics.includes("A modified"), "A's modification is still on the server");
  await assertEventCSurvived(calendar);

  cal.manager.unregisterCalendar(calendar);
});

/** An event created while offline reaches the server. */
add_task(async function testOfflineCreate() {
  // Put event A on the server and subscribe to the calendar.
  await ICSServer.putICSInternal(buildIcs(buildVEvent(UID_A, "A", "17")));
  const calendar = await registerTestCalendar();
  Assert.ok(await calendar.getItem(UID_A), "the existing event was synced");

  // Create an event while offline.
  await whileOffline(async () => {
    const event = new CalEvent(buildIcs(buildVEvent("event-new", "N", "19")));
    await calendar.addItem(event);
  });

  // Add an event to the server, so that a refresh is necessary, and perform the refresh.
  await addEventCOnServer();
  await calendar.refresh();

  // Check the events are correct on the server and in the cache.
  await TestUtils.waitForCondition(
    () => ICSServer.ics.includes("UID:event-new"),
    "waiting for the offline created event to reach the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  Assert.ok(await calendar.getItem("event-new"), "the created event is in the cache");
  Assert.ok(await calendar.getItem(UID_A), "the existing event survived");
  const all = await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
  Assert.equal(
    all.filter(item => item.id == "event-new").length,
    1,
    "exactly one copy of the new event"
  );
  Assert.equal(
    all.filter(item => item.id == UID_A).length,
    1,
    "exactly one copy of the existing event"
  );
  await assertEventCSurvived(calendar);

  cal.manager.unregisterCalendar(calendar);
});

/** An event deleted while offline is deleted from the server. */
add_task(async function testOfflineDelete() {
  // Put events A and B on the server and subscribe to the calendar.
  await ICSServer.putICSInternal(
    buildIcs(buildVEvent(UID_A, "A", "17"), buildVEvent(UID_B, "B", "18"))
  );
  const calendar = await registerTestCalendar();
  const b = await calendar.getItem(UID_B);
  Assert.ok(b, "the event to delete was synced");

  // Delete B while offline.
  await whileOffline(async () => {
    await calendar.deleteItem(b);
  });

  // Add an event to the server, so that a refresh is necessary, and perform the refresh.
  await addEventCOnServer();
  await calendar.refresh();

  // Check the events are correct on the server and in the cache.
  await TestUtils.waitForCondition(
    () => !ICSServer.ics.includes("UID:" + UID_B),
    "waiting for the offline deletion of B to reach the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  // The playback removes B from the cache after the server confirmed, so poll.
  await TestUtils.waitForCondition(
    async () => !(await calendar.getItem(UID_B)),
    "waiting for B to stay deleted in the cache",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
  Assert.ok(await calendar.getItem(UID_A), "the other event survived");
  await assertEventCSurvived(calendar);

  cal.manager.unregisterCalendar(calendar);
});
