/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// The xpcshell tests cover calendar filtering and state rules. These browser
// tests check the native control and its connection to that state, including
// keyboard input, focus, accessible values, and the saved event.

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let redux;
let doc;
let dialog;
let firstCalendar;
let defaultCalendar;
let calendars;
let savedEvent;
let repeatedEvent;
let originalGetItem;
let releaseRequest;
let calendarPopup;

add_setup(async function () {
  const existing = cal.manager.getCalendars().map(calendar => ({
    calendar,
    visibility: calendar.getProperty("calendar-main-in-composite"),
    isDefault: calendar.getProperty("calendar-main-default"),
  }));
  const composite = cal.view.getCompositeCalendar(window);
  const previousDefault = composite.defaultCalendar;
  const tabmail = document.getElementById("tabmail");
  let tab = null;
  calendars = [];

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "calendar.list.sortOrder",
        Services.prefs.getStringPref("calendar.list.sortOrder", ""),
      ],
    ],
  });

  const addCalendar = options => {
    const calendar = createCalendar(options);
    calendars.push(calendar);
    return calendar;
  };

  // Hide profile calendars so the control offers only this test's calendars.
  // Cleanup restores the original visibility and default calendar.
  for (const { calendar } of existing) {
    calendar.setProperty("calendar-main-in-composite", false);
  }

  firstCalendar = addCalendar({ name: "First calendar", color: "#008000" });
  defaultCalendar = addCalendar({
    name: "Default calendar",
    color: "#0000ff",
  });

  for (const calendar of calendars) {
    calendar.setProperty("calendar-main-in-composite", true);
    calendar.deleteProperty("calendar-main-default");
  }

  composite.defaultCalendar = defaultCalendar;

  await SpecialPowers.pushPrefEnv({
    set: [
      [
        "calendar.list.sortOrder",
        calendars.map(calendar => calendar.id).join(" "),
      ],
    ],
  });

  savedEvent = await createEvent({
    calendar: firstCalendar,
    name: "Saved event",
  });

  repeatedEvent = await createEvent({
    calendar: firstCalendar,
    name: "Repeating event",
    repeats: true,
  });

  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  cal.view.colorTracker.registerWindow(browser.contentWindow);
  redux = browser.contentWindow.ReduxTestUtils;
  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  dialog.container = doc.getElementById("dialog-container");

  cal.view.getCompositeCalendar(browser.contentWindow).defaultCalendar =
    defaultCalendar;

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Calendar selector states should pass axe",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(async () => {
    if (calendarPopup && calendarPopup.state !== "closed") {
      const hidden = BrowserTestUtils.waitForPopupEvent(
        calendarPopup,
        "hidden"
      );

      calendarPopup.hidePopup();
      await hidden;
    }

    releaseRequest?.resolve();
    if (originalGetItem) {
      firstCalendar.wrappedJSObject.getItem = originalGetItem;
    }

    dialog?.close();
    if (tab) {
      tabmail.closeTab(tab);
    }
    for (const calendar of calendars) {
      CalendarTestUtils.removeCalendar(calendar);
    }

    composite.defaultCalendar = previousDefault;
    for (const { calendar, visibility, isDefault } of existing) {
      for (const [name, value] of [
        ["calendar-main-in-composite", visibility],
        ["calendar-main-default", isDefault],
      ]) {
        if (value === null) {
          calendar.deleteProperty(name);
        } else {
          calendar.setProperty(name, value);
        }
      }
    }
  });
});

/**
 * Opens create mode and waits for translated dialog text.
 *
 * @returns {Promise<HTMLSelectElement>} The calendar control for the new route.
 */
async function showCreate() {
  dialog.setCalendarEventRoute();
  Assert.ok(await dialog.show(), "The create dialog should open");
  await doc.l10n.translateFragment(dialog);

  return dialog.querySelector("select");
}

/**
 * Opens edit mode and waits for translated dialog text.
 *
 * @param {calIEvent} event - The saved event whose calendar and ID form the route.
 * @param {?string} [recurrenceId=null] - The occurrence start time in
 *   microseconds, as a string, or null to edit the whole event.
 * @returns {Promise<HTMLSelectElement>} The control after the source has loaded.
 */
async function showEdit(event, recurrenceId = null) {
  dialog.setCalendarEventRoute({
    calendarId: event.calendar.id,
    eventId: event.id,
    recurrenceId,
  });
  Assert.ok(await dialog.show(), "The edit dialog should open");
  await doc.l10n.translateFragment(dialog);

  return dialog.querySelector("select");
}

add_task(async function test_initialFocus() {
  const opener = doc.getElementById("menuCreate");
  dialog.close();
  opener.focus();
  let select = await showCreate();

  Assert.equal(
    doc.activeElement,
    select,
    "Opening should focus the enabled selector"
  );

  opener.focus();
  Assert.ok(await dialog.show(), "Showing an open dialog should succeed");
  Assert.equal(
    doc.activeElement,
    opener,
    "Showing an open dialog should preserve focus"
  );

  dialog.close();

  firstCalendar.readOnly = true;
  defaultCalendar.readOnly = true;
  opener.focus();
  select = await showCreate();

  Assert.ok(select.disabled, "The selector should be unavailable");
  Assert.equal(
    doc.activeElement,
    dialog,
    "Opening should focus the dialog when the selector is unavailable"
  );

  firstCalendar.readOnly = false;
  defaultCalendar.readOnly = false;
  dialog.close();
});

add_task(async function test_focusAfterOperationChange() {
  const originalSelect = await showCreate();
  originalSelect.focus();
  const select = await showCreate();

  Assert.strictEqual(
    select,
    originalSelect,
    "A new operation should reuse the calendar control"
  );
  Assert.equal(
    doc.activeElement,
    select,
    "The calendar control should keep focus after an operation change"
  );

  const unavailable = await showEdit(
    repeatedEvent,
    String(repeatedEvent.startDate.nativeTime)
  );

  Assert.ok(
    unavailable.disabled,
    "The occurrence should not permit a calendar change"
  );
  Assert.equal(
    doc.activeElement,
    dialog,
    "The dialog should receive focus when the calendar control is unavailable"
  );

  await showCreate();

  Assert.equal(
    doc.activeElement,
    dialog,
    "Creating after an unavailable event should keep focus on the dialog"
  );

  const opener = doc.getElementById("menuCreate");
  opener.focus();
  await showCreate();

  Assert.equal(
    doc.activeElement,
    opener,
    "A route change should preserve focus outside the selector"
  );
});

add_task(async function test_focusDuringOperationLoading() {
  const opener = doc.getElementById("menuCreate");
  const calendarObject = firstCalendar.wrappedJSObject;
  originalGetItem = calendarObject.getItem;

  for (const endState of ["selector", "opener", "closed"]) {
    const select = await showCreate();
    select.focus();

    // Hold the calendar response so focus can be checked during event loading.
    // Resolve it only after setting the focus or closed state for this case.
    const requestStarted = Promise.withResolvers();
    releaseRequest = Promise.withResolvers();
    calendarObject.getItem = async id => {
      requestStarted.resolve();
      await releaseRequest.promise;
      return originalGetItem.call(calendarObject, id);
    };

    dialog.setCalendarEventRoute({
      calendarId: firstCalendar.id,
      eventId: savedEvent.id,
    });
    const shown = dialog.show();
    await requestStarted.promise;

    Assert.equal(
      doc.activeElement,
      dialog,
      "Focus should stay in the dialog while the new operation loads"
    );

    if (endState == "closed") {
      dialog.close();
    }
    if (endState != "selector") {
      opener.focus();
    }
    releaseRequest.resolve();

    Assert.equal(
      await shown,
      endState != "closed",
      "The load should complete only while the dialog remains open"
    );
    Assert.equal(
      doc.activeElement,
      endState == "selector" ? dialog.querySelector("select") : opener,
      "Loading should restore selector focus only when focus stays in the dialog"
    );

    calendarObject.getItem = originalGetItem;
    releaseRequest = null;
  }
});

add_task(async function test_popupClosesWhenEventChanges() {
  const nextEvent = await createEvent({
    calendar: firstCalendar,
    name: "Another event for calendar selection",
  });
  const select = await showEdit(savedEvent);

  await SimpleTest.promiseFocus(browser.contentWindow);
  select.scrollIntoView();

  const opened = BrowserTestUtils.waitForSelectPopupShown(window);

  EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  calendarPopup = await opened;

  Assert.equal(
    calendarPopup.state,
    "open",
    "The calendar popup should be open before changing events"
  );

  const popupClosed = BrowserTestUtils.waitForPopupEvent(
    calendarPopup,
    "hidden"
  );
  const calendarObject = firstCalendar.wrappedJSObject;
  originalGetItem = calendarObject.getItem;
  const requestStarted = Promise.withResolvers();
  releaseRequest = Promise.withResolvers();

  // Hold the next event's response while the previous event's popup closes.
  calendarObject.getItem = async id => {
    requestStarted.resolve();
    await releaseRequest.promise;

    return originalGetItem.call(calendarObject, id);
  };

  dialog.setCalendarEventRoute({
    calendarId: firstCalendar.id,
    eventId: nextEvent.id,
  });

  const shown = dialog.show();

  await requestStarted.promise;

  Assert.strictEqual(
    dialog.querySelector("select"),
    select,
    "The loading dialog should reuse the calendar control"
  );
  Assert.ok(
    select.disabled,
    "The control should be disabled during event loading"
  );
  Assert.equal(
    dialog.draft,
    null,
    "The previous event's draft should be cleared during loading"
  );

  await popupClosed;

  Assert.equal(
    calendarPopup.state,
    "closed",
    "Changing events should close the previous calendar popup"
  );

  releaseRequest.resolve();
  const didShow = await shown;
  calendarObject.getItem = originalGetItem;
  originalGetItem = null;
  releaseRequest = null;

  Assert.ok(didShow, "The next event's dialog should finish loading");
  Assert.strictEqual(
    dialog.querySelector("select"),
    select,
    "The loaded dialog should reuse the calendar control"
  );
  Assert.equal(
    dialog.draft.title,
    nextEvent.title,
    "The draft should contain the next event's title"
  );
  Assert.equal(
    select.value,
    firstCalendar.id,
    "The control should display the next event's calendar"
  );
  Assert.ok(
    !select.disabled,
    "The loaded event should permit calendar selection"
  );

  // Native macOS menus cannot receive synthesized keys. Use Enter to select
  // a popup item without generating a click on the hidden HTML option.
  await SpecialPowers.pushPrefEnv({
    set: [["widget.macos.allow-native-select", false]],
  });

  await SimpleTest.promiseFocus(browser.contentWindow);
  select.scrollIntoView();

  const reopened = BrowserTestUtils.waitForSelectPopupShown(window);

  EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  calendarPopup = await reopened;

  const optionIndex = Array.from(select.options).findIndex(
    option => option.value === defaultCalendar.id
  );
  const popupItem = calendarPopup.querySelectorAll("menuitem")[optionIndex];

  Assert.greaterOrEqual(optionIndex, 0, "The other calendar should be offered");
  Assert.ok(popupItem, "The other calendar should have a popup item");

  for (let index = select.selectedIndex; index < optionIndex; index++) {
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, window);
  }

  Assert.equal(
    calendarPopup.parentNode.activeChild,
    popupItem,
    "Keyboard navigation should highlight the other calendar"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(calendarPopup, "hidden");
  const changed = BrowserTestUtils.waitForEvent(select, "change");

  EventUtils.synthesizeKey("KEY_Enter", {}, window);
  await hidden;
  await changed;
  await SpecialPowers.popPrefEnv();

  Assert.equal(
    select.value,
    defaultCalendar.id,
    "The popup choice should update the calendar control"
  );
  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "The popup choice should update the next event's draft"
  );

  dialog.close();
});

add_task(async function test_defaultsAndUnavailableCalendar() {
  let select = await showCreate();

  Assert.deepEqual(
    Array.from(select.options, option => option.value),
    [firstCalendar.id, defaultCalendar.id],
    "The selector should render the calendar choices in order"
  );
  Assert.equal(
    select.value,
    defaultCalendar.id,
    "The usable default should be selected"
  );
  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "The draft should use the default calendar"
  );
  Assert.ok(!dialog.isDirty, "The default should leave the draft unchanged");
  Assert.ok(!select.disabled, "The selector should permit calendar selection");

  defaultCalendar.setProperty("calendar-main-in-composite", false);
  select = await showCreate();

  Assert.equal(
    select.value,
    firstCalendar.id,
    "The first usable calendar should replace a hidden default"
  );

  defaultCalendar.setProperty("calendar-main-in-composite", true);
  defaultCalendar.readOnly = true;
  firstCalendar.readOnly = true;
  select = await showCreate();

  Assert.equal(
    select.value,
    defaultCalendar.id,
    "If no calendar is usable, the selector should keep the default ID"
  );
  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "The draft should retain the unavailable default calendar"
  );
  Assert.equal(
    select.selectedOptions[0].textContent,
    defaultCalendar.name,
    "The unavailable option should display the calendar name"
  );
  Assert.ok(select.disabled, "The selector should be unavailable");
  Assert.ok(
    select.selectedOptions[0].disabled,
    "The fallback should be displayed without permitting selection"
  );

  firstCalendar.readOnly = false;
  defaultCalendar.readOnly = false;
});

add_task(async function test_editSelectionChangesOnlyTheDraft() {
  const select = await showEdit(savedEvent);

  Assert.equal(
    select.value,
    firstCalendar.id,
    "Edit should start with the loaded event's calendar"
  );
  Assert.ok(
    !select.disabled,
    "An editable whole event should permit calendar selection"
  );

  const original = savedEvent.icalString;
  const changed = redux.waitForAction(
    "calendarEventDraft/updateSection",
    action =>
      action.payload.sessionKey === dialog.calendarEventSessionKey &&
      action.payload.section === "calendar"
  );

  select.value = defaultCalendar.id;
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );
  await changed;

  await redux.assertSelector(
    "moz-src:///comm/mail/components/calendar/content/state/calendar-event-create-edit-selectors.mjs",
    "selectCalendarId",
    defaultCalendar.id,
    "The draft should use the selected calendar",
    dialog.calendarEventSessionKey
  );
  Assert.equal(
    savedEvent.calendar.id,
    firstCalendar.id,
    "The original event should retain its calendar"
  );
  Assert.equal(
    (await firstCalendar.getItem(savedEvent.id)).icalString,
    original,
    "The saved event should remain unchanged"
  );
  Assert.equal(
    await defaultCalendar.getItem(savedEvent.id),
    null,
    "Selection should not move the saved event"
  );
});

add_task(async function test_editPermissionAndOccurrence() {
  let select = await showEdit(
    repeatedEvent,
    String(repeatedEvent.startDate.nativeTime)
  );

  Assert.equal(
    select.value,
    firstCalendar.id,
    "The occurrence should display its original calendar"
  );
  Assert.ok(
    select.disabled,
    "One occurrence should not permit a calendar change"
  );

  select.value = defaultCalendar.id;
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    firstCalendar.id,
    "A disabled occurrence should reject selection"
  );

  firstCalendar.setProperty("calendar-main-in-composite", false);
  select = await showEdit(savedEvent);

  Assert.equal(
    select.value,
    firstCalendar.id,
    "A hidden source calendar should stay selected"
  );
  Assert.ok(
    select.selectedOptions[0].disabled,
    "A hidden source should be displayed without permitting selection"
  );
  Assert.ok(
    !select.disabled,
    "A writable whole event should permit a move from a hidden calendar"
  );

  firstCalendar.setProperty("calendar-main-in-composite", true);
});

add_task(async function test_oldDefaultCannotChangeNewOperation() {
  await showCreate();

  const original = dialog.onEmptyCalendarEventRoute;
  const oldLookup = Promise.withResolvers();
  const calendarObject = firstCalendar.wrappedJSObject;

  originalGetItem = calendarObject.getItem;
  releaseRequest = Promise.withResolvers();

  // Hold the edit response while the helper reads the cleared selection.
  calendarObject.getItem = async id => {
    await releaseRequest.promise;

    return originalGetItem.call(calendarObject, id);
  };

  // Start create initialization, then switch to edit before its await resumes.
  // This checks that the old result cannot restore cleared choices or defaults.
  dialog.onEmptyCalendarEventRoute = route => {
    const pending = original.call(dialog, route);
    dialog.onEmptyCalendarEventRoute = original;
    dialog.setCalendarEventRoute({
      calendarId: firstCalendar.id,
      eventId: savedEvent.id,
    });
    oldLookup.resolve(pending);
    return pending;
  };

  dialog.setCalendarEventRoute();
  await oldLookup.promise;

  Assert.equal(
    dialog.draft,
    null,
    "The old default should not recreate the cleared draft"
  );

  await redux.assertSelector(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    null,
    "The old lookup should not restore its calendar choices",
    dialog.calendarEventSessionKey
  );

  releaseRequest.resolve();
  await dialog.show();
  calendarObject.getItem = originalGetItem;
  originalGetItem = null;
  releaseRequest = null;

  Assert.equal(dialog.mode, "edit", "The route should remain in edit mode");
  Assert.equal(
    dialog.draft.calendarId,
    firstCalendar.id,
    "A pending create default should not replace the edit calendar"
  );
  Assert.equal(
    dialog.draft.title,
    savedEvent.title,
    "The edit draft should use the saved event title"
  );
  Assert.ok(!dialog.isDirty, "The loaded edit draft should be unchanged");
});

add_task(async function test_reduxRenderingKeyboardAndAccessibility() {
  const select = await showCreate();
  const swatch = dialog.querySelector(".calendar-color");
  const originalColor = defaultCalendar.getProperty("color");

  Assert.equal(
    select.namespaceURI,
    "http://www.w3.org/1999/xhtml",
    "The selector should use the XHTML namespace"
  );
  Assert.equal(
    doc.l10n.getAttributes(select).id,
    "calendar-event-calendar-selector",
    "The selector should use the localized Calendar label"
  );
  Assert.equal(
    swatch.getAttribute("aria-hidden"),
    "true",
    "The decorative color should have no extra announcement"
  );
  Assert.equal(
    browser.contentWindow.getComputedStyle(swatch).backgroundColor,
    "rgb(0, 0, 255)",
    "The swatch should display the default calendar color"
  );

  const before = doc.createElement("button");
  before.textContent = "Before";
  select.before(before);

  before.focus();
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);

  Assert.equal(
    doc.activeElement,
    select,
    "Tab should reach the calendar selector"
  );

  EventUtils.synthesizeKey("f", {}, browser.contentWindow);
  await TestUtils.waitForCondition(
    () => dialog.draft.calendarId == firstCalendar.id,
    "Keyboard selection updates the draft"
  );

  Assert.equal(
    doc.activeElement,
    select,
    "Selection should keep focus on the control"
  );

  EventUtils.synthesizeKey(
    "KEY_Tab",
    { shiftKey: true },
    browser.contentWindow
  );

  Assert.equal(
    doc.activeElement,
    before,
    "Shift+Tab should leave the selector"
  );

  before.remove();

  // Update state directly to check the observation path separately from input.
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventDraftSlice.mjs",
    "updateSection",
    {
      sessionKey: dialog.calendarEventSessionKey,
      section: "calendar",
      patch: { calendarId: defaultCalendar.id },
    }
  );

  Assert.equal(
    select.value,
    defaultCalendar.id,
    "Redux should update the displayed value"
  );
  Assert.equal(
    browser.contentWindow.getComputedStyle(swatch).backgroundColor,
    "rgb(0, 0, 255)",
    "The swatch should follow the selected calendar color"
  );

  const selection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    dialog.calendarEventSessionKey
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "setCalendarOptions",
    {
      sessionKey: dialog.calendarEventSessionKey,
      calendarId: dialog.draft.calendarId,
      calendars: selection.calendars.map(calendar =>
        calendar.id == defaultCalendar.id
          ? { ...calendar, name: "Renamed calendar" }
          : calendar
      ),
    }
  );

  Assert.equal(
    select.selectedOptions[0].textContent,
    "Renamed calendar",
    "Redux should update the calendar name"
  );

  defaultCalendar.setProperty("color", "#ff0000");

  Assert.equal(
    browser.contentWindow.getComputedStyle(swatch).backgroundColor,
    "rgb(255, 0, 0)",
    "The swatch should follow the updated calendar color"
  );

  defaultCalendar.setProperty("color", originalColor);

  // Check the native selected calendar value and selector role.
  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;
  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(select)),
    "The selector is in the accessibility tree"
  );

  Assert.equal(
    accessible.value,
    "Renamed calendar",
    "Screen readers should receive the selected calendar separately"
  );
  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_COMBOBOX,
    "The native select should expose the combobox role"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "setCalendarSelection",
    {
      ...selection,
      sessionKey: dialog.calendarEventSessionKey,
      canChange: false,
    }
  );

  Assert.ok(select.disabled, "Redux should update the disabled state");
  await TestUtils.waitForCondition(() => {
    const state = {};
    accessible.getState(state, {});
    return state.value & Ci.nsIAccessibleStates.STATE_UNAVAILABLE;
  }, "Screen readers receive the unavailable state");

  const disabledBefore = doc.createElement("button");
  disabledBefore.textContent = "Before disabled selector";
  const disabledAfter = doc.createElement("button");
  disabledAfter.textContent = "After disabled selector";
  select.before(disabledBefore);
  select.after(disabledAfter);

  disabledBefore.focus();
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);

  Assert.equal(
    doc.activeElement,
    disabledAfter,
    "Tab should skip the unavailable selector"
  );

  disabledBefore.remove();
  disabledAfter.remove();
});

add_task(async function test_calendarUpdatesKeepUnchangedOptions() {
  const select = await showCreate();
  const options = Array.from(select.options);
  const sessionKey = dialog.calendarEventSessionKey;

  const selection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  Assert.equal(
    typeof selection.generation,
    "number",
    "The loaded choices should have a request number"
  );

  select.focus();

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "changeCalendar",
    {
      sessionKey,
      generation: selection.generation,
      calendarId: firstCalendar.id,
    }
  );

  dialog.updateDraftSection("title", { title: "Edited title" });

  const originalColor = firstCalendar.getProperty("color");
  const stateBeforeColorChange = redux.getState();

  firstCalendar.setProperty("color", "#123456");

  Assert.strictEqual(
    redux.getState(),
    stateBeforeColorChange,
    "A provider color change should leave Redux state unchanged"
  );

  Assert.strictEqual(
    dialog.querySelector("select"),
    select,
    "Selection, title, and color changes should keep the control"
  );
  Assert.equal(
    select.value,
    firstCalendar.id,
    "The control should keep the selected calendar after a color change"
  );
  Assert.equal(
    select.options.length,
    options.length,
    "The control should keep the same number of options"
  );

  for (const [index, option] of options.entries()) {
    Assert.strictEqual(
      select.options[index],
      option,
      "Unchanged choices should keep their option nodes"
    );
  }

  Assert.equal(
    browser.contentWindow.getComputedStyle(
      dialog.querySelector(".calendar-color")
    ).backgroundColor,
    "rgb(18, 52, 86)",
    "A provider color change should update the swatch without a Redux action"
  );

  firstCalendar.setProperty("color", originalColor);

  // Change the request number without changing the choices to check reuse.
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "setCalendarSelection",
    {
      ...selection,
      sessionKey,
      generation: selection.generation + 1,
    }
  );

  Assert.strictEqual(
    dialog.querySelector("select"),
    select,
    "A new request should reuse the calendar control"
  );
  Assert.equal(
    select.options.length,
    options.length,
    "A new request should keep unchanged choices"
  );
  Assert.equal(
    select.value,
    firstCalendar.id,
    "A new request should keep the selected calendar"
  );
  Assert.strictEqual(
    doc.activeElement,
    select,
    "A new request should keep control focus"
  );

  for (const [index, option] of options.entries()) {
    Assert.strictEqual(
      select.options[index],
      option,
      "A new request with unchanged choices should keep its option nodes"
    );
  }

  select.value = defaultCalendar.id;
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "The reused control should change the current request's draft"
  );

  await showEdit(savedEvent);

  const editSelection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  Assert.equal(
    typeof editSelection.generation,
    "number",
    "An edit load should pass its request number to the calendar choices"
  );

  dialog.close();
});

add_task(async function test_onlyCurrentEnabledDropdownChangesCalendar() {
  const select = await showCreate();
  const unrelatedSelect = select.cloneNode(true);

  // Send an event from another dropdown to check the dialog's target guard.
  select.before(unrelatedSelect);
  select.value = firstCalendar.id;
  unrelatedSelect.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "An unrelated dropdown should not change the current draft"
  );

  unrelatedSelect.remove();
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    firstCalendar.id,
    "The current enabled dropdown should change the draft"
  );

  // Leave state permission enabled to check the handler's disabled-control guard.
  select.disabled = true;
  select.value = defaultCalendar.id;
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    firstCalendar.id,
    "A disabled current dropdown should not change the draft"
  );

  select.disabled = false;
  dialog.close();
});

add_task(async function test_sourcePermissionUpdatesWithoutReloadingEvent() {
  const calendarObject = firstCalendar.wrappedJSObject;
  let loadCount = 0;
  originalGetItem = calendarObject.getItem;
  calendarObject.getItem = function (id) {
    loadCount++;

    return originalGetItem.call(this, id);
  };

  const select = await showEdit(savedEvent);
  const sessionKey = dialog.calendarEventSessionKey;
  const selection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  Assert.ok(
    !select.disabled,
    "A writable source should permit calendar changes"
  );

  dialog.updateDraftSection("title", { title: "Unsaved source change" });

  // Changing the source must prevent moves even while another choice is writable.
  let updated = BrowserTestUtils.waitForAttribute("disabled", select);

  firstCalendar.readOnly = true;
  await updated;

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "changeCalendar",
    { sessionKey, calendarId: defaultCalendar.id }
  );

  Assert.equal(
    dialog.draft.calendarId,
    firstCalendar.id,
    "A read-only source should prevent moving the draft to a writable calendar"
  );

  updated = BrowserTestUtils.waitForAttributeRemoval("disabled", select);
  firstCalendar.readOnly = false;
  await updated;

  select.value = defaultCalendar.id;
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.calendarId,
    defaultCalendar.id,
    "Restoring source permission should allow choosing another calendar"
  );

  const draft = dialog.draft;
  const dirty = dialog.dirtySections;

  // The draft now names the destination, but a move still removes the source.
  updated = BrowserTestUtils.waitForAttribute("disabled", select);
  firstCalendar.readOnly = true;
  await updated;

  Assert.ok(
    !defaultCalendar.readOnly,
    "The selected destination should remain writable"
  );
  Assert.deepEqual(
    dialog.draft,
    draft,
    "A source permission change should preserve all unsaved draft values"
  );
  Assert.deepEqual(
    dialog.dirtySections,
    dirty,
    "A source permission change should preserve the changed sections"
  );

  const currentSelection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  Assert.equal(
    currentSelection.generation,
    selection.generation,
    "A source permission change should keep the current event request"
  );
  Assert.equal(loadCount, 1, "Permission changes should not reload the event");

  // A source that starts read-only must also recover without reopening the dialog.
  dialog.close();
  const unavailable = await showEdit(savedEvent);

  Assert.ok(
    unavailable.disabled,
    "A read-only source should disable selection"
  );

  updated = BrowserTestUtils.waitForAttributeRemoval("disabled", unavailable);
  firstCalendar.readOnly = false;
  await updated;

  Assert.ok(
    !unavailable.disabled,
    "A source that becomes writable should enable calendar selection"
  );

  calendarObject.getItem = originalGetItem;
  originalGetItem = null;
  dialog.close();
});

add_task(async function test_choicesUpdateWithoutReloadingEvent() {
  const select = await showEdit(savedEvent);
  const sessionKey = dialog.calendarEventSessionKey;

  const source = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  const calendar = createCalendar({ name: "Live calendar", type: "memory" });
  calendars.push(calendar);
  calendar.setProperty("calendar-main-in-composite", true);

  const option = () =>
    Array.from(select.options).find(choice => choice.value === calendar.id);
  const waitForChoice = condition =>
    BrowserTestUtils.waitForMutationCondition(
      select,
      { childList: true, subtree: true },
      () => condition(option())
    );

  await waitForChoice(choice => choice && !choice.disabled);

  // Native macOS menus cannot receive synthesized keys. Use Enter to select
  // a popup item without generating a click on the hidden HTML option.
  await SpecialPowers.pushPrefEnv({
    set: [["widget.macos.allow-native-select", false]],
  });

  await SimpleTest.promiseFocus(browser.contentWindow);
  select.scrollIntoView();

  const opened = BrowserTestUtils.waitForSelectPopupShown(window);

  EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  calendarPopup = await opened;

  const optionIndex = Array.from(select.options).findIndex(
    choice => choice.value === calendar.id
  );
  const popupItem = calendarPopup.querySelectorAll("menuitem")[optionIndex];

  Assert.greaterOrEqual(optionIndex, 0, "The live calendar should be offered");
  Assert.ok(popupItem, "The live calendar should have a popup item");

  for (let index = select.selectedIndex; index < optionIndex; index++) {
    EventUtils.synthesizeKey("KEY_ArrowDown", {}, window);
  }

  Assert.equal(
    calendarPopup.parentNode.activeChild,
    popupItem,
    "Keyboard navigation should highlight the live calendar"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(calendarPopup, "hidden");
  const changed = BrowserTestUtils.waitForEvent(select, "change");

  EventUtils.synthesizeKey("KEY_Enter", {}, window);
  await hidden;
  await changed;
  await SpecialPowers.popPrefEnv();

  Assert.equal(
    dialog.draft.calendarId,
    calendar.id,
    "The popup choice should update the draft to the live calendar"
  );

  dialog.updateDraftSection("title", { title: "Unsaved live choice" });

  const draft = dialog.draft;
  const dirty = dialog.dirtySections;
  let updated = waitForChoice(
    choice => choice?.textContent === "Renamed live calendar"
  );

  calendar.name = "Renamed live calendar";
  await updated;

  updated = waitForChoice(choice => choice?.disabled);
  calendar.readOnly = true;
  await updated;

  Assert.equal(
    select.value,
    calendar.id,
    "An unavailable selected calendar should keep its displayed selection"
  );
  Assert.equal(
    option().textContent,
    "Renamed live calendar",
    "An unavailable selected calendar should keep its displayed name"
  );

  updated = waitForChoice(choice => choice && !choice.disabled);
  calendar.readOnly = false;
  await updated;

  updated = waitForChoice(choice => choice?.disabled);
  calendar.setProperty("calendar-main-in-composite", false);
  await updated;

  updated = waitForChoice(choice => choice && !choice.disabled);
  calendar.setProperty("calendar-main-in-composite", true);
  await updated;

  updated = waitForChoice(choice => choice?.disabled);
  calendar.setProperty("capabilities.events.supported", false);
  await updated;

  updated = waitForChoice(choice => choice && !choice.disabled);
  calendar.deleteProperty("capabilities.events.supported");
  await updated;

  updated = BrowserTestUtils.waitForMutationCondition(
    select,
    { childList: true, subtree: true },
    () => select.options[0].value === calendar.id
  );
  cal.manager.setCalendarOrder([
    calendar.id,
    ...cal.manager
      .getCalendars()
      .map(choice => choice.id)
      .filter(id => id !== calendar.id),
  ]);
  await updated;

  updated = waitForChoice(choice => choice?.disabled);
  CalendarTestUtils.removeCalendar(calendar);
  calendars.splice(calendars.indexOf(calendar), 1);
  await updated;

  Assert.equal(
    option().textContent,
    "Renamed live calendar",
    "Removing a calendar should keep its selected name visible"
  );
  Assert.strictEqual(
    dialog.querySelector("select"),
    select,
    "Live choice changes should keep the current control"
  );
  Assert.deepEqual(
    dialog.draft,
    draft,
    "Live choice changes should preserve all unsaved draft values"
  );
  Assert.deepEqual(
    dialog.dirtySections,
    dirty,
    "Live choice changes should preserve the changed sections"
  );

  const currentSelection = await redux.selectValue(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCalendarSlice.mjs",
    "selectCalendarSelection",
    sessionKey
  );

  Assert.equal(
    currentSelection.generation,
    source.generation,
    "Live choice changes should keep the current event request"
  );

  dialog.close();
});
