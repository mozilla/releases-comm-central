/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that playing back an offline modification does not corrupt other
 * events in the cache. The cached calendar hands its cache-update callback to
 * the CalDAV calendar through a member field; when that field outlives its
 * operation, the next direct modification - the offline playback - runs the
 * leftover callback and writes its own item paired with the previous
 * operation's old item, deleting that event from the cache.
 */

var { CalDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalDAVServer.sys.mjs"
);
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

// The playback chain (refresh, playback, cache update) can take a moment, so
// poll longer than the TestUtils default.
const WAIT_INTERVAL = 200;
const WAIT_TRIES = 100;

const UID_A = "event-a";
const UID_B = "event-b";
const PATH_A = "/calendars/alice/test/event-a.ics";
const PATH_B = "/calendars/alice/test/event-b.ics";

function buildIcs(uid, summary) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Test//EN",
    "BEGIN:VEVENT",
    "UID:" + uid,
    "SUMMARY:" + summary,
    "DTSTART:20220317T120000Z",
    "DTEND:20220317T130000Z",
    "DTSTAMP:20220317T100000Z",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function registerTestCalendar() {
  const calendar = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI(`${CalDAVServer.origin}/calendars/alice/test/`)
  );
  calendar.name = "offlinePlayback";
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", true);
  calendar.setProperty("username", "alice");
  cal.manager.registerCalendar(calendar);
  const registered = cal.manager.getCalendarById(calendar.id);
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
 * Waits until the playback of the offline modification has completed: the
 * server holds the modification and the item's offline flag has been reset,
 * which happens after the cache-update callback - the one that must not leak -
 * has already run.
 *
 * @param {calICalendar} calendar - The registered cached calendar.
 * @param {string} path - The item's path on the CalDAVServer.
 * @param {string} uid - The item's UID.
 * @param {string} needle - Text the item on the server must contain.
 */
async function waitForPlayback(calendar, path, uid, needle) {
  await TestUtils.waitForCondition(
    () => CalDAVServer.items.get(path)?.ics.includes(needle),
    "waiting for the offline modification to reach the server",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
  const storage = calendar.wrappedJSObject.mCachedCalendar;
  await TestUtils.waitForCondition(
    async () => {
      const item = await storage.getItem(uid);
      return item && !(await storage.getItemOfflineFlag(item));
    },
    "waiting for the offline flag to be reset after the playback",
    WAIT_INTERVAL,
    WAIT_TRIES
  );
}

add_setup(async function () {
  do_get_profile();
  CalDAVServer.open("alice", "alice");
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(CalDAVServer.origin, null, "test", "alice", "alice", "", "");
  await Services.logins.addLoginAsync(loginInfo);
  registerCleanupFunction(() => {
    CalDAVServer.close();
  });
});

add_task(async function testOfflineModifyPlaybackKeepsOtherEvents() {
  // The server starts out with events A and B.
  await CalDAVServer.putItemInternal(PATH_A, buildIcs(UID_A, "A"));
  await CalDAVServer.putItemInternal(PATH_B, buildIcs(UID_B, "B"));

  // Subscribing to the calendar syncs both events into the cache.
  const calendar = await registerTestCalendar();
  const a = await calendar.getItem(UID_A);
  Assert.ok(a && (await calendar.getItem(UID_B)), "both events were synced");

  // Modify A while online. This is the operation whose cache callback must not
  // survive into the playback further down.
  const aChanged = a.clone();
  aChanged.title = "A modified";
  await calendar.modifyItem(aChanged, a);

  // Modify B while offline. The change only reaches the cache and is flagged
  // there for the next synchronization.
  const wasManaged = Services.io.manageOfflineStatus;
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;
  try {
    const bCached = await calendar.getItem(UID_B);
    const bChanged = bCached.clone();
    bChanged.title = "B modified";
    await calendar.modifyItem(bChanged, bCached);
  } finally {
    Services.io.offline = false;
    Services.io.manageOfflineStatus = wasManaged;
  }

  // Back online, the refresh plays B's offline modification back to the server.
  await calendar.refresh();
  await waitForPlayback(calendar, PATH_B, UID_B, "B modified");

  // A must be untouched by that playback - it is the event a leaked callback
  // would delete - and each event must exist exactly once.
  const aAfter = await calendar.getItem(UID_A);
  Assert.ok(aAfter, "event A still exists after the playback of B");
  Assert.equal(aAfter?.title, "A modified", "event A kept its modification");
  const all = await calendar.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_ALL_ITEMS, 0, null, null);
  Assert.equal(all.filter(item => item.id == UID_A).length, 1, "exactly one copy of A");
  Assert.equal(all.filter(item => item.id == UID_B).length, 1, "exactly one copy of B");

  cal.manager.unregisterCalendar(calendar);
});
