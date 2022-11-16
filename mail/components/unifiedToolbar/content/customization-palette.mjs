/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import ListBoxSelection from "./list-box-selection.mjs";

/**
 * Customization palette containing items that can be added to a customization
 * target.
 * Attributes:
 * - space: ID of the space the widgets are for. "all" for space agnostic
 *   widgets.
 */
class CustomizationPalette extends ListBoxSelection {
  contextMenuId = "customizationPaletteMenu";

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
    menu.replaceChildren(...menuItems);
    this.initializeContextMenu(event);
  };

  /**
   * Generate a context menu item event handler that will add the right clicked
   * item to the target.
   *
   * @param {CustomizationTarget} target
   * @returns {function} Context menu item event handler curried with the given
   *   target.
   */
  #makeAddToTargetHandler(target) {
    return () => {
      if (this.contextMenuFor) {
        this.primaryAction(this.contextMenuFor, target);
      }
    };
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
    if (super.primaryAction(item)) {
      return;
    }
    if (!target) {
      target = this.getRootNode().querySelector('[is="customization-target"]');
    }
    target.addItem(item);
  }

  /**
   * Returns the item to this palette from some other place.
   *
   * @param {CustomizableElement} item - Item to return to this palette.
   */
  returnItem(item) {
    //TODO items should probably be sorted by something like a label.
    this.append(item);
  }
}
customElements.define("customization-palette", CustomizationPalette, {
  extends: "ul",
});
