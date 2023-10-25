/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/search-bar.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-palette.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-target.mjs"; // eslint-disable-line import/no-unassigned-import
import {
  BUTTON_STYLE_MAP,
  BUTTON_STYLE_PREF,
} from "resource:///modules/ButtonStyle.mjs";

const { getDefaultItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

/**
 * Template ID: unifiedToolbarCustomizationPaneTemplate
 * Attributes:
 * - space: Identifier of the space this pane is for. Changes are not observed.
 * - current-items: Currently used items in this space.
 * - builtin-space: Boolean indicating if the space is a built in space (true) or an
 *   extension provided space (false).
 */
class UnifiedToolbarCustomizationPane extends HTMLElement {
  /**
   * Reference to the customization target for the main toolbar area.
   *
   * @type {CustomizationTarget?}
   */
  #toolbarTarget = null;

  /**
   * Reference to the title of the space specific palette.
   *
   * @type {?HTMLHeadingElement}
   */
  #spaceSpecificTitle = null;

  /**
   * Reference to the palette for items only available in the current space.
   *
   * @type {?CustomizationPalette}
   */
  #spaceSpecificPalette = null;

  /**
   * Reference to the palette for items available in all spaces.
   *
   * @type {?CustomizationPalette}
   */
  #genericPalette = null;

  /**
   * List of the item IDs that are in the toolbar by default in this area.
   *
   * @type {string[]}
   */
  #defaultItemIds = [];

  /**
   * The search bar used to filter the items in the palettes.
   *
   * @type {?SearchBar}
   */
  #searchBar = null;

  connectedCallback() {
    if (this.shadowRoot) {
      document.l10n.connectRoot(this.shadowRoot);
      return;
    }
    this.setAttribute("role", "tabpanel");
    const shadowRoot = this.attachShadow({ mode: "open" });
    document.l10n.connectRoot(shadowRoot);

    const space = this.getAttribute("space");

    const template = document
      .getElementById("unifiedToolbarCustomizationPaneTemplate")
      .content.cloneNode(true);
    const styles = document.createElement("link");
    styles.setAttribute("rel", "stylesheet");
    styles.setAttribute(
      "href",
      "chrome://messenger/skin/shared/unifiedToolbarCustomizationPane.css"
    );

    this.#toolbarTarget = template.querySelector(".toolbar-target");
    this.#toolbarTarget.setAttribute("space", space);

    this.#spaceSpecificTitle = template.querySelector(".space-specific-title");
    document.l10n.setAttributes(
      this.#spaceSpecificTitle,
      this.hasAttribute("builtin-space")
        ? `customize-palette-${space}-specific-title`
        : "customize-palette-extension-specific-title"
    );
    this.#spaceSpecificTitle.id = `${space}PaletteTitle`;
    this.#spaceSpecificPalette = template.querySelector(
      ".space-specific-palette"
    );
    this.#spaceSpecificPalette.id = `${space}Palette`;
    this.#spaceSpecificPalette.setAttribute(
      "aria-labelledby",
      this.#spaceSpecificTitle.id
    );
    this.#spaceSpecificPalette.setAttribute("space", space);
    const genericTitle = template.querySelector(".generic-palette-title");
    genericTitle.id = `${space}GenericPaletteTitle`;
    this.#genericPalette = template.querySelector(".generic-palette");
    this.#genericPalette.id = `${space}GenericPalette`;
    this.#genericPalette.setAttribute("aria-labelledby", genericTitle.id);

    this.#searchBar = template.querySelector("search-bar");
    this.#searchBar.addEventListener("search", this.#handleSearch);
    this.#searchBar.addEventListener("autocomplete", this.#handleFilter);

    this.initialize();

    shadowRoot.append(styles, template);

    this.addEventListener("dragover", this.#handleDragover);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  #handleFilter = event => {
    this.#spaceSpecificPalette.filterItems(event.detail);
    this.#genericPalette.filterItems(event.detail);
  };

  #handleSearch = event => {
    // Don't clear the search bar.
    event.preventDefault();
  };

  /**
   * Default handler to indicate nothing can be dropped in the customization,
   * except for the dragging and dropping in the palettes and targets.
   *
   * @param {DragEvent} event - Drag over event.
   */
  #handleDragover = event => {
    event.dataTransfer.dropEffect = "none";
    event.preventDefault();
  };

  /**
   * Initialize the contents of this element from the state. The relevant state
   * for this element are the items currently in the toolbar for this space.
   *
   * @param {boolean} [deep = false] - If true calls initialize on all the
   *   targets and palettes.
   */
  initialize(deep = false) {
    const space = this.getAttribute("space");
    this.#defaultItemIds = getDefaultItemIdsForSpace(space);
    const currentItems = this.hasAttribute("current-items")
      ? this.getAttribute("current-items")
      : this.#defaultItemIds.join(",");
    this.#toolbarTarget.setAttribute("current-items", currentItems);
    this.#spaceSpecificPalette.setAttribute("items-in-use", currentItems);
    this.#genericPalette.setAttribute("items-in-use", currentItems);

    if (deep) {
      this.#searchBar.reset();
      this.#toolbarTarget.initialize();
      this.#spaceSpecificPalette.initialize();
      this.#genericPalette.initialize();
      this.#spaceSpecificTitle.hidden = this.#spaceSpecificPalette.isEmpty;
      this.#spaceSpecificPalette.hidden = this.#spaceSpecificPalette.isEmpty;
    }

    this.updateButtonStyle(
      BUTTON_STYLE_MAP[Services.prefs.getIntPref(BUTTON_STYLE_PREF, 0)]
    );
  }

  /**
   * Reset the items in the targets to the defaults.
   */
  reset() {
    this.#toolbarTarget.setItems(this.#defaultItemIds);
    this.#spaceSpecificPalette.setItems(this.#defaultItemIds);
    this.#genericPalette.setItems(this.#defaultItemIds);
  }

  /**
   * Add an item to the default target in this space. Can only add items that
   * are available in all spaces.
   *
   * @param {string} itemId - Item ID of the item to add to the default target.
   */
  addItem(itemId) {
    this.#genericPalette.addItemById(itemId);
  }

  /**
   * Remove an item from all targets in this space.
   *
   * @param {string} itemId - Item ID of the item to remove from this pane's
   *   targets.
   */
  removeItem(itemId) {
    this.#toolbarTarget.removeItemById(itemId);
  }

  /**
   * Check if an item is currently in a target in this pane.
   *
   * @param {string} itemId - Item ID of the item to check for.
   * @returns {boolean} If the item is currently used in this pane.
   */
  hasItem(itemId) {
    return Boolean(this.#toolbarTarget.hasItem(itemId));
  }

  /**
   * If the customization state of this space matches its default state.
   *
   * @type {boolean}
   */
  get matchesDefaultState() {
    const itemsInToolbar = this.#toolbarTarget.itemIds;
    return itemsInToolbar.join(",") === this.#defaultItemIds.join(",");
  }

  /**
   * If the customization state of this space matches the currently saved
   * configuration.
   *
   * @type {boolean}
   */
  get hasChanges() {
    return this.#toolbarTarget.hasChanges;
  }

  /**
   * Current customization state for this space.
   *
   * @type {string[]}
   */
  get itemIds() {
    return this.#toolbarTarget.itemIds;
  }

  /**
   * Update the class of the toolbar preview to reflect the selected button
   * style.
   *
   * @param {string} value - The class to apply.
   */
  updateButtonStyle(value) {
    this.#toolbarTarget.classList.remove(...BUTTON_STYLE_MAP);
    this.#toolbarTarget.classList.add(value);
  }
}
customElements.define(
  "unified-toolbar-customization-pane",
  UnifiedToolbarCustomizationPane
);
