/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let categoriesElement;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/calendar/test/browser/files/calendarDialogCategories.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser, undefined, url =>
    url.endsWith("calendarDialogCategories.xhtml")
  );
  tab.browser.focus();
  categoriesElement = tab.browser.contentWindow.document.querySelector(
    "calendar-dialog-categories"
  );
});

registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});

add_task(async function test_setCategories() {
  const categoriesList =
    categoriesElement.shadowRoot.querySelector(".categories-list");
  const overflowLabel =
    categoriesElement.shadowRoot.querySelector(".overflow-label");
  function assertCategories(categories) {
    Assert.equal(
      categoriesList.childElementCount,
      categories.length,
      "Category count should match expected count"
    );
    for (const [index, category] of categories.entries()) {
      const item = categoriesList.children[index];
      const cssSafeId = cal.view.formatStringForCSSRule(category);
      Assert.equal(
        item.tagName,
        "li",
        `Category item at index ${index} should be a list item`
      );
      Assert.equal(
        item.textContent,
        category,
        `Should find expected category text at index ${index}`
      );
      Assert.equal(
        item.title,
        category,
        `Should find expected category tooltip at index ${index}`
      );
      Assert.equal(
        item.style.getPropertyValue("--item-color"),
        `var(--category-${cssSafeId}-color)`,
        `Should set category color custom property for ${category}`
      );
      Assert.equal(
        item.style.getPropertyValue("--item-text-color"),
        `var(--category-${cssSafeId}-text-color)`,
        `Should set category text color custom property for ${category}`
      );
    }
  }

  Assert.equal(
    categoriesElement.constructor.MAX_VISIBLE_CATEGORIES,
    3,
    "Max visible categories should be the default value"
  );

  const toggleRowVisibilityPromise = BrowserTestUtils.waitForEvent(
    categoriesElement,
    "toggleRowVisibility"
  );
  categoriesElement.setCategories([]);
  // Setting the categories should fire this event.
  await toggleRowVisibilityPromise;

  Assert.ok(
    BrowserTestUtils.isHidden(overflowLabel),
    "Overflow is hidden without categories"
  );
  Assert.equal(
    categoriesList.childElementCount,
    0,
    "Should have no categories"
  );

  categoriesElement.setCategories(["Lorem", "ipsum", "dolor"]);

  Assert.ok(
    BrowserTestUtils.isHidden(overflowLabel),
    "Should show no overflow with three categories"
  );
  assertCategories(["Lorem", "ipsum", "dolor"]);

  const allCategories = ["Lorem ipsum", "dolor", "sit", "amet"];
  categoriesElement.setCategories(allCategories);

  assertCategories(allCategories.slice(0, 3));
  Assert.ok(
    BrowserTestUtils.isVisible(overflowLabel),
    "Overflow label should be visible"
  );
  const { id, args } = document.l10n.getAttributes(overflowLabel);
  Assert.equal(
    id,
    "calendar-dialog-more-categories",
    "Should have expected string for overflow label"
  );
  Assert.equal(args.additionalCategories, 1, "Should have one more category");

  for (const category of allCategories) {
    Assert.stringContains(
      args.categories,
      category,
      "Tooltip variable should contain category"
    );
  }

  categoriesElement.setCategories([]);

  Assert.ok(
    BrowserTestUtils.isHidden(overflowLabel),
    "Overflow is hidden again"
  );
  Assert.equal(
    categoriesList.childElementCount,
    0,
    "Should have no categories again"
  );
});
