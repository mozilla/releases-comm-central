/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalendarDialogRow } from "./calendar-dialog-row.mjs";
import { calendarEventSessionRow } from "./calendar-event-session-row.mjs";
import {
  getCategoryOption,
  loadCategoryOptions,
} from "./calendar-event-category-options.mjs";
import {
  changeCategory,
  clearCategoryOptions,
  setCategoryOptions,
} from "./state/calendarEventCategorySlice.mjs";
import { selectCategoryViewModel } from "./state/calendar-event-create-edit-selectors.mjs";

/**
 * Shows selected categories as chips, each with a Remove button.
 * The summary shows up to three chips; More opens a list of the rest.
 * Add category opens checkboxes for available and selected names.
 *
 * The row observes and updates the draft for the session bound by the dialog.
 * Open lists, focus, and chip widths stay in the row, outside Redux.
 *
 * Template ID: #calendarDialogRowTemplate (inherited)
 *
 * @tagname calendar-event-category-row
 * @slot icon - The row icon.
 * @slot label - The row label.
 * @slot content - The category controls.
 */
export class CalendarEventCategoryRow extends calendarEventSessionRow(
  CalendarDialogRow,
  forSession => ({ categoryViewModel: forSession(selectCategoryViewModel) })
) {
  /** @type {?CalendarEventCategoryViewModel} The latest selected row values. */
  #categoryState = null;

  /** @type {number} The current option load, invalidated when the route clears. */
  #optionsLoadId = 0;

  /** @type {Promise<void>} Completion of the current option load. */
  #optionsLoaded = Promise.resolve();

  /** @type {?Error} The current option load error, reported by readiness waits. */
  #optionsError = null;

  /**
   * Translated More buttons for two or three visible chips, in that order.
   *
   * @type {HTMLButtonElement[]}
   */
  #moreButtons = [];

  /** @type {number} The content width used for the current chip layout. */
  #layoutWidth = 0;

  /**
   * Identifies the latest render so older translations can be ignored.
   *
   * @type {number}
   */
  #renderId = 0;

  /**
   * Resolves when the latest render finishes. Rejects if translation fails.
   *
   * @type {Promise<void>}
   */
  #renderComplete = Promise.resolve();

  /**
   * The dialog that receives clicks and key presses outside this row.
   *
   * @type {?HTMLDialogElement}
   */
  #dialog = null;

  /**
   * Updates chip layout when the row's width changes.
   *
   * @type {ResizeObserver}
   */
  #resizeObserver = new ResizeObserver(() => this.prepareLayout());

  connectedCallback() {
    super.connectedCallback();

    if (!this.hasConnected) {
      this.hasConnected = true;
      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      this.addEventListener("change", this, true);
    }

    this.#dialog = this.closest("dialog");
    this.#dialog?.addEventListener("click", this);
    this.#dialog?.addEventListener("keydown", this);

    this.#resizeObserver.observe(
      this.querySelector(".calendar-event-category-content")
    );

    // Apply values received while the row was outside the document.
    this.#renderComplete = this.#renderCategories();
  }

  disconnectedCallback() {
    this.#resizeObserver.disconnect();
    this.#dialog?.removeEventListener("click", this);
    this.#dialog?.removeEventListener("keydown", this);
    this.#dialog = null;
    // Ignore any translation that finishes after the row is removed.
    this.#renderId++;
  }

  handleEvent(event) {
    if (event.currentTarget === this.#dialog) {
      // Events from this row also bubble to the dialog. Handle each event once.
      if (this.contains(event.target)) {
        return;
      }

      if (event.type == "click") {
        this.#setPopup(null);
      } else if (event.type == "keydown") {
        this.#handleKey(event);
      }

      return;
    }

    switch (event.type) {
      case "change": {
        const input = event.target.closest(
          ".calendar-event-category-choices input"
        );

        if (!input || !this.#categoryState) {
          return;
        }

        this.#changeCategory(input.dataset.category, input.checked);

        // The checkbox changes before this event, but dispatch updates the
        // draft immediately. Restore the draft value if the change was refused.
        input.checked = this.#categoryState.categories.includes(
          input.dataset.category
        );
        break;
      }
      case "click":
        if (event.target.closest(".calendar-event-add-category")) {
          this.#setPopup(this.#popup == "choices" ? null : "choices");
        } else if (event.target.closest(".calendar-event-more-categories")) {
          this.#setPopup(this.#popup == "overflow" ? null : "overflow");
        } else if (event.target.closest(".calendar-event-remove-category")) {
          this.#changeCategory(
            event.target.closest("[data-category]").dataset.category,
            false
          );
        }
        break;
      case "keydown":
        this.#handleKey(event);
        break;
    }
  }

  /**
   * Loads options when a route starts and updates controls from selected values.
   * Hidden rows stay current. Detached rows wait to render until reconnecting.
   *
   * @param {string} _fieldName - The registered selector name.
   * @param {CalendarEventCategoryViewModel|undefined} previous - The old selection.
   * @param {CalendarEventCategoryViewModel} value - The current selection.
   */
  handleStateChange(_fieldName, previous, value) {
    this.#categoryState = value;
    let state = value;

    if ((previous?.mode ?? null) !== state.mode) {
      const loadId = ++this.#optionsLoadId;

      this.#optionsError = null;
      this.#optionsLoaded = Promise.resolve();
      this.dispatchSessionAction(clearCategoryOptions, {});
      state = this.#categoryState;

      // Clearing options can notify code that replaces this route again.
      if (state.mode && loadId === this.#optionsLoadId) {
        this.#optionsLoaded = this.#loadOptions(loadId);
      }
    }

    if (!this.isConnected) {
      return;
    }

    if (previous?.disabled !== state.disabled) {
      this.#renderDisabled();
    }

    if (!state.hasDraft || !state.options) {
      this.#clear();

      return;
    }

    // Options can finish loading before the first draft arrives.
    if (
      previous?.hasDraft &&
      previous.categories === state.categories &&
      previous.options === state.options
    ) {
      return;
    }

    this.#renderComplete = this.#renderCategories();
  }

  /**
   * Loads choices for the current route and stores only its own result.
   * Readiness waits report current errors. Replaced loads cannot fail a new route.
   *
   * @param {number} loadId - The option load that owns this work.
   * @returns {Promise<void>} Resolves after applying or discarding the result.
   */
  async #loadOptions(loadId) {
    try {
      const options = await loadCategoryOptions();

      if (loadId !== this.#optionsLoadId) {
        return;
      }

      this.dispatchSessionAction(setCategoryOptions, { options });
    } catch (error) {
      if (loadId === this.#optionsLoadId) {
        this.#optionsError = error;
      }
    }
  }

  /**
   * Stops observation and prevents a late option load from updating this window.
   */
  dispose() {
    this.#optionsLoadId++;
    this.#optionsLoaded = Promise.resolve();
    super.dispose();
  }

  /**
   * Returns the completion promise for the current category display.
   * The dialog waits for this promise before it opens and measures the row.
   *
   * @returns {Promise<void>} Resolves after loading options and translating the
   *   controls, or after discarding replaced work. Rejects if current loading or
   *   translation fails.
   */
  get renderComplete() {
    return this.#waitForRender();
  }

  /**
   * Waits for options, then for the render started by their store update.
   *
   * @returns {Promise<void>} Resolves after the current display is ready or its
   *   load is replaced. Rejects if the current load or translation fails.
   */
  async #waitForRender() {
    const loading = this.#optionsLoaded;

    await loading;

    if (loading !== this.#optionsLoaded) {
      return;
    }

    if (this.#optionsError) {
      throw this.#optionsError;
    }

    while (loading === this.#optionsLoaded) {
      const rendering = this.#renderComplete;

      try {
        await rendering;
      } catch (error) {
        if (
          loading === this.#optionsLoaded &&
          rendering === this.#renderComplete
        ) {
          throw error;
        }
      }

      // A store update can replace the render while translation is pending.
      if (rendering === this.#renderComplete) {
        return;
      }
    }
  }

  /**
   * Returns the name of the open category list.
   *
   * @returns {"choices"|"overflow"|null} The open list, or null when both are hidden.
   */
  get #popup() {
    if (!this.querySelector(".calendar-event-category-choices").hidden) {
      return "choices";
    }

    return this.querySelector(".calendar-event-category-overflow").hidden
      ? null
      : "overflow";
  }

  /**
   * Removes the controls and ignores pending translation results.
   */
  #clear() {
    this.#renderId++;
    this.#renderComplete = Promise.resolve();
    this.#moreButtons = [];
    this.#layoutWidth = 0;
    this.#setPopup(null);

    for (const selector of [
      ".calendar-event-category-list",
      ".calendar-event-category-overflow",
      ".calendar-event-category-choices",
    ]) {
      this.querySelector(selector).replaceChildren();
    }

    const add = this.querySelector(".calendar-event-add-category");

    // Replace the Add button so code holding the old button cannot open a
    // list for the next event.
    add.replaceWith(add.cloneNode(true));
    this.querySelector(".calendar-event-add-category").disabled = true;
    this.querySelector(".calendar-event-more-categories").hidden = true;
  }

  /**
   * Updates the category draft unless changes are disabled.
   *
   * @param {string} categoryName - The category to add or remove.
   * @param {boolean} selected - Whether to select the category.
   */
  #changeCategory(categoryName, selected) {
    if (
      !this.isConnected ||
      !this.#categoryState ||
      this.#categoryState.disabled
    ) {
      return;
    }

    this.dispatchSessionAction(changeCategory, { categoryName, selected });
  }

  /**
   * Sets the disabled state of category buttons and checkboxes.
   * Moves focus to the open dialog if a focused control becomes disabled.
   */
  #renderDisabled() {
    const disabled = this.#categoryState.disabled;
    const content = this.querySelector(".calendar-event-category-content");
    const focused = document.activeElement;
    const moveFocus =
      disabled &&
      this.#dialog?.open &&
      content.contains(focused) &&
      focused.matches("button, input");

    for (const control of content.querySelectorAll("button, input")) {
      control.disabled = disabled;
    }

    // Layout can replace More with either cached button while Save is pending.
    for (const button of this.#moreButtons) {
      button.disabled = disabled;
    }

    const add = content.querySelector(".calendar-event-add-category");
    const choices = content.querySelector(".calendar-event-category-choices");

    add.disabled = disabled || !choices.childElementCount;

    if (!moveFocus) {
      return;
    }

    this.#dialog.focus();
  }

  /**
   * Builds chips and choices, then translates them before insertion.
   * Ignores translated controls after a newer render, reset, or disconnection.
   * Restores category focus only if focus has not moved during translation.
   *
   * @returns {Promise<void>} Resolves after inserting translated controls and
   *   any required focus change, or after discarding the render. Rejects if
   *   translation fails.
   */
  async #renderCategories() {
    const state = this.#categoryState;

    if (!state?.hasDraft || !state.options) {
      this.#clear();

      return;
    }

    const renderId = ++this.#renderId;
    const names = state.categories;
    const fragment = document.createDocumentFragment();
    const template = this.querySelector(
      ".calendar-event-category-chip-template"
    );
    const focused = document.activeElement;
    const focusedName = focused?.closest("[data-category]")?.dataset.category;
    const focusedChoice = focused?.closest(".calendar-event-category-choices");
    const focusedIndex = names.indexOf(focusedName);

    const previousIndex = [
      ...this.querySelectorAll(".calendar-event-category-chip"),
    ].findIndex(chip => chip.contains(focused));

    // Saved events can select names absent from the configured options. Keep
    // those chips and read their colors without adding category preferences.
    const chips = names.map(categoryName => {
      const chip = template.content.firstElementChild.cloneNode(true);
      const label = chip.querySelector(".calendar-event-category-label");
      const button = chip.querySelector("button");
      const option =
        state.options.find(item => item.name == categoryName) ??
        getCategoryOption(categoryName);

      chip.dataset.category = categoryName;
      label.textContent = categoryName;
      label.title = categoryName;
      chip.style.setProperty("--item-color", option.color);
      chip.style.setProperty("--item-text-color", option.textColor);

      document.l10n.setAttributes(button, "calendar-event-remove-category", {
        category: categoryName,
      });

      return chip;
    });

    // Include selected names so categories removed from preferences can still
    // be unchecked in this event.
    const choices = [
      ...new Set([...state.options.map(option => option.name), ...names]),
    ]
      .sort(new Intl.Collator().compare)
      .map(categoryName => {
        const item = document.createElement("li");
        const label = document.createElement("label");
        const input = document.createElement("input");

        input.type = "checkbox";
        input.checked = names.includes(categoryName);
        input.dataset.category = categoryName;

        label.append(input, document.createTextNode(categoryName));
        item.append(label);

        return item;
      });

    // Translate both counts now so layout can choose two or three chips
    // without waiting for translation.
    const moreButtons = [2, 3].map(capacity => {
      const button = this.querySelector(
        ".calendar-event-more-categories"
      ).cloneNode(false);

      button.type = "button";
      button.hidden = names.length <= capacity;

      document.l10n.setAttributes(button, "calendar-event-more-categories", {
        count: Math.max(0, names.length - capacity),
      });

      return button;
    });

    // Translate before insertion so screen readers get named Remove buttons.
    fragment.append(...chips, ...choices, ...moreButtons);
    await document.l10n.translateFragment(fragment);

    // Ignore translations from before a reset, removal, or newer render.
    if (!this.isConnected || renderId !== this.#renderId) {
      return;
    }

    // Do not move focus back if the user moved elsewhere while translation ran.
    const restoreFocus =
      this.#dialog?.open && focused === document.activeElement;
    const popup = this.#popup;

    this.#moreButtons = moreButtons;
    this.#layoutWidth = 0;

    this.querySelector(".calendar-event-category-list").replaceChildren(
      ...chips.slice(0, 3)
    );

    this.querySelector(".calendar-event-category-overflow").replaceChildren(
      ...chips.slice(3)
    );

    this.querySelector(".calendar-event-more-categories").replaceWith(
      moreButtons[1]
    );

    this.querySelector(".calendar-event-category-choices").replaceChildren(
      ...choices
    );

    this.#renderDisabled();
    this.prepareLayout();
    this.#setPopup(popup);

    if (!restoreFocus || (!focusedName && previousIndex == -1)) {
      return;
    }

    if (focusedChoice) {
      const input = choices
        .map(item => item.querySelector("input"))
        .find(choice => choice.dataset.category == focusedName);

      // An unknown name disappears from choices after it is unchecked.
      (input ?? this.querySelector(".calendar-event-add-category")).focus();

      return;
    }

    // After removal, use the chip now at the old position, or the last chip.
    // If no visible chip remains, use Add category instead.
    const index =
      focusedIndex == -1
        ? Math.min(previousIndex, chips.length - 1)
        : focusedIndex;
    const chip = chips[index];
    const overflow = this.querySelector(".calendar-event-category-overflow");
    const target =
      chip && (!overflow.contains(chip) || !overflow.hidden)
        ? chip.querySelector("button")
        : this.querySelector(".calendar-event-add-category");

    target.focus();
  }

  /**
   * Shows up to three chips and moves the rest to the overflow list.
   * Measures chips before flex layout shrinks them, with the CSS label limit.
   * Finishes synchronously so the dialog can measure and position itself.
   */
  prepareLayout() {
    if (!this.#moreButtons.length) {
      return;
    }

    const list = this.querySelector(".calendar-event-category-list");

    // A hidden row has no usable width. Measure again when the dialog opens
    // or the resize observer reports a width change.
    if (!list.clientWidth) {
      return;
    }

    const contentWidth = this.querySelector(
      ".calendar-event-category-content"
    ).clientWidth;

    // More changes the list width. Compare the content width to skip repeated
    // layout work when only the row height changes.
    if (contentWidth == this.#layoutWidth) {
      return;
    }

    this.#layoutWidth = contentWidth;

    const overflow = this.querySelector(".calendar-event-category-overflow");
    const chips = [...this.querySelectorAll(".calendar-event-category-chip")];
    const popup = this.#popup;
    const candidate = this.#moreButtons[1];
    const currentMore = this.querySelector(".calendar-event-more-categories");
    const focused = document.activeElement;
    const candidates = chips.slice(0, 3);

    // Include the More button when checking whether three chips fit. Disable
    // flex shrinking so the measurements include the full chip widths.
    currentMore.replaceWith(candidate);
    list.replaceChildren(...candidates);

    for (const chip of candidates) {
      chip.style.flexShrink = "0";
    }

    const gap = parseFloat(getComputedStyle(list).columnGap) || 0;
    const required =
      candidates.reduce(
        (width, chip) => width + chip.getBoundingClientRect().width,
        0
      ) +
      Math.max(0, candidates.length - 1) * gap;
    const capacity = list.clientWidth && required > list.clientWidth ? 2 : 3;

    // Restore normal shrinking after choosing capacity. This lets long labels
    // fit within the two-chip summary without hiding their Remove buttons.
    for (const chip of candidates) {
      chip.style.removeProperty("flex-shrink");
    }

    list.replaceChildren(...chips.slice(0, capacity));
    overflow.replaceChildren(...chips.slice(capacity));
    candidate.replaceWith(this.#moreButtons[capacity - 2]);
    this.#setPopup(popup);

    if (
      !this.#dialog?.open ||
      !focused?.matches(
        ".calendar-event-remove-category, .calendar-event-more-categories"
      )
    ) {
      return;
    }

    if (overflow.contains(focused) && overflow.hidden) {
      this.querySelector(".calendar-event-more-categories").focus();
    } else if (focused.isConnected) {
      focused.focus();
    } else if (focused.matches(".calendar-event-more-categories")) {
      const more = this.querySelector(".calendar-event-more-categories");

      (more.hidden
        ? this.querySelector(".calendar-event-add-category")
        : more
      ).focus();
    }
  }

  /**
   * Shows one category list and updates the buttons' `aria-expanded` state.
   * Keeps the overflow list closed when it is empty.
   *
   * @param {"choices"|"overflow"|null} popup - The list to open, or null to close.
   */
  #setPopup(popup) {
    const choices = this.querySelector(".calendar-event-category-choices");
    const overflow = this.querySelector(".calendar-event-category-overflow");
    const add = this.querySelector(".calendar-event-add-category");
    const more = this.querySelector(".calendar-event-more-categories");

    const shown =
      popup == "overflow" && !overflow.childElementCount ? null : popup;

    choices.hidden = shown != "choices";
    overflow.hidden = shown != "overflow";
    add.setAttribute("aria-expanded", String(!choices.hidden));
    more.setAttribute("aria-expanded", String(!overflow.hidden));
  }

  /**
   * Handles category list keys without closing the event dialog.
   * Escape closes the list and focuses its button. Up and Down wrap through
   * choices; Home and End focus the first and last choices.
   *
   * @param {KeyboardEvent} event - The keyboard event.
   */
  #handleKey(event) {
    if (!this.#popup) {
      return;
    }

    if (event.key == "Escape") {
      event.preventDefault();
      event.stopPropagation();

      const selector =
        this.#popup == "choices"
          ? ".calendar-event-add-category"
          : ".calendar-event-more-categories";

      this.#setPopup(null);
      this.querySelector(selector).focus();

      return;
    }

    const choices = [
      ...this.querySelectorAll(".calendar-event-category-choices input"),
    ];
    const index = choices.indexOf(event.target);

    if (
      index == -1 ||
      !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      return;
    }

    event.preventDefault();

    let next =
      (index + (event.key == "ArrowDown" ? 1 : -1) + choices.length) %
      choices.length;

    if (event.key == "Home") {
      next = 0;
    } else if (event.key == "End") {
      next = choices.length - 1;
    }

    choices[next].focus();
  }
}

customElements.define("calendar-event-category-row", CalendarEventCategoryRow);
