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
  // Keep another field below the category row to check that the pills stay in flow.
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
 * Sets draft categories and waits for the pills and dialog layout.
 *
 * @param {string[]} names - The selected names.
 * @returns {Promise<void>} Resolves after rendering and positioning the dialog.
 */
async function showSamples(names) {
  dialog.updateDraftSection("categories", { categories: names });
  await row.renderComplete;

  dialog.querySelector(".calendar-event-create-edit-dialog-body").scrollTop = 0;
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
  Assert.ok(
    !row.shadowRoot.querySelector(".toggle-checkbox"),
    "Categories should have no row toggle"
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
  Assert.equal(
    categoryChoices.localName,
    "menupopup",
    "Add category should have a native popup menu"
  );
  Assert.equal(categoryChoices.state, "closed", "The menu should start closed");
  Assert.equal(
    addCategoryButton.getAttribute("aria-controls"),
    categoryChoices.id,
    "Add category should identify the menu it opens"
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

  // Check the names and roles that screen readers receive.
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

  EventUtils.synthesizeKey("KEY_Enter", {}, browser.contentWindow);

  await BrowserTestUtils.waitForMutationCondition(
    row,
    { childList: true, subtree: true },
    () => row.querySelectorAll(".calendar-event-category-label").length == 1
  );

  Assert.deepEqual(
    dialog.draft.categories,
    ["Personal"],
    "Enter on the remove button should remove only its draft category"
  );

  Assert.equal(
    row.querySelector(".calendar-event-category-list").childElementCount,
    1,
    "Keyboard removal should update the visible chips"
  );

  Assert.equal(
    doc.activeElement,
    row.querySelector(".calendar-event-remove-category"),
    "Removal should move focus to the next chip"
  );

  Assert.deepEqual(
    initialDraft.categories,
    ["Work", "Personal"],
    "The previous draft copy should retain its category names"
  );
});

add_task(async function test_longLabelsWrapWithoutHidingPills() {
  const longNames = ["A", "B", "C", "D"].map(letter => letter.repeat(100));

  await showSamples(longNames);

  const list = row.querySelector(".calendar-event-category-list");
  const listRect = list.getBoundingClientRect();
  const chips = [...list.children];

  Assert.equal(
    chips.length,
    longNames.length,
    "The list should contain every selected category"
  );
  Assert.greater(
    chips.at(-1).getBoundingClientRect().top,
    chips[0].getBoundingClientRect().top,
    "The selected pills should wrap onto more than one row"
  );

  for (const chip of chips) {
    const label = chip.querySelector(".calendar-event-category-label");
    const remove = chip.querySelector(".calendar-event-remove-category");
    const style = browser.contentWindow.getComputedStyle(label);

    Assert.equal(
      style.whiteSpace,
      "nowrap",
      "Pill text should stay on one line"
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
      "The Remove button should stay inside the category list"
    );
  }
});

add_task(async function test_selectedCategoriesGrowAndScrollDialog() {
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");
  const header = dialog.querySelector(
    ".calendar-event-create-edit-dialog-header"
  );
  const footer = dialog.querySelector(
    ".calendar-event-create-edit-dialog-footer"
  );
  const list = row.querySelector(".calendar-event-category-list");

  await showSamples(["Work"]);

  const initialHeight = dialog.getBoundingClientRect().height;
  const followingTop = followingRow.getBoundingClientRect().top;
  const names = Array.from(
    { length: 12 },
    (_, index) => `Category ${index + 1}`
  );

  await showSamples(names);

  Assert.greater(
    dialog.getBoundingClientRect().height,
    initialHeight,
    "Wrapping pills should grow the dialog while there is space"
  );
  Assert.greater(
    followingRow.getBoundingClientRect().top,
    followingTop,
    "Pills on multiple lines should move the following field down"
  );

  const manyNames = Array.from(
    { length: 80 },
    (_, index) => `Category ${index + 1}`
  );

  await showSamples(manyNames);

  Assert.equal(
    list.childElementCount,
    manyNames.length,
    "The category list should show every selected pill"
  );
  Assert.lessOrEqual(
    dialog.getBoundingClientRect().height,
    parseFloat(dialog.style.maxHeight),
    "The dialog should stop growing at its available height"
  );
  Assert.greater(
    body.scrollHeight,
    body.clientHeight,
    "The dialog body should scroll when the pills exceed the available height"
  );
  Assert.equal(
    list.scrollHeight,
    list.clientHeight,
    "The category list should rely on the dialog scrollbar"
  );

  const headerTop = header.getBoundingClientRect().top;
  const footerBottom = footer.getBoundingClientRect().bottom;
  const lastRemove = list.lastElementChild.querySelector(
    ".calendar-event-remove-category"
  );
  const scrolled = BrowserTestUtils.waitForEvent(
    body,
    "scroll",
    false,
    () => body.scrollTop > 0
  );

  lastRemove.focus();
  await scrolled;

  Assert.equal(
    doc.activeElement,
    lastRemove,
    "The last Remove button should take focus"
  );
  Assert.lessOrEqual(
    lastRemove.getBoundingClientRect().bottom,
    body.getBoundingClientRect().bottom,
    "Focusing the last Remove button should scroll it into view"
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
});
