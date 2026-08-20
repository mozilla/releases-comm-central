/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that changes made to a cached ICS calendar while offline are played
 * back to the server by the next synchronization instead of being silently
 * discarded (bug 2052714), and that the playback does not corrupt other
 * events in the cache.
 *
 * Also tests the conflict prompt the synchronization raises when the server
 * copy has moved on in the meantime (bug 2059370): when it appears, what it is
 * asked about, and what each answer does to both sides.
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

// LAST-MODIFIED decides which copy the synchronization considers the newer one.
// It defaults to the past, so an offline edit always wins and the plain modify
// path runs. The conflict tasks pass a stamp of their own to lose that race.
function buildVEvent(uid, summary, day, lastModified = "20220316T100000Z") {
  return [
    "BEGIN:VEVENT",
    "UID:" + uid,
    "SUMMARY:" + summary,
    "LAST-MODIFIED:" + lastModified,
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

/**
 * Creates a cached ICS calendar on the mock server and registers it.
 *
 * @returns {calICalendar} The registered calendar, once it has finished loading.
 */
async function registerTestCalendar() {
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
  await waitForLoad(registered);
  registered.setProperty("refreshInterval", "0");
  return registered;
}

/**
 * Resolves once the calendar reports being loaded. The cached calendar defers
 * that notification until the synchronization the load triggered has finished,
 * so this covers the playback of the offline changes as well.
 *
 * @param {calICalendar} calendar - The registered cached calendar.
 * @returns {Promise<void>}
 */
function waitForLoad(calendar) {
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
        calendar.removeObserver(observer);
        resolve();
      },
    };
    calendar.addObserver(observer);
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

/**
 * Stands in for the conflict dialog, which is modal and would hang xpcshell.
 * Records what it was asked and answers with whatever `overwrite` is set to.
 * Everything behind this stub is out of reach here.
 */
const MockConflictPrompt = {
  _origFunc: null,
  overwrite: false,
  prompts: [],

  register() {
    if (!this._origFunc) {
      this._origFunc = cal.provider.promptOverwrite;
      cal.provider.promptOverwrite = (mode, item) => {
        this.prompts.push({ mode, id: item.id, title: item.title });
        return this.overwrite;
      };
    }
  },

  unregister() {
    if (this._origFunc) {
      cal.provider.promptOverwrite = this._origFunc;
      this._origFunc = null;
    }
  },

  /**
   * @param {boolean} overwrite - The answer the dialog is to give from now on.
   */
  reset(overwrite) {
    this.prompts.length = 0;
    this.overwrite = overwrite;
  },
};

/**
 * Puts events A and B on the server, subscribes to the calendar and changes B
 * while offline. B is the event the conflict tasks fight over, A the bystander.
 *
 * @param {Function} changeB - Called with the calendar and the cached copy of B.
 * @returns {calICalendar} The registered cached calendar.
 */
async function calendarWithOfflineChangeToB(changeB) {
  await ICSServer.putICSInternal(
    buildIcs(buildVEvent(UID_A, "A", "17"), buildVEvent(UID_B, "B", "18"))
  );
  const calendar = await registerTestCalendar();
  const b = await calendar.getItem(UID_B);
  Assert.ok(b, "event B should be in the cache before going offline");
  await whileOffline(() => changeB(calendar, b));
  return calendar;
}

/**
 * Rewrites the server copy of B, the way another client would after the offline
 * change. Its LAST-MODIFIED makes it the newer copy, which is what the
 * synchronization raises the conflict on.
 *
 * @param {string} summary - The summary the other client gave B.
 * @param {string} [stamp] - The LAST-MODIFIED to give it. Defaults to an hour
 *   from now: storing an offline edit restamps the item with the current time,
 *   so only the future beats it. An offline deletion leaves the stamp alone and
 *   those callers pass their own.
 */
async function putNewerServerCopyOfB(summary, stamp) {
  stamp ||= new Date(Date.now() + 3600000).toISOString().replace(/[-:]|\.\d+/g, "");
  await ICSServer.putICSInternal(
    buildIcs(buildVEvent(UID_A, "A", "17"), buildVEvent(UID_B, summary, "18", stamp))
  );
}

/**
 * Asserts that the synchronization went through without asking. The server copy
 * being untouched is the only reason the tasks above never see the prompt.
 */
function assertNoConflictRaised() {
  Assert.deepEqual(MockConflictPrompt.prompts, [], "the synchronization should not ask anything");
}

/**
 * Asserts that the synchronization raised exactly one conflict, about B.
 *
 * @param {string} mode - The conflict mode expected, "modify" or "delete".
 * @param {string} title - The summary of the copy the prompt is to be handed.
 *   Always the offline copy: the point of asking is what to do with it.
 */
function assertPromptedAboutB(mode, title) {
  Assert.equal(MockConflictPrompt.prompts.length, 1, "should prompt exactly once");
  Assert.equal(MockConflictPrompt.prompts[0]?.mode, mode, `should prompt in ${mode} mode`);
  Assert.equal(MockConflictPrompt.prompts[0]?.id, UID_B, "should prompt about event B");
  Assert.equal(
    MockConflictPrompt.prompts[0]?.title,
    title,
    "should be handed the offline copy of B"
  );
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

/** Refreshes the calendar and waits for the synchronization to finish. */
async function refreshAndWait(calendar) {
  const loaded = waitForLoad(calendar);
  calendar.refresh();
  await loaded;
  await waitForSyncSettled(calendar);
}

add_setup(async function () {
  do_get_profile();
  ICSServer.open();
  registerCleanupFunction(() => ICSServer.close());
  // Registered for every task, so that a synchronization which unexpectedly
  // raises a conflict fails the test instead of hanging on the dialog.
  MockConflictPrompt.register();
  registerCleanupFunction(() => MockConflictPrompt.unregister());
});

/**
 * An offline modification reaches the server, and the event modified online
 * just before survives the playback - its cache callback must not leak into it.
 */
add_task(async function testOfflineModify() {
  MockConflictPrompt.reset(false);

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

  assertNoConflictRaised();

  cal.manager.unregisterCalendar(calendar);
});

/** An event created while offline reaches the server. */
add_task(async function testOfflineCreate() {
  MockConflictPrompt.reset(false);

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

  assertNoConflictRaised();

  cal.manager.unregisterCalendar(calendar);
});

/** An event deleted while offline is deleted from the server. */
add_task(async function testOfflineDelete() {
  MockConflictPrompt.reset(false);

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

  assertNoConflictRaised();

  cal.manager.unregisterCalendar(calendar);
});

/**
 * An offline modification collides with a modification another client made on
 * the server. Accepting the prompt puts the offline version on the server.
 */
add_task(async function testModifyVsServerEditAccepted() {
  MockConflictPrompt.reset(true);

  // Modify B while offline.
  const calendar = await calendarWithOfflineChangeToB(async (registered, b) => {
    const changed = b.clone();
    changed.title = "B offline";
    await registered.modifyItem(changed, b);
  });

  // Another client modifies B on the server after that, then synchronize.
  await putNewerServerCopyOfB("B server");
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to overwrite.
  assertPromptedAboutB("modify", "B offline");
  Assert.ok(ICSServer.ics.includes("B offline"), "the accepted overwrite should reach the server");
  Assert.ok(!ICSServer.ics.includes("B server"), "the server copy of B should be gone");
  Assert.equal(
    (await calendar.getItem(UID_B))?.title,
    "B offline",
    "the cache should hold the offline version of B"
  );

  // The bystander is untouched.
  Assert.equal((await calendar.getItem(UID_A))?.title, "A", "event A should be unchanged");

  cal.manager.unregisterCalendar(calendar);
});

/**
 * Declining the same conflict keeps the server version and drops the offline
 * modification, which the recreated cache no longer holds either.
 */
add_task(async function testModifyVsServerEditDeclined() {
  MockConflictPrompt.reset(false);

  // Modify B while offline.
  const calendar = await calendarWithOfflineChangeToB(async (registered, b) => {
    const changed = b.clone();
    changed.title = "B offline";
    await registered.modifyItem(changed, b);
  });

  // Another client modifies B on the server after that, then synchronize.
  await putNewerServerCopyOfB("B server");
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to keep the server copy.
  assertPromptedAboutB("modify", "B offline");
  Assert.ok(ICSServer.ics.includes("B server"), "the server should keep its version of B");
  Assert.ok(
    !ICSServer.ics.includes("B offline"),
    "the offline version should not reach the server"
  );
  Assert.equal(
    (await calendar.getItem(UID_B))?.title,
    "B server",
    "the cache should drop the offline version of B"
  );

  cal.manager.unregisterCalendar(calendar);
});

/**
 * An offline deletion collides with a modification another client made on the
 * server - playing it back would destroy a change nobody here has seen, which
 * is the only reason a deletion is worth asking about. Accepting the prompt
 * deletes the event after all.
 */
add_task(async function testDeleteVsServerEditAccepted() {
  MockConflictPrompt.reset(true);

  // Delete B while offline.
  const calendar = await calendarWithOfflineChangeToB((registered, b) => registered.deleteItem(b));

  // Another client modifies B on the server after that, then synchronize.
  await putNewerServerCopyOfB("B server", "20220317T100000Z");
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to delete it anyway.
  assertPromptedAboutB("delete", "B");
  Assert.ok(
    !ICSServer.ics.includes("UID:" + UID_B),
    "the accepted deletion should reach the server"
  );
  // The playback does not await the removal from the cache, so poll for it.
  await TestUtils.waitForCondition(
    async () => !(await calendar.getItem(UID_B)),
    "waiting for B to leave the cache",
    WAIT_INTERVAL,
    WAIT_TRIES
  );

  cal.manager.unregisterCalendar(calendar);
});

/**
 * Declining the same conflict keeps the event on the server, and the recreated
 * cache brings it back.
 */
add_task(async function testDeleteVsServerEditDeclined() {
  MockConflictPrompt.reset(false);

  // Delete B while offline.
  const calendar = await calendarWithOfflineChangeToB((registered, b) => registered.deleteItem(b));

  // Another client modifies B on the server after that, then synchronize.
  await putNewerServerCopyOfB("B server", "20220317T100000Z");
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to keep it.
  assertPromptedAboutB("delete", "B");
  Assert.ok(ICSServer.ics.includes("UID:" + UID_B), "B should still be on the server");
  Assert.equal(
    (await calendar.getItem(UID_B))?.title,
    "B server",
    "the cache should hold the server version of B again"
  );

  cal.manager.unregisterCalendar(calendar);
});

/**
 * The mirror image: an offline modification of an event another client has
 * deleted on the server. Accepting the prompt puts the event back.
 */
add_task(async function testModifyVsServerDeleteAccepted() {
  MockConflictPrompt.reset(true);

  // Modify B while offline.
  const calendar = await calendarWithOfflineChangeToB(async (registered, b) => {
    const changed = b.clone();
    changed.title = "B offline";
    await registered.modifyItem(changed, b);
  });

  // Another client deletes B on the server after that, then synchronize.
  await ICSServer.putICSInternal(buildIcs(buildVEvent(UID_A, "A", "17")));
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to bring it back.
  assertPromptedAboutB("modify", "B offline");
  Assert.ok(ICSServer.ics.includes("B offline"), "the re-added B should reach the server");
  Assert.equal(
    (await calendar.getItem(UID_B))?.title,
    "B offline",
    "the cache should hold the re-added B"
  );

  cal.manager.unregisterCalendar(calendar);
});

/** Declining the same conflict leaves the event deleted on both sides. */
add_task(async function testModifyVsServerDeleteDeclined() {
  MockConflictPrompt.reset(false);

  // Modify B while offline.
  const calendar = await calendarWithOfflineChangeToB(async (registered, b) => {
    const changed = b.clone();
    changed.title = "B offline";
    await registered.modifyItem(changed, b);
  });

  // Another client deletes B on the server after that, then synchronize.
  await ICSServer.putICSInternal(buildIcs(buildVEvent(UID_A, "A", "17")));
  await refreshAndWait(calendar);

  // The synchronization asked about B, and the answer was to let it go.
  assertPromptedAboutB("modify", "B offline");
  Assert.ok(!ICSServer.ics.includes("UID:" + UID_B), "B should stay deleted on the server");
  const remaining = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
    0,
    null,
    null
  );
  Assert.deepEqual(
    remaining.map(item => item.id),
    [UID_A],
    "B should stay deleted in the cache"
  );

  cal.manager.unregisterCalendar(calendar);
});
