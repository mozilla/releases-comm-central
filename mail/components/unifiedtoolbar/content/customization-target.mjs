/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import ListBoxSelection from "./list-box-selection.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

const { getAvailableItemIdsForSpace } = ChromeUtils.importESModule(
  "resource:///modules/CustomizableItems.sys.mjs"
);

/**
 * Customization target where items can be placed, rearranged and removed.
 *
 * @tagname customization-target
 * @attribute {string} aria-label - Name of the target area.
 * @attribute {string} current-items - Comma separated item IDs currently in this area. When
 *   changed initialize should be called.
 * @fires itemchange - Fired whenever the items inside the toolbar are added, moved or
 *   removed.
 * @fires space - The space this target is in.
 */
class CustomizationTarget extends ListBoxSelection {
  contextMenuId = "customizationTargetMenu";
  actionKey = "Delete";
  canMoveItems = true;

  connectedCallback() {
    if (super.connectedCallback()) {
      return;
    }

    document
      .getElementById("customizationTargetForward")
      .addEventListener("command", this.#handleMenuForward);
    document
      .getElementById("customizationTargetBackward")
      .addEventListener("command", this.#handleMenuBackward);
    document
      .getElementById("customizationTargetRemove")
      .addEventListener("command", this.#handleMenuRemove);
    document
      .getElementById("customizationTargetRemoveEverywhere")
      .addEventListener("command", this.#handleMenuRemoveEverywhere);
    document
      .getElementById("customizationTargetAddEverywhere")
      .addEventListener("command", this.#handleMenuAddEverywhere);
    document
      .getElementById("customizationTargetStart")
      .addEventListener("command", this.#handleMenuStart);
    document
      .getElementById("customizationTargetEnd")
      .addEventListener("command", this.#handleMenuEnd);

    this.initialize();
  }

  /**
   * Initialize the contents of the target from the current state. The relevant
   * state is passed in via the current-items attribute.
   */
  initialize() {
    const itemIds = this.getAttribute("current-items").split(",");
    this.setItems(itemIds);
  }

  /**
   * Update the items in the target from an array of item IDs.
   *
   * @param {string[]} itemIds - ordered array of IDs of the items currently in
   *   the target
   */
  setItems(itemIds) {
    const childCount = this.children.length;
    const availableItems = getAvailableItemIdsForSpace(
      this.getAttribute("space"),
      true
    );
    this.replaceChildren(
      ...itemIds.map(itemId => {
        const element = document.createElement("li", {
          is: "customizable-element",
        });
        element.setAttribute("item-id", itemId);
        element.setAttribute("disabled", "disabled");
        element.classList.toggle("collapsed", !availableItems.includes(itemId));
        element.draggable = true;
        return element;
      })
    );
    if (childCount) {
      this.#onChange();
    }
  }

  /**
   * Human-readable name of the customization target area.
   *
   * @type {string}
   */
  get name() {
    return this.getAttribute("aria-label");
  }

  handleContextMenu = event => {
    this.initializeContextMenu(event);
    const notForAllSpaces = !this.contextMenuFor.allSpaces;
    const removeEverywhereItem = document.getElementById(
      "customizationTargetRemoveEverywhere"
    );
    const addEverywhereItem = document.getElementById(
      "customizationTargetAddEverywhere"
    );
    addEverywhereItem.setAttribute("hidden", notForAllSpaces.toString());
    removeEverywhereItem.setAttribute("hidden", notForAllSpaces.toString());
    if (!notForAllSpaces) {
      const customization = this.getRootNode().host.closest(
        "unified-toolbar-customization"
      );
      const itemId = this.contextMenuFor.getAttribute("item-id");
      addEverywhereItem.disabled =
        !this.contextMenuFor.allowMultiple &&
        customization.activeInAllSpaces(itemId);
      removeEverywhereItem.disabled =
        this.contextMenuFor.allowMultiple ||
        !customization.activeInMultipleSpaces(itemId);
    }
    const isFirstElement = this.contextMenuFor === this.firstElementChild;
    const isLastElement = this.contextMenuFor === this.lastElementChild;
    document.getElementById("customizationTargetBackward").disabled =
      isFirstElement;
    document.getElementById("customizationTargetForward").disabled =
      isLastElement;
    document.getElementById("customizationTargetStart").disabled =
      isFirstElement;
    document.getElementById("customizationTargetEnd").disabled = isLastElement;
  };

  /**
   * Event handler when the context menu item to move the item forward is
   * selected.
   */
  #handleMenuForward = () => {
    if (this.contextMenuFor) {
      this.moveItemForward(this.contextMenuFor);
    }
  };

  /**
   * Event handler when the context menu item to move the item backward is
   * selected.
   */
  #handleMenuBackward = () => {
    if (this.contextMenuFor) {
      this.moveItemBackward(this.contextMenuFor);
    }
  };

  /**
   * Event handler when the context menu item to remove the item is selected.
   */
  #handleMenuRemove = () => {
    if (this.contextMenuFor) {
      this.primaryAction(this.contextMenuFor);
    }
  };

  #handleMenuRemoveEverywhere = () => {
    if (this.contextMenuFor) {
      this.primaryAction(this.contextMenuFor);
      this.dispatchEvent(
        new CustomEvent("removeitem", {
          detail: {
            itemId: this.contextMenuFor.getAttribute("item-id"),
          },
          bubbles: true,
          composed: true,
        })
      );
    }
  };

  #handleMenuAddEverywhere = () => {
    if (this.contextMenuFor) {
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

  #handleMenuStart = () => {
    if (this.contextMenuFor) {
      this.moveItemToStart(this.contextMenuFor);
    }
  };

  #handleMenuEnd = () => {
    if (this.contextMenuFor) {
      this.moveItemToEnd(this.contextMenuFor);
    }
  };

  /**
   * Emit a change event. Should be called whenever items are added, moved or
   * removed from the target.
   */
  #onChange() {
    const changeEvent = new Event("itemchange", {
      bubbles: true,
      // Make sure this bubbles out of the pane shadow root.
      composed: true,
    });
    this.dispatchEvent(changeEvent);
  }

  /**
   * Adopt an item from another list into this one.
   *
   * @param {?CustomizableElement} item - Item from another list.
   */
  #adoptItem(item) {
    item?.setAttribute("disabled", "disabled");
  }

  moveItemForward(...args) {
    super.moveItemForward(...args);
    this.#onChange();
  }

  moveItemBackward(...args) {
    super.moveItemBackward(...args);
    this.#onChange();
  }

  moveItemToStart(...args) {
    super.moveItemToStart(...args);
    this.#onChange();
  }

  moveItemToEnd(...args) {
    super.moveItemToEnd(...args);
    this.#onChange();
  }

  handleDrop(itemId, sibling, afterSibling) {
    const item = super.handleDrop(itemId, sibling, afterSibling);
    if (item) {
      this.#adoptItem(item);
      this.#onChange();
    }
  }

  handleDragSuccess(item) {
    super.handleDragSuccess(item);
    this.#onChange();
  }

  /**
   * Return the item to its palette, removing it from this target.
   *
   * @param {CustomizableElement} item - The item to remove.
   */
  primaryAction(item) {
    if (super.primaryAction(item)) {
      return;
    }
    item.palette.returnItem(item);
    this.#onChange();
  }

  /**
   * Add an item to the end of this customization target.
   *
   * @param {CustomizableElement} item - The item to add.
   */
  addItem(item) {
    if (!item) {
      return;
    }
    this.#adoptItem(item);
    this.append(item);
    this.#onChange();
  }

  removeItemById(itemId) {
    const item = this.querySelector(`[item-id="${itemId}"]`);
    if (!item) {
      return;
    }
    this.primaryAction(item);
  }

  /**
   * Check if an item is currently used in this target.
   *
   * @param {string} itemId - Item ID of the item to check for.
   * @returns {boolean} If the item is currently used in this target.
   */
  hasItem(itemId) {
    return Boolean(this.querySelector(`[item-id="${itemId}"]`));
  }

  /**
   * IDs of the items currently in this target, in correct order including
   * duplicates.
   *
   * @type {string[]}
   */
  get itemIds() {
    return Array.from(this.children, element =>
      element.getAttribute("item-id")
    );
  }

  /**
   * If the contents of this target differ from the currently saved
   * configuration.
   *
   * @type {boolean}
   */
  get hasChanges() {
    return this.itemIds.join(",") !== this.getAttribute("current-items");
  }
}
customElements.define("customization-target", CustomizationTarget, {
  extends: "ul",
});
