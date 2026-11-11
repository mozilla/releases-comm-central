/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// These xpcshell tests check calendar data and permissions without a dialog.
// The browser tests check how the dialog displays and changes the selection.

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalEvent } = ChromeUtils.importESModule(
  "resource:///modules/CalEvent.sys.mjs"
);
const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const {
  canChangeEventCalendar,
  canMoveCalendarEvent,
  loadCalendarOptions,
  observeCalendarOptions,
  snapshotCalendar,
} = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-calendar-options.mjs"
);
const { loadCalendarEventSource } = ChromeUtils.importESModule(
  "moz-src:///comm/mail/components/calendar/content/calendar-event-source-loader.mjs"
);

const calendars = [];
let firstCalendar;
let defaultCalendar;
let hiddenCalendar;
let stopObservingOptions;

/**
 * Registers a visible memory calendar and adds it to the cleanup list.
 *
 * @param {string} name - The calendar name.
 * @returns {calICalendar} The registered calendar.
 */
function createCalendar(name) {
  const calendar = CalendarTestUtils.createCalendar(name, "memory");

  calendars.push(calendar);

  // The tests choose defaults with explicit calendar IDs.
  calendar.deleteProperty("calendar-main-default");
  calendar.setProperty("calendar-main-in-composite", true);

  return calendar;
}

add_setup(function () {
  do_get_profile();

  const orderPref = "calendar.list.sortOrder";
  const previousOrder = Services.prefs.prefHasUserValue(orderPref)
    ? Services.prefs.getStringPref(orderPref)
    : null;

  registerCleanupFunction(() => {
    stopObservingOptions?.();

    for (const calendar of calendars) {
      cal.manager.unregisterCalendar(calendar);
    }
    if (previousOrder === null) {
      Services.prefs.clearUserPref(orderPref);
    } else {
      Services.prefs.setStringPref(orderPref, previousOrder);
    }
  });

  // Register allowed choices and calendars excluded for different reasons.
  // Memory calendars keep event data in memory and do not need a server.
  firstCalendar = createCalendar("First calendar");
  firstCalendar.setProperty("color", "#008000");
  defaultCalendar = createCalendar("Default calendar");
  defaultCalendar.setProperty("color", "#0000ff");

  hiddenCalendar = createCalendar("Hidden calendar");
  hiddenCalendar.setProperty("calendar-main-in-composite", false);

  const readOnlyCalendar = createCalendar("Read only calendar");
  readOnlyCalendar.readOnly = true;
  const tasksCalendar = createCalendar("Tasks only calendar");
  tasksCalendar.setProperty("capabilities.events.supported", false);
  const disabledCalendar = createCalendar("Disabled calendar");
  disabledCalendar.setProperty("disabled", true);
  const noAddCalendar = createCalendar("No add permission");

  // Simulate a user who can read this calendar but cannot add an item.
  // The memory provider reads permissions from this access-control entry.
  noAddCalendar.wrappedJSObject.mACLEntry = {
    QueryInterface: ChromeUtils.generateQI(["calICalendarACLEntry"]),
    hasAccessControl: true,
    userIsOwner: false,
    userCanAddItems: false,
  };
});

add_task(function test_snapshotCopiesOnlyDisplayData() {
  const calendar = cal.manager.createCalendar(
    "memory",
    Services.io.newURI("moz-memory-calendar://")
  );
  calendar.id = "snapshot-calendar";
  calendar.name = "Snapshot calendar";

  Assert.deepEqual(
    snapshotCalendar(calendar),
    {
      id: calendar.id,
      name: "Snapshot calendar",
    },
    "The snapshot should contain only the calendar ID and name"
  );

  calendar.setProperty("color", "#112233");
  const snapshot = snapshotCalendar(calendar);

  // Later provider changes must not change the values already copied for Redux.
  calendar.name = "Changed calendar";
  calendar.setProperty("color", "#445566");

  Assert.deepEqual(
    snapshot,
    {
      id: calendar.id,
      name: "Snapshot calendar",
    },
    "The snapshot should keep copied display data after the calendar changes"
  );
});

add_task(async function test_filtersCalendarChoices() {
  const { calendars: choices } = await loadCalendarOptions();

  Assert.deepEqual(
    choices,
    [
      { id: firstCalendar.id, name: "First calendar" },
      { id: defaultCalendar.id, name: "Default calendar" },
    ],
    "Choices should contain only visible, writable event calendars with add permission"
  );
});

add_task(async function test_choicesFollowListOrder() {
  for (const [order, expected] of [
    [
      [defaultCalendar.id, hiddenCalendar.id, firstCalendar.id],
      [defaultCalendar.id, firstCalendar.id],
    ],
    [
      ["missing-calendar", defaultCalendar.id],
      [defaultCalendar.id, firstCalendar.id],
    ],
    [
      [firstCalendar.id, defaultCalendar.id],
      [firstCalendar.id, defaultCalendar.id],
    ],
    [[], [firstCalendar.id, defaultCalendar.id]],
  ]) {
    cal.manager.setCalendarOrder(order);
    const { calendars: choices } = await loadCalendarOptions();

    Assert.deepEqual(
      choices.map(calendar => calendar.id),
      expected,
      `Choices should follow manager list order ${JSON.stringify(order)} and keep unlisted calendars`
    );
  }
});

add_task(async function test_defaultIsSeparateFromChoices() {
  Assert.equal(
    (await loadCalendarOptions()).defaultCalendar,
    null,
    "An omitted default ID should return no default calendar"
  );
  Assert.equal(
    (await loadCalendarOptions("missing-calendar")).defaultCalendar,
    null,
    "An unknown default ID should return no default calendar"
  );
  Assert.deepEqual(
    (await loadCalendarOptions(defaultCalendar.id)).defaultCalendar,
    { id: defaultCalendar.id, name: "Default calendar" },
    "A supplied default ID should return its calendar display data"
  );

  // A hidden calendar can be the supplied default while other choices remain.
  // Returning display data must not add that default to the destination list.
  const options = await loadCalendarOptions(hiddenCalendar.id);

  Assert.deepEqual(
    options.defaultCalendar,
    { id: hiddenCalendar.id, name: "Hidden calendar" },
    "An unavailable default should retain its display data"
  );
  Assert.ok(
    !options.calendars.some(calendar => calendar.id == hiddenCalendar.id),
    "An unavailable default should stay outside the usable choices"
  );
});

add_task(function test_moveRequiresMoreThanEditPermission() {
  // Model a whole repeating series with separate calendar and item permissions.
  // An occurrence has recurrenceId; the whole series has recurrenceInfo.
  const calendarEntry = {
    hasAccessControl: true,
    userIsOwner: false,
    userCanDeleteItems: true,
  };
  const properties = new Map([["requiresNetwork", false]]);
  const event = {
    recurrenceId: null,
    recurrenceInfo: {},
    aclEntry: { calendarEntry, userCanModify: true },
    calendar: {
      aclEntry: calendarEntry,
      readOnly: false,
      supportsScheduling: false,
      getProperty: name => properties.get(name) ?? null,
    },
  };

  Assert.ok(
    canMoveCalendarEvent(event),
    "A whole repeating event with the required permissions should permit a move"
  );

  calendarEntry.userCanDeleteItems = false;

  Assert.ok(
    !canMoveCalendarEvent(event),
    "Edit permission should not grant delete permission"
  );
  Assert.ok(
    canChangeEventCalendar(event),
    "Calendar delete permission should not change the event restrictions"
  );

  calendarEntry.userCanDeleteItems = true;
  event.aclEntry.userCanModify = false;

  Assert.ok(
    !canMoveCalendarEvent(event),
    "Moving should require permission to modify the event"
  );
  Assert.ok(
    !canChangeEventCalendar(event),
    "An event without modify permission should prevent a calendar change"
  );

  event.aclEntry.userCanModify = true;
  event.recurrenceId = {};

  Assert.ok(
    !canMoveCalendarEvent(event),
    "An editable occurrence should not permit a calendar change"
  );
  Assert.ok(
    !canChangeEventCalendar(event),
    "The saved event restrictions should prevent moving an occurrence"
  );

  event.recurrenceId = null;
  event.calendar.readOnly = true;

  Assert.ok(
    !canMoveCalendarEvent(event),
    "A read-only source calendar should prevent a move"
  );
  Assert.ok(
    canChangeEventCalendar(event),
    "Source writability should not change the event restrictions"
  );

  event.calendar.readOnly = false;
  properties.set("disabled", true);

  Assert.ok(
    !canMoveCalendarEvent(event),
    "A disabled source calendar should prevent a move"
  );

  properties.delete("disabled");
  event.calendar.supportsScheduling = true;
  event.calendar.getSchedulingSupport = () => ({ isInvitation: () => true });

  Assert.ok(
    !canMoveCalendarEvent(event),
    "An invitation should not permit a calendar change through the editor"
  );
  Assert.ok(
    !canChangeEventCalendar(event),
    "The saved event restrictions should prevent moving an invitation"
  );
});

add_task(async function test_sourceSnapshotContainsCalendarData() {
  // Read through the source loader to check the data passed to the dialog.
  const event = await firstCalendar.addItem(
    new CalEvent(
      [
        "BEGIN:VEVENT",
        "UID:calendar-options-event",
        "SUMMARY:Saved event",
        "DTSTART:20261020T100000Z",
        "DTEND:20261020T110000Z",
        "END:VEVENT",
      ].join("\r\n")
    )
  );
  const source = await loadCalendarEventSource({
    calendarId: firstCalendar.id,
    eventId: event.id,
    recurrenceId: null,
  });

  Assert.deepEqual(
    source.snapshot.calendar,
    { id: firstCalendar.id, name: "First calendar" },
    "The loaded source should include copied calendar display data"
  );
  Assert.ok(
    source.snapshot.canMoveCalendar,
    "The loaded source should include permission to move a writable whole event"
  );
  Assert.ok(
    source.snapshot.canChangeCalendar,
    "The loaded source should include the event restrictions separately"
  );
  Assert.deepEqual(
    JSON.parse(JSON.stringify(source.snapshot)),
    source.snapshot,
    "The loaded source snapshot should contain only JSON-compatible data"
  );
});

add_task(async function test_observerTracksCalendarChanges() {
  const updates = [];
  let unload = null;
  const ownerWindow = {
    addEventListener(_type, callback) {
      unload = callback;
    },
    removeEventListener(_type, callback) {
      if (unload === callback) {
        unload = null;
      }
    },
  };

  let calendarsUpdate = Promise.withResolvers();

  stopObservingOptions = observeCalendarOptions(choices => {
    updates.push(choices);
    calendarsUpdate.resolve(choices);
    calendarsUpdate = Promise.withResolvers();
  }, ownerWindow);

  let nextUpdate = calendarsUpdate.promise;

  const calendar = createCalendar("Observed calendar");
  let updatedChoices = await nextUpdate;

  Assert.ok(
    updatedChoices.some(choice => choice.id === calendar.id),
    "Registering a calendar should add it to the observed choices"
  );

  const beforeProperties = updates.length;
  nextUpdate = calendarsUpdate.promise;

  calendar.readOnly = true;
  calendar.name = "Renamed observed calendar";
  updatedChoices = await nextUpdate;

  Assert.equal(
    updates.length,
    beforeProperties + 1,
    "Property changes in one turn should share one choice refresh"
  );
  Assert.ok(
    !updatedChoices.some(choice => choice.id === calendar.id),
    "A read-only calendar should no longer be an allowed choice"
  );

  nextUpdate = calendarsUpdate.promise;

  calendar.readOnly = false;
  calendar.setProperty("capabilities.events.supported", false);
  updatedChoices = await nextUpdate;

  Assert.ok(
    !updatedChoices.some(choice => choice.id === calendar.id),
    "A calendar without event support should remain unavailable"
  );

  nextUpdate = calendarsUpdate.promise;

  calendar.deleteProperty("capabilities.events.supported");
  updatedChoices = await nextUpdate;

  const restored = updatedChoices.find(choice => choice.id === calendar.id);

  Assert.ok(restored, "The event calendar should be available after deletion");
  Assert.equal(
    restored.name,
    "Renamed observed calendar",
    "Deleting the capability override should restore the renamed event calendar"
  );

  const order = cal.manager.getCalendars().map(choice => choice.id);
  nextUpdate = calendarsUpdate.promise;

  cal.manager.setCalendarOrder([
    calendar.id,
    ...order.filter(id => id !== calendar.id),
  ]);

  updatedChoices = await nextUpdate;

  Assert.equal(
    updatedChoices[0].id,
    calendar.id,
    "Observed choices should follow the calendar manager's new order"
  );

  const beforeColor = updates.length;

  calendar.setProperty("color", "#112233");

  // No callback is expected, so let any queued refresh run.
  await Promise.resolve();

  Assert.equal(
    updates.length,
    beforeColor,
    "A color change should leave choices to the shared CSS color tracker"
  );

  nextUpdate = calendarsUpdate.promise;

  Services.obs.notifyObservers(
    null,
    "network:offline-status-changed",
    "online"
  );

  await nextUpdate;

  Assert.equal(
    updates.length,
    beforeColor + 1,
    "A network status notification should refresh calendar writability"
  );

  nextUpdate = calendarsUpdate.promise;

  cal.manager.unregisterCalendar(calendar);
  calendars.splice(calendars.indexOf(calendar), 1);
  updatedChoices = await nextUpdate;

  Assert.ok(
    !updatedChoices.some(choice => choice.id === calendar.id),
    "Unregistering a calendar should remove it after the manager finishes removal"
  );

  const beforeStop = updates.length;
  Services.obs.notifyObservers(
    null,
    "network:offline-status-changed",
    "online"
  );
  const stop = stopObservingOptions;
  stopObservingOptions();
  stopObservingOptions = null;
  await Promise.resolve();

  Assert.equal(
    updates.length,
    beforeStop,
    "Stopping observation should ignore an already queued choice refresh"
  );

  Assert.equal(
    unload,
    null,
    "Stopping observation should release the window's unload listener"
  );

  stop();
  stopObservingOptions = observeCalendarOptions(
    choices => updates.push(choices),
    ownerWindow
  );
  Services.obs.notifyObservers(
    null,
    "network:offline-status-changed",
    "online"
  );

  Assert.ok(unload, "The owning window should have an unload listener");
  unload();
  await Promise.resolve();

  Assert.equal(
    updates.length,
    beforeStop,
    "Window unload should stop observation and ignore the queued choice refresh"
  );

  stopObservingOptions();
  stopObservingOptions = null;

  cal.manager.setCalendarOrder(order.filter(id => id !== calendar.id));
});
