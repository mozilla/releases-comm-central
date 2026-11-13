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
let row;
let followingRow;

add_setup(async function () {
  const tabmail = document.getElementById("tabmail");
  let tab = null;

  await SpecialPowers.pushPrefEnv({ set: [["general.smoothScroll", false]] });
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarEventCreateEditDialog.xhtml",
  });
  browser = tab.browser;

  await BrowserTestUtils.browserLoaded(browser, undefined, url =>
    url.endsWith("calendarEventCreateEditDialog.xhtml")
  );
  await SimpleTest.promiseFocus(browser);

  doc = browser.contentWindow.document;
  dialog = doc.querySelector('[is="calendar-event-create-edit-dialog"]');
  row = dialog.querySelector(".calendar-event-category-row");
  // Keep another field below the category row to check that lists stay in flow.
  followingRow = doc.createElement("div");
  followingRow.textContent = "Other event fields";
  followingRow.style.blockSize = "80px";
  row.after(followingRow);
  dialog.style.inlineSize = "436px";

  Assert.ok(await dialog.show(), "The category fixture dialog should open");
  await doc.l10n.translateFragment(dialog);

  await startAxeMutationObserver(browser, {
    container: '[is="calendar-event-create-edit-dialog"]',
    message: "Category row states should pass axe checks",
    specialPowers: SpecialPowers,
  });

  registerCleanupFunction(() => {
    dialog?.close();

    if (tab) {
      tabmail.closeTab(tab);
    }
  });
});

/**
 * Creates a category chip for the test.
 *
 * @param {string} name - The sample category label.
 *
 * @returns {HTMLLIElement} The detached chip with localization attributes.
 */
function makeChip(name) {
  const template = row.querySelector(".calendar-event-category-chip-template");
  const chip = template.content.firstElementChild.cloneNode(true);
  const label = chip.querySelector(".calendar-event-category-label");
  const remove = chip.querySelector(".calendar-event-remove-category");

  label.textContent = name;
  doc.l10n.setAttributes(remove, "calendar-event-remove-category", {
    category: name,
  });

  return chip;
}

/**
 * Shows sample category chips and clears category choices.
 *
 * @param {string[]} names - Chips to show in the summary.
 * @param {string[]} [remaining=[]] - Chips to show in the remaining list.
 *
 * @returns {Promise<void>} Resolves after translation and layout.
 */
async function showSamples(names, remaining = []) {
  const list = row.querySelector(".calendar-event-category-list");
  const choices = row.querySelector(".calendar-event-category-choices");
  const overflow = row.querySelector(".calendar-event-category-overflow");
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const more = row.querySelector(".calendar-event-more-categories");

  const selectedChips = doc.createDocumentFragment();
  const remainingChips = doc.createDocumentFragment();

  selectedChips.append(...names.map(makeChip));
  remainingChips.append(...remaining.map(makeChip));

  // Translate before inserting the chips so each remove button has a name
  // for screen readers.
  await doc.l10n.translateFragment(selectedChips);
  await doc.l10n.translateFragment(remainingChips);

  choices.replaceChildren();
  choices.hidden = true;
  list.replaceChildren(selectedChips);
  overflow.replaceChildren(remainingChips);
  body.scrollTop = 0;
  overflow.hidden = !remaining.length;
  more.hidden = !remaining.length;
  doc.l10n.setAttributes(more, "calendar-event-more-categories", {
    count: remaining.length,
  });

  await doc.l10n.translateFragment(row);
  await waitForDialogWithinContainer();
}

/**
 * Shows sample category choices without changing the event draft.
 *
 * @param {string[]} names - The sample category names.
 * @returns {Promise<void>} Resolves after the dialog fits inside its container.
 */
async function showChoices(names) {
  const choices = row.querySelector(".calendar-event-category-choices");
  const items = doc.createDocumentFragment();

  for (const name of names) {
    const item = doc.createElement("li");

    item.textContent = name;
    items.append(item);
  }

  choices.replaceChildren(items);
  choices.hidden = !names.length;

  await waitForDialogWithinContainer();
}

/**
 * Waits for the resized dialog to fit inside its calendar container.
 * ResizeObserver updates the dialog position after its size changes.
 *
 * @returns {Promise<void>} Resolves after the dialog fits within its margins.
 */
async function waitForDialogWithinContainer() {
  await BrowserTestUtils.waitForMutationCondition(
    dialog,
    { attributes: true, attributeFilter: ["style"] },
    () => {
      const bounds = dialog.getBoundingClientRect();
      const container = dialog.container.getBoundingClientRect();

      return (
        bounds.top >= container.top + dialog.margin &&
        bounds.bottom <= container.bottom - dialog.margin
      );
    }
  );
}

add_task(async function test_emptyMarkupAndLabels() {
  const addCategoryButton = row.querySelector(".calendar-event-add-category");
  const categoryChoices = row.querySelector(".calendar-event-category-choices");
  const selectedCategories = row.querySelector(".calendar-event-category-list");
  const dialogTemplateRow = document
    .getElementById("calendarEventCreateEditDialogTemplate")
    .content.querySelector(".calendar-event-category-row");
  const fixtureTemplateRow = doc
    .getElementById("calendarEventCreateEditDialogTemplate")
    .content.querySelector(".calendar-event-category-row");

  Assert.ok(
    dialogTemplateRow,
    "The dialog template should include the category row"
  );
  Assert.ok(
    fixtureTemplateRow,
    "The fixture template should include category markup"
  );
  Assert.equal(
    fixtureTemplateRow.outerHTML.replace(/\s+/g, " "),
    dialogTemplateRow.outerHTML.replace(/\s+/g, " "),
    "The fixture and dialog templates should have the same category markup"
  );
  Assert.equal(
    addCategoryButton.type,
    "button",
    "Add category should be a native button"
  );
  Assert.equal(
    doc.l10n.getAttributes(addCategoryButton).id,
    "calendar-event-add-category",
    "Add category should use its translated label"
  );
  Assert.equal(
    selectedCategories.childElementCount,
    0,
    "The category row should start without sample categories"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(categoryChoices),
    "Choices should start hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      row.querySelector(".calendar-event-more-categories")
    ),
    "The overflow control should start hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      row.querySelector(".calendar-event-category-overflow")
    ),
    "Remaining categories should start hidden"
  );
});

add_task(async function test_chipsAndKeyboardControls() {
  await showSamples(["Work", "Personal"]);

  const add = row.querySelector(".calendar-event-add-category");
  const remove = row.querySelector(".calendar-event-remove-category");
  const initialDraft = dialog.draft;

  add.focus();
  EventUtils.synthesizeKey(
    "KEY_Tab",
    { shiftKey: true },
    browser.contentWindow
  );

  Assert.equal(
    doc.activeElement,
    row.querySelectorAll(".calendar-event-remove-category")[1],
    "Shift+Tab from Add category should reach the last selected chip"
  );

  EventUtils.synthesizeKey(
    "KEY_Tab",
    { shiftKey: true },
    browser.contentWindow
  );

  Assert.equal(
    doc.activeElement,
    remove,
    "Shift+Tab should reach the first chip remove button"
  );
  Assert.ok(
    remove.matches(":focus-visible"),
    "Keyboard focus should be visible"
  );
  Assert.notEqual(
    browser.contentWindow.getComputedStyle(remove).outlineStyle,
    "none",
    "The focused remove button should have an outline"
  );

  const clicked = BrowserTestUtils.waitForEvent(remove, "click");

  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);
  await clicked;

  Assert.deepEqual(
    dialog.draft,
    initialDraft,
    "Static controls should not patch the draft"
  );
  Assert.equal(
    row.querySelector(".calendar-event-category-list").childElementCount,
    2,
    "Static remove markup should leave selection actions to the follow-up bug"
  );

  const service = Cc["@mozilla.org/accessibilityService;1"].getService(
    Ci.nsIAccessibilityService
  );
  let accessible;

  Assert.deepEqual(
    doc.l10n.getAttributes(remove),
    { id: "calendar-event-remove-category", args: { category: "Work" } },
    "The remove button should use its category in the localized name"
  );

  await TestUtils.waitForCondition(
    () => (accessible = service.getAccessibleFor(remove)),
    "The remove button should appear in the accessibility tree"
  );

  Assert.equal(
    accessible.role,
    Ci.nsIAccessibleRole.ROLE_PUSHBUTTON,
    "The remove control should expose a native button role"
  );
  Assert.equal(
    doc.l10n.getAttributes(add).id,
    "calendar-event-add-category",
    "The Add category button should use the localized name"
  );

  const selectedList = row.querySelector(".calendar-event-category-list");

  Assert.equal(
    doc.l10n.getAttributes(selectedList).id,
    "calendar-event-selected-categories",
    "The selected list should use the localized name"
  );
});

add_task(async function test_overflowLabels() {
  for (const remaining of [["Work"], ["Work", "Personal"]]) {
    await showSamples(["Travel"], remaining);

    const more = row.querySelector(".calendar-event-more-categories");
    const count = remaining.length;

    Assert.deepEqual(
      doc.l10n.getAttributes(more),
      { id: "calendar-event-more-categories", args: { count } },
      "The overflow control should use the sample count for localization"
    );
  }

  await showSamples([]);
});

add_task(async function test_longLabelsRemainReadable() {
  const longName = "A very long category label ".repeat(20);

  await showSamples([]);

  let previousHeight = dialog.getBoundingClientRect().height;

  for (const count of [2, 3]) {
    await showSamples(Array(count).fill(longName));

    const height = dialog.getBoundingClientRect().height;

    Assert.greater(
      height,
      previousHeight,
      "The dialog should grow when another row of category chips is added"
    );
    previousHeight = height;

    const list = row.querySelector(".calendar-event-category-list");
    const listRect = list.getBoundingClientRect();

    for (const chip of list.children) {
      const label = chip.querySelector(".calendar-event-category-label");
      const remove = chip.querySelector("button");
      const style = browser.contentWindow.getComputedStyle(label);

      Assert.equal(
        style.whiteSpace,
        "nowrap",
        "Chip text should stay on one line"
      );
      Assert.equal(
        style.textOverflow,
        "ellipsis",
        "Long labels should end with an ellipsis"
      );
      Assert.greater(
        label.scrollWidth,
        label.clientWidth,
        "The long label should be clipped"
      );
      Assert.lessOrEqual(
        remove.getBoundingClientRect().right,
        listRect.right,
        "The remove button should stay inside the summary"
      );
    }
  }

  await showSamples(["Work", "Personal", longName]);

  for (const chip of row.querySelector(".calendar-event-category-list")
    .children) {
    const label = chip.querySelector(".calendar-event-category-label");

    if (label.textContent == longName) {
      continue;
    }

    Assert.equal(
      label.scrollWidth,
      label.clientWidth,
      "Short labels should remain readable beside a long category"
    );
  }
});

add_task(async function test_remainingCategoriesGrowAndScrollDialog() {
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const header = dialog.querySelector(
    ".calendar-event-create-edit-dialog-header"
  );
  const footer = dialog.querySelector(
    ".calendar-event-create-edit-dialog-footer"
  );
  const overflow = row.querySelector(".calendar-event-category-overflow");

  await showSamples(["Work"]);

  const initialHeight = dialog.getBoundingClientRect().height;
  const followingTop = followingRow.getBoundingClientRect().top;

  await showSamples(["Work"], ["Personal", "Travel"]);

  Assert.greater(
    dialog.getBoundingClientRect().height,
    initialHeight,
    "Showing remaining categories should grow the dialog when space is available"
  );
  Assert.lessOrEqual(
    dialog.getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The grown dialog should stay above the container bottom margin"
  );
  Assert.lessOrEqual(
    dialog
      .querySelector(".calendar-event-create-edit-dialog-footer")
      .getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The Save footer should stay inside the container after the dialog grows"
  );
  Assert.greater(
    followingRow.getBoundingClientRect().top,
    followingTop,
    "Remaining categories should move the following fields down"
  );
  Assert.lessOrEqual(
    overflow.getBoundingClientRect().bottom,
    followingRow.getBoundingClientRect().top,
    "Remaining categories should stay before the following fields"
  );
  Assert.lessOrEqual(
    overflow.getBoundingClientRect().bottom,
    row.getBoundingClientRect().bottom,
    "Remaining categories should stay inside the category row"
  );
  Assert.greaterOrEqual(
    overflow.getBoundingClientRect().top,
    row.getBoundingClientRect().top,
    "Remaining categories should stay below the category row top"
  );
  Assert.greaterOrEqual(
    overflow.getBoundingClientRect().left,
    row.getBoundingClientRect().left,
    "Remaining categories should stay inside the category row start"
  );
  Assert.lessOrEqual(
    overflow.getBoundingClientRect().right,
    row.getBoundingClientRect().right,
    "Remaining categories should stay inside the category row end"
  );

  const remaining = Array.from(
    { length: 20 },
    (_, index) => `Category ${index}`
  );

  await showSamples(["Work"], remaining);

  Assert.lessOrEqual(
    dialog.getBoundingClientRect().height,
    parseFloat(dialog.style.maxHeight),
    "The dialog should stop growing at its available height"
  );
  Assert.lessOrEqual(
    dialog.getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The grown dialog should stay above the container bottom margin"
  );
  Assert.lessOrEqual(
    dialog
      .querySelector(".calendar-event-create-edit-dialog-footer")
      .getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The Save footer should stay inside the container after the dialog grows"
  );
  Assert.greater(
    body.scrollHeight,
    body.clientHeight,
    "The dialog body should scroll when remaining categories exceed its height"
  );
  Assert.equal(
    overflow.scrollHeight,
    overflow.clientHeight,
    "The remaining-category list should show every category without its own scrollbar"
  );

  const headerTop = header.getBoundingClientRect().top;
  const footerBottom = footer.getBoundingClientRect().bottom;

  overflow.focus();
  body.scrollTop = 0;

  const bodyScrolled = BrowserTestUtils.waitForEvent(
    body,
    "scroll",
    false,
    () => body.scrollTop > 0
  );

  EventUtils.synthesizeKey("KEY_End", {}, browser.contentWindow);
  await bodyScrolled;

  Assert.greater(
    body.scrollTop,
    0,
    "Keyboard input should scroll the dialog body"
  );

  Assert.equal(
    overflow.scrollTop,
    0,
    "Keyboard input should not scroll the remaining-category list itself"
  );
  Assert.equal(
    doc.activeElement,
    overflow,
    "The remaining-category list should retain keyboard focus"
  );
  Assert.equal(
    header.getBoundingClientRect().top,
    headerTop,
    "The header should stay fixed when the dialog body scrolls"
  );
  Assert.equal(
    footer.getBoundingClientRect().bottom,
    footerBottom,
    "The Save footer should stay fixed when the dialog body scrolls"
  );
  Assert.equal(
    doc.l10n.getAttributes(row.querySelector(".calendar-event-more-categories"))
      .args.count,
    20,
    "The sample overflow control should receive the translated count"
  );
});

add_task(async function test_categoryChoicesGrowAndScrollDialog() {
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const choices = row.querySelector(".calendar-event-category-choices");

  await showSamples([]);

  const initialHeight = dialog.getBoundingClientRect().height;
  const followingTop = followingRow.getBoundingClientRect().top;

  await showChoices(["Work", "Personal"]);

  Assert.greater(
    dialog.getBoundingClientRect().height,
    initialHeight,
    "Showing category choices should grow the dialog when space is available"
  );
  Assert.lessOrEqual(
    dialog.getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The grown dialog should stay above the container bottom margin"
  );
  Assert.lessOrEqual(
    dialog
      .querySelector(".calendar-event-create-edit-dialog-footer")
      .getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The Save footer should stay inside the container after the dialog grows"
  );
  Assert.greater(
    followingRow.getBoundingClientRect().top,
    followingTop,
    "Category choices should move the following fields down"
  );
  Assert.lessOrEqual(
    choices.getBoundingClientRect().bottom,
    followingRow.getBoundingClientRect().top,
    "Category choices should stay before the following fields"
  );
  Assert.lessOrEqual(
    choices.getBoundingClientRect().bottom,
    row.getBoundingClientRect().bottom,
    "Category choices should stay inside the category row"
  );
  Assert.greaterOrEqual(
    choices.getBoundingClientRect().top,
    row.getBoundingClientRect().top,
    "Category choices should stay below the category row top"
  );
  Assert.greaterOrEqual(
    choices.getBoundingClientRect().left,
    row.getBoundingClientRect().left,
    "Category choices should stay inside the category row start"
  );
  Assert.lessOrEqual(
    choices.getBoundingClientRect().right,
    row.getBoundingClientRect().right,
    "Category choices should stay inside the category row end"
  );

  const names = Array.from({ length: 40 }, (_, index) => `Category ${index}`);

  await showChoices(names);

  Assert.lessOrEqual(
    dialog.getBoundingClientRect().height,
    parseFloat(dialog.style.maxHeight),
    "The dialog should stop growing when category choices fill its available height"
  );
  Assert.lessOrEqual(
    dialog.getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The grown dialog should stay above the container bottom margin"
  );
  Assert.lessOrEqual(
    dialog
      .querySelector(".calendar-event-create-edit-dialog-footer")
      .getBoundingClientRect().bottom,
    dialog.container.getBoundingClientRect().bottom - dialog.margin,
    "The Save footer should stay inside the container after the dialog grows"
  );
  Assert.greater(
    body.scrollHeight,
    body.clientHeight,
    "The dialog body should scroll when category choices exceed its height"
  );
  Assert.equal(
    choices.scrollHeight,
    choices.clientHeight,
    "Category choices should show every item without their own scrollbar"
  );

  body.scrollTop = body.scrollHeight;

  Assert.greater(
    body.scrollTop,
    0,
    "The dialog body should scroll to show all category choices"
  );
  Assert.equal(
    choices.scrollTop,
    0,
    "The category choices list should not scroll on its own"
  );

  await showChoices([]);
  body.scrollTop = 0;
});
