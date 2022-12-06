/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./search-bar.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-palette.mjs"; // eslint-disable-line import/no-unassigned-import
import "./customization-target.mjs"; // eslint-disable-line import/no-unassigned-import
import { getDefaultItemIdsForSpace } from "resource:///modules/CustomizableItems.mjs";

/**
 * Template ID: unifiedToolbarCustomizationPaneTemplate
 * Attributes:
 * - space: Identifier of the space this pane is for. Changes are not observed.
 */
class UnifiedToolbarCustomizationPane extends HTMLElement {
  /**
   * Reference to the customization target for the main toolbar area.
   *
   * @type {CustomizationTarget?}
   */
  #toolbarTarget = null;

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

    const spaceSpecificTitle = template.querySelector(".space-specific-title");
    document.l10n.setAttributes(
      spaceSpecificTitle,
      `customize-palette-${space}-specific-title`
    );
    spaceSpecificTitle.id = `${space}PaletteTitle`;
    this.#spaceSpecificPalette = template.querySelector(
      ".space-specific-palette"
    );
    this.#spaceSpecificPalette.id = `${space}Palette`;
    this.#spaceSpecificPalette.setAttribute(
      "aria-labelledby",
      spaceSpecificTitle.id
    );
    this.#spaceSpecificPalette.setAttribute("space", space);
    // TODO hide space specific palette if there are no items in it (probably
    // fairly likely for extension spaces, hard to tell for the rest of the app)
    const genericTitle = template.querySelector(".generic-palette-title");
    genericTitle.id = `${space}GenericPaletteTitle`;
    this.#genericPalette = template.querySelector(".generic-palette");
    this.#genericPalette.id = `${space}GenericPalette`;
    this.#genericPalette.setAttribute("aria-labelledby", genericTitle.id);
    this.initialize();

    shadowRoot.append(styles, template);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

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
    const currentItems = this.#defaultItemIds.join(",");
    this.#toolbarTarget.setAttribute("current-items", currentItems);
    this.#spaceSpecificPalette.setAttribute("items-in-use", currentItems);
    this.#genericPalette.setAttribute("items-in-use", currentItems);

    if (deep) {
      this.#toolbarTarget.initialize();
      this.#spaceSpecificPalette.initialize();
      this.#genericPalette.initialize();
    }
  }

  /**
   * Reset the items in the targets to the defaults.
   */
  reset() {
    this.initialize(true);
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
}
customElements.define(
  "unified-toolbar-customization-pane",
  UnifiedToolbarCustomizationPane
);
