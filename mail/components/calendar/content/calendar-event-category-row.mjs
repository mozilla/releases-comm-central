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
 * Add category opens a menu for choosing or entering category names.
 *
 * The row observes and updates the draft for the session bound by the dialog.
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
   * The Add category button that opens the menu.
   *
   * @type {HTMLButtonElement}
   */
  #addButton;

  /**
   * The popup menu for choosing or adding categories.
   *
   * @type {XULPopupElement}
   */
  #menu;

  /**
   * The text field for entering a new category name.
   *
   * @type {HTMLInputElement}
   */
  #nameInput;

  connectedCallback() {
    super.connectedCallback();

    if (!this.hasConnected) {
      this.hasConnected = true;
      this.#addButton = this.querySelector(".calendar-event-add-category");
      this.#menu = this.querySelector(".calendar-event-category-choices");
      this.#nameInput = this.#menu.querySelector(
        ".calendar-category-name-input"
      );

      this.addEventListener("click", this);
      this.#menu.addEventListener("command", this);
      this.#menu.addEventListener("popupshowing", this);
      this.#menu.addEventListener("popupshown", this);
      this.#menu.addEventListener("popuphidden", this);
      this.#nameInput.addEventListener("keydown", this);
      this.#nameInput.addEventListener("focus", this);
      this.#nameInput.addEventListener("blur", this);
    }

    // Apply values received while the row was outside the document.
    this.#renderComplete = this.#renderCategories();
  }

  disconnectedCallback() {
    this.#menu.hidePopup();
    this.#resetMenu();

    // Ignore any translation that finishes after the row is removed.
    this.#renderId++;
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        this.#handleClick(event);
        break;
      case "command": {
        const categoryName = event.target.dataset.category;

        if (categoryName && this.#categoryState) {
          const isSelected =
            this.#categoryState.categories.includes(categoryName);

          this.#changeCategory(categoryName, !isSelected);
        }
        break;
      }
      case "popupshowing":
        this.#renderMenu(this.#categoryState);
        break;
      case "popupshown":
        this.#addButton.setAttribute("aria-expanded", "true");
        this.#nameInput.focus();
        break;
      case "popuphidden":
        this.#resetMenu();
        break;
      case "keydown":
        this.#handleNameKey(event);
        break;
      case "focus": {
        const menu = this.#menu;
        const activeItem = menu.querySelector("menuitem[_moz-menuactive]");

        menu.setAttribute("ignorekeys", "true");
        // Gecko clears the active item on mouseout so arrow keys can start over.
        activeItem?.dispatchEvent(new MouseEvent("mouseout"));
        break;
      }
      case "blur":
        this.#menu.removeAttribute("ignorekeys");
        break;
    }
  }

  /**
   * Opens the category menu or removes a selected category.
   *
   * @param {MouseEvent} event - The click on the row.
   */
  #handleClick(event) {
    if (event.target === this.#addButton && !this.#addButton.disabled) {
      const addButton = this.#addButton;

      this.#menu.style.minInlineSize = `${addButton.parentElement.clientWidth}px`;
      addButton.focus();

      this.#menu.openPopup(addButton, {
        position: "after_start",
        triggerEvent: event,
      });

      return;
    }

    const remove = event.target.closest(".calendar-event-remove-category");

    if (remove) {
      this.#changeCategory(
        remove.closest("[data-category]").dataset.category,
        false
      );
    }
  }

  /**
   * Adds a typed name or moves keyboard focus from the field to the menu.
   *
   * @param {KeyboardEvent} event - The key pressed in the category name field.
   */
  #handleNameKey(event) {
    if (event.isComposing) {
      return;
    }

    const input = this.#nameInput;

    switch (event.key) {
      case "Tab":
      case "ArrowUp":
      case "ArrowDown": {
        event.preventDefault();

        if (!this.#menu.querySelector("menuitem")) {
          if (event.key == "Tab") {
            this.#menu.hidePopup();
          }
          break;
        }

        input.blur();

        // Home and End go to the menu edges even if an item is highlighted.
        const keyCode =
          event.key == "ArrowUp"
            ? KeyboardEvent.DOM_VK_END
            : KeyboardEvent.DOM_VK_HOME;

        this.#menu.dispatchEvent(new KeyboardEvent("keydown", { keyCode }));
        break;
      }
      case "Escape":
        event.preventDefault();

        if (input.value) {
          input.value = "";
        } else {
          this.#menu.hidePopup();
        }
        break;
      case "Enter": {
        event.preventDefault();

        const categoryName = input.value.trim();

        if (categoryName) {
          this.#changeCategory(categoryName, true);
          this.#menu.hidePopup();
        }
        break;
      }
    }
  }

  /**
   * Clears typed text and returns focus to Add category when the menu closes.
   */
  #resetMenu() {
    const focused = document.activeElement;
    const addButton = this.#addButton;

    this.#nameInput.value = "";
    this.#menu.removeAttribute("ignorekeys");
    addButton.setAttribute("aria-expanded", "false");

    if (
      this.closest("dialog")?.open &&
      !addButton.disabled &&
      (focused === this.#nameInput || focused === document.body)
    ) {
      addButton.focus();
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
   * Removes controls from the previous route and discards pending renders.
   */
  #clear() {
    this.#renderId++;
    this.#renderComplete = Promise.resolve();

    this.#menu.hidePopup();
    this.#nameInput.disabled = true;
    this.#clearMenuItems();
    this.querySelector(".calendar-event-category-list").replaceChildren();

    // A retained button must not open the menu for a different event.
    const oldAddButton = this.#addButton;
    const addButton = oldAddButton.cloneNode(true);

    addButton.disabled = true;
    oldAddButton.replaceWith(addButton);
    this.#addButton = addButton;
    this.#resetMenu();
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
   * Disables category controls during Save and closes any open category menu.
   * Moves focus to the dialog if a focused category button becomes disabled.
   */
  #renderDisabled() {
    const isDisabled = this.#categoryState.disabled;
    const dialog = this.closest("dialog");
    const focused = document.activeElement;
    const moveFocus = isDisabled && dialog?.open && this.contains(focused);

    for (const button of this.querySelectorAll(
      ".calendar-event-remove-category"
    )) {
      button.disabled = isDisabled;
    }

    for (const item of this.#menu.querySelectorAll("menuitem")) {
      item.disabled = isDisabled;
    }

    this.#addButton.disabled =
      isDisabled ||
      !this.#categoryState.hasDraft ||
      !this.#categoryState.options;
    this.#nameInput.disabled = this.#addButton.disabled;

    if (isDisabled) {
      this.#menu.hidePopup();
    }

    if (moveFocus) {
      dialog.focus();
    }
  }

  /**
   * Updates menu choices, then translates and inserts the selected chips.
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
    const list = this.querySelector(".calendar-event-category-list");
    const focused = document.activeElement;
    const focusedChip = focused?.closest(".calendar-event-category-chip");
    const previousIndex = [...list.children].indexOf(focusedChip);

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

      document.l10n.setAttributes(button, "calendar-event-remove-category", {
        category: categoryName,
      });

      return chip;
    });

    // Gecko needs the activated item to stay in the menu until the menu closes.
    // Update an open menu from the current draft the next time it opens.
    if (this.#menu.state == "closed") {
      this.#renderMenu(state);
    }

    this.#renderDisabled();

    fragment.append(...chips);
    await document.l10n.translateFragment(fragment);

    if (!this.isConnected || renderId !== this.#renderId) {
      return;
    }

    const restoreFocus =
      previousIndex != -1 &&
      this.closest("dialog")?.open &&
      focused === document.activeElement;

    list.replaceChildren(fragment);
    this.#renderDisabled();

    if (!restoreFocus) {
      return;
    }

    // Focus the same category after a render. If it was removed, use the
    // category at its old position, or the last category.
    const currentIndex = names.indexOf(focusedChip.dataset.category);
    const index =
      currentIndex == -1
        ? Math.min(previousIndex, chips.length - 1)
        : currentIndex;
    const button = chips[index]?.querySelector("button") ?? this.#addButton;

    button.focus();
  }

  /**
   * Builds the checkbox menu from the current event draft.
   *
   * @param {CalendarEventCategoryViewModel} state - The category options and
   *   selected names.
   */
  #renderMenu(state) {
    const selected = new Set(state.categories);
    const colorsByName = new Map(
      state.options.map(option => [option.name, option.color])
    );

    // Include saved names that can be removed but no longer exist in preferences.
    const names = [...new Set([...colorsByName.keys(), ...selected])];
    names.sort(new Intl.Collator().compare);

    const items = names.map(categoryName => {
      const item = document.createXULElement("menuitem");
      const color =
        colorsByName.get(categoryName) ?? getCategoryOption(categoryName).color;

      item.classList.add("menuitem-iconic", "calendar-category");
      item.dataset.category = categoryName;
      item.setAttribute("label", categoryName);
      item.setAttribute("type", "checkbox");
      item.setAttribute("autocheck", "false");
      item.toggleAttribute("checked", selected.has(categoryName));
      item.style.setProperty("--item-color", color || "transparent");

      return item;
    });

    this.#clearMenuItems();
    this.#menu.append(...items);
  }

  /**
   * Removes the choices and keeps the name field and separator.
   */
  #clearMenuItems() {
    for (const item of this.#menu.querySelectorAll("menuitem")) {
      item.remove();
    }
  }
}

customElements.define("calendar-event-category-row", CalendarEventCategoryRow);
