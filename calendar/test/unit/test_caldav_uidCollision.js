/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests recovery from an "accept before sync" UID conflict (bug 1717401).
 *
 * A CalDAV server doing server-side scheduling (RFC 6638) writes an event into
 * the invitee's calendar under its own object URI as soon as the invitation
 * arrives. If the user accepts the invitation before that copy has synced, the
 * client does not know the server's URI and tries to create the event itself.
 * The server rejects the create because the UID already exists. The provider
 * reports calIErrors.UID_CONFLICT and the invitation code recovers by syncing
 * and applying the response to the existing event with modifyItem, which also
 * replies to the organizer - the same path as an ordinary accept-after-sync.
 */

var { CalDAVServer } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalDAVServer.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");
var { TestUtils } = ChromeUtils.importESModule("resource://testing-common/TestUtils.sys.mjs");

// Keep the UID free of characters the test server rejects in object paths
// (it only allows [\w-]+.ics); the provider derives the PUT path from the UID.
const UID = "accept-before-sync-1717401";
// The test calendar authenticates as "alice"; the CalDAV provider derives the
// user's calendar address as "mailto:alice@invalid", so the invitee uses that.
const USER = "mailto:alice@invalid";
const ORGANIZER = "mailto:organizer@example.com";
// Where the server stored its own copy of the event.
const SERVER_PATH = "/calendars/alice/test/server-scheduled.ics";
// A fixed DTSTAMP so the invitation and the server's copy are the same revision.
const DTSTAMP = "20220317T100000Z";

// REPLY messages the client tried to send to the organizer, recorded by the
// stubbed iMIP transport.
let sentReplies = [];

// How often processItipItem handed us an action while the last accept ran.
let optionsFuncCalls = 0;

/**
 * Build a serialized calendar object for the invitation, with the invitee
 * (USER) as an attendee.
 *
 * @param {object} options
 * @param {string} options.partStat - The invitee's participation status.
 * @param {number} [options.sequence] - The SEQUENCE of the event.
 * @param {string} [options.method] - The iTIP METHOD, if any.
 * @param {string} [options.uid] - The UID of the event.
 * @param {string} [options.dtstamp] - The DTSTAMP of the event.
 * @returns {string} The serialized VCALENDAR.
 */
function buildIcs({ partStat, sequence = 0, method, uid = UID, dtstamp = DTSTAMP }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN"];
  if (method) {
    lines.push("METHOD:" + method);
  }
  lines.push(
    "BEGIN:VEVENT",
    "UID:" + uid,
    "SUMMARY:Team meeting",
    "DTSTART:20220317T120000Z",
    "DTEND:20220317T130000Z",
    "DTSTAMP:" + dtstamp,
    "SEQUENCE:" + sequence,
    "ORGANIZER;CN=Organizer:" + ORGANIZER,
    "ATTENDEE;CN=Alice;PARTSTAT=" + partStat + ";RSVP=TRUE:" + USER,
    "END:VEVENT",
    "END:VCALENDAR"
  );
  return lines.join("\r\n");
}

/**
 * Register a CalDAV calendar for the test collection and wait for its first
 * sync to finish.
 *
 * @param {boolean} [cached=true] - Whether to enable the offline cache.
 * @returns {Promise<calICalendar>} The registered calendar.
 */
function registerTestCalendar(cached = true) {
  const calendar = cal.manager.createCalendar(
    "caldav",
    Services.io.newURI(`${CalDAVServer.origin}/calendars/alice/test/`)
  );
  calendar.name = "uidCollision";
  calendar.id = cal.getUUID();
  calendar.setProperty("cache.enabled", cached);
  calendar.setProperty("username", "alice");
  cal.manager.registerCalendar(calendar);

  const registered = cal.manager.getCalendarById(calendar.id);
  // Unregister the calendar if the task failed before doing it itself.
  registerCleanupFunction(() => {
    if (cal.manager.getCalendarById(registered.id)) {
      cal.manager.unregisterCalendar(registered);
    }
  });
  return new Promise(resolve => {
    /** @implements {calIObserver} */
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
 * Drive processItipItem for the invitation against the given calendar and
 * return the create action (the cache is stale, so no item is found).
 *
 * @param {calICalendar} calendar - The (stale) target calendar.
 * @returns {Promise<Function>} The action function to run to accept/decline.
 */
async function getCreateAction(calendar) {
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(buildIcs({ partStat: "NEEDS-ACTION", method: "REQUEST" }));
  itipItem.receivedMethod = "REQUEST";
  itipItem.responseMethod = "REPLY";
  itipItem.autoResponse = Ci.calIItipItem.AUTO;
  itipItem.targetCalendar = calendar;

  optionsFuncCalls = 0;
  const processed = await new Promise(resolve => {
    cal.itip.processItipItem(itipItem, (item, rc, actionFunc, foundItems) => {
      optionsFuncCalls++;
      resolve({ rc, actionFunc, foundItems });
    });
  });
  Assert.ok(Components.isSuccessCode(processed.rc), "processItipItem succeeded");
  Assert.equal(processed.foundItems.length, 0, "the event was not found in the stale cache");
  Assert.equal(processed.actionFunc.method, "REQUEST", "the create path was chosen");
  return processed.actionFunc;
}

/**
 * Run an action function and resolve with its final {status, opType}.
 *
 * @param {Function} actionFunc - The action returned by getCreateAction.
 * @param {string} partStat - The participation status to apply.
 * @returns {Promise<{status: number, opType: number}>} The operation result.
 */
function runAction(actionFunc, partStat) {
  return new Promise(resolve => {
    const opListener = {
      QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
      onOperationComplete(_calendar, status, opType) {
        resolve({ status, opType });
      },
      onGetResult() {},
    };
    actionFunc(opListener, partStat, null);
  });
}

/**
 * Wait for the reconciliation to reach the server's resource and our cache.
 * The offline tests depend on this having happened; `calendar.refresh()`
 * returns before the synchronisation it starts has finished.
 *
 * @param {calICalendar} calendar - The calendar holding the cached copy.
 * @param {string} partStat - The status both copies must end up with.
 */
async function waitForReconciliation(calendar, partStat) {
  await TestUtils.waitForCondition(
    () => CalDAVServer.items.get(SERVER_PATH)?.ics.includes(`PARTSTAT=${partStat}`),
    `the server's resource carries PARTSTAT=${partStat}`
  );
  await TestUtils.waitForCondition(
    async () =>
      (await calendar.getItem(UID))?.getAttendeeById(USER).participationStatus == partStat,
    `the cached copy carries PARTSTAT=${partStat}`
  );
}

/**
 * Wait until the server has not received a request for a short period, so
 * background requests settle before the calendar is torn down. Nothing is
 * asserted after this, use waitForReconciliation() for that.
 */
async function waitForServerQuiescence() {
  let last = -1;
  while (last != CalDAVServer.requestCount) {
    last = CalDAVServer.requestCount;
    await new Promise(resolve => do_timeout(250, resolve));
  }
}

/** Count the resources on the server whose UID matches the test event. */
function serverItemCountForUid() {
  let count = 0;
  for (const item of CalDAVServer.items.values()) {
    if (CalDAVServer._extractUid(item.ics) == UID) {
      count++;
    }
  }
  return count;
}

add_setup(async function () {
  do_get_profile();

  CalDAVServer.open("alice", "alice");
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(Ci.nsILoginInfo);
  loginInfo.init(CalDAVServer.origin, null, "test", "alice", "alice", "", "");
  await Services.logins.addLoginAsync(loginInfo);

  // Record the REPLY the client sends to the organizer instead of mailing it.
  const originalTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => ({
    QueryInterface: ChromeUtils.generateQI(["calIItipTransport"]),
    scheme: "mailto",
    type: "email",
    senderAddress: USER,
    sendItems(recipients, itipItem) {
      sentReplies.push({
        method: itipItem.responseMethod,
        recipients: Array.from(recipients, attendee => attendee.id),
      });
      return true;
    },
  });

  registerCleanupFunction(() => {
    cal.itip.getImipTransport = originalTransport;
    CalDAVServer.close();
  });
});

/**
 * Accept before the server's copy has synced and check that the recovery
 * updates the existing event (no duplicate) and replies to the organizer.
 *
 * @param {string} style - The server's rejection shape.
 * @param {boolean} cached - Whether the calendar uses the offline cache.
 * @param {object} [buildIcsArgs] - Extra arguments for the copy the server
 *   deposited in the calendar.
 */
async function runAcceptBeforeSync(style, cached, buildIcsArgs = {}) {
  const serverIcs = buildIcs({ partStat: "NEEDS-ACTION", ...buildIcsArgs });
  const label = `"${style}"${cached ? "" : " (uncached)"}`;
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar(cached);

  // The server schedules the event into the calendar after our initial
  // sync, so our local copy of the collection does not know about it yet.
  CalDAVServer.conflictResponseStyle = style;
  await CalDAVServer.putItemInternal(SERVER_PATH, serverIcs);
  Assert.equal(await calendar.getItem(UID), null, `stale local data for ${label}`);

  const action = await getCreateAction(calendar);
  const result = await runAction(action, "ACCEPTED");

  Assert.ok(
    Components.isSuccessCode(result.status),
    `accepting before sync succeeds for ${label} (status=${result.status.toString(16)})`
  );
  Assert.equal(
    result.opType,
    Ci.calIOperationListener.MODIFY,
    `recovery updates the existing event rather than creating one for ${label}`
  );

  // Once for the invitation and once for the event the recovery leaves behind.
  // Without the guard in processFoundItems() the sync during the recovery
  // offers a third one, which replaces the action the user is running - in the
  // invitation bar the buttons reappear for a moment.
  Assert.equal(
    optionsFuncCalls,
    2,
    `the invitation is not offered again during the recovery for ${label}`
  );
  Assert.equal(serverItemCountForUid(), 1, `no duplicate on the server for ${label}`);
  Assert.ok(
    CalDAVServer.items.get(SERVER_PATH).ics.includes("PARTSTAT=ACCEPTED"),
    `the server's resource was updated in place for ${label}`
  );
  const stored = await calendar.getItem(UID);
  Assert.equal(
    stored.getAttendeeById(USER).participationStatus,
    "ACCEPTED",
    `the local copy carries the acceptance for ${label}`
  );
  Assert.ok(
    sentReplies.some(m => m.method == "REPLY" && m.recipients.includes(ORGANIZER)),
    `a REPLY was sent to the organizer for ${label}`
  );

  await waitForServerQuiescence();
  cal.manager.unregisterCalendar(calendar);
}

/**
 * Accepting before the server's copy has synced must succeed by updating the
 * existing event (not creating a duplicate) and reply to the organizer, for
 * every real-world rejection shape: Nextcloud's bare 400, Radicale's and
 * SOGo's 409, the conformant 409 with the CALDAV:no-uid-conflict element and a
 * plain 412 for a copy stored at the requested URI itself.
 */
add_task(async function testAcceptBeforeSyncSabre400() {
  await runAcceptBeforeSync("sabre400", true);
});

add_task(async function testAcceptBeforeSyncRadicale409() {
  await runAcceptBeforeSync("radicale409", true);
});

add_task(async function testAcceptBeforeSyncSogo409() {
  await runAcceptBeforeSync("sogo409", true);
});

add_task(async function testAcceptBeforeSyncPrecondition409Href() {
  await runAcceptBeforeSync("precondition409href", true);
});

add_task(async function testAcceptBeforeSyncPlain412() {
  await runAcceptBeforeSync("plain412", true);
});

/**
 * The recovery must also work without the offline cache, where the provider's
 * rejection reaches the invitation code directly.
 */
add_task(async function testAcceptBeforeSyncResolvesUncached() {
  await runAcceptBeforeSync("sabre400", false);
});

/**
 * The recovery must not apply the response to a different revision of the
 * event, e.g. when the organizer sent an update after this invitation. The add
 * fails the way an unresolved conflict always has, and the server copy is left
 * untouched for the user to review after the sync.
 */
add_task(async function testNewerRevisionNotResolved() {
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar();

  CalDAVServer.conflictResponseStyle = "sabre400";
  const newerIcs = buildIcs({ partStat: "NEEDS-ACTION", sequence: 2 });
  await CalDAVServer.putItemInternal(SERVER_PATH, newerIcs);

  const action = await getCreateAction(calendar);
  const result = await runAction(action, "ACCEPTED");

  Assert.ok(
    !Components.isSuccessCode(result.status),
    "accepting an outdated revision fails instead of updating the newer copy"
  );
  Assert.equal(CalDAVServer.items.get(SERVER_PATH).ics, newerIcs, "the server copy is untouched");
  Assert.ok(
    !sentReplies.some(m => m.method == "REPLY"),
    "no REPLY is sent for the outdated revision"
  );

  await waitForServerQuiescence();
  cal.manager.unregisterCalendar(calendar);
});

/**
 * A calendar with "itip.disableRevisionChecks" waives the revision check in the
 * found NEEDS-ACTION path, so the recovery has to waive it too: the response is
 * applied even though the server's copy carries a newer SEQUENCE.
 */
add_task(async function testNewerRevisionResolvedWithoutRevisionChecks() {
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar();
  calendar.setProperty("itip.disableRevisionChecks", true);

  CalDAVServer.conflictResponseStyle = "sabre400";
  await CalDAVServer.putItemInternal(
    SERVER_PATH,
    buildIcs({ partStat: "NEEDS-ACTION", sequence: 2 })
  );

  const action = await getCreateAction(calendar);
  const result = await runAction(action, "ACCEPTED");

  Assert.ok(
    Components.isSuccessCode(result.status),
    `accepting succeeds without revision checks (status=${result.status.toString(16)})`
  );
  Assert.ok(
    CalDAVServer.items.get(SERVER_PATH).ics.includes("PARTSTAT=ACCEPTED"),
    "the response was applied to the newer server copy"
  );

  await waitForServerQuiescence();
  cal.manager.unregisterCalendar(calendar);
});

/**
 * A newer DTSTAMP alone is not a different revision: the server rewrites its
 * copy whenever another attendee replies. Like the found NEEDS-ACTION path, the
 * recovery compares the SEQUENCE only, so the acceptance is still applied.
 */
add_task(async function testNewerStampResolved() {
  await runAcceptBeforeSync("sabre400", true, { dtstamp: "20220317T110000Z" });
});

/**
 * The recovery must not act on a copy that already carries a response (e.g. the
 * invitation was answered on another client). Like the found path, a copy that
 * is no longer NEEDS-ACTION is left untouched and no second reply is sent.
 */
add_task(async function testAlreadyRespondedNotResolved() {
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar();

  CalDAVServer.conflictResponseStyle = "sabre400";
  const respondedIcs = buildIcs({ partStat: "ACCEPTED" });
  await CalDAVServer.putItemInternal(SERVER_PATH, respondedIcs);

  const action = await getCreateAction(calendar);
  const result = await runAction(action, "ACCEPTED");

  Assert.ok(
    !Components.isSuccessCode(result.status),
    "accepting an already-answered copy fails instead of replying twice"
  );
  Assert.equal(
    CalDAVServer.items.get(SERVER_PATH).ics,
    respondedIcs,
    "the already-answered server copy is untouched"
  );
  Assert.ok(!sentReplies.some(m => m.method == "REPLY"), "no second REPLY is sent");

  await waitForServerQuiescence();
  cal.manager.unregisterCalendar(calendar);
});

/**
 * Accept while offline and check that the reconnect applies the response to the
 * server's own copy.
 *
 * @param {object} [buildIcsArgs] - Extra arguments for the copy the server
 *   deposited in the calendar.
 */
async function runAcceptWhileOffline(buildIcsArgs = {}) {
  const serverIcs = buildIcs({ partStat: "NEEDS-ACTION", ...buildIcsArgs });
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar();

  CalDAVServer.conflictResponseStyle = "sabre400";
  await CalDAVServer.putItemInternal(SERVER_PATH, serverIcs);
  Assert.equal(await calendar.getItem(UID), null, "the event is not yet in our cache");

  // Go offline and accept; the response is queued as an offline create.
  const wasManaged = Services.io.manageOfflineStatus;
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;
  try {
    await calendar.addItem(new CalEvent(buildIcs({ partStat: "ACCEPTED" })));
    const offlineCopy = await calendar.getItem(UID);
    Assert.equal(
      offlineCopy.getAttendeeById(USER).participationStatus,
      "ACCEPTED",
      "the accepted event is stored locally while offline"
    );
  } finally {
    Services.io.offline = false;
    Services.io.manageOfflineStatus = wasManaged;
  }

  // Reconnect and sync: the queued create collides and must be reconciled.
  await calendar.refresh();
  await waitForReconciliation(calendar, "ACCEPTED");
  await waitForServerQuiescence();

  const stored = await calendar.getItem(UID);
  Assert.equal(
    stored.getAttendeeById(USER).participationStatus,
    "ACCEPTED",
    "the acceptance survived the reconnect"
  );
  Assert.equal(serverItemCountForUid(), 1, "no duplicate event on the server");
  Assert.ok(
    CalDAVServer.items.get(SERVER_PATH).ics.includes("PARTSTAT=ACCEPTED"),
    "the acceptance was written to the server's resource"
  );
  // This task stores the acceptance with addItem instead of driving the
  // invitation flow, so no REPLY is due here. Where the flow does run, the
  // REPLY goes out when the user accepts, not when the reconciliation writes
  // the response to the server - see testOfflineAcceptSecondDepositResync.
  Assert.equal(sentReplies.length, 0, "no client REPLY for the offline reconciliation");

  cal.manager.unregisterCalendar(calendar);
}

/**
 * Accepting an invitation while offline must not lose the response. The local
 * "Accept" is queued offline; on reconnect the queued create collides with the
 * server's own copy, and the reconciliation applies the response to it so the
 * next sync no longer overwrites the acceptance with the server's NEEDS-ACTION
 * copy.
 */
add_task(async function testAcceptWhileOfflineRecovers() {
  await runAcceptWhileOffline();
});

/**
 * The reconciliation compares the SEQUENCE only, like the online recovery, so a
 * server copy that merely got a newer DTSTAMP while we were offline still
 * receives the queued response.
 */
add_task(async function testOfflineNewerStampRecovers() {
  await runAcceptWhileOffline({ dtstamp: "20220317T110000Z" });
});

/**
 * Two invitations are deposited by the server; one is accepted through the
 * invitation flow while offline. After the reconnect sync reconciles it, the
 * event must remain locally, also after another offline/online cycle.
 */
add_task(async function testOfflineAcceptSecondDepositResync() {
  const UID2 = "second-deposit-1717401";
  const SERVER_PATH2 = "/calendars/alice/test/server-scheduled-2.ics";
  CalDAVServer.reset();
  sentReplies = [];
  const calendar = await registerTestCalendar();

  CalDAVServer.conflictResponseStyle = "sabre400";
  await CalDAVServer.putItemInternal(SERVER_PATH, buildIcs({ partStat: "NEEDS-ACTION" }));
  await CalDAVServer.putItemInternal(
    SERVER_PATH2,
    buildIcs({ partStat: "NEEDS-ACTION", uid: UID2 })
  );
  Assert.equal(await calendar.getItem(UID), null, "the events are not yet in our cache");

  // Accept the first invitation through the iTIP flow while offline.
  const wasManaged = Services.io.manageOfflineStatus;
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;
  try {
    const action = await getCreateAction(calendar);
    const result = await runAction(action, "ACCEPTED");
    Assert.ok(Components.isSuccessCode(result.status), "the offline accept is stored locally");
  } finally {
    Services.io.offline = false;
    Services.io.manageOfflineStatus = wasManaged;
  }

  await calendar.refresh();
  await waitForReconciliation(calendar, "ACCEPTED");
  await waitForServerQuiescence();

  Assert.ok(
    CalDAVServer.items.get(SERVER_PATH).ics.includes("PARTSTAT=ACCEPTED"),
    "the acceptance was written to the server's resource"
  );
  let stored = await calendar.getItem(UID);
  Assert.ok(stored, "the event is present after the reconciliation");

  // The user-reported trigger: another offline/online cycle and a manual sync.
  Services.io.manageOfflineStatus = false;
  Services.io.offline = true;
  Services.io.offline = false;
  Services.io.manageOfflineStatus = wasManaged;
  await calendar.refresh();
  await waitForServerQuiescence();

  stored = await calendar.getItem(UID);
  Assert.ok(stored, "the event survives another offline/online cycle");
  const occurrences = await calendar.getItemsAsArray(
    Ci.calICalendar.ITEM_FILTER_CLASS_OCCURRENCES | Ci.calICalendar.ITEM_FILTER_TYPE_ALL,
    0,
    cal.createDateTime("20220316T000000Z"),
    cal.createDateTime("20220319T000000Z")
  );
  const uids = occurrences.map(o => o.id);
  Assert.ok(uids.includes(UID), "the view query returns the accepted event");
  Assert.ok(uids.includes(UID2), "the view query returns the second deposit");
  Assert.equal(
    stored.getAttendeeById(USER).participationStatus,
    "ACCEPTED",
    "the acceptance is intact"
  );

  cal.manager.unregisterCalendar(calendar);
});
