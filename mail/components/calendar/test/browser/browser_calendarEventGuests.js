/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let doc;
let dialog;
let guestsRow;
let calendar;
let populatedEvent;
let emptyEvent;
let snapshotEvent;

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["intl.locale.requested", "en-US"]],
  });
  registerCleanupFunction(() => SpecialPowers.popPrefEnv());
  Assert.equal(
    Services.locale.appLocalesAsBCP47[0],
    "en-US",
    "The app locale should be en-US"
  );

  calendar = createCalendar();
  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
  });

  const attendees = [
    { id: "mailto:yes@example.com", participationStatus: "ACCEPTED" },
    ...Array.from({ length: 2 }, (_, i) => ({
      id: `mailto:maybe${i}@example.com`,
      participationStatus: "TENTATIVE",
    })),
    ...Array.from({ length: 3 }, (_, i) => ({
      id: `mailto:no${i}@example.com`,
      participationStatus: "DECLINED",
    })),
    ...Array.from({ length: 4 }, (_, i) => ({
      id: `mailto:pending${i}@example.com`,
      participationStatus: "NEEDS-ACTION",
    })),
  ];
  populatedEvent = await createEventWithOrganizer(attendees);
  snapshotEvent = await createEventWithOrganizer([attendees[0]]);
  emptyEvent = await createEvent({ calendar, name: "No guests" });

  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);
  doc = browser.contentWindow.document;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  guestsRow = dialog.querySelector("#guestsNavigationRow");
});

async function createEventWithOrganizer(attendees) {
  const organizer = new CalAttendee();
  organizer.id = "mailto:host@example.com";
  organizer.isOrganizer = true;
  return createEvent({ calendar, attendees, organizer });
}

/**
 * Loads an event into the dialog and returns its snapshot. Temporarily
 * intercepts the load handler so the test can wait for the dialog to finish
 * processing the event. Restores the original handler afterward.
 *
 * @param {calIEvent} event - The event to load.
 * @returns {Promise<CalendarEventSourceSnapshot>} The loaded snapshot.
 */
async function loadEvent(event) {
  const originalSourceLoadedHandler = dialog.onCalendarEventSourceLoaded;
  const originalRouteErrorHandler = dialog.onCalendarEventRouteError;
  const sourceLoaded = Promise.withResolvers();

  dialog.onCalendarEventSourceLoaded = async source => {
    try {
      await originalSourceLoadedHandler.call(dialog, source);
      sourceLoaded.resolve(source.snapshot);
    } catch (error) {
      sourceLoaded.reject(error);
      throw error;
    }
  };
  dialog.onCalendarEventRouteError = error => {
    try {
      originalRouteErrorHandler.call(dialog, error);
    } finally {
      sourceLoaded.reject(
        new Error(`Failed to load calendar event: ${error.code}`)
      );
    }
  };

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: event.id,
    });
    return await sourceLoaded.promise;
  } finally {
    dialog.onCalendarEventSourceLoaded = originalSourceLoadedHandler;
    dialog.onCalendarEventRouteError = originalRouteErrorHandler;
  }
}

async function resetToCreate() {
  dialog.setCalendarEventRoute();
  await TestUtils.waitForCondition(
    () => dialog.mode == "create",
    "The dialog should enter create mode"
  );
}

function assertEmptyRow() {
  Assert.ok(
    BrowserTestUtils.isVisible(guestsRow),
    "The Add guests row should be visible"
  );

  const label = guestsRow.querySelector(".guests-label");
  Assert.equal(
    doc.l10n.getAttributes(label).id,
    "calendar-event-add-guests",
    "An empty row should show Add guests rather than an old invited count"
  );
  Assert.ok(BrowserTestUtils.isVisible(label), "Add guests should be visible");

  const summary = guestsRow.querySelector(".guests-summary");
  Assert.ok(
    BrowserTestUtils.isHidden(summary),
    "An empty row should not show a stale response summary"
  );
  Assert.equal(
    guestsRow.querySelector('[slot="content"]'),
    null,
    "An empty Guests row should have no assigned content element"
  );

  const contentSlot = guestsRow.shadowRoot.querySelector(
    'slot[name="content"]'
  );
  Assert.deepEqual(
    contentSlot.assignedElements(),
    [],
    "An empty Guests row should leave its content slot unassigned"
  );
}

async function assertPopulatedRow() {
  Assert.ok(
    BrowserTestUtils.isVisible(guestsRow),
    "The invited Guests row should be visible"
  );

  const label = guestsRow.querySelector(".guests-label");
  Assert.deepEqual(
    doc.l10n.getAttributes(label),
    { id: "calendar-event-guests-invited", args: { count: 11 } },
    "The row should show eleven invited guests"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(label),
    "The invited count should be visible"
  );

  const summary = guestsRow.querySelector(".guests-summary");
  await BrowserTestUtils.waitForMutationCondition(
    summary,
    { childList: true, characterData: true, subtree: true },
    () => summary.textContent.length > 0
  );

  Assert.equal(
    summary.textContent,
    "1 attending, 2 maybe, 3 declined, 4 pending",
    "The summary should show each response count in order"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(summary),
    "The response summary should be visible"
  );
  Assert.strictEqual(
    guestsRow.querySelector('[slot="content"]'),
    summary,
    "The response summary should be assigned as row content"
  );

  const contentSlot = guestsRow.shadowRoot.querySelector(
    'slot[name="content"]'
  );
  Assert.deepEqual(
    contentSlot.assignedElements(),
    [summary],
    "The content slot should contain the response summary"
  );
}

async function waitForPopulatedSummary() {
  const summary = guestsRow.querySelector(".guests-summary");
  await BrowserTestUtils.waitForMutationCondition(
    summary,
    { childList: true, characterData: true, subtree: true },
    () => summary.textContent.length > 0
  );
  Assert.ok(
    BrowserTestUtils.isVisible(summary),
    "The summary should be visible"
  );
}

// Checks that the loaded event’s attendees and organizer are copied into the
// dialog’s snapshot as serializable data.
add_task(async function test_loadedEventSnapshotContainsGuestData() {
  Assert.ok(guestsRow, "The dialog should have a Guests navigation row");
  const snapshot = await loadEvent(snapshotEvent);

  Assert.ok(
    Array.isArray(snapshot.event.attendees),
    "The snapshot should have an attendee array"
  );

  Assert.equal(
    snapshot.event.attendees.length,
    1,
    "The snapshot should have one attendee"
  );

  const attendee = snapshot.event.attendees[0];
  Assert.equal(
    attendee.id,
    "mailto:yes@example.com",
    "The attendee ID should be copied"
  );
  Assert.equal(
    attendee.participationStatus,
    "ACCEPTED",
    "The response should be copied"
  );

  Assert.ok(snapshot.event.organizer, "The snapshot should have its organizer");
  Assert.equal(
    snapshot.event.organizer.id,
    "mailto:host@example.com",
    "The organizer ID should be copied"
  );

  for (const record of [attendee, snapshot.event.organizer]) {
    Assert.ok(
      !("QueryInterface" in record),
      "Snapshot records should not be calendar interface objects"
    );
  }

  Assert.deepEqual(
    JSON.parse(JSON.stringify(snapshot)),
    snapshot,
    "Guest records should survive a JSON round trip without data loss"
  );
});

add_task(async function test_newEventShowsAddGuests() {
  await resetToCreate();
  await dialog.show();

  try {
    await doc.l10n.translateFragment(dialog);
    Assert.ok(
      guestsRow.querySelector(".guests-label"),
      "The Guests row should have a label element"
    );
    Assert.ok(
      guestsRow.querySelector(".guests-summary"),
      "The Guests row should have a summary container"
    );
    Assert.ok(
      guestsRow.shadowRoot.querySelector('slot[name="content"]'),
      "The Guests row should have a content slot"
    );
    assertEmptyRow();

    const navigationButton = guestsRow.shadowRoot.querySelector("button");
    Assert.ok(
      navigationButton,
      "The Guests row should have a navigation action"
    );

    const actionIcon = guestsRow.querySelector('[slot="action"]');
    Assert.ok(
      actionIcon.alt,
      "The Guests navigation action should have an accessible label"
    );
  } finally {
    dialog.close();
  }
});

add_task(async function test_savedEventShowsGuestSummary() {
  await loadEvent(populatedEvent);
  await dialog.show();

  try {
    await assertPopulatedRow();
  } finally {
    dialog.close();
  }
});

add_task(async function test_emptySavedEventClearsGuestSummary() {
  await loadEvent(populatedEvent);
  await dialog.show();

  try {
    await waitForPopulatedSummary();

    await loadEvent(emptyEvent);
    assertEmptyRow();

    Assert.strictEqual(
      doc.l10n.getAttributes(guestsRow.querySelector(".guests-label")).args,
      null,
      "An empty saved event should clear the invited count arguments"
    );

    Assert.equal(
      guestsRow.querySelector(".guests-summary").textContent,
      "",
      "An empty saved event should clear the response summary"
    );
  } finally {
    dialog.close();
  }
});

add_task(async function test_createRouteClearsGuestSummary() {
  await loadEvent(populatedEvent);
  await dialog.show();

  try {
    await waitForPopulatedSummary();

    await resetToCreate();
    assertEmptyRow();

    Assert.strictEqual(
      doc.l10n.getAttributes(guestsRow.querySelector(".guests-label")).args,
      null,
      "Opening 'Create' should clear the invited count arguments"
    );
    Assert.equal(
      guestsRow.querySelector(".guests-summary").textContent,
      "",
      "Opening 'Create' should clear the response summary"
    );
  } finally {
    dialog.close();
  }
});

add_task(async function test_backRestoresGuestActionFocus() {
  await resetToCreate();
  await dialog.show();
  registerCleanupFunction(() => dialog.close());

  const main = dialog.querySelector(
    "#calendarEventCreateEditDialogMainSubview"
  );
  const subview = dialog.querySelector("#calendarEventCreateEditGuestsSubview");
  const action = guestsRow.shadowRoot.querySelector("button");
  action.click();

  Assert.ok(BrowserTestUtils.isHidden(main), "The main view should be hidden");
  Assert.ok(BrowserTestUtils.isVisible(subview), "Guests should be visible");
  Assert.equal(
    subview.querySelector('[slot="main"]').textContent.trim(),
    "",
    "The Guests subview should be empty"
  );

  subview.shadowRoot.querySelector(".back-button").click();

  Assert.ok(
    BrowserTestUtils.isVisible(main),
    "The main view should be visible"
  );
  Assert.ok(BrowserTestUtils.isHidden(subview), "Guests should be hidden");
  Assert.strictEqual(
    doc.activeElement,
    guestsRow,
    "The Guests row should have focus"
  );
  Assert.strictEqual(
    guestsRow.shadowRoot.activeElement,
    action,
    "The Guests action should have focus"
  );
});

function holdGuestTranslations() {
  const original = doc.l10n.formatValues;
  const requests = [];

  doc.l10n.formatValues = function (messages) {
    if (messages[0]?.id != "calendar-dialog-attendee-summary-going") {
      return original.call(this, messages);
    }

    const release = Promise.withResolvers();
    const values = original.call(this, messages);
    requests.push({ ...release, values });
    return release.promise.then(() => values);
  };

  function restore() {
    doc.l10n.formatValues = original;
    for (const request of requests) {
      request.resolve();
    }
    dialog.close();
  }

  return { requests, restore };
}

add_task(async function test_lateGuestTranslationKeepsCurrentSummary() {
  await resetToCreate();
  const { requests, restore } = holdGuestTranslations();

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: snapshotEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 1,
      "First translation should start"
    );
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: populatedEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 2,
      "Replacement translation should start"
    );

    await requests[1].values;
    requests[1].resolve();
    await TestUtils.waitForCondition(
      () =>
        guestsRow.querySelector(".guests-summary").textContent ==
        "1 attending, 2 maybe, 3 declined, 4 pending",
      "The replacement summary should render"
    );

    await requests[0].values;
    requests[0].resolve();
    await TestUtils.waitForTick();
    Assert.equal(
      guestsRow.querySelector(".guests-summary").textContent,
      "1 attending, 2 maybe, 3 declined, 4 pending",
      "The old translation should not replace the current summary"
    );
  } finally {
    restore();
  }
});

add_task(async function test_createOpensWhileOldGuestTranslationIsPending() {
  await resetToCreate();
  const { requests, restore } = holdGuestTranslations();

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: populatedEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 1,
      "Edit translation should start"
    );
    await resetToCreate();
    await dialog.show();
    Assert.ok(dialog.open, "The create dialog should open");
    assertEmptyRow();

    await requests[0].values;
    requests[0].resolve();
    await TestUtils.waitForTick();
    assertEmptyRow();
    Assert.equal(
      guestsRow.querySelector(".guests-summary").textContent,
      "",
      "The old edit translation should not restore a summary"
    );
  } finally {
    restore();
  }
});

add_task(async function test_editWaitsForGuestSummary() {
  await resetToCreate();
  const { requests, restore } = holdGuestTranslations();

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: populatedEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 1,
      "Guest translation should start"
    );
    const shown = dialog.show();
    await dialog.querySelector("calendar-event-category-row").renderComplete;
    await doc.l10n.translateFragment(dialog);
    await TestUtils.waitForTick();
    Assert.ok(
      !dialog.open,
      "The edit dialog should wait for guest translation"
    );

    await requests[0].values;
    requests[0].resolve();
    await shown;
    Assert.ok(dialog.open, "The edit dialog should open after translation");
    await assertPopulatedRow();
  } finally {
    restore();
  }
});

add_task(async function test_oldRouteCannotOpenPendingReplacement() {
  await resetToCreate();
  const { requests, restore } = holdGuestTranslations();

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: snapshotEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 1,
      "First route translation should start"
    );
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: populatedEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 2,
      "Replacement route translation should start"
    );
    const shown = dialog.show();
    await requests[0].values;
    requests[0].resolve();
    await dialog.querySelector("calendar-event-category-row").renderComplete;
    await doc.l10n.translateFragment(dialog);
    await TestUtils.waitForTick();
    Assert.ok(
      !dialog.open,
      "The replacement route should wait for its translation"
    );

    await requests[1].values;
    requests[1].resolve();
    await shown;
    Assert.ok(
      dialog.open,
      "The replacement route should open after translation"
    );
    await assertPopulatedRow();
  } finally {
    restore();
  }
});

add_task(async function test_translationFailureClearsOldSummary() {
  await resetToCreate();
  await loadEvent(populatedEvent);
  const summary = guestsRow.querySelector(".guests-summary");
  await BrowserTestUtils.waitForMutationCondition(
    summary,
    { childList: true, characterData: true, subtree: true },
    () => summary.textContent.length > 0
  );
  const { requests, restore } = holdGuestTranslations();

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: snapshotEvent.id,
    });
    await TestUtils.waitForCondition(
      () => requests.length == 1,
      "Replacement translation should start"
    );
    const shown = dialog.show();
    requests[0].reject(new Error("Guest translation failed"));
    await shown;

    Assert.ok(dialog.open, "The dialog should open after translation fails");
    Assert.equal(
      guestsRow.querySelector(".guests-summary").textContent,
      "",
      "The failed translation should not leave the old summary"
    );
  } finally {
    restore();
  }
});
