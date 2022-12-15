/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import ListBoxSelection from "./list-box-selection.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Customization target where items can be placed, rearranged and removed.
 * Attributes:
 * - aria-label: Name of the target area.
 * - current-items: Comma separated item IDs currently in this area. When
 *   changed initialize should be called.
 * Events:
 * - itemchange: Fired whenever the items inside the toolbar are added, moved or
 *   removed.
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
    this.replaceChildren(
      ...itemIds.map(itemId => {
        const element = document.createElement("li", {
          is: "customizable-element",
        });
        element.setAttribute("item-id", itemId);
        element.setAttribute("disabled", "disabled");
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
    document.getElementById("customizationTargetBackward").disabled =
      this.contextMenuFor === this.firstElementChild;
    document.getElementById("customizationTargetForward").disabled =
      this.contextMenuFor === this.lastElementChild;
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

  moveItemForward(...args) {
    super.moveItemForward(...args);
    this.#onChange();
  }

  moveItemBackward(...args) {
    super.moveItemBackward(...args);
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
    item.setAttribute("disabled", "disabled");
    this.append(item);
    this.#onChange();
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
