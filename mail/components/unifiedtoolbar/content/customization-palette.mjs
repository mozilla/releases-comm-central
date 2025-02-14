/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import ListBoxSelection from "./list-box-selection.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

const { getAvailableItemIdsForSpace, MULTIPLE_ALLOWED_ITEM_IDS } =
  ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");

/**
 * Customization palette containing items that can be added to a customization
 * target.
 *
 * @tagname customization-palette
 * @attribute {string} space - ID of the space the widgets are for. "all" for space agnostic
 *   widgets. Not observed.
 * @attribute {string} items-in-use - Comma-separated IDs of items that are in a target at the time
 *   this is initialized. When changed, initialize should be called.
 */
class CustomizationPalette extends ListBoxSelection {
  contextMenuId = "customizationPaletteMenu";

  /**
   * If this palette contains items (even if those items are currently all in a
   * target).
   *
   * @type {boolean}
   */
  isEmpty = false;

  /**
   * Array of item IDs allowed to be in this palette.
   *
   * @type {string[]}
   */
  #allAvailableItems = [];

  /**
   * If this palette contains items that can be added to all spaces.
   *
   * @type {boolean}
   */
  #allSpaces = false;

  connectedCallback() {
    if (super.connectedCallback()) {
      return;
    }

    this.#allSpaces = this.getAttribute("space") === "all";

    if (this.#allSpaces) {
      document
        .getElementById("customizationPaletteAddEverywhere")
        .addEventListener("command", this.#handleMenuAddEverywhere);
    }

    this.initialize();
  }

  /**
   * Initializes the contents of the palette from the current state. The
   * relevant state is defined by the space and items-in-use attributes.
   */
  initialize() {
    const itemIds = this.getAttribute("items-in-use").split(",");
    this.setItems(itemIds);
  }

  /**
   * Update the items currently removed from the palette with an array of item
   * IDs.
   *
   * @param {string[]} itemIds - Array of item IDs currently being used in a
   *   target.
   */
  setItems(itemIds) {
    let space = this.getAttribute("space");
    if (space === "all") {
      space = undefined;
    }
    const itemsInUse = new Set(itemIds);
    this.#allAvailableItems = getAvailableItemIdsForSpace(space);
    this.isEmpty = !this.#allAvailableItems.length;
    const items = this.#allAvailableItems.filter(
      itemId => !itemsInUse.has(itemId) || MULTIPLE_ALLOWED_ITEM_IDS.has(itemId)
    );
    this.replaceChildren(
      ...items.map(itemId => {
        const element = document.createElement("li", {
          is: "customizable-element",
        });
        element.setAttribute("item-id", itemId);
        element.draggable = true;
        return element;
      })
    );
  }

  /**
   * Overwritten context menu handler. Before showing the menu, initializes the
   * menu with items for all the target areas available.
   *
   * @param {MouseEvent} event
   */
  handleContextMenu = event => {
    const menu = document.getElementById(this.contextMenuId);
    const targets = this.getRootNode().querySelectorAll(
      '[is="customization-target"]'
    );
    const addEverywhereItem = document.getElementById(
      "customizationPaletteAddEverywhere"
    );
    addEverywhereItem.setAttribute("hidden", (!this.#allSpaces).toString());
    const menuItems = Array.from(targets, target => {
      const menuItem = document.createXULElement("menuitem");
      document.l10n.setAttributes(menuItem, "customize-palette-add-to", {
        target: target.name,
      });
      menuItem.addEventListener(
        "command",
        this.#makeAddToTargetHandler(target)
      );
      return menuItem;
    });
    menuItems.push(addEverywhereItem);
    menu.replaceChildren(...menuItems);
    this.initializeContextMenu(event);
  };

  #handleMenuAddEverywhere = () => {
    if (this.contextMenuFor) {
      this.primaryAction(this.contextMenuFor);
      this.dispatchEvent(
        new CustomEvent("additem", {
          detail: {
            itemId: this.contextMenuFor.getAttribute("item-id"),
          },
          bubbles: true,
          composed: true,
        })
      );
    }
  };

  /**
   * Generate a context menu item event handler that will add the right clicked
   * item to the target.
   *
   * @param {CustomizationTarget} target
   * @returns {Function} Context menu item event handler curried with the given
   *   target.
   */
  #makeAddToTargetHandler(target) {
    return () => {
      if (this.contextMenuFor) {
        this.primaryAction(this.contextMenuFor, target);
      }
    };
  }

  handleDragSuccess(item) {
    if (item.allowMultiple) {
      return;
    }
    super.handleDragSuccess(item);
  }

  handleDrop(itemId, sibling, afterSibling) {
    if (this.querySelector(`li[item-id="${itemId}"]`)?.allowMultiple) {
      return;
    }
    super.handleDrop(itemId, sibling, afterSibling);
  }

  canAddElement(itemId) {
    return (
      this.#allAvailableItems.includes(itemId) &&
      (super.canAddElement(itemId) ||
        this.querySelector(`li[item-id="${itemId}"]`).allowMultiple)
    );
  }

  /**
   * The primary action for the palette is to add the item to a customization
   * target. Will pick the first target if none is provided.
   *
   * @param {CustomizableElement} item - Item to move to a target.
   * @param {CustomizationTarget} [target] - The target to move the item to.
   *   Defaults to the first target in the root.
   */
  primaryAction(item, target) {
    if (!target) {
      target = this.getRootNode().querySelector('[is="customization-target"]');
    }
    if (item?.allowMultiple) {
      target.addItem(item.cloneNode(true));
      return;
    }
    if (super.primaryAction(item)) {
      return;
    }
    target.addItem(item);
  }

  /**
   * Returns the item to this palette from some other place.
   *
   * @param {CustomizableElement} item - Item to return to this palette.
   */
  returnItem(item) {
    if (item.allowMultiple) {
      item.remove();
      return;
    }
    this.append(item);
  }

  /**
   * Filter the items in the palette for the given string based on their label.
   * The comparison is done on the lower cased label, and the filter string is
   * lower cased as well.
   *
   * @param {string} filterString - String to filter the items by.
   */
  filterItems(filterString) {
    const lowerFilterString = filterString.toLowerCase();
    for (const item of this.children) {
      item.hidden = !item.label.toLowerCase().includes(lowerFilterString);
    }
  }

  addItemById(itemId) {
    const item = this.querySelector(`[item-id="${itemId}"]`);
    if (!item) {
      return;
    }
    this.primaryAction(item);
  }
}
customElements.define("customization-palette", CustomizationPalette, {
  extends: "ul",
});
