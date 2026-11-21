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
      ["calendar.category.color.personal", "#ffee99"],
      ["ui.prefersReducedMotion", 1],
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
 * Returns the selected category labels in draft order.
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

/**
 * Opens Add category and waits for its native menu.
 *
 * @param {boolean} [withKeyboard=false] - Open the menu with Enter.
 * @returns {Promise<XULPopupElement>} Resolves when the menu is shown.
 */
async function openCategoryMenu(withKeyboard = false) {
  const add = dialog.querySelector(".calendar-event-add-category");
  const menu = dialog.querySelector(".calendar-event-category-choices");
  const shown = BrowserTestUtils.waitForPopupEvent(menu, "shown");

  if (withKeyboard) {
    add.focus();
    EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  } else {
    EventUtils.synthesizeMouseAtCenter(add, {}, browser.contentWindow);
  }

  await shown;

  return menu;
}

/**
 * Activates a category menu item and waits for the menu to close.
 *
 * @param {XULPopupElement} menu - The open category menu.
 * @param {Element} item - The category to toggle.
 * @returns {Promise<void>} Resolves when the menu is hidden.
 */
async function activateCategory(menu, item) {
  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  menu.activateItem(item);
  await hidden;
}

add_task(async function test_createChoicesAndKeyboardSelection() {
  await showCategories();

  const add = dialog.querySelector(".calendar-event-add-category");
  const dialogHeight = dialog.getBoundingClientRect().height;
  const menu = await openCategoryMenu(true);
  const choices = [...menu.querySelectorAll("menuitem")];

  Assert.deepEqual(
    choices.map(item => item.dataset.category),
    ["Personal", "Team", "Work"],
    "The menu should contain all configured categories in order"
  );
  Assert.equal(
    add.getAttribute("aria-expanded"),
    "true",
    "Add category should expose that its menu is open"
  );
  Assert.equal(
    dialog.getBoundingClientRect().height,
    dialogHeight,
    "Opening the category menu should leave the dialog height unchanged"
  );

  const work = choices[2];
  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );

  await TestUtils.waitForCondition(
    () => service.getAccessibleFor(work)?.name == "Work",
    "The Work menu item should expose its name to screen readers"
  );

  Assert.equal(
    service.getAccessibleFor(work).role,
    Ci.nsIAccessibleRole.ROLE_CHECK_MENU_ITEM,
    "The Work item should expose a checkbox menu item role"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await hidden;
  await waitForCategories(["Work"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Work"],
    "Enter on the Work menu item should add Work to the draft"
  );
  Assert.deepEqual(
    dialog.dirtySections,
    ["categories"],
    "Selection should change only the category section"
  );
  Assert.equal(
    doc.activeElement,
    add,
    "Selecting a category should return focus to Add category"
  );

  await openCategoryMenu(true);

  const escapeHidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
  await escapeHidden;

  Assert.ok(dialog.open, "Escape should keep the event dialog open");
  Assert.equal(
    doc.activeElement,
    add,
    "Escape should return focus to Add category"
  );
  Assert.equal(
    add.getAttribute("aria-expanded"),
    "false",
    "Add category should expose that its menu is closed"
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

add_task(async function test_arrowUpEntersCategoryMenuAtLastItem() {
  await showCategories();

  const menu = await openCategoryMenu(true);
  const input = menu.querySelector(".calendar-category-name-input");
  const team = menu.querySelector('[data-category="Team"]');
  const teamActive = BrowserTestUtils.waitForEvent(team, "DOMMenuItemActive");
  const mouseMove = { type: "mousemove" };

  // Gecko can ignore the first mouse move after a menu opens.
  EventUtils.synthesizeMouse(team, 5, 5, mouseMove, browser.contentWindow);
  EventUtils.synthesizeMouse(team, 7, 7, mouseMove, browser.contentWindow);
  await teamActive;

  Assert.equal(doc.activeElement, input, "The name field should keep focus.");

  const itemActive = BrowserTestUtils.waitForEvent(menu, "DOMMenuItemActive");

  EventUtils.synthesizeKey("KEY_ArrowUp", {}, browser.contentWindow);

  const { target } = await itemActive;

  Assert.equal(
    target.dataset.category,
    "Work",
    "Arrow Up from the name field should highlight the last item."
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
  await hidden;
});

add_task(async function test_refocusingCategoryNameClearsMenuHighlight() {
  await showCategories(secondEvent);

  const menu = await openCategoryMenu(true);
  const input = menu.querySelector(".calendar-category-name-input");
  const firstItem = menu.querySelector("menuitem");
  const itemActive = BrowserTestUtils.waitForEvent(
    firstItem,
    "DOMMenuItemActive"
  );

  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);
  await itemActive;

  Assert.ok(
    firstItem.hasAttribute("_moz-menuactive"),
    "Arrow Down should highlight the first item."
  );

  const itemInactive = BrowserTestUtils.waitForEvent(
    firstItem,
    "DOMMenuItemInactive"
  );

  // Click the field without moving the pointer over a menu item.
  EventUtils.synthesizeMouseAtCenter(input, {}, browser.contentWindow);

  Assert.equal(doc.activeElement, input, "The name field should regain focus.");
  await itemInactive;

  Assert.ok(
    !menu.querySelector("menuitem[_moz-menuactive]"),
    "No menu item should be highlighted when the name field regains focus."
  );
  Assert.ok(firstItem.hasAttribute("checked"), "Personal should stay checked.");
  Assert.equal(menu.state, "open", "The category menu should stay open.");

  const itemActiveAgain = BrowserTestUtils.waitForEvent(
    firstItem,
    "DOMMenuItemActive"
  );

  EventUtils.synthesizeKey("KEY_ArrowDown", {}, browser.contentWindow);
  await itemActiveAgain;

  Assert.ok(
    firstItem.hasAttribute("_moz-menuactive"),
    "Arrow Down should highlight the first item again."
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
  await hidden;
});

add_task(async function test_enterCategoryName() {
  await showCategories();

  const menu = await openCategoryMenu(true);
  const input = menu.querySelector(".calendar-category-name-input");

  Assert.equal(
    doc.activeElement,
    input,
    "The menu should focus the name field."
  );
  Assert.equal(
    doc.l10n.getAttributes(input).id,
    "calendar-event-category-name",
    "The name field should have a localized label and placeholder."
  );

  EventUtils.sendString("Discard this", browser.contentWindow);
  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);

  Assert.equal(input.value, "", "Escape should clear the typed name.");
  Assert.equal(
    menu.state,
    "open",
    "Clearing the name should leave the menu open."
  );
  Assert.deepEqual(
    dialog.draft.categories,
    [],
    "Clearing the name should preserve the draft."
  );

  EventUtils.sendString("  Workshop  ", browser.contentWindow);

  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await hidden;
  await waitForCategories(["Workshop"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Workshop"],
    "Enter should trim the new name and add it to the event draft."
  );
  Assert.equal(
    Services.prefs.getStringPref("calendar.categories.names"),
    "Work,Personal,Team",
    "Typing a name should preserve the configured category list."
  );

  await openCategoryMenu(true);

  Assert.equal(
    input.value,
    "",
    "Reopening the menu should show an empty name field."
  );
  Assert.ok(
    menu.querySelector('[data-category="Workshop"][checked]'),
    "The new category should appear checked in the list."
  );

  const dismissed = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
  await dismissed;
});

add_task(async function test_categoryPillSpacingAndRemoveContrast() {
  await showCategories();
  dialog.updateDraftSection("categories", { categories: ["Work", "Personal"] });
  await waitForCategories(["Work", "Personal"]);

  const categoryColors = [
    { name: "Work", iconColor: "rgb(255, 255, 255)", tint: 255 },
    { name: "Personal", iconColor: "rgb(0, 0, 0)", tint: 0 },
  ];

  for (const { name, iconColor, tint } of categoryColors) {
    const chip = dialog.querySelector(
      `.calendar-event-category-chip[data-category="${name}"]`
    );
    const remove = chip.querySelector(".calendar-event-remove-category");
    const label = chip.querySelector(".calendar-event-category-label");
    const chipStyle = browser.contentWindow.getComputedStyle(chip);
    const removeStyle = browser.contentWindow.getComputedStyle(remove);
    const chipRect = chip.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const removeRect = remove.getBoundingClientRect();
    const expectedHeight = Math.max(12, labelRect.height) + 12;
    const endInset =
      chipStyle.direction == "rtl"
        ? removeRect.left - chipRect.left
        : chipRect.right - removeRect.right;

    Assert.equal(
      chipStyle.paddingBlockStart,
      "6px",
      "The pill should have 6 px of vertical padding."
    );
    Assert.equal(
      chipStyle.paddingInlineStart,
      "9px",
      "The pill should have 9 px of horizontal padding."
    );
    Assert.equal(removeRect.height, 12, "Remove should fit in a 12 px box.");
    Assert.equal(removeRect.width, 12, "The Remove button should be square.");
    Assert.equal(
      chipRect.height,
      expectedHeight,
      "Only the label or the Remove button and the vertical padding should set the pill height."
    );
    Assert.equal(
      Math.round(endInset),
      9,
      "The Remove button should sit at the end padding of the pill."
    );
    Assert.equal(
      chipStyle.color,
      iconColor,
      "The pill label should use the same contrasting color as Remove."
    );
    Assert.equal(
      removeStyle.color,
      iconColor,
      `Remove should contrast with the ${name} pill.`
    );

    EventUtils.synthesizeMouseAtCenter(
      remove,
      { type: "mousemove" },
      browser.contentWindow
    );

    Assert.equal(
      removeStyle.color,
      iconColor,
      "Hover should keep the Remove icon color."
    );

    const { r, g, b, a } = InspectorUtils.colorToRGBA(
      removeStyle.backgroundColor
    );

    Assert.deepEqual(
      [r, g, b],
      [tint, tint, tint],
      "Hover should tint the button toward the icon color."
    );
    Assert.greater(a, 0, "Hover should add a background tint to Remove.");
    Assert.less(
      a,
      1,
      "The pill color should remain visible through the hover tint."
    );
  }
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

  const menu = await openCategoryMenu();
  const unknown = menu.querySelector('[data-category="Unknown category"]');

  Assert.ok(
    unknown,
    "An event category absent from preferences should remain available"
  );

  Assert.ok(
    unknown.hasAttribute("checked"),
    "The unknown category should retain its selected state"
  );

  await activateCategory(menu, unknown);
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

  const menu = await openCategoryMenu();
  let work = menu.querySelector('[data-category="Work"]');
  const workLabel = work.querySelector(".menu-text");
  const workStyle = browser.contentWindow.getComputedStyle(workLabel);

  Assert.ok(work.hasAttribute("checked"), "Work should open checked");
  Assert.ok(
    menu.hasAttribute("nonnative"),
    "The menu should use Thunderbird's themed renderer."
  );
  Assert.notEqual(
    workStyle.backgroundImage,
    "none",
    "The category label should show a color swatch."
  );
  Assert.equal(
    workStyle.fill,
    "rgb(0, 0, 128)",
    "The swatch should use the Work category color."
  );
  Assert.equal(
    browser.contentWindow.getComputedStyle(work.querySelector(".menu-icon"))
      .visibility,
    "visible",
    "A checked category should show a checkmark next to its swatch."
  );

  await activateCategory(menu, work);
  await waitForCategories(["Unknown category"]);

  Assert.deepEqual(
    dialog.dirtySections,
    ["categories"],
    "Removing a selected category should mark the category section changed"
  );

  await openCategoryMenu();
  work = menu.querySelector('[data-category="Work"]');

  Assert.ok(!work.hasAttribute("checked"), "Work should reopen unchecked");
  Assert.equal(
    browser.contentWindow.getComputedStyle(work.querySelector(".menu-icon"))
      .visibility,
    "hidden",
    "An unchecked category should hide the checkmark."
  );
  Assert.equal(
    browser.contentWindow.getComputedStyle(work.querySelector(".menu-text"))
      .fill,
    "rgb(0, 0, 128)",
    "An unchecked category should keep its color swatch."
  );

  await activateCategory(menu, work);
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
    ".calendar-event-category-choices menuitem"
  );

  await showCategories(secondEvent);

  oldRemove.click();
  oldChoice.dispatchEvent(
    new browser.contentWindow.Event("command", { bubbles: true })
  );
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

add_task(async function test_pendingSaveDisablesCategoryControls() {
  await showCategories(firstEvent);

  const row = dialog.querySelector("calendar-event-category-row");
  const operation = {
    sessionKey: dialog.calendarEventSessionKey,
    kind: "save",
    requestId: "category-disabled-controls",
  };
  const menu = await openCategoryMenu();
  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");
  const work = menu.querySelector('[data-category="Work"]');

  pendingSaveOperation = operation;

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationStarted",
    operation
  );
  await hidden;

  Assert.ok(
    [...row.querySelectorAll("button, input, menuitem")].every(
      control => control.disabled
    ),
    "Pending Save should disable the category buttons and menu items"
  );
  Assert.equal(
    doc.activeElement,
    dialog,
    "Disabling the focused category control should move focus to the dialog"
  );

  work.dispatchEvent(
    new browser.contentWindow.Event("command", { bubbles: true })
  );

  Assert.ok(
    work.hasAttribute("checked"),
    "Pending Save should keep Work checked"
  );
  Assert.deepEqual(
    dialog.draft.categories,
    ["Work", "Unknown category"],
    "A category command during Save should preserve the draft"
  );

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCreateEditSessionSlice.mjs",
    "operationReleased",
    operation
  );
  pendingSaveOperation = null;

  Assert.ok(
    [...row.querySelectorAll("button, input, menuitem")].every(
      control => !control.disabled
    ),
    "Releasing Save should enable all category controls"
  );

  await openCategoryMenu();
  await activateCategory(menu, menu.querySelector('[data-category="Work"]'));
  await waitForCategories(["Unknown category"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Unknown category"],
    "A re-enabled category item should update the draft"
  );
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

  const checkedItems = row.querySelectorAll(
    ".calendar-event-category-choices menuitem[checked]"
  );

  Assert.deepEqual(
    [...checkedItems].map(item => item.dataset.category),
    ["Personal", "Team", "Work"],
    "The menu should show the new selection while the Remove labels translate"
  );

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
    [...row.querySelectorAll("button, input, menuitem")].every(
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
    [...row.querySelectorAll("button, input, menuitem")].every(
      control => !control.disabled
    ),
    "Releasing Save should enable the newly rendered category controls"
  );
});

add_task(async function test_editWithNoSelectedCategoriesLoadsChoices() {
  await showCategories();
  await showCategories(emptyEvent);

  const add = dialog.querySelector(".calendar-event-add-category");
  const choices = [
    ...dialog.querySelectorAll(".calendar-event-category-choices menuitem"),
  ];

  Assert.deepEqual(
    choices.map(item => item.dataset.category),
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

  const menu = await openCategoryMenu();

  await activateCategory(menu, menu.querySelector('[data-category="Work"]'));
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

  const add = dialog.querySelector(".calendar-event-add-category");
  const menu = await openCategoryMenu();
  const unknown = menu.querySelector('[data-category="Unknown category"]');

  await activateCategory(menu, unknown);
  await waitForCategories(["Work"]);

  Assert.equal(
    doc.activeElement,
    add,
    "Removing a category absent from preferences should return focus to Add category"
  );

  await openCategoryMenu();

  Assert.ok(
    !menu.querySelector('[data-category="Unknown category"]'),
    "The removed category should disappear from the next menu"
  );

  const hidden = BrowserTestUtils.waitForPopupEvent(menu, "hidden");

  EventUtils.synthesizeKey("KEY_Escape", {}, browser.contentWindow);
  await hidden;
});

add_task(async function test_categoryRowReconnects() {
  await showCategories(firstEvent);

  const row = dialog.querySelector("calendar-event-category-row");
  const parent = row.parentNode;

  await openCategoryMenu();
  EventUtils.sendString("Discard this", browser.contentWindow);

  row.remove();
  parent.append(row);
  await row.renderComplete;

  Assert.deepEqual(
    selectedLabels(),
    ["Work", "Unknown category"],
    "Reconnecting the category row should show the current draft's pills"
  );

  const menu = await openCategoryMenu(true);
  const input = menu.querySelector(".calendar-category-name-input");
  const work = menu.querySelector('[data-category="Work"]');

  Assert.equal(
    input.value,
    "",
    "Reopening the reconnected menu should clear the old name."
  );

  await activateCategory(menu, work);
  await waitForCategories(["Unknown category"]);

  Assert.deepEqual(
    dialog.draft.categories,
    ["Unknown category"],
    "The reconnected category menu should update the draft once per selection"
  );
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
    row.querySelectorAll(".calendar-event-category-choices menuitem").length,
    0,
    "A row cleared while disconnected should remove its previous choices"
  );
  Assert.ok(
    row.querySelector(".calendar-event-add-category").disabled,
    "A row cleared while disconnected should disable Add category"
  );

  await showCategories();
});
