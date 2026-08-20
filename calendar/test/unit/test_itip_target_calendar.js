/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that accepting an iMIP invitation honors the user-selected calendar:
 * the response is written to the chosen calendar, and the calendar chooser is
 * preselected to the calendar that already holds the event (or the default
 * calendar when it is not found).
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

const UID = "wrong-calendar-2016999";
const RECEIVER = "receiver@example.com";
const RECEIVER_ID = "mailto:receiver@example.com";
const STAMP = "20220317T191602Z";

let identity;
let otherIdentity;

/**
 * Build a serialized VCALENDAR for the invitation event.
 *
 * @param {object} options
 * @param {string} options.partStat - The receiver's participation status.
 * @param {boolean} [options.method] - Add METHOD:REQUEST (the incoming item).
 * @param {boolean} [options.received] - Add X-MOZ-RECEIVED-*, as a stored item
 *   that was received earlier carries it.
 * @returns {string} The serialized VCALENDAR.
 */
function buildIcs({ partStat, method, received }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN"];
  if (method) {
    lines.push("METHOD:REQUEST");
  }
  lines.push(
    "BEGIN:VEVENT",
    "UID:" + UID,
    "SUMMARY:Team meeting",
    "DTSTART:20220317T120000Z",
    "DTEND:20220317T130000Z",
    "DTSTAMP:" + STAMP,
    "SEQUENCE:0"
  );
  if (received) {
    lines.push("X-MOZ-RECEIVED-SEQUENCE:0", "X-MOZ-RECEIVED-DTSTAMP:" + STAMP);
  }
  lines.push(
    "ORGANIZER;CN=Organizer:mailto:organizer@example.com",
    "ATTENDEE;CN=Receiver;PARTSTAT=" + partStat + ";RSVP=TRUE:" + RECEIVER_ID,
    "END:VEVENT",
    "END:VCALENDAR"
  );
  return lines.join("\r\n") + "\r\n";
}

/**
 * Create a registered, writable scheduling memory calendar for the receiver.
 *
 * @param {string} name - The calendar name.
 * @param {boolean} isDefault - Whether it is the current default calendar.
 * @param {nsIMsgIdentity} [calIdentity] - The identity to configure; defaults
 *   to the receiver's identity.
 * @returns {calICalendar} The calendar.
 */
function makeCalendar(name, isDefault, calIdentity = identity) {
  const calendar = CalendarTestUtils.createCalendar(name, "memory");
  calendar.setProperty("imip.identity.key", calIdentity.key);
  if (isDefault) {
    calendar.setProperty("calendar-main-default", true);
  } else {
    calendar.deleteProperty("calendar-main-default");
  }
  return calendar;
}

/**
 * Seed an event with the invitation UID into a calendar.
 *
 * @param {calICalendar} calendar - The calendar to add the event to.
 * @param {string} partStat - The receiver's participation status.
 * @returns {Promise<calIItemBase>} The stored event.
 */
async function seedItem(calendar, partStat) {
  return calendar.addItem(new CalEvent(buildIcs({ partStat, received: true })));
}

/**
 * Return the receiver's participation status for the stored event, or null.
 *
 * @param {calICalendar} calendar - The calendar to read from.
 * @returns {Promise<?string>} The participation status, or null if absent.
 */
async function partStatIn(calendar) {
  const item = await calendar.getItem(UID);
  if (!item) {
    return null;
  }
  const attendee = item.getAttendeeById(RECEIVER_ID);
  return attendee ? attendee.participationStatus : null;
}

/**
 * Process the invitation against `searchCalendar` (where the event is looked
 * up), then simulate the user picking `chosenCalendar` in the chooser and run
 * the resulting action.
 *
 * @param {calICalendar} searchCalendar - The calendar/composite to search.
 * @param {calICalendar} chosenCalendar - The calendar the user selected.
 * @returns {Promise<object>} The action method and operation outcome.
 */
async function accept(searchCalendar, chosenCalendar) {
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(buildIcs({ partStat: "NEEDS-ACTION", method: true }));
  itipItem.receivedMethod = "REQUEST";
  itipItem.responseMethod = "REPLY";
  itipItem.autoResponse = Ci.calIItipItem.NONE;
  itipItem.targetCalendar = searchCalendar;

  const processed = await new Promise(resolve => {
    cal.itip.processItipItem(itipItem, (item, rc, actionFunc, foundItems) => {
      resolve({ rc, actionFunc, foundItems });
    });
  });
  Assert.ok(Components.isSuccessCode(processed.rc), "processItipItem should succeed");
  Assert.ok(processed.actionFunc, "an action function should be available");

  // Simulate the chooser selecting a calendar, as promptCalendar would.
  itipItem.targetCalendar = chosenCalendar;

  const opComplete = Promise.withResolvers();
  const opListener = {
    QueryInterface: ChromeUtils.generateQI(["calIOperationListener"]),
    onOperationComplete(_calendar, status, opType) {
      opComplete.resolve({ status, opType });
    },
    onGetResult() {},
  };
  processed.actionFunc(opListener, "ACCEPTED", null);
  const result = await opComplete.promise;
  return { method: processed.actionFunc.method, ...result };
}

/**
 * Run promptCalendar with a stubbed window and return the preselectId that the
 * chooser dialog would receive.
 *
 * @param {calICalendar} targetCalendar - The itip item's target (found single
 *   calendar, or a composite when not found).
 * @param {calICalendar} chosen - The calendar the stubbed dialog selects.
 * @returns {?string} The preselectId passed to the dialog.
 */
function promptPreselectId(targetCalendar, chosen) {
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(buildIcs({ partStat: "NEEDS-ACTION", method: true }));
  itipItem.receivedMethod = "REQUEST";
  itipItem.targetCalendar = targetCalendar;

  let seen = null;
  const win = {
    openDialog(url, name, features, args) {
      seen = args.preselectId;
      args.onOk(chosen);
    },
    alert() {},
  };
  cal.itip.promptCalendar("REQUEST:NEEDS-ACTION", itipItem, win);
  return seen;
}

function unregister(...calendars) {
  for (const calendar of calendars) {
    cal.manager.unregisterCalendar(calendar);
  }
}

add_setup(async function () {
  do_get_profile();

  identity = MailServices.accounts.createIdentity();
  identity.email = RECEIVER;
  otherIdentity = MailServices.accounts.createIdentity();
  otherIdentity.email = "other@example.com";
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(identity);
  account.addIdentity(otherIdentity);

  // Don't send a real iTIP reply when the accept completes.
  const originalTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => ({
    scheme: "mailto",
    type: "email",
    senderAddress: RECEIVER_ID,
    sendItems: () => true,
  });

  registerCleanupFunction(() => {
    cal.itip.getImipTransport = originalTransport;
    MailServices.accounts.removeIncomingServer(account.incomingServer, false);
    MailServices.accounts.removeAccount(account);
  });
});

/**
 * Redirecting to a calendar that does not hold the event adds a copy there and
 * leaves the calendar the event was found in untouched.
 */
add_task(async function testRedirectToEmptyAdds() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  await seedItem(calB, "NEEDS-ACTION");

  const outcome = await accept(calB, calA);
  Assert.equal(outcome.method, "REQUEST:NEEDS-ACTION", "the accept branch should be chosen");
  Assert.ok(Components.isSuccessCode(outcome.status), "the accept should succeed");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.ADD,
    "a copy should be added to the selected calendar"
  );

  Assert.equal(
    await partStatIn(calA),
    "ACCEPTED",
    "the response should land in the selected calendar"
  );
  Assert.equal(
    await partStatIn(calB),
    "NEEDS-ACTION",
    "the calendar the event was found in should be left untouched"
  );

  unregister(calA, calB);
});

/**
 * Selecting the calendar the event was found in updates it in place and does
 * not create a duplicate elsewhere.
 */
add_task(async function testPickFoundModifiesInPlace() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  await seedItem(calB, "NEEDS-ACTION");

  const outcome = await accept(calB, calB);
  Assert.ok(Components.isSuccessCode(outcome.status), "the accept should succeed");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.MODIFY,
    "the event should be modified in place"
  );

  Assert.equal(
    await partStatIn(calB),
    "ACCEPTED",
    "the calendar the event was found in should be updated"
  );
  Assert.equal(
    await partStatIn(calA),
    null,
    "no duplicate should be created in the other calendar"
  );

  unregister(calA, calB);
});

/**
 * Redirecting to a different calendar that also already holds the event updates
 * that calendar in place rather than creating a duplicate.
 */
add_task(async function testRedirectToOtherHolderModifies() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  await seedItem(calA, "NEEDS-ACTION");
  await seedItem(calB, "NEEDS-ACTION");

  // Found in calB, user selects calA (which also holds the event).
  const outcome = await accept(calB, calA);
  Assert.ok(Components.isSuccessCode(outcome.status), "the accept should succeed");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.MODIFY,
    "the selected calendar should be modified in place"
  );

  Assert.equal(await partStatIn(calA), "ACCEPTED", "the selected calendar should be updated");
  Assert.equal(
    await partStatIn(calB),
    "NEEDS-ACTION",
    "the calendar the event was found in should be left untouched"
  );

  const items = await calA.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_TYPE_ALL, 0, null, null);
  Assert.equal(
    items.filter(i => i.id == UID).length,
    1,
    "the selected calendar should hold exactly one copy"
  );

  unregister(calA, calB);
});

/**
 * The lookup runs over a composite of every writable calendar. With the event
 * sitting in more than one of them, redirecting to a third calendar still has
 * to add a single copy there and leave the others alone.
 */
add_task(async function testCompositeSearchRedirects() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  const calC = makeCalendar("C", false);
  await seedItem(calB, "NEEDS-ACTION");
  await seedItem(calC, "NEEDS-ACTION");

  const composite = Cc["@mozilla.org/calendar/calendar;1?type=composite"].createInstance(
    Ci.calICompositeCalendar
  );
  composite.addCalendar(calA);
  composite.addCalendar(calB);
  composite.addCalendar(calC);

  const outcome = await accept(composite, calA);
  Assert.ok(Components.isSuccessCode(outcome.status), "the accept should succeed");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.ADD,
    "a copy should be added to the selected calendar"
  );

  Assert.equal(
    await partStatIn(calA),
    "ACCEPTED",
    "the response should land in the selected calendar"
  );
  const items = await calA.getItemsAsArray(Ci.calICalendar.ITEM_FILTER_TYPE_ALL, 0, null, null);
  Assert.equal(
    items.filter(item => item.id == UID).length,
    1,
    "the selected calendar should hold exactly one copy"
  );
  Assert.equal(
    await partStatIn(calB),
    "NEEDS-ACTION",
    "the first calendar holding the event should be left untouched"
  );
  Assert.equal(
    await partStatIn(calC),
    "NEEDS-ACTION",
    "the second calendar holding the event should be left untouched"
  );

  unregister(calA, calB, calC);
});

/**
 * A failed lookup on the selected calendar must not create a duplicate: the
 * accept falls back to updating the found calendar in place.
 */
add_task(async function testRedirectLookupFailureFallsBack() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  await seedItem(calB, "NEEDS-ACTION");

  // targetCalendar re-wraps the calendar through XPCOM, so override the lookup
  // on the underlying implementation.
  const impl = calA.wrappedJSObject;
  const realGetItem = impl.getItem;
  impl.getItem = () => Promise.reject(new Error("transient lookup failure"));

  const outcome = await accept(calB, calA);
  impl.getItem = realGetItem;

  Assert.ok(Components.isSuccessCode(outcome.status), "the accept should still succeed");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.MODIFY,
    "the accept should fall back to modifying in place"
  );
  Assert.equal(
    await partStatIn(calB),
    "ACCEPTED",
    "the calendar the event was found in should be updated"
  );
  Assert.equal(await partStatIn(calA), null, "no duplicate should be added when the lookup fails");

  unregister(calA, calB);
});

/**
 * A write that fails is reported through the operation listener instead of
 * escaping as an unhandled rejection.
 */
add_task(async function testWriteFailureIsReported() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false);
  await seedItem(calB, "NEEDS-ACTION");

  // Let the add to the selected calendar fail.
  const impl = calA.wrappedJSObject;
  const realAddItem = impl.addItem;
  impl.addItem = () => Promise.reject(Components.Exception("", Cr.NS_ERROR_FAILURE));

  const outcome = await accept(calB, calA);
  impl.addItem = realAddItem;

  Assert.ok(!Components.isSuccessCode(outcome.status), "the accept should report the failure");
  Assert.equal(
    outcome.opType,
    Ci.calIOperationListener.ADD,
    "the failure should be reported for the operation that was attempted"
  );
  Assert.equal(
    await partStatIn(calB),
    "NEEDS-ACTION",
    "the calendar the event was found in should be left untouched"
  );

  unregister(calA, calB);
});

/**
 * When only one calendar matches the invited attendee, promptCalendar selects
 * it without showing the chooser, and the accept still lands there rather than
 * in the (non-matching) calendar the event was found in.
 */
add_task(async function testAutoSelectSingleMatchingCalendar() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", false, otherIdentity);
  await seedItem(calB, "NEEDS-ACTION");

  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(buildIcs({ partStat: "NEEDS-ACTION", method: true }));
  itipItem.receivedMethod = "REQUEST";
  itipItem.responseMethod = "REPLY";
  itipItem.autoResponse = Ci.calIItipItem.NONE;
  itipItem.targetCalendar = calB; // as pinned by processFoundItems

  const win = {
    openDialog() {
      Assert.ok(false, "the chooser should not open for a single matching calendar");
    },
    alert() {},
  };
  Assert.ok(
    cal.itip.promptCalendar("REQUEST:NEEDS-ACTION", itipItem, win),
    "a calendar should be selected without prompting"
  );
  Assert.equal(
    itipItem.targetCalendar.id,
    calA.id,
    "the calendar matching the invited attendee should be selected"
  );

  unregister(calA, calB);
});

/**
 * When the event is found, the chooser preselects the calendar that holds it.
 */
add_task(async function testPreselectFoundHolder() {
  const calA = makeCalendar("A", true); // default, but not the holder
  const calB = makeCalendar("B", false);
  await seedItem(calB, "NEEDS-ACTION");

  // Simulate processFoundItems having pinned the found calendar.
  const preselectId = promptPreselectId(calB, calA);
  Assert.equal(preselectId, calB.id, "the calendar holding the event should be preselected");

  unregister(calA, calB);
});

/**
 * When the event is not found, the chooser preselects the current default
 * calendar (read live), not a stale value.
 */
add_task(async function testPreselectDefaultWhenNotFound() {
  const calA = makeCalendar("A", false);
  const calB = makeCalendar("B", true); // current default

  const composite = Cc["@mozilla.org/calendar/calendar;1?type=composite"].createInstance(
    Ci.calICompositeCalendar
  );
  composite.addCalendar(calA);
  composite.addCalendar(calB);

  const preselectId = promptPreselectId(composite, calA);
  Assert.equal(preselectId, calB.id, "the current default calendar should be preselected");

  unregister(calA, calB);
});
