/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let doc;
let dialog;
let dialogContainer;
let calendar;
let calendarEvent;
let recurringEvent;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);
  doc = browser.contentWindow.document;
  dialogContainer = doc.getElementById("dialog-container");
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  dialog.container = dialogContainer;

  calendar = createCalendar();
  calendarEvent = await createEvent({
    calendar,
    name: "Create/Edit Loader Event",
  });
  recurringEvent = await createEvent({
    calendar,
    name: "Create/Edit Loader Recurring Event",
    repeats: true,
  });

  await startAxeMutationObserver(browser, {
    message:
      "The create/edit dialog shell stayed axe-clean while the test mutated it",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

function waitForNextSourceLoad(element = dialog) {
  const { promise, resolve, reject } = Promise.withResolvers();
  const originalSourceLoaded = element.onCalendarEventSourceLoaded;
  element.onCalendarEventSourceLoaded = async source => {
    try {
      await originalSourceLoaded.call(element, source);
      resolve(source);
    } catch (error) {
      reject(error);
      throw error;
    }
  };
  return promise.finally(() => {
    element.onCalendarEventSourceLoaded = originalSourceLoaded;
  });
}

function waitForNextSourceError(element = dialog) {
  const { promise, resolve } = Promise.withResolvers();
  const originalRouteError = element.onCalendarEventRouteError;
  element.onCalendarEventRouteError = error => {
    originalRouteError.call(element, error);
    resolve(error);
  };
  return promise.finally(() => {
    element.onCalendarEventRouteError = originalRouteError;
  });
}

async function waitForMode(mode, element = dialog) {
  await TestUtils.waitForCondition(
    () => element.mode == mode,
    `Waiting for the create/edit dialog to enter ${mode} mode`
  );
}

async function resetToCreateMode(element = dialog) {
  element.setCalendarEventRoute();
  await waitForMode("create", element);
}

async function createAdditionalDialog() {
  const element = browser.contentWindow.document.createElement("dialog", {
    is: "calendar-event-create-edit-dialog",
  });
  element.container = dialogContainer;
  browser.contentWindow.document.body.append(element);
  await waitForMode("create", element);
  return element;
}

function delayCalendarEventLoad(eventId) {
  const calendarObject = calendar.wrappedJSObject;
  const originalGetItem = calendarObject.getItem;
  const requestStarted = Promise.withResolvers();
  const releaseRequest = Promise.withResolvers();
  let delayed = true;

  calendarObject.getItem = async id => {
    if (delayed && id == eventId) {
      requestStarted.resolve();
      await releaseRequest.promise;
    }
    return originalGetItem.call(calendarObject, id);
  };

  return {
    release() {
      delayed = false;
      releaseRequest.resolve();
    },
    restore() {
      calendarObject.getItem = originalGetItem;
    },
    waitForRequest() {
      return requestStarted.promise;
    },
  };
}

add_task(async function test_registrationAndStructure() {
  const { customElements } = browser.contentWindow;
  Assert.ok(
    customElements.get("calendar-event-create-edit-dialog"),
    "The create/edit dialog custom element is registered"
  );
  Assert.ok(
    dialog instanceof customElements.get("positioned-dialog"),
    "The create/edit dialog extends PositionedDialog through the shared source mixin"
  );
  Assert.ok(
    !("sourceState" in dialog),
    "Create/edit does not expose a pull-based source-state API"
  );
  Assert.ok(
    !("sourceEvent" in dialog),
    "Create/edit does not expose a pull-based raw-event API"
  );

  Assert.equal(
    dialog.querySelectorAll(
      ":scope > .calendar-event-create-edit-dialog-header"
    ).length,
    1,
    "The dialog has one header region"
  );
  Assert.equal(
    dialog.querySelectorAll(":scope > .calendar-event-create-edit-dialog-body")
      .length,
    1,
    "The dialog has one body region"
  );
  Assert.equal(
    dialog.querySelectorAll(
      ":scope > .calendar-event-create-edit-dialog-footer"
    ).length,
    1,
    "The dialog has one footer region"
  );
});

add_task(async function test_sharedRowAndSubviewScaffolding() {
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const subview = body.querySelector(
    "#calendarEventCreateEditDialogMainSubview[data-subview='main']"
  );

  Assert.ok(subview, "The body provides the main subview scaffold");
  const rows = subview.querySelector(".calendar-event-create-edit-dialog-rows");
  Assert.ok(rows, "The main subview provides the shared row container");
  Assert.equal(rows.childElementCount, 0, "The static shell has no field rows");
});

add_task(async function test_accessibleStaticDialogShell() {
  dialog.showModal();

  try {
    await doc.l10n.translateFragment(dialog);

    Assert.equal(
      dialog.getAttribute("aria-label"),
      "Event",
      "The dialog has an accessible name"
    );
  } finally {
    dialog.close();
  }
});

add_task(async function test_dialogVisibilityChecks() {
  Assert.ok(!dialog.open, "The dialog is closed before it is shown");

  Assert.ok(
    BrowserTestUtils.isHidden(dialog),
    "The dialog is hidden before it is opened"
  );

  await dialog.show();

  Assert.ok(
    BrowserTestUtils.isVisible(dialog),
    "The dialog is visible after opening"
  );

  dialog.close();

  Assert.ok(
    BrowserTestUtils.isHidden(dialog),
    "The dialog is hidden after closing"
  );
});

add_task(async function test_dialogHasMinimumWidth() {
  await dialog.show();

  try {
    await TestUtils.waitForCondition(
      () => BrowserTestUtils.isVisible(dialog),
      "The dialog is visible before measuring its rendered width"
    );

    const { width } = dialog.getBoundingClientRect();
    Assert.greaterOrEqual(width, 424, "The dialog is at least 424px wide");
  } finally {
    dialog.close();
  }
});

add_task(async function test_bodyScrollsWhenContentIsTooTall() {
  const dialogHeader = dialog.querySelector(
    ".calendar-event-create-edit-dialog-header"
  );
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const dialogFooter = dialog.querySelector(
    ".calendar-event-create-edit-dialog-footer"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const headerContent = dialogHeader.querySelector(".calendar-name");
  const tallContent = doc.createElement("div");

  headerContent.textContent = "Header content";
  dialogFooter.textContent = "Footer content";

  // Limit the size of the dialog container, to mimic a limited size in the
  // calendar view.
  dialogContainer.style.blockSize = "200px";

  const shortDialogRect = dialog.getBoundingClientRect();
  const shortHeaderRect = dialogHeader.getBoundingClientRect();
  const shortFooterRect = dialogFooter.getBoundingClientRect();

  await dialog.show();

  try {
    Assert.ok(
      BrowserTestUtils.isVisible(dialogHeader),
      "The header is visible when the dialog content is short"
    );
    Assert.greaterOrEqual(
      shortHeaderRect.top,
      shortDialogRect.top,
      "The header top edge is inside the dialog when the content is short"
    );
    Assert.lessOrEqual(
      shortHeaderRect.bottom,
      shortDialogRect.bottom,
      "The header bottom edge is inside the dialog when the content is short"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(dialogFooter),
      "The footer is visible when the dialog content is short"
    );
    Assert.greaterOrEqual(
      shortFooterRect.top,
      shortDialogRect.top,
      "The footer top edge is inside the dialog when the content is short"
    );
    Assert.lessOrEqual(
      shortFooterRect.bottom,
      shortDialogRect.bottom,
      "The footer bottom edge is inside the dialog when the content is short"
    );

    // Now, increase the height of the dialog body content, such that it
    // triggers a scrollbar
    tallContent.style.blockSize = "1000px";
    rows.append(tallContent);

    const tallDialogRect = dialog.getBoundingClientRect();
    const constrainedContainerRect = dialogContainer.getBoundingClientRect();

    Assert.lessOrEqual(
      tallDialogRect.height,
      constrainedContainerRect.height,
      "The dialog does not exceed the constrained container height"
    );

    Assert.greater(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body becomes scrollable when its content is too tall"
    );

    const headerRectBeforeScroll = dialogHeader.getBoundingClientRect();
    const footerRectBeforeScroll = dialogFooter.getBoundingClientRect();

    // Scroll to the bottom of the dialog.
    dialogBody.scrollTop = dialogBody.scrollHeight;

    Assert.greater(
      dialogBody.scrollTop,
      0,
      "The dialog body scrolls when content is too tall"
    );

    const headerRectAfterScroll = dialogHeader.getBoundingClientRect();
    const footerRectAfterScroll = dialogFooter.getBoundingClientRect();

    Assert.equal(
      headerRectAfterScroll.top,
      headerRectBeforeScroll.top,
      "The header top edge stays fixed when the body scrolls"
    );
    Assert.equal(
      headerRectAfterScroll.bottom,
      headerRectBeforeScroll.bottom,
      "The header bottom edge stays fixed when the body scrolls"
    );
    Assert.greaterOrEqual(
      headerRectAfterScroll.top,
      tallDialogRect.top,
      "The header top edge stays inside the dialog after the body scrolls"
    );
    Assert.lessOrEqual(
      headerRectAfterScroll.bottom,
      tallDialogRect.bottom,
      "The header bottom edge stays inside the dialog after the body scrolls"
    );
    Assert.equal(
      footerRectAfterScroll.top,
      footerRectBeforeScroll.top,
      "The footer top edge stays fixed when the body scrolls"
    );
    Assert.equal(
      footerRectAfterScroll.bottom,
      footerRectBeforeScroll.bottom,
      "The footer bottom edge stays fixed when the body scrolls"
    );
    Assert.greaterOrEqual(
      footerRectAfterScroll.top,
      tallDialogRect.top,
      "The footer top edge stays inside the dialog after the body scrolls"
    );
    Assert.lessOrEqual(
      footerRectAfterScroll.bottom,
      tallDialogRect.bottom,
      "The footer bottom edge stays inside the dialog after the body scrolls"
    );
  } finally {
    headerContent.textContent = "";
    dialogFooter.textContent = "";
    tallContent.remove();
    dialogBody.scrollTop = 0;
    dialogContainer.style.removeProperty("block-size");
    dialog.close();
  }
});

add_task(async function test_rowsExpandAndCollapseWithinAvailableSpace() {
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const row = doc.createElement("div");
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  const expandedContent = doc.createElement("div");

  summary.textContent = "Expandable row";
  expandedContent.style.blockSize = "80px";
  expandedContent.textContent = "Expanded row content";
  details.append(summary, expandedContent);
  row.append(details);
  rows.append(row);

  await dialog.show();

  try {
    const collapsedHeight = dialog.getBoundingClientRect().height;

    details.open = true;

    const expandedHeight = dialog.getBoundingClientRect().height;

    Assert.greater(
      expandedHeight,
      collapsedHeight,
      "The dialog grows when a row expands and vertical space is available"
    );
    Assert.lessOrEqual(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body does not need to scroll when vertical space is available"
    );

    details.open = false;

    Assert.less(
      dialog.getBoundingClientRect().height,
      expandedHeight,
      "The dialog shrinks when the row collapses"
    );
  } finally {
    row.remove();
    dialogBody.scrollTop = 0;
    dialog.close();
  }
});

add_task(async function test_rowsScrollWhenAvailableSpaceIsConstrained() {
  const dialogBody = dialog.querySelector(
    ".calendar-event-create-edit-dialog-body"
  );
  const rows = dialog.querySelector(".calendar-event-create-edit-dialog-rows");
  const row = doc.createElement("div");
  const details = doc.createElement("details");
  const summary = doc.createElement("summary");
  const expandedContent = doc.createElement("div");

  summary.textContent = "Expandable row";
  expandedContent.style.blockSize = "260px";
  expandedContent.textContent = "Expanded row content";
  details.append(summary, expandedContent);
  row.append(details);

  dialogContainer.style.blockSize = "160px";
  rows.append(row);

  await dialog.show();

  try {
    const constrainedHeight = dialogContainer.getBoundingClientRect().height;
    const collapsedHeight = dialog.getBoundingClientRect().height;

    Assert.lessOrEqual(
      collapsedHeight,
      constrainedHeight,
      "The collapsed dialog fits inside the constrained container"
    );

    details.open = true;

    const expandedHeight = dialog.getBoundingClientRect().height;

    Assert.lessOrEqual(
      expandedHeight,
      constrainedHeight,
      "The expanded dialog does not grow beyond the constrained height"
    );
    Assert.equal(
      expandedHeight,
      collapsedHeight,
      "The dialog height stays static when a row expands without more vertical space"
    );
    Assert.greater(
      dialogBody.scrollHeight,
      dialogBody.clientHeight,
      "The dialog body becomes scrollable when expanded content exceeds available space"
    );

    const scrollTop = dialogBody.scrollTop;
    dialogBody.scrollTop = dialogBody.scrollHeight;

    Assert.greater(
      dialogBody.scrollTop,
      scrollTop,
      "The dialog body can scroll to show the expanded row content"
    );
  } finally {
    row.remove();
    dialogBody.scrollTop = 0;
    dialogContainer.style.removeProperty("block-size");
    dialog.close();
  }
});
add_task(async function test_createRouteDoesNotLoadASourceEvent() {
  await resetToCreateMode();

  const originalSourceLoaded = dialog.onCalendarEventSourceLoaded;
  let sourceLoaded = false;
  dialog.onCalendarEventSourceLoaded = async source => {
    sourceLoaded = true;
    await originalSourceLoaded.call(dialog, source);
  };

  try {
    Assert.equal(
      await dialog.show(),
      true,
      "A create route can show without a source event"
    );
    Assert.equal(
      dialog.mode,
      "create",
      "The empty route remains in create mode"
    );
    Assert.ok(!sourceLoaded, "The create route does not load a source event");
  } finally {
    dialog.onCalendarEventSourceLoaded = originalSourceLoaded;
    dialog.close();
  }
});
add_task(async function test_attributeDrivenSourceLoader() {
  await resetToCreateMode();

  const sourceLoaded = waitForNextSourceLoad();
  dialog.setAttribute("calendar-id", calendar.id);
  dialog.setAttribute("event-id", calendarEvent.id);
  const source = await sourceLoaded;

  Assert.equal(
    dialog.mode,
    "edit",
    "The identifying attributes select edit mode"
  );
  Assert.equal(
    source.identity.calendarId,
    calendar.id,
    "The source transition retains the calendar identity"
  );
  Assert.equal(
    source.identity.eventId,
    calendarEvent.id,
    "The source transition retains the event identity"
  );
  Assert.equal(
    source.snapshot.event.title,
    calendarEvent.title,
    "The source transition carries a serializable event snapshot"
  );
  Assert.ok(
    !("event" in source),
    "The Redux create/edit consumer does not receive a raw platform event"
  );
  const serializedSnapshot = JSON.stringify(source.snapshot);
  Assert.equal(
    JSON.parse(serializedSnapshot).event.title,
    calendarEvent.title,
    "The snapshot passed through the state transition is serializable"
  );

  const nextOccurrence = recurringEvent.recurrenceInfo.getNextOccurrence(
    recurringEvent.startDate
  );
  Assert.ok(nextOccurrence, "The recurring event has a next occurrence");
  const expectedRecurrenceId = String(nextOccurrence.recurrenceId.nativeTime);
  const expectedOccurrenceStartNativeTime = String(
    nextOccurrence.startDate.nativeTime
  );
  const recurringSourceLoaded = waitForNextSourceLoad();
  dialog.setAttribute("event-id", recurringEvent.id);
  dialog.setAttribute("recurrence-id", expectedRecurrenceId);
  const recurringSource = await recurringSourceLoaded;

  Assert.strictEqual(
    recurringSource.identity.recurrenceId,
    expectedRecurrenceId,
    "The source transition accepts recurrence-id as the route's native-time value"
  );
  Assert.strictEqual(
    recurringSource.snapshot.event.recurrenceId,
    expectedRecurrenceId,
    "The snapshot identifies the requested occurrence"
  );
  Assert.strictEqual(
    recurringSource.snapshot.event.start.nativeTime,
    expectedOccurrenceStartNativeTime,
    "The source snapshot represents the requested occurrence"
  );

  await resetToCreateMode();
});

add_task(async function test_atomicRouteUpdatesClearModeAndRecurrence() {
  await resetToCreateMode();

  const recurringSourceLoaded = waitForNextSourceLoad();
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: recurringEvent.id,
    recurrenceId: String(recurringEvent.startDate.nativeTime),
  });
  await recurringSourceLoaded;
  Assert.equal(dialog.mode, "edit", "The atomic route selects edit mode");

  const sourceLoaded = waitForNextSourceLoad();
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: calendarEvent.id,
  });
  Assert.equal(
    dialog.getAttribute("recurrence-id"),
    null,
    "An atomic non-recurring route removes the prior recurrence ID"
  );
  const source = await sourceLoaded;
  Assert.equal(
    source.snapshot.event.eventId,
    calendarEvent.id,
    "The new route loads without the prior occurrence selector"
  );

  dialog.setCalendarEventRoute();
  Assert.equal(
    dialog.mode,
    null,
    "Clearing a route resets edit mode immediately"
  );
  await waitForMode("create");
});

add_task(async function test_loadingStateDrivesEditPresentation() {
  await resetToCreateMode();

  const delayedLoad = delayCalendarEventLoad(calendarEvent.id);
  const originalSourceLoaded = dialog.onCalendarEventSourceLoaded;
  const sourceLoaded = Promise.withResolvers();
  dialog.onCalendarEventSourceLoaded = async source => {
    sourceLoaded.resolve(source);
    await originalSourceLoaded.call(dialog, source);
  };

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: calendarEvent.id,
    });
    await delayedLoad.waitForRequest();
    await waitForMode("edit");

    Assert.ok(
      !dialog.open,
      "The loading state selects edit presentation before the source is ready"
    );

    delayedLoad.release();
    const source = await sourceLoaded.promise;
    Assert.equal(
      source.snapshot.event.eventId,
      calendarEvent.id,
      "The ready transition receives the event after the loading transition"
    );
  } finally {
    delayedLoad.release();
    delayedLoad.restore();
    dialog.onCalendarEventSourceLoaded = originalSourceLoaded;
    await resetToCreateMode();
  }
});

add_task(async function test_supersededSourceHookCannotApplyStaleState() {
  await resetToCreateMode();

  const originalSourceLoaded = dialog.onCalendarEventSourceLoaded;
  const firstHookStarted = Promise.withResolvers();
  const releaseFirstHook = Promise.withResolvers();
  const currentSourceLoaded = Promise.withResolvers();
  let renderedEventId = null;
  let firstHookWasCurrent = true;

  dialog.onCalendarEventSourceLoaded = async source => {
    if (source.snapshot.event.eventId == calendarEvent.id) {
      firstHookStarted.resolve();
      await releaseFirstHook.promise;
      firstHookWasCurrent = source.isCurrent();
    }
    if (source.isCurrent()) {
      renderedEventId = source.snapshot.event.eventId;
      if (source.snapshot.event.eventId == recurringEvent.id) {
        currentSourceLoaded.resolve();
      }
    }
  };

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: calendarEvent.id,
    });
    await firstHookStarted.promise;

    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: recurringEvent.id,
      recurrenceId: String(recurringEvent.startDate.nativeTime),
    });
    await currentSourceLoaded.promise;
    Assert.equal(
      renderedEventId,
      recurringEvent.id,
      "The current route renders while the old hook is pending"
    );

    releaseFirstHook.resolve();
    await new Promise(browser.contentWindow.requestAnimationFrame);
    Assert.ok(!firstHookWasCurrent, "The superseded hook is marked stale");
    Assert.equal(
      renderedEventId,
      recurringEvent.id,
      "The stale hook does not overwrite current presentation state"
    );
  } finally {
    dialog.onCalendarEventSourceLoaded = originalSourceLoaded;
    await resetToCreateMode();
  }
});

add_task(async function test_staleCalendarLookupCannotReplaceCurrentRoute() {
  await resetToCreateMode();

  const delayedLoad = delayCalendarEventLoad(calendarEvent.id);
  const originalSourceLoaded = dialog.onCalendarEventSourceLoaded;
  const currentSourceLoaded = Promise.withResolvers();
  const sourceSnapshotEventIds = [];
  dialog.onCalendarEventSourceLoaded = async source => {
    sourceSnapshotEventIds.push(source.snapshot.event.eventId);
    if (source.snapshot.event.eventId == recurringEvent.id) {
      currentSourceLoaded.resolve(source);
    }
  };

  try {
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: calendarEvent.id,
    });
    await delayedLoad.waitForRequest();

    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: recurringEvent.id,
      recurrenceId: String(recurringEvent.startDate.nativeTime),
    });
    const currentSource = await currentSourceLoaded.promise;
    Assert.equal(
      currentSource.snapshot.event.eventId,
      recurringEvent.id,
      "The replacement route receives its own source snapshot"
    );

    delayedLoad.release();
    await new Promise(browser.contentWindow.requestAnimationFrame);
    await new Promise(browser.contentWindow.requestAnimationFrame);
    Assert.deepEqual(
      sourceSnapshotEventIds,
      [recurringEvent.id],
      "The stale calendar lookup cannot render over the current route"
    );
  } finally {
    delayedLoad.release();
    delayedLoad.restore();
    dialog.onCalendarEventSourceLoaded = originalSourceLoaded;
    await resetToCreateMode();
  }
});

add_task(async function test_dialogSessionsAreIsolatedAndReloadedAfterClose() {
  await resetToCreateMode();
  const otherDialog = await createAdditionalDialog();

  try {
    const firstSourceLoaded = waitForNextSourceLoad();
    const secondSourceLoaded = waitForNextSourceLoad(otherDialog);
    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: calendarEvent.id,
    });
    otherDialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: recurringEvent.id,
      recurrenceId: String(recurringEvent.startDate.nativeTime),
    });

    const [firstSource, secondSource] = await Promise.all([
      firstSourceLoaded,
      secondSourceLoaded,
    ]);
    Assert.equal(
      firstSource.snapshot.event.eventId,
      calendarEvent.id,
      "The first dialog receives its own source snapshot"
    );
    Assert.equal(
      secondSource.snapshot.event.eventId,
      recurringEvent.id,
      "The second dialog receives its own source snapshot"
    );

    Assert.equal(await dialog.show(), true, "The first dialog opens");
    dialog.close();
    Assert.ok(!dialog.open, "Closing clears the first dialog session");

    Assert.equal(
      await otherDialog.show(),
      true,
      "Closing one dialog does not invalidate another dialog's source session"
    );
    Assert.ok(otherDialog.open, "The isolated second dialog opens");
    otherDialog.close();

    const reloadedSource = waitForNextSourceLoad();
    const reopened = dialog.show();
    Assert.ok(!dialog.open, "The closed dialog waits for a fresh source load");
    const source = await reloadedSource;
    Assert.equal(
      source.snapshot.event.eventId,
      calendarEvent.id,
      "The closed dialog reloads its own source before reopening"
    );
    Assert.equal(await reopened, true, "The first dialog reopens after reload");
  } finally {
    if (dialog.open) {
      dialog.close();
    }
    if (otherDialog.open) {
      otherDialog.close();
    }
    otherDialog.remove();
    await resetToCreateMode();
  }
});

add_task(async function test_createAndEditDraftLifecycle() {
  await resetToCreateMode();

  Assert.deepEqual(
    dialog.draft,
    {},
    "Create mode starts with an empty draft before fields set defaults"
  );
  dialog.resetCreateDraft({
    calendarId: calendar.id,
    title: "Field provider title",
  });
  Assert.deepEqual(
    dialog.draft,
    {
      calendarId: calendar.id,
      title: "Field provider title",
    },
    "Create draft accepts values from field defaults"
  );
  Assert.ok(!dialog.isDirty, "Create defaults set the starting values");

  const sourceLoaded = waitForNextSourceLoad();
  dialog.setAttribute("calendar-id", calendar.id);
  dialog.setAttribute("event-id", calendarEvent.id);
  const source = await sourceLoaded;
  await TestUtils.waitForCondition(
    () => dialog.draft?.title == calendarEvent.title,
    "Waiting for source data to set the edit draft"
  );

  Assert.deepEqual(
    dialog.draft,
    {
      calendarId: calendar.id,
      end: source.snapshot.event.end,
      start: source.snapshot.event.start,
      title: calendarEvent.title,
    },
    "Edit mode copies source data into a draft"
  );
  Assert.ok(!dialog.isDirty, "A newly loaded edit draft is clean");

  dialog.updateDraftSection("title", { title: "Unsaved title" });
  Assert.equal(dialog.draft.title, "Unsaved title", "The draft changes");
  Assert.deepEqual(
    dialog.dirtySections,
    ["title"],
    "The dirty section is tracked"
  );
  Assert.equal(
    source.snapshot.event.title,
    calendarEvent.title,
    "Draft input does not change copied source data"
  );

  const recurringSourceLoaded = waitForNextSourceLoad();
  dialog.setAttribute("event-id", recurringEvent.id);
  dialog.setAttribute("recurrence-id", recurringEvent.startDate.nativeTime);
  await recurringSourceLoaded;
  await TestUtils.waitForCondition(
    () => dialog.draft?.title == recurringEvent.title,
    "Waiting for new source data to reset the draft"
  );
  Assert.deepEqual(
    dialog.dirtySections,
    [],
    "Loading new source data clears old changed state"
  );

  await resetToCreateMode();
  Assert.deepEqual(
    dialog.draft,
    {},
    "Clearing an edit route removes its draft and starts a clean create draft"
  );
});

add_task(async function test_showWaitsForTheCurrentSourceRoute() {
  await resetToCreateMode();

  const sourceLoaded = waitForNextSourceLoad();
  dialog.setAttribute("calendar-id", calendar.id);
  dialog.setAttribute("event-id", calendarEvent.id);
  const showPromise = dialog.show();

  Assert.ok(
    !dialog.open,
    "The dialog is not shown before the source route has loaded"
  );
  await sourceLoaded;
  await showPromise;
  Assert.ok(dialog.open, "The dialog opens after the source route is ready");

  dialog.close();
});

add_task(async function test_incompleteSourceIdentityIsNotLoaded() {
  await resetToCreateMode();

  const sourceError = waitForNextSourceError();
  dialog.setAttribute("calendar-id", calendar.id);
  const error = await sourceError;

  Assert.equal(
    dialog.mode,
    null,
    "An incomplete route selects neither dialog mode"
  );
  Assert.equal(
    error.code,
    "incomplete-identity",
    "The incomplete route is reported without a calendar lookup"
  );

  Assert.equal(
    await dialog.show(),
    false,
    "An incomplete route resolves without opening the dialog"
  );
  Assert.ok(!dialog.open, "The failed route did not show the dialog");

  await resetToCreateMode();
});

add_task(async function test_missingOrInvalidSourceFailuresAreControlled() {
  await resetToCreateMode();

  const missingCalendar = waitForNextSourceError();
  dialog.setCalendarEventRoute({
    calendarId: "missing-calendar",
    eventId: calendarEvent.id,
  });
  const missingCalendarError = await missingCalendar;
  Assert.equal(
    missingCalendarError.code,
    "calendar-not-found",
    "A missing calendar has a controlled Redux error"
  );
  Assert.equal(
    await dialog.show(),
    false,
    "A missing calendar does not reject a fire-and-forget show call"
  );

  const missingEvent = waitForNextSourceError();
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: "missing-event",
  });
  const missingEventError = await missingEvent;
  Assert.equal(
    missingEventError.code,
    "event-not-found",
    "A missing event has a controlled Redux error"
  );
  Assert.equal(
    await dialog.show(),
    false,
    "A missing event does not reject a fire-and-forget show call"
  );

  const invalidRecurrence = waitForNextSourceError();
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: recurringEvent.id,
    recurrenceId: "not-a-native-time",
  });
  const invalidRecurrenceError = await invalidRecurrence;
  Assert.equal(
    invalidRecurrenceError.code,
    "invalid-recurrence-id",
    "An invalid recurrence identity has a controlled error"
  );
  Assert.equal(
    await dialog.show(),
    false,
    "An invalid recurrence identity does not show the dialog"
  );

  const missingOccurrence = waitForNextSourceError();
  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: recurringEvent.id,
    recurrenceId: String(
      Number(recurringEvent.startDate.nativeTime) +
        90 * 24 * 60 * 60 * 1_000_000
    ),
  });
  const missingOccurrenceError = await missingOccurrence;
  Assert.equal(
    missingOccurrenceError.code,
    "occurrence-not-found",
    "A missing recurrence occurrence has a controlled error"
  );
  Assert.equal(
    await dialog.show(),
    false,
    "A missing recurrence occurrence does not show the dialog"
  );

  await resetToCreateMode();
});
