/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import ListBoxSelection from "./list-box-selection.mjs";

/**
 * Customization target where items can be placed, rearranged and removed.
 * Attributes:
 * - aria-label: Name of the target area.
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
   * Return the item to its palette, removing it from this target.
   *
   * @param {CustomizableElement} item - The item to remove.
   */
  primaryAction(item) {
    if (super.primaryAction(item)) {
      return;
    }
    item.palette.returnItem(item);
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
    this.append(item);
  }
}
customElements.define("customization-target", CustomizationTarget, {
  extends: "ul",
});
