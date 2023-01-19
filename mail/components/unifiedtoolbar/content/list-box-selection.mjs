/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Shared implementation for a list box used as both a palette of items to add
 * to a toolbar and a toolbar of items.
 */
export default class ListBoxSelection extends HTMLUListElement {
  /**
   * The currently selected item for keyboard operations.
   *
   * @type {?CustomizableElement}
   */
  selectedItem = null;

  /**
   * The item the context menu is opened for.
   *
   * @type {?CustomizableElement}
   */
  contextMenuFor = null;

  /**
   * Key name the primary action is executed on.
   *
   * @type {string}
   */
  actionKey = "Enter";

  /**
   * The ID of the menu to show as context menu.
   *
   * @type {string}
   */
  contextMenuId = "";

  /**
   * If items can be reordered in this list box.
   *
   * @type {boolean}
   */
  canMoveItems = false;

  /**
   * @returns {boolean} If the widget has connected previously.
   */
  connectedCallback() {
    if (this.hasConnected) {
      return true;
    }
    this.hasConnected = true;

    this.setAttribute("role", "listbox");
    this.setAttribute("tabindex", "0");

    this.addEventListener("contextmenu", this.handleContextMenu, {
      capture: true,
    });
    document
      .getElementById(this.contextMenuId)
      .addEventListener("popuphiding", this.#handleContextMenuClose);
    this.addEventListener("keydown", this.#handleKey, { capture: true });
    this.addEventListener("click", this.#handleClick, { capture: true });
    this.addEventListener("focus", this.#handleFocus);
    return false;
  }

  /**
   * Default context menu event handler. Simply forwards the call to
   * initializeContextMenu.
   *
   * @param {MouseEvent} event - The contextmenu mouse click event.
   */
  handleContextMenu = event => {
    this.initializeContextMenu(event);
  };

  /**
   * Store the clicked item and open the context menu.
   *
   * @param {MouseEvent} event - The contextmenu mouse click event.
   */
  initializeContextMenu(event) {
    // If the context menu was opened by keyboard, we already have the item.
    if (!this.contextMenuFor) {
      this.contextMenuFor = event.target.closest("li");
      this.#clearSelection();
    }
    document
      .getElementById(this.contextMenuId)
      .openPopupAtScreen(event.screenX, event.screenY, true);
  }

  /**
   * Discard the reference to the item the context menu is triggered on when the
   * menu is closed.
   */
  #handleContextMenuClose = () => {
    this.contextMenuFor = null;
  };

  /**
   * Make sure some element is selected when focus enters the element.
   */
  #handleFocus = () => {
    if (!this.selectedItem) {
      this.selectItem(this.firstElementChild);
    }
  };

  /**
   * Handles basic list box keyboard interactions.
   *
   * @param {KeyboardEvent} event - The event for the key down.
   */
  #handleKey = event => {
    // Clicking into the list might clear the selection while retaining focus,
    // so we need to make sure we have a selected item here.
    if (!this.selectedItem) {
      this.selectItem(this.firstElementChild);
    }
    const rightIsForward = document.dir === "ltr";
    switch (event.key) {
      case this.actionKey:
        this.primaryAction(this.selectedItem);
        break;
      case "Home":
        this.selectItem(this.firstElementChild);
        break;
      case "End":
        this.selectItem(this.lastElementChild);
        break;
      case "ArrowLeft":
        if (this.canMoveItems && event.altKey) {
          if (rightIsForward) {
            this.moveItemBackward(this.selectedItem);
          } else {
            this.moveItemForward(this.selectedItem);
          }
        } else if (rightIsForward) {
          this.selectItem(this.selectedItem?.previousElementSibling);
        } else {
          this.selectItem(this.selectedItem?.nextElementSibling);
        }
        break;
      case "ArrowRight":
        if (this.canMoveItems && event.altKey) {
          if (rightIsForward) {
            this.moveItemForward(this.selectedItem);
          } else {
            this.moveItemBackward(this.selectedItem);
          }
        } else if (rightIsForward) {
          this.selectItem(this.selectedItem?.nextElementSibling);
        } else {
          this.selectItem(this.selectedItem?.previousElementSibling);
        }
        break;
      case "ContextMenu":
        this.contextMenuFor = this.selectedItem;
        return;
      default:
        return;
    }

    event.stopPropagation();
    event.preventDefault();
  };

  /**
   * Handles the click event on an item in the list box. Marks the item as
   * selected.
   *
   * @param {MouseEvent} event - The event for the mouse click.
   */
  #handleClick = event => {
    const item = event.target.closest("li");
    if (item) {
      this.selectItem(item);
    } else {
      this.#clearSelection();
    }
    event.stopPropagation();
    event.preventDefault();
  };

  /**
   * Move the item forward in the list box. Only works if canMoveItems is true.
   *
   * @param {CustomizableElement} item - The item to move forward.
   */
  moveItemForward(item) {
    if (!this.canMoveItems) {
      return;
    }
    item.nextElementSibling?.after(item);
  }

  /**
   * Move the item backward in the list box. Only works if canMoveItems is true.
   *
   * @param {CustomizableElement} item - The item to move backward.
   */
  moveItemBackward(item) {
    if (!this.canMoveItems) {
      return;
    }
    item.previousElementSibling?.before(item);
  }

  /**
   * Select the item. Removes the selection of the previous item. No-op if no
   * item is passed.
   *
   * @param {CustomizableElement} item - The item to select.
   */
  selectItem(item) {
    if (item) {
      this.selectedItem?.removeAttribute("aria-selected");
      item.setAttribute("aria-selected", "true");
      this.selectedItem = item;
      this.setAttribute("aria-activedescendant", item.id);
    }
  }

  /**
   * Clear the selection inside the list box.
   */
  #clearSelection() {
    this.selectedItem?.removeAttribute("aria-selected");
    this.selectedItem = null;
    this.removeAttribute("aria-activedescendant");
  }

  /**
   * Select the next item in the list. If there are no more items in either
   * direction, the selection state is reset.
   *
   * @param {CustomizableElement} item - The item of which the next sibling
   *   should be the new selection.
   */
  #selectNextItem(item) {
    const nextItem = item.nextElementSibling || item.previousElementSibling;
    if (nextItem) {
      this.selectItem(nextItem);
      return;
    }
    this.#clearSelection();
  }

  /**
   * Execute the primary action on the item after it has been deselected and the
   * next item was selected. Implementations are expected to override this
   * method and call it as the first step, aborting if it returns true.
   *
   * @param {CustomizableElement} item - The item the primary action should be
   *   executed on.
   * @returns {boolean} If the action should be aborted.
   */
  primaryAction(item) {
    if (!item) {
      return true;
    }
    item.removeAttribute("aria-selected");
    this.#selectNextItem(item);
    return false;
  }
}
