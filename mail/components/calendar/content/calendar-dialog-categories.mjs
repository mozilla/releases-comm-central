/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * Calendar Dialog Categories
 *
 * Template ID: #calendarDialogCategoriesTemplate
 *
 * @tagname calendar-dialog-categories
 */
export class CalendarDialogCategories extends HTMLElement {
  static MAX_VISIBLE_CATEGORIES = 3;

  #l10n = null;

  async connectedCallback() {
    if (this.shadowRoot) {
      // Already connected, no need to run it again.
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    this.#l10n = new DOMLocalization(["messenger/calendarDialog.ftl"]);

    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href =
      "chrome://messenger/skin/calendar/calendarDialogCategories.css";

    const template = document
      .getElementById("calendarDialogCategoriesTemplate")
      .content.cloneNode(true);

    shadowRoot.append(template, style);
    this.#l10n.connectRoot(shadowRoot);
  }

  /**
   *
   * @param {string[]} categories - Array of category names.
   */
  setCategories(categories) {
    const buildCategoryItem = category => {
      const item = document.createElement("li");
      const cssSafeId = cal.view.formatStringForCSSRule(category);
      item.style.setProperty(
        "--item-color",
        `var(--category-${cssSafeId}-color)`
      );
      item.style.setProperty(
        "--item-text-color",
        `var(--category-${cssSafeId}-text-color)`
      );
      item.textContent = category;
      item.title = category;
      return item;
    };
    const list = this.shadowRoot.querySelector(".categories-list");
    list.replaceChildren(
      ...categories
        .slice(0, this.constructor.MAX_VISIBLE_CATEGORIES)
        .map(buildCategoryItem)
    );
    const overflowLabel = this.shadowRoot.querySelector(".overflow-label");
    overflowLabel.hidden =
      this.constructor.MAX_VISIBLE_CATEGORIES >= categories.length;
    document.l10n.setAttributes(
      overflowLabel,
      "calendar-dialog-more-categories",
      {
        additionalCategories:
          categories.length - this.constructor.MAX_VISIBLE_CATEGORIES,
        categories: new Intl.ListFormat().format(categories),
      }
    );

    this.dispatchEvent(
      new CustomEvent("toggleRowVisibility", {
        bubbles: true,
        detail: {
          isHidden: categories.length === 0,
        },
      })
    );
  }
}

customElements.define("calendar-dialog-categories", CalendarDialogCategories);
