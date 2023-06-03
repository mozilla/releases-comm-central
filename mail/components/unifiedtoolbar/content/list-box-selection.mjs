/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

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
    this.addEventListener("dragstart", this.#handleDragstart);
    this.addEventListener("dragenter", this.#handleDragenter);
    this.addEventListener("dragover", this.#handleDragover);
    this.addEventListener("dragleave", this.#handleDragleave);
    this.addEventListener("drop", this.#handleDrop);
    this.addEventListener("dragend", this.#handleDragend);
    return false;
  }

  disconnectedCallback() {
    this.contextMenuFor = null;
    this.selectedItem = null;
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
        if (this.canMoveItems && event.altKey) {
          this.moveItemToStart(this.selectedItem);
          break;
        }
        this.selectItem(this.firstElementChild);
        break;
      case "End":
        if (this.canMoveItems && event.altKey) {
          this.moveItemToEnd(this.selectedItem);
          break;
        }
        this.selectItem(this.lastElementChild);
        break;
      case "ArrowLeft":
        if (this.canMoveItems && event.altKey) {
          if (rightIsForward) {
            this.moveItemBackward(this.selectedItem);
            break;
          }
          this.moveItemForward(this.selectedItem);
          break;
        }
        if (rightIsForward) {
          this.selectItem(this.selectedItem?.previousElementSibling);
          break;
        }
        this.selectItem(this.selectedItem?.nextElementSibling);
        break;
      case "ArrowRight":
        if (this.canMoveItems && event.altKey) {
          if (rightIsForward) {
            this.moveItemForward(this.selectedItem);
            break;
          }
          this.moveItemBackward(this.selectedItem);
          break;
        }
        if (rightIsForward) {
          this.selectItem(this.selectedItem?.nextElementSibling);
          break;
        }
        this.selectItem(this.selectedItem?.previousElementSibling);
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
   * Set up the drag data transfer.
   *
   * @param {DragEvent} event - Drag start event.
   */
  #handleDragstart = event => {
    // Only allow dragging the customizable elements themeselves.
    if (event.target.getAttribute("is") !== "customizable-element") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/tb-item-id",
      event.target.getAttribute("item-id")
    );
    const customizableItem = event.target;
    window.requestAnimationFrame(() => {
      customizableItem.classList.add("dragging");
    });
  };

  /**
   * Calculate the drop position's closest sibling and the relative drop point.
   * Assumes the list is laid out horizontally if canMoveItems is true. Else
   * the sibling will be the event target and afterSibling will always be true.
   *
   * @param {DragEvent} event - The event the sibling being dragged over should
   *   be found in.
   * @returns {{sibling: CustomizableElement, afterSibling: boolean}}
   */
  #dragSiblingInfo(event) {
    let sibling = event.target;
    let afterSibling = true;
    if (this.canMoveItems) {
      const listBoundingRect = this.getBoundingClientRect();
      const listY = listBoundingRect.y + listBoundingRect.height / 2;
      const element = this.getRootNode().elementFromPoint(event.x, listY);
      sibling = element.closest('li[is="customizable-element"]');
      if (!sibling) {
        if (!this.children.length) {
          return {};
        }
        sibling = this.lastElementChild;
      }
      const boundingRect = sibling.getBoundingClientRect();
      if (event.x < boundingRect.x + boundingRect.width / 2) {
        afterSibling = false;
      }
      if (document.dir === "rtl") {
        afterSibling = !afterSibling;
      }
    }
    return { sibling, afterSibling };
  }

  /**
   * Shared logic for when a drag event happens over a new part of the list.
   *
   * @param {DragEvent} event - Drag event.
   */
  #dragIn(event) {
    const itemId = event.dataTransfer.getData("text/tb-item-id");
    if (!itemId || !this.canAddElement(itemId)) {
      event.dataTransfer.dropEffect = "none";
      event.preventDefault();
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (!this.canMoveItems) {
      return;
    }
    const { sibling, afterSibling } = this.#dragSiblingInfo(event);
    if (!sibling) {
      return;
    }
    sibling.classList.toggle("drop-before", !afterSibling);
    sibling.classList.toggle("drop-after", afterSibling);
    sibling.nextElementSibling?.classList.remove("drop-before", "drop-after");
    sibling.previousElementSibling?.classList.remove(
      "drop-before",
      "drop-after"
    );
  }

  /**
   * Shared logic for when a drag leaves an element.
   *
   * @param {Element} element - Element the drag has left.
   */
  #dragOut(element) {
    element.classList.remove("drop-after", "drop-before");
    if (element !== this) {
      return;
    }
    for (const child of this.querySelectorAll(".drop-after,.drop-before")) {
      child.classList.remove("drop-after", "drop-before");
    }
  }

  /**
   * Prevents the default action for the dragenter event to enable dropping
   * items on this list. Shows a drag position placeholder in the target if
   * applicable.
   *
   * @param {DragEvent} event - Drag enter event.
   */
  #handleDragenter = event => {
    this.#dragIn(event);
  };

  /**
   * Prevents the default for the dragover event to enable dropping items on
   * this list. Shows a drag position placeholder in the target if applicable.
   *
   * @param {DragEvent} event - Drag over event.
   */
  #handleDragover = event => {
    this.#dragIn(event);
  };

  /**
   * Hide the drag position placeholder.
   *
   * @param {DragEvent} event - Drag leave event.
   */
  #handleDragleave = event => {
    if (!this.canMoveItems) {
      return;
    }
    this.#dragOut(event.target);
  };

  /**
   * Move the item to the dragged into given position. Possibly moving adopting
   * it from another list.
   *
   * @param {DragEvent} event - Drop event.
   */
  #handleDrop = event => {
    const itemId = event.dataTransfer.getData("text/tb-item-id");
    if (
      event.dataTransfer.dropEffect !== "move" ||
      !itemId ||
      !this.canAddElement(itemId)
    ) {
      return;
    }

    const { sibling, afterSibling } = this.#dragSiblingInfo(event);

    event.preventDefault();
    this.#dragOut(sibling ?? this);
    this.handleDrop(itemId, sibling, afterSibling);
  };

  /**
   * Remove the item from this list if it was dropped into another list. Return
   * it to its palette if dropped outside a valid target.
   *
   * @param {DragEvent} event - Drag end event.
   */
  #handleDragend = event => {
    event.target.classList.remove("dragging");
    if (event.dataTransfer.dropEffect === "move") {
      this.handleDragSuccess(event.target);
      return;
    }
    // If we can't move the item to the drop location, return it to its palette.
    const palette = event.target.palette;
    if (event.dataTransfer.dropEffect === "none" && palette !== this) {
      event.preventDefault();
      this.handleDragSuccess(event.target);
      palette.returnItem(event.target);
    }
  };

  /**
   * Handle an item from a drag operation being added to the list. The drag
   * origin could be this list or another list.
   *
   * @param {string} itemId - Item ID to add to this list from a drop.
   * @param {CustomizableElement} sibling - Sibling this item should end up next
   *   to.
   * @param {boolean} afterSibling - If the item should be inserted after the
   *   sibling.
   * @return {CustomizableElement} The dropped customizable element created by
   *   this handler.
   */
  handleDrop(itemId, sibling, afterSibling) {
    const item = document.createElement("li", {
      is: "customizable-element",
    });
    item.setAttribute("item-id", itemId);
    item.draggable = true;
    if (!this.canMoveItems || !sibling) {
      this.appendChild(item);
      return item;
    }
    if (afterSibling) {
      sibling.after(item);
      return item;
    }
    sibling.before(item);
    return item;
  }

  /**
   * Handle an item from this list having been dragged somewhere else.
   *
   * @param {CustomizableElement} item - Item dragged somewhere else.
   */
  handleDragSuccess(item) {
    item.remove();
  }

  /**
   * Check if a given item is allowed to be added to this list. Is false if the
   * item is already in the list and moving around is not allowed.
   *
   * @param {string} itemId - The item ID of the item that wants to be added to
   *   this list.
   * @returns {boolean} If this item can be added to this list.
   */
  canAddElement(itemId) {
    return this.canMoveItems || !this.querySelector(`li[item-id="${itemId}"]`);
  }

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
   * Move the item to the start of the list. Only works if canMoveItems is
   * true.
   *
   * @param {CustomizableElement} item - The item to move to the start.
   */
  moveItemToStart(item) {
    if (!this.canMoveItems || item === this.firstElementChild) {
      return;
    }
    this.prepend(item);
  }

  /**
   * Move the item to the end of the list. Only works if canMoveItems is true.
   *
   * @param {CustomizableElement} item - The item to move to the end.
   */
  moveItemToEnd(item) {
    if (!this.canMoveItems || item === this.lastElementChild) {
      return;
    }
    this.appendChild(item);
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
