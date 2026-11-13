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

  redux = browser.contentWindow.ReduxTestUtils;
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
 * Sets draft categories and waits for the translated controls.
 * If `remaining` has names, opens More when some names do not fit the summary.
 *
 * @param {string[]} names - The selected names.
 * @param {string[]} [remaining=[]] - Additional selected names.
 * @returns {Promise<void>} Resolves after rendering and layout.
 */
async function showSamples(names, remaining = []) {
  const choices = row.querySelector(".calendar-event-category-choices");
  const overflow = row.querySelector(".calendar-event-category-overflow");

  if (!choices.hidden) {
    row.querySelector(".calendar-event-add-category").click();
  }

  if (!overflow.hidden) {
    row.querySelector(".calendar-event-more-categories").click();
  }

  dialog.updateDraftSection("categories", {
    categories: [...names, ...remaining],
  });
  await row.renderComplete;

  const more = row.querySelector(".calendar-event-more-categories");
  const body = dialog.querySelector(".calendar-event-create-edit-dialog-body");

  if (remaining.length && !more.hidden) {
    more.click();
  }

  body.scrollTop = 0;

  await waitForDialogWithinContainer();
}

/**
 * Supplies sample category options and opens Add category.
 *
 * @param {string[]} names - The sample category names.
 * @returns {Promise<void>} Resolves after rendering and layout.
 */
async function showChoices(names) {
  const choices = row.querySelector(".calendar-event-category-choices");

  await redux.dispatchAction(
    "moz-src:///comm/mail/components/calendar/content/state/calendarEventCategorySlice.mjs",
    "setCategoryOptions",
    {
      sessionKey: dialog.calendarEventSessionKey,
      options: names.map(name => ({ name, color: "", textColor: "" })),
    }
  );
  await row.renderComplete;

  if (choices.hidden) {
    row.querySelector(".calendar-event-add-category").click();
  }

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

add_task(async function test_overflowLabels() {
  for (const remaining of [["Work"], ["Work", "Personal"]]) {
    await showSamples(["A", "B", "C"], remaining);

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
    const names = Array(count).fill(longName);

    // Open More for the third long name because only two fit in the summary.
    await showSamples(names.slice(0, 2), names.slice(2));

    const height = dialog.getBoundingClientRect().height;

    Assert.greater(
      height,
      previousHeight,
      "The dialog should grow when another row of category content appears"
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

  await showSamples(["A", "B", "C"]);

  const initialHeight = dialog.getBoundingClientRect().height;
  const followingTop = followingRow.getBoundingClientRect().top;

  await showSamples(["A", "B", "C"], ["Personal", "Travel"]);

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

  await showSamples(["A", "B", "C"], remaining);

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
    remaining.length +
      3 -
      row.querySelector(".calendar-event-category-list").childElementCount,
    "The overflow control should receive the actual remaining count"
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
