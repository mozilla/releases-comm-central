/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let doc;
let dialog;
let redux;
let calendar;
let originalGetItem;
let releaseRequest;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  let tab = null;

  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );

  await SimpleTest.promiseFocus(browser);

  doc = browser.contentDocument;
  redux = browser.contentWindow.ReduxTestUtils;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  dialog.container = doc.getElementById("dialog-container");
  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Availability states should pass axe",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    releaseRequest?.resolve();

    if (originalGetItem) {
      calendar.wrappedJSObject.getItem = originalGetItem;
    }

    dialog?.close();

    if (calendar) {
      CalendarTestUtils.removeCalendar(calendar);
    }

    if (tab) {
      tabmail.closeTab(tab);
    }
  });
});

add_task(async function test_optionsAndDraftOnlyChanges() {
  const opened = await dialog.show();

  Assert.ok(opened, "The dialog should open");
  await doc.l10n.translateFragment(dialog);

  const select = dialog.querySelector(".availability-selector");
  const initial = dialog.draft;

  Assert.ok(select, "The footer should have an availability selector");
  Assert.equal(
    select.parentElement.localName,
    "footer",
    "Availability should be in the footer"
  );

  Assert.deepEqual(
    Array.from(select.options, option => option.value),
    ["default", "busy", "free"],
    "Only the three accepted values should be offered"
  );

  Assert.equal(
    doc.l10n.getAttributes(select).id,
    "calendar-event-availability-selector",
    "The selector should have the Availability localization"
  );

  Assert.equal(
    select.getAttribute("aria-label"),
    "Availability",
    "The native selector should have an accessible name"
  );

  Assert.ok(
    !("availability" in initial),
    "Rendering should not initialize the draft field"
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  let accessible;

  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(select)),
    "Availability should appear in the accessibility tree"
  );

  Assert.equal(
    accessible.name,
    "Availability",
    "Screen readers should receive the field name"
  );

  Assert.equal(
    accessible.value,
    "Default",
    "Screen readers should receive the selected value"
  );

  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_COMBOBOX,
    "The native selector should expose combobox semantics"
  );

  const before = dialog.getBoundingClientRect().toJSON();

  for (const value of ["busy", "free", "default"]) {
    const actionPromise = browser.contentWindow.ReduxTestUtils.waitForAction(
      "calendarEventDraft/updateSection"
    );

    let dispatchCount = 0;
    const unsubscribe = redux.subscribe(() => dispatchCount++);

    select.value = value;
    select.dispatchEvent(
      new browser.contentWindow.Event("change", { bubbles: true })
    );

    unsubscribe();
    const action = await actionPromise;

    Assert.equal(
      dispatchCount,
      1,
      "Selection should dispatch exactly one action"
    );

    Assert.deepEqual(
      action.payload,
      {
        sessionKey: dialog.calendarEventSessionKey,
        section: "availability",
        patch: { availability: value },
      },
      "Selection should dispatch only the availability section patch"
    );

    Assert.deepEqual(
      dialog.draft,
      { ...initial, availability: value },
      "Selection should change only the draft availability"
    );

    Assert.deepEqual(
      dialog.dirtySections,
      ["availability"],
      "Selection should dirty only availability"
    );

    Assert.deepEqual(
      dialog.getBoundingClientRect().toJSON(),
      before,
      "Selection should preserve the dialog bounds"
    );
  }

  select.disabled = true;
  select.value = "free";
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.availability,
    "default",
    "A disabled selector should not patch the draft"
  );

  select.disabled = false;
  select.value = "unsupported";
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  Assert.equal(
    dialog.draft.availability,
    "default",
    "Unsupported values should not patch the draft"
  );

  dialog.resetCreateDraft({ availability: "busy" });
});

add_task(async function test_keyboardAndReplacement() {
  let select = dialog.querySelector(".availability-selector");

  select.focus();
  EventUtils.synthesizeKey("f", {}, browser.contentWindow);
  await TestUtils.waitForCondition(
    () => dialog.draft.availability == "free",
    "Keyboard selection should update availability"
  );

  Assert.equal(doc.activeElement, select, "Selection should preserve focus");

  const obsolete = select;
  dialog.resetCreateDraft({ availability: "busy" });
  select = dialog.querySelector(".availability-selector");

  Assert.notEqual(
    select,
    obsolete,
    "A reset should replace the native control"
  );

  Assert.equal(
    doc.activeElement,
    select,
    "A reset should retain focus on the new control"
  );

  Assert.equal(
    select.value,
    "busy",
    "The new control should render the new draft"
  );

  // Reattach the obsolete control to reproduce a delayed bubbling event.
  let staleDispatches = 0;
  const unsubscribe = redux.subscribe(() => staleDispatches++);

  dialog.append(obsolete);
  obsolete.value = "free";
  obsolete.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  obsolete.remove();
  unsubscribe();

  Assert.equal(
    staleDispatches,
    0,
    "An obsolete control should dispatch no action"
  );

  Assert.equal(
    dialog.draft.availability,
    "busy",
    "An obsolete event should not change the new draft"
  );

  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);

  Assert.notEqual(doc.activeElement, select, "Tab should leave the selector");
  dialog.close();
});

add_task(async function test_savedEventAndRouteReplacement() {
  calendar = createCalendar({ name: "Availability calendar" });
  const event = await createEvent({ calendar, name: "Saved availability" });
  const original = event.icalString;

  dialog.setCalendarEventRoute({ calendarId: calendar.id, eventId: event.id });
  const opened = await dialog.show();

  Assert.ok(opened, "The edit dialog should open");
  dialog.resetCreateDraft({ title: event.title, availability: "busy" });
  const select = dialog.querySelector(".availability-selector");

  select.value = "free";
  select.dispatchEvent(
    new browser.contentWindow.Event("change", { bubbles: true })
  );

  const saved = await calendar.getItem(event.id);

  Assert.equal(
    saved.icalString,
    original,
    "Selection should not mutate the saved event"
  );

  dialog.setCalendarEventRoute();
  await TestUtils.waitForCondition(
    () => dialog.draft !== null,
    "The replacement route should initialize its draft"
  );

  const replacement = dialog.querySelector(".availability-selector");

  Assert.notEqual(
    replacement,
    select,
    "Route replacement should discard the old control"
  );

  Assert.equal(
    replacement.value,
    "default",
    "An absent field should display Default"
  );

  Assert.ok(
    !("availability" in dialog.draft),
    "A new route should not initialize availability"
  );

  dialog.close();
});

add_task(async function test_popupReplacement() {
  const opened = await dialog.show();

  Assert.ok(opened, "The dialog should open for popup interaction");
  await doc.l10n.translateFragment(dialog);
  const select = dialog.querySelector(".availability-selector");
  const before = dialog.getBoundingClientRect().toJSON();
  const shown = BrowserTestUtils.waitForSelectPopupShown(window);

  EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  const popup = await shown;

  Assert.deepEqual(
    dialog.getBoundingClientRect().toJSON(),
    before,
    "Opening the popup should preserve dialog bounds"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(popup, "hidden");

  dialog.resetCreateDraft({ availability: "busy" });
  await hidden;

  Assert.equal(
    dialog.draft.availability,
    "busy",
    "Closing the old popup should preserve replacement availability"
  );

  dialog.close();
});

add_task(async function test_focusDuringRouteLoading() {
  const event = await createEvent({ calendar, name: "Availability focus" });
  const opener = doc.getElementById("menuCreate");
  const calendarObject = calendar.wrappedJSObject;

  originalGetItem = calendarObject.getItem;

  for (const endState of ["selector", "opener", "closed"]) {
    dialog.setCalendarEventRoute();
    const opened = await dialog.show();

    Assert.ok(opened, "The create dialog should open before route loading");

    const select = dialog.querySelector(".availability-selector");

    select.focus();

    // Hold the event load to check focus before the replacement draft exists.
    const requestStarted = Promise.withResolvers();

    releaseRequest = Promise.withResolvers();
    calendarObject.getItem = async id => {
      requestStarted.resolve();
      await releaseRequest.promise;

      return originalGetItem.call(calendarObject, id);
    };

    dialog.setCalendarEventRoute({
      calendarId: calendar.id,
      eventId: event.id,
    });

    const shown = dialog.show();

    await requestStarted.promise;

    Assert.equal(
      doc.activeElement,
      dialog,
      "Focus should stay on the dialog while the replacement draft loads"
    );

    if (endState == "closed") {
      dialog.close();
    }

    if (endState != "selector") {
      opener.focus();
    }

    releaseRequest.resolve();
    const result = await shown;

    Assert.equal(
      result,
      endState != "closed",
      "The load should complete only while the dialog remains open"
    );

    Assert.equal(
      doc.activeElement,
      endState == "selector"
        ? dialog.querySelector(".availability-selector")
        : opener,
      "Loading should restore Availability focus only when focus stays on the dialog"
    );

    calendarObject.getItem = originalGetItem;
    releaseRequest = null;
    dialog.close();
  }
});
