/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that answering an iTIP REFRESH only sends the event to the stored
 * attendee who requested it, and only for events the user organizes.
 */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { calendarDeactivator } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calCalendarDeactivator.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { CalEvent } = ChromeUtils.importESModule("resource:///modules/CalEvent.sys.mjs");

const UID = "refresh-2087943";
const SERIES_UID = "refresh-series-2087943";
const INVITATION_UID = "refresh-invitation-2087943";
const IMPORTED_UID = "refresh-imported-2087943";
const IMPORTED_SERIES_UID = "refresh-imported-series-2087943";
const ALIAS_UID = "refresh-alias-2087943";
const ALIAS = "alias@example.com";
const USER = "organizer@example.com";

const l10n = new Localization(["calendar/calendar-itip.ftl"], true);

let calendar;
let sent = [];

/**
 * Build a serialized VCALENDAR for an event.
 *
 * @param {object} options
 * @param {string} [options.uid] - The event UID.
 * @param {string} [options.organizer] - Email address of the organizer.
 * @param {string[]} options.attendees - ATTENDEE property lines, without the
 *   "ATTENDEE" name.
 * @param {string} [options.method] - The iTIP method, for an incoming item.
 * @param {string[]} [options.extra] - Additional VEVENT property lines.
 * @returns {string} The serialized VCALENDAR.
 */
function buildIcs({ uid = UID, organizer = USER, attendees, method, extra = [] }) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Test//Test//EN"];
  if (method) {
    lines.push("METHOD:" + method);
  }
  lines.push(
    "BEGIN:VEVENT",
    "UID:" + uid,
    "SUMMARY:Confidential meeting",
    "DTSTART:20260317T120000Z",
    "DTEND:20260317T130000Z",
    "DTSTAMP:20260301T120000Z",
    "SEQUENCE:0",
    "ORGANIZER:mailto:" + organizer,
    ...attendees.map(attendee => "ATTENDEE" + attendee),
    ...extra,
    "END:VEVENT",
    "END:VCALENDAR"
  );
  return lines.join("\r\n") + "\r\n";
}

/**
 * Process an incoming REFRESH and run the resulting action, if any.
 *
 * @param {string} sender - The sender of the REFRESH message.
 * @param {string|string[]} attendee - Email address(es) of the attendee(s)
 *   named in the REFRESH.
 * @param {object} [options] - Additional options for buildIcs.
 * @returns {Promise<object>} The recipient lists of the messages sent and the
 *   label of the iTIP bar.
 */
async function processRefresh(sender, attendee, options = {}) {
  sent = [];
  const itipItem = Cc["@mozilla.org/calendar/itip-item;1"].createInstance(Ci.calIItipItem);
  itipItem.init(
    buildIcs({
      ...options,
      attendees: [attendee].flat().map(a => ":mailto:" + a),
      method: "REFRESH",
    })
  );
  itipItem.receivedMethod = "REFRESH";
  itipItem.autoResponse = Ci.calIItipItem.USER;
  itipItem.sender = sender;
  itipItem.targetCalendar = calendar;

  const { rc, actionFunc, foundItems } = await new Promise(resolve => {
    cal.itip.processItipItem(itipItem, (item, result, func, found) =>
      resolve({ rc: result, actionFunc: func, foundItems: found })
    );
  });
  const { label } = cal.itip.getOptionsText(itipItem, rc, actionFunc, foundItems);
  if (actionFunc) {
    actionFunc(null);
  }
  return { sent, label };
}

add_setup(async function () {
  do_get_profile();

  const identity = MailServices.accounts.createIdentity();
  identity.email = USER;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    `${account.key}user`,
    "localhost",
    "none"
  );
  account.addIdentity(identity);

  const originalTransport = cal.itip.getImipTransport;
  cal.itip.getImipTransport = () => ({
    scheme: "mailto",
    type: "email",
    senderAddress: "mailto:" + USER,
    sendItems(recipients) {
      sent.push(recipients.map(r => r.id));
      return true;
    },
  });

  calendar = CalendarTestUtils.createCalendar("Organizer", "memory");
  calendar.setProperty("imip.identity.key", identity.key);
  const attendees = [
    ";PARTSTAT=ACCEPTED:mailto:alice@example.com",
    ';PARTSTAT=ACCEPTED;SENT-BY="mailto:assistant@example.com":mailto:bob@example.com',
  ];
  await calendar.addItem(new CalEvent(buildIcs({ attendees })));
  await calendar.addItem(
    new CalEvent(buildIcs({ uid: SERIES_UID, attendees, extra: ["RRULE:FREQ=DAILY;COUNT=3"] }))
  );
  await calendar.addItem(
    new CalEvent(
      buildIcs({
        uid: INVITATION_UID,
        organizer: "boss@example.com",
        attendees: [...attendees, ";PARTSTAT=ACCEPTED:mailto:" + USER],
      })
    )
  );
  await calendar.addItem(
    new CalEvent(buildIcs({ uid: IMPORTED_UID, organizer: "boss@example.com", attendees }))
  );
  const importedSeries = new CalEvent(
    buildIcs({
      uid: IMPORTED_SERIES_UID,
      organizer: "boss@example.com",
      attendees,
      extra: ["RRULE:FREQ=DAILY;COUNT=3"],
    })
  );
  const exception = importedSeries.recurrenceInfo
    .getOccurrenceFor(cal.createDateTime("20260318T120000Z"))
    .clone();
  exception.organizer = null;
  exception.title = "Moved meeting";
  importedSeries.recurrenceInfo.modifyException(exception, true);
  await calendar.addItem(importedSeries);
  await calendar.addItem(new CalEvent(buildIcs({ uid: ALIAS_UID, organizer: ALIAS, attendees })));

  const wasActivated = calendarDeactivator.isCalendarActivated;
  calendarDeactivator.isCalendarActivated = true;

  registerCleanupFunction(() => {
    calendarDeactivator.isCalendarActivated = wasActivated;
    cal.itip.getImipTransport = originalTransport;
    cal.manager.unregisterCalendar(calendar);
    MailServices.accounts.removeIncomingServer(account.incomingServer, false);
    MailServices.accounts.removeAccount(account);
  });
});

add_task(async function testRefreshFromAttendee() {
  const result = await processRefresh("Alice <Alice@example.com>", "alice@example.com");
  Assert.deepEqual(
    result.sent,
    [["mailto:alice@example.com"]],
    "the event should be sent only to the requesting attendee"
  );
});

add_task(async function testRefreshFromDelegate() {
  const result = await processRefresh("assistant@example.com", "bob@example.com");
  Assert.deepEqual(
    result.sent,
    [["mailto:bob@example.com"]],
    "the event should be sent to the attendee the stored SENT-BY delegate acts for"
  );
});

add_task(async function testRefreshForOccurrence() {
  const result = await processRefresh("alice@example.com", "alice@example.com", {
    uid: SERIES_UID,
    extra: ["RECURRENCE-ID:20260318T120000Z"],
  });
  Assert.deepEqual(
    result.sent,
    [["mailto:alice@example.com"]],
    "the occurrence should be sent only to the requesting attendee"
  );
});

add_task(async function testRefreshNamingOutsider() {
  const result = await processRefresh("attacker@example.net", "attacker@example.net");
  Assert.deepEqual(result.sent, [], "nothing should be sent to an address not among the attendees");
  Assert.equal(
    result.label,
    l10n.formatValueSync("imip-bar-refresh-not-attendee-text"),
    "the iTIP bar should explain that the sender is not an attendee"
  );
});

add_task(async function testRefreshNamingOtherAttendee() {
  const result = await processRefresh("attacker@example.net", "alice@example.com");
  Assert.deepEqual(
    result.sent,
    [],
    "nothing should be sent when the sender is not the named attendee"
  );
});

add_task(async function testRefreshWithoutSender() {
  const result = await processRefresh("", "alice@example.com");
  Assert.deepEqual(result.sent, [], "nothing should be sent when the sender is unknown");
});

add_task(async function testRefreshForInvitation() {
  const result = await processRefresh("alice@example.com", "alice@example.com", {
    uid: INVITATION_UID,
    organizer: "boss@example.com",
  });
  Assert.deepEqual(
    result.sent,
    [],
    "nothing should be sent for an event organized by someone else"
  );
  Assert.equal(
    result.label,
    l10n.formatValueSync("imip-bar-refresh-not-organizer-text"),
    "the iTIP bar should explain that only the organizer can answer"
  );
});

add_task(async function testRefreshForImportedEvent() {
  const result = await processRefresh("alice@example.com", "alice@example.com", {
    uid: IMPORTED_UID,
    organizer: "boss@example.com",
  });
  Assert.deepEqual(
    result.sent,
    [],
    "nothing should be sent for an event the user neither organizes nor attends"
  );
  Assert.equal(
    result.label,
    l10n.formatValueSync("imip-bar-refresh-not-organizer-text"),
    "the iTIP bar should explain that only the organizer can answer"
  );
});

add_task(async function testRefreshNamingSeveralAttendees() {
  const result = await processRefresh("alice@example.com", [
    "alice@example.com",
    "bob@example.com",
  ]);
  Assert.deepEqual(
    result.sent,
    [],
    "nothing should be sent when the REFRESH names more than one attendee"
  );
});

add_task(async function testRefreshForExceptionOfImportedSeries() {
  const result = await processRefresh("alice@example.com", "alice@example.com", {
    uid: IMPORTED_SERIES_UID,
    organizer: "boss@example.com",
    extra: ["RECURRENCE-ID:20260318T120000Z"],
  });
  Assert.deepEqual(
    result.sent,
    [],
    "nothing should be sent for an exception whose series is organized by someone else"
  );
});

add_task(async function testRefreshForCalendarUserAddress() {
  const support = calendar.getSchedulingSupport().wrappedJSObject;
  support.calendarUserAddresses = ["mailto:" + ALIAS];
  try {
    const result = await processRefresh("alice@example.com", "alice@example.com", {
      uid: ALIAS_UID,
      organizer: ALIAS,
    });
    Assert.deepEqual(
      result.sent,
      [["mailto:alice@example.com"]],
      "the event should be sent when organized through a calendar user address"
    );
  } finally {
    delete support.calendarUserAddresses;
  }
});
