/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { startAxeMutationObserver } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AxeHelpers.sys.mjs"
);

let browser;
let redux;
let doc;
let dialog;
let calendar;
let firstEvent;
let secondEvent;
let emptyEvent;
let pendingSaveOperation;
let restoreTranslation;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  let tab = null;

  await SpecialPowers.pushPrefEnv({
    set: [
      ["calendar.categories.names", "Work,Personal,Team"],
      ["calendar.category.color.work", "#000080"],
    ],
  });

  calendar = createCalendar({ type: "memory" });
  calendar.setProperty("calendar-main-in-composite", true);
  // Include a saved category that is not in preferences.
  firstEvent = await createEvent({
    calendar,
    categories: ["Work", "Unknown category"],
    name: "First event",
  });
  secondEvent = await createEvent({
    calendar,
    categories: ["Personal"],
    name: "Second event",
  });
  emptyEvent = await createEvent({
    calendar,
    categories: [],
    name: "Empty event",
  });
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  redux = browser.contentWindow.ReduxTestUtils;
  doc = browser.contentDocument;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  dialog.style.inlineSize = "600px";
  cal.view.getCompositeCalendar(browser.contentWindow).defaultCalendar =
    calendar;
  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Category interactions should pass axe",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(async () => {
    restoreTranslation?.();

    if (pendingSaveOperation) {
      await redux.dispatchAction(
        "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
        "operationReleased",
        pendingSaveOperation
      );
    }

    if (dialog) {
      dialog.style.inlineSize = "600px";
    }

    dialog?.close();

    if (tab) {
      tabmail.closeTab(tab);
    }

    if (calendar) {
      CalendarTestUtils.removeCalendar(calendar);
    }
  });
});

/**
 * Opens a fresh create or edit dialog and checks the initial categories.
 *
 * @param {?calIEvent} [event=null] - The event to edit, or null for create.
 * @returns {Promise<void>} Resolves after the dialog opens with selected names.
 */
async function showCategories(event = null) {
  dialog.close();

  dialog.setCalendarEventRoute(
    event ? { calendarId: calendar.id, eventId: event.id } : {}
  );

  Assert.ok(await dialog.show(), "The category route should open");

  Assert.deepEqual(
    selectedLabels(),
    event?.getCategories() ?? [],
    "The initial category display should be ready when show resolves"
  );
}

/**
 * Returns selected labels from the summary and overflow lists in draft order.
 *
 * @returns {string[]} The rendered category names.
 */
function selectedLabels() {
  return [...dialog.querySelectorAll(".calendar-event-category-label")].map(
    label => label.textContent
  );
}

/**
 * Waits for the expected category labels.
 * The row inserts labels after translation, so matching labels are ready.
 *
 * @param {string[]} expected - The names expected in draft order.
 * @returns {Promise<void>} Resolves after the page contains the expected names.
 */
async function waitForCategories(expected) {
  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    { childList: true, subtree: true },
    () => JSON.stringify(selectedLabels()) == JSON.stringify(expected)
  );
}

add_task(async function test_createChoicesAndKeyboardSelection() {
  await showCategories();

  Assert.deepEqual(
    dialog.draft.categories,
    [],
    "A create draft should start without selected categories"
  );

  const add = dialog.querySelector(".calendar-event-add-category");

  add.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Tab", {}, browser.contentWindow);

  const choices = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ];

  Assert.deepEqual(
    choices.map(input => input.dataset.category),
    ["Personal", "Team", "Work"],
    "Available choices should come from the configured category names"
  );

  Assert.equal(
    doc.activeElement,
    choices[0],
    "Tab should reach the first category choice"
  );

  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);

  Assert.equal(
    doc.activeElement,
    choices[1],
    "ArrowDown should reach the next category choice"
  );

  EventUtils.synthesizeKey("KEY_End", {}, browser.contentWindow);

  Assert.equal(
    doc.activeElement,
    choices[2],
    "End should reach the last category choice"
  );

  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  await waitForCategories(["Work"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Work"],
    "Space should add the focused category to the draft"
  );

  Assert.deepEqual(
    dialog.dirtySections,
    ["categories"],
    "Selection should change only the category section"
  );

  Assert.equal(
    doc.activeElement.dataset.category,
    "Work",
    "Selection should retain focus on its replacement choice"
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  await TestUtils.waitForCondition(
    () => service.getAccessibleFor(doc.activeElement)?.name == "Work",
    "The category checkbox should expose its name to screen readers"
  );

  Assert.equal(
    service.getAccessibleFor(doc.activeElement).role,
    Ci.nsIAccessibleRole.ROLE_CHECKBUTTON,
    "Choices should expose native checkbox semantics"
  );

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);

  Assert.ok(
    dialog.open,
    "Escape from category choices should keep the event dialog open"
  );

  Assert.equal(
    doc.activeElement,
    add,
    "Escape should return focus to Add category"
  );

  Assert.equal(
    add.getAttribute("aria-expanded"),
    "false",
    "Closing choices should update the disclosure state"
  );

  const remove = dialog.querySelector(".calendar-event-remove-category");

  remove.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await waitForCategories([]);

  Assert.deepEqual(
    dialog.draft.categories,
    [],
    "Enter on Remove should clear the draft category"
  );

  Assert.deepEqual(
    dialog.dirtySections,
    [],
    "Restoring the empty selection should clear the category dirty state"
  );

  Assert.equal(
    doc.activeElement,
    add,
    "Removing the final chip should return focus to Add category"
  );
});

add_task(async function test_editSourceAndDraftOnlyChanges() {
  await showCategories(firstEvent);

  const source =
    redux.getState().calendarEventSource.sessions[
      dialog.calendarEventSessionKey
    ];
  const draft =
    redux.getState().calendarEventDraft.sessions[
      dialog.calendarEventSessionKey
    ];

  Assert.deepEqual(
    source.snapshot.event.categories,
    ["Work", "Unknown category"],
    "The shared loader should copy every selected name into its plain snapshot"
  );

  Assert.deepEqual(
    draft.baseline.categories,
    firstEvent.getCategories(),
    "The category baseline should start from the loaded source snapshot"
  );

  Assert.ok(
    !dialog.isDirty,
    "Loading selected event categories should leave the draft clean"
  );

  Assert.equal(
    browser.contentWindow.getComputedStyle(
      dialog.querySelector(".calendar-event-category-chip")
    ).backgroundColor,
    "rgb(0, 0, 128)",
    "Chips should use the configured category color"
  );

  dialog.querySelector(".calendar-event-add-category").click();

  const unknown = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ].find(input => input.dataset.category == "Unknown category");

  Assert.ok(
    unknown,
    "An event category absent from preferences should remain available"
  );

  Assert.ok(
    unknown.checked,
    "The unknown category should retain its selected state"
  );

  unknown.click();
  await waitForCategories(["Work"]);

  Assert.deepEqual(
    (await calendar.getItem(firstEvent.id)).getCategories(),
    ["Work", "Unknown category"],
    "Changing the draft should preserve the saved event categories"
  );

  Assert.deepEqual(
    source.snapshot.event.categories,
    ["Work", "Unknown category"],
    "Changing the draft should preserve the source snapshot"
  );

  await showCategories(firstEvent);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Work", "Unknown category"],
    "Closing without Save should discard category changes"
  );
});

add_task(async function test_reselectedCategoryLeavesDraftClean() {
  await showCategories(firstEvent);

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  dialog.querySelector(".calendar-event-add-category").click();

  let work = dialog.querySelector(
    '.calendar-event-category-choices input[data-category="Work"]'
  );

  Assert.ok(work, "Category choices should include the selected Work category");

  await TestUtils.waitForCondition(
    () => service.getAccessibleFor(work)?.name == "Work",
    "The selected Work checkbox should be available to screen readers"
  );

  work.click();
  await waitForCategories(["Unknown category"]);

  Assert.deepEqual(
    dialog.dirtySections,
    ["categories"],
    "Removing a selected category should mark the category section changed"
  );

  work = dialog.querySelector(
    '.calendar-event-category-choices input[data-category="Work"]'
  );

  Assert.ok(work, "An unchecked configured category should remain available");

  await TestUtils.waitForCondition(
    () => service.getAccessibleFor(work)?.name == "Work",
    "The unchecked Work checkbox should be available to screen readers"
  );

  work.click();
  await waitForCategories(["Unknown category", "Work"]);

  Assert.deepEqual(
    dialog.dirtySections,
    [],
    "Restoring selected names in a different order should clear category changes"
  );
  Assert.ok(
    !dialog.isDirty,
    "Unchecking and rechecking the same category should leave the draft clean"
  );
  Assert.deepEqual(
    dialog.draft.categories,
    ["Unknown category", "Work"],
    "Reselecting a category should preserve the current selection order"
  );
  Assert.deepEqual(
    redux.getState().calendarEventDraft.sessions[dialog.calendarEventSessionKey]
      .baseline.categories,
    ["Work", "Unknown category"],
    "Comparing category names should preserve the baseline order"
  );

  const saved = await calendar.getItem(firstEvent.id);

  Assert.deepEqual(
    saved.getCategories(),
    ["Work", "Unknown category"],
    "Reselecting a draft category should preserve the saved event categories"
  );
});

add_task(async function test_oldControlsCannotChangeReplacementEvent() {
  await showCategories(firstEvent);

  const oldAdd = dialog.querySelector(".calendar-event-add-category");
  const oldRemove = dialog.querySelector(".calendar-event-remove-category");
  const oldChoice = dialog.querySelector(
    ".calendar-event-category-choices input"
  );

  await showCategories(secondEvent);

  oldRemove.click();
  oldChoice.checked = true;
  oldChoice.dispatchEvent(new browser.contentWindow.Event("change"));
  oldAdd.click();

  Assert.deepEqual(
    dialog.draft.categories,
    ["Personal"],
    "Old category actions should preserve the replacement event draft"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      dialog.querySelector(".calendar-event-category-choices")
    ),
    "An old disclosure button should not open the replacement event choices"
  );

  Assert.ok(
    !dialog.isDirty,
    "Old category actions should leave the replacement baseline clean"
  );
});

add_task(async function test_lateCategoryRenderingCannotReplaceCurrentEvent() {
  dialog.close();

  const original = doc.l10n.translateFragment;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const finished = Promise.withResolvers();
  let delayed = false;

  restoreTranslation = () => {
    release.resolve();
    doc.l10n.translateFragment = original;
  };

  // Pause translation before the first event's new chips enter the document.
  // Load another event during that pause, then release the old translation.
  doc.l10n.translateFragment = async function (fragment) {
    if (
      !delayed &&
      fragment.querySelector?.('[data-category="Unknown category"]')
    ) {
      delayed = true;
      started.resolve();
      await release.promise;
      await original.call(this, fragment);
      finished.resolve();

      return;
    }

    await original.call(this, fragment);
  };

  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: firstEvent.id,
  });

  const oldShow = dialog.show();

  await started.promise;

  Assert.ok(
    !dialog.open,
    "The dialog should remain closed until initial category translation finishes"
  );

  dialog.setCalendarEventRoute({
    calendarId: calendar.id,
    eventId: secondEvent.id,
  });

  Assert.ok(
    await dialog.show(),
    "The replacement route should open while old translation waits"
  );

  release.resolve();
  await finished.promise;
  await oldShow;

  doc.l10n.translateFragment = original;
  restoreTranslation = null;

  Assert.deepEqual(
    selectedLabels(),
    ["Personal"],
    "Late category rendering should preserve the replacement event chips"
  );

  Assert.deepEqual(
    dialog.draft.categories,
    ["Personal"],
    "Late category rendering should preserve the replacement event draft"
  );
});

add_task(async function test_responsiveCapacityAndOverflowActions() {
  await showCategories();

  // Long labels reach the CSS width limit before the row decides how many fit.
  const names = [
    "Alpha category".repeat(4),
    "Bravo category".repeat(4),
    "Charlie category".repeat(4),
    "Delta",
    "Echo",
  ];

  dialog.style.inlineSize = "300px";
  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  const list = dialog.querySelector(".calendar-event-category-list");

  Assert.equal(list.childElementCount, 2, "A narrow row should show two chips");

  Assert.equal(
    doc.l10n.getAttributes(
      dialog.querySelector(".calendar-event-more-categories")
    ).args.count,
    3,
    "The narrow row should disclose exactly three remaining categories"
  );

  dialog.style.inlineSize = "1000px";
  dialog.prepareLayout();

  Assert.equal(list.childElementCount, 3, "A wide row should show three chips");

  const more = dialog.querySelector(".calendar-event-more-categories");
  const before = dialog.getBoundingClientRect();

  Assert.equal(
    doc.l10n.getAttributes(more).args.count,
    2,
    "The wide row should disclose exactly two remaining categories"
  );

  more.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);

  const overflow = dialog.querySelector(".calendar-event-category-overflow");
  const after = dialog.getBoundingClientRect();

  Assert.ok(
    BrowserTestUtils.isVisible(overflow),
    "Enter on More should show remaining categories"
  );

  Assert.greater(
    after.height,
    before.height,
    "Opening remaining categories should grow the dialog when space is available"
  );
  Assert.equal(
    after.width,
    before.width,
    "Opening remaining categories should preserve the dialog width"
  );

  const remove = overflow.querySelector("button");

  remove.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await waitForCategories([names[0], names[1], names[2], names[4]]);

  Assert.deepEqual(
    dialog.draft.categories,
    [names[0], names[1], names[2], names[4]],
    "Keyboard removal from overflow should change only the selected category"
  );

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);

  Assert.equal(
    doc.activeElement,
    dialog.querySelector(".calendar-event-more-categories"),
    "Escape from overflow should return focus to its disclosure button"
  );

  Assert.ok(dialog.open, "Closing overflow should preserve the event dialog");

  dialog.style.inlineSize = "600px";
  dialog.prepareLayout();
});

add_task(async function test_unchangedLayoutPreservesControls() {
  await showCategories();

  const names = [
    "Alpha category".repeat(4),
    "Bravo category".repeat(4),
    "Charlie category".repeat(4),
  ];

  dialog.style.inlineSize = "400px";
  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  const row = dialog.querySelector("calendar-event-category-row");
  const content = row.querySelector(".calendar-event-category-content");
  const width = content.clientWidth;
  const list = row.querySelector(".calendar-event-category-list");
  const more = row.querySelector(".calendar-event-more-categories");

  Assert.equal(
    list.childElementCount,
    2,
    "The long category labels should leave one chip in overflow"
  );

  more.focus();

  const observer = new browser.contentWindow.MutationObserver(() => {});

  observer.observe(row, {
    attributes: true,
    childList: true,
    subtree: true,
  });

  dialog.prepareLayout();
  dialog.prepareLayout();

  const mutations = observer.takeRecords();

  observer.disconnect();

  Assert.equal(
    mutations.length,
    0,
    "Preparing an unchanged layout should preserve the category controls"
  );
  Assert.equal(
    doc.activeElement,
    more,
    "Preparing an unchanged layout should preserve focus on More"
  );

  const shortNames = ["A", "B", "C"];

  dialog.updateDraftSection("categories", { categories: shortNames });
  await waitForCategories(shortNames);

  Assert.equal(
    content.clientWidth,
    width,
    "Changing category labels should preserve the available row width"
  );
  Assert.equal(
    list.childElementCount,
    3,
    "New category labels should be measured even when the width is unchanged"
  );
  Assert.ok(
    row.querySelector(".calendar-event-more-categories").hidden,
    "Fitting all new category labels should hide More"
  );

  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  Assert.equal(
    content.clientWidth,
    width,
    "Restoring long category labels should preserve the available row width"
  );
  Assert.equal(
    list.childElementCount,
    2,
    "Restoring long category labels should measure chip capacity at the same width"
  );

  dialog.style.inlineSize = "600px";
});

add_task(async function test_pendingSaveDisablesCategoryControls() {
  await showCategories();

  const names = [
    "Alpha category".repeat(4),
    "Bravo category".repeat(4),
    "Charlie category".repeat(4),
    "Delta category".repeat(4),
  ];

  dialog.style.inlineSize = "400px";
  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  const row = dialog.querySelector("calendar-event-category-row");
  const list = row.querySelector(".calendar-event-category-list");
  const operation = {
    sessionKey: dialog.calendarEventSessionKey,
    kind: "save",
    requestId: "category-disabled-controls",
  };

  Assert.equal(
    list.childElementCount,
    2,
    "The narrow category row should show two chips before Save"
  );

  row.querySelector(".calendar-event-add-category").click();

  const choice = row.querySelector(".calendar-event-category-choices input");
  const checked = choice.checked;

  choice.focus();
  pendingSaveOperation = operation;

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationStarted",
    operation
  );

  Assert.ok(
    [...row.querySelectorAll("button, input")].every(
      control => control.disabled
    ),
    "Pending Save should disable every category button and checkbox"
  );
  Assert.equal(
    doc.activeElement,
    dialog,
    "Disabling a focused category control should move focus to the dialog"
  );

  choice.click();

  Assert.equal(
    choice.checked,
    checked,
    "Clicking a disabled category checkbox should preserve its checked state"
  );
  Assert.deepEqual(
    dialog.draft.categories,
    names,
    "Clicking a disabled category checkbox should preserve the draft"
  );

  dialog.style.inlineSize = "1000px";

  await BrowserTestUtils.waitForMutationCondition(
    list,
    { childList: true },
    () => list.childElementCount == 3
  );

  Assert.ok(
    row.querySelector(".calendar-event-more-categories").disabled,
    "Resizing during Save should keep the replacement More button disabled"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationReleased",
    operation
  );
  pendingSaveOperation = null;

  Assert.ok(
    [...row.querySelectorAll("button, input")].every(
      control => !control.disabled
    ),
    "Releasing Save should enable every available category control"
  );

  const work = [
    ...row.querySelectorAll(".calendar-event-category-choices input"),
  ].find(input => input.dataset.category == "Work");

  work.click();
  await waitForCategories([...names, "Work"]);

  Assert.ok(
    dialog.draft.categories.includes("Work"),
    "A re-enabled category checkbox should update the draft"
  );

  dialog.style.inlineSize = "600px";
});

add_task(async function test_pendingRenderUsesCurrentDisabledState() {
  await showCategories();

  const row = dialog.querySelector("calendar-event-category-row");
  const original = doc.l10n.translateFragment;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  const names = ["Work", "Personal", "Team"];
  const operation = {
    sessionKey: dialog.calendarEventSessionKey,
    kind: "save",
    requestId: "category-disabled-render",
  };
  let delayed = false;

  restoreTranslation = () => {
    release.resolve();
    doc.l10n.translateFragment = original;
  };

  // Start Save while the new category controls wait for translation.
  doc.l10n.translateFragment = async function (fragment) {
    if (!delayed && fragment.querySelector?.(".calendar-event-category-chip")) {
      delayed = true;
      started.resolve();
      await release.promise;
    }

    await original.call(this, fragment);
  };

  dialog.updateDraftSection("categories", { categories: names });
  await started.promise;

  pendingSaveOperation = operation;

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationStarted",
    operation
  );

  release.resolve();
  await row.renderComplete;

  doc.l10n.translateFragment = original;
  restoreTranslation = null;

  Assert.deepEqual(
    selectedLabels(),
    names,
    "The completed render should insert the newly selected category controls"
  );
  Assert.ok(
    [...row.querySelectorAll("button, input")].every(
      control => control.disabled
    ),
    "Controls inserted during Save should use the current disabled state"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationReleased",
    operation
  );
  pendingSaveOperation = null;

  Assert.ok(
    [...row.querySelectorAll("button, input")].every(
      control => !control.disabled
    ),
    "Releasing Save should enable the newly rendered category controls"
  );
});

add_task(async function test_ignoredChangesRestoreCheckboxState() {
  await showCategories(firstEvent);

  const operation = {
    sessionKey: dialog.calendarEventSessionKey,
    kind: "save",
    requestId: "category-pending-save",
  };

  pendingSaveOperation = operation;

  dialog.querySelector(".calendar-event-add-category").click();
  // Simulate a pending Save so checkbox changes must be refused.
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationStarted",
    operation
  );

  const choices = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ];
  const work = choices.find(input => input.dataset.category == "Work");
  const personal = choices.find(input => input.dataset.category == "Personal");

  work.checked = false;
  work.dispatchEvent(new browser.contentWindow.Event("change"));
  personal.checked = true;
  personal.dispatchEvent(new browser.contentWindow.Event("change"));

  Assert.ok(
    work.checked,
    "An ignored removal should restore the selected checkbox"
  );

  Assert.ok(
    !personal.checked,
    "An ignored addition should restore the unselected checkbox"
  );

  Assert.deepEqual(
    dialog.draft.categories,
    ["Work", "Unknown category"],
    "Pending Save should preserve the category draft"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationReleased",
    operation
  );
  pendingSaveOperation = null;
});

add_task(async function test_editWithNoSelectedCategoriesLoadsChoices() {
  await showCategories();
  await showCategories(emptyEvent);

  const add = dialog.querySelector(".calendar-event-add-category");
  const choices = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ];

  Assert.deepEqual(
    choices.map(input => input.dataset.category),
    ["Personal", "Team", "Work"],
    "An empty edit selection should still load all available choices"
  );

  Assert.ok(
    !add.disabled,
    "An empty edit selection should allow adding categories"
  );

  Assert.ok(
    !dialog.isDirty,
    "An empty edit selection should initialize a clean baseline"
  );

  add.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  choices[2].focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  await waitForCategories(["Work"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Work"],
    "An event with no initial categories should accept a draft selection"
  );

  Assert.deepEqual(
    (await calendar.getItem(emptyEvent.id)).getCategories(),
    [],
    "Adding to an empty edit draft should preserve the saved event"
  );
});

add_task(async function test_removingUnknownCategoryRestoresFocus() {
  await showCategories(firstEvent);

  let add = dialog.querySelector(".calendar-event-add-category");

  add.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);

  const unknown = [
    ...dialog.querySelectorAll(".calendar-event-category-choices input"),
  ].find(input => input.dataset.category == "Unknown category");

  unknown.focus();
  EventUtils.synthesizeKey(" ", {}, browser.contentWindow);
  await waitForCategories(["Work"]);

  Assert.equal(
    doc.activeElement,
    add,
    "Removing a choice absent from preferences should return focus to Add category"
  );

  await showCategories(firstEvent);

  add = dialog.querySelector(".calendar-event-add-category");
  add.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);

  const remove = dialog.querySelectorAll(
    ".calendar-event-category-list button"
  )[1];

  remove.focus();
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await waitForCategories(["Work"]);

  Assert.equal(
    doc.activeElement,
    dialog.querySelector(".calendar-event-category-list button"),
    "Removing a chip while choices are open should focus the remaining chip"
  );
});

add_task(async function test_resizeKeepsMeasuredCategoryCapacity() {
  await showCategories();

  const row = dialog.querySelector(".calendar-event-category-row");
  const add = row.querySelector(".calendar-event-add-category");
  const names = [
    "Alpha category".repeat(4),
    "Bravo category".repeat(4),
    "Charlie category".repeat(4),
  ];

  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  const list = row.querySelector(".calendar-event-category-list");

  for (const [initialWidth, initialCapacity, finalWidth, capacity] of [
    [300, 2, 300, 2],
    [1000, 3, 300, 2],
    [300, 2, 1000, 3],
  ]) {
    dialog.style.inlineSize = `${initialWidth}px`;

    await BrowserTestUtils.waitForMutationCondition(
      list,
      { childList: true },
      () => list.childElementCount == initialCapacity
    );

    // Finish the initial resize before changing the dialog width again.
    await new Promise(browser.contentWindow.requestAnimationFrame);

    add.focus();

    dialog.style.inlineSize = `${finalWidth}px`;

    await BrowserTestUtils.waitForMutationCondition(
      list,
      { childList: true },
      () => list.childElementCount == capacity
    );

    Assert.equal(
      list.childElementCount,
      capacity,
      "Resizing the row should use the current width for its chip capacity"
    );

    const more = row.querySelector(".calendar-event-more-categories");

    Assert.equal(
      doc.l10n.getAttributes(more).args.count,
      names.length - capacity,
      "Resizing the row should report the current remaining category count"
    );

    Assert.equal(
      more.hidden,
      names.length <= capacity,
      "The remaining count should be visible only when categories overflow"
    );

    Assert.equal(
      doc.activeElement,
      add,
      "Changing chip capacity should preserve focus on Add category"
    );
  }
});

add_task(async function test_categoryRowReconnects() {
  await showCategories();

  const row = dialog.querySelector("calendar-event-category-row");
  const parent = row.parentNode;
  const names = [
    "Alpha category".repeat(4),
    "Bravo category".repeat(4),
    "Charlie category".repeat(4),
  ];

  dialog.style.inlineSize = "300px";
  dialog.updateDraftSection("categories", { categories: names });
  await waitForCategories(names);

  row.remove();
  parent.append(row);
  await row.renderComplete;

  const add = row.querySelector(".calendar-event-add-category");
  const list = row.querySelector(".calendar-event-category-list");

  Assert.equal(
    list.childElementCount,
    2,
    "A reconnected category row should measure its current width"
  );

  add.focus();

  dialog.style.inlineSize = "1000px";

  await BrowserTestUtils.waitForMutationCondition(
    list,
    { childList: true },
    () => list.childElementCount == 3
  );

  Assert.equal(
    list.childElementCount,
    3,
    "A reconnected category row should observe changes to its width"
  );

  Assert.equal(
    doc.activeElement,
    add,
    "Resizing a reconnected row should preserve focus on Add category"
  );

  row.querySelector(".calendar-event-add-category").click();
  dialog.querySelector(".calendar-selector").focus();
  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);

  Assert.ok(
    row.querySelector(".calendar-event-category-choices").hidden,
    "A reconnected row should close its choices after Escape outside the row"
  );
  Assert.ok(
    dialog.open,
    "Closing choices from another control should keep the dialog open"
  );

  dialog.style.inlineSize = "600px";
});

add_task(async function test_categoryRowClearsWhileDisconnected() {
  await showCategories(firstEvent);

  const row = dialog.querySelector("calendar-event-category-row");
  const parent = row.parentNode;

  row.remove();
  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCategorySlice.mjs",
    "clearCategoryOptions",
    { sessionKey: dialog.calendarEventSessionKey }
  );

  parent.append(row);
  await row.renderComplete;

  Assert.equal(
    row.querySelectorAll(".calendar-event-category-chip").length,
    0,
    "A row cleared while disconnected should remove its previous chips"
  );
  Assert.equal(
    row.querySelector(".calendar-event-category-choices").childElementCount,
    0,
    "A row cleared while disconnected should remove its previous choices"
  );
  Assert.ok(
    row.querySelector(".calendar-event-add-category").disabled,
    "A row cleared while disconnected should disable Add category"
  );

  await showCategories();
});
