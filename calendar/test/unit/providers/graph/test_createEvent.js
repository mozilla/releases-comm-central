/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../head.js */

const { CalDateTime } = ChromeUtils.importESModule("resource:///modules/CalDateTime.sys.mjs");
const { CalTimezone } = ChromeUtils.importESModule("resource:///modules/CalTimezone.sys.mjs");
const { CalTimezoneService } = ChromeUtils.importESModule(
  "resource:///modules/CalTimezoneService.sys.mjs"
);

let graphServer;
let incomingServer;
let calendar;

add_setup(async function () {
  [graphServer, incomingServer] = setupBasicGraphTestServer();
  calendar = createGraphCalendar(incomingServer);
});

add_task(async function testCreateEventUTC() {
  const newEvent = new CalEvent();
  newEvent.title = "A new day";

  const startDate = new CalDateTime();
  startDate.resetTo(2026, 11, 9, 0, 0, 0, CalTimezoneService.UTC);
  newEvent.startDate = startDate;

  const endDate = new CalDateTime();
  endDate.resetTo(2026, 11, 9, 1, 0, 0, CalTimezoneService.UTC);
  newEvent.endDate = endDate;

  calendar.startBatch();
  const addedEvent = await calendar.addItem(newEvent);
  calendar.endBatch();

  Assert.ok(!!addedEvent.id, "Event should have been assigned an ID by the server.");

  const newId = addedEvent.id;
  const retrievedEvent = await calendar.getItem(newId);
  Assert.ok(!!retrievedEvent, "Created event should be retrievable");
  Assert.deepEqual(
    retrievedEvent,
    addedEvent,
    "Retrieved and created events should have the same data."
  );
});
