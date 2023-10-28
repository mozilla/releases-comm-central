/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { SelectionWidgetController } = ChromeUtils.import(
  "resource:///modules/SelectionWidgetController.jsm"
);

/**
 * Data for a selectable item.
 *
 * @typedef {object} ItemData
 * @property {HTMLElement} element - The DOM node for the item.
 * @property {boolean} selected - Whether the item is selected.
 */

class TestSelectionWidget extends HTMLElement {
  /**
   * The selectable items for this widget, in DOM ordering.
   *
   * @type {ItemData[]}
   */
  items = [];
  #focusItem = this;
  #controller = null;

  connectedCallback() {
    const widget = this;

    widget.tabIndex = 0;
    widget.setAttribute("role", "listbox");
    widget.setAttribute("aria-label", "Test selection widget");
    widget.setAttribute(
      "aria-orientation",
      widget.getAttribute("layout-direction")
    );
    const model = widget.getAttribute("selection-model");
    widget.setAttribute("aria-multiselectable", model == "browse-multi");

    this.#controller = new SelectionWidgetController(widget, model, {
      getLayoutDirection() {
        return widget.getAttribute("layout-direction");
      },
      indexFromTarget(target) {
        for (let i = 0; i < widget.items.length; i++) {
          if (widget.items[i].element.contains(target)) {
            return i;
          }
        }
        return null;
      },
      getPageSizeDetails() {
        if (widget.hasAttribute("no-pages")) {
          return null;
        }
        const itemRect = widget.items[0]?.element.getBoundingClientRect();
        if (widget.getAttribute("layout-direction") == "vertical") {
          return {
            itemSize: itemRect?.height ?? null,
            viewSize: widget.clientHeight,
            viewOffset: widget.scrollTop,
          };
        }
        return {
          itemSize: itemRect?.width ?? null,
          viewSize: widget.clientWidth,
          viewOffset: Math.abs(widget.scrollLeft),
        };
      },
      setFocusableItem(index, focus) {
        widget.#focusItem.tabIndex = -1;
        widget.#focusItem =
          index == null ? widget : widget.items[index].element;
        widget.#focusItem.tabIndex = 0;
        if (focus) {
          widget.#focusItem.focus();
          widget.#focusItem.scrollIntoView({
            block: "nearest",
            inline: "nearest",
          });
        }
      },
      setItemSelectionState(index, number, selected) {
        for (let i = index; i < index + number; i++) {
          widget.items[i].selected = selected;
          widget.items[i].element.classList.toggle("selected", selected);
          widget.items[i].element.setAttribute("aria-selected", selected);
        }
      },
    });
  }

  #createItemElement(text) {
    for (const { element } of this.items) {
      if (element.textContent == text) {
        throw new Error(`An item with the text "${text}" already exists`);
      }
    }
    const element = this.ownerDocument.createElement("span");
    element.textContent = text;
    element.setAttribute("role", "option");
    element.tabIndex = -1;
    element.draggable = this.hasAttribute("items-draggable");
    return element;
  }

  /**
   * Create new items and add them to the widget.
   *
   * @param {number} index - The starting index at which to add the items.
   * @param {string[]} textList - The textContent for the items to add. Each
   *   entry in the array will create one item in the same order.
   */
  addItems(index, textList) {
    for (const [i, text] of textList.entries()) {
      const element = this.#createItemElement(text);
      this.insertBefore(element, this.items[index + i]?.element ?? null);
      this.items.splice(index + i, 0, { element });
    }
    this.#controller.addedSelectableItems(index, textList.length);
    // Force re-layout. This is needed for the items to be able to enter the
    // focus cycle immediately.
    this.getBoundingClientRect();
  }

  /**
   * Remove items from the widget.
   *
   * @param {number} index - The starting index at which to remove items.
   * @param {number} number - How many items to remove.
   */
  removeItems(index, number) {
    this.#controller.removeSelectableItems(index, number, () => {
      for (const { element } of this.items.splice(index, number)) {
        element.remove();
      }
    });
  }

  /**
   * Move items within the widget.
   *
   * @param {number} from - The index at which to move items from.
   * @param {number} to - The index at which to move items to.
   * @param {number} number - How many items to move.
   * @param {boolean} reCreate - Whether to recreate the item when
   *   moving it. Otherwise the existing item is used.
   */
  moveItems(from, to, number, reCreate) {
    if (reCreate == undefined) {
      throw new Error("Missing reCreate argument");
    }
    this.#controller.moveSelectableItems(from, to, number, () => {
      const moving = this.items.splice(from, number);
      for (let [i, item] of moving.entries()) {
        item.element.remove();
        if (reCreate) {
          const text = item.element.textContent;
          item = { element: this.#createItemElement(text) };
        }
        this.insertBefore(item.element, this.items[to + i]?.element ?? null);
        this.items.splice(to + i, 0, item);
      }
    });
  }

  /**
   * Selects a single item via the SelectionWidgetController.selectSingleItem
   * method.
   *
   * @param {number} index - The index of the item to select.
   */
  selectSingleItem(index) {
    this.#controller.selectSingleItem(index);
  }

  /**
   * Changes the selection state of an item via the
   * SelectionWidgetController.setItemSelected method.
   *
   * @param {number} index - The index of the item to set the selection state
   *   of.
   * @param {boolean} select - Whether to select the item.
   */
  setItemSelected(index, select) {
    this.#controller.setItemSelected(index, select);
  }

  /**
   * Get the list of selected item's indices.
   *
   * @returns {number[]} - The indices for selected items.
   */
  selectedIndices() {
    const indices = [];
    for (let i = 0; i < this.items.length; i++) {
      // Assert that the item has a defined selection state set in
      // setItemSelectionState.
      if (typeof this.items[i].selected != "boolean") {
        throw new Error(`Item ${i} has an undefined selection state`);
      }
      // Assert that our stored selection state matches that returned by the
      // controller API.
      const itemIsSelected = this.#controller.itemIsSelected(i);
      if (this.items[i].selected != itemIsSelected) {
        throw new Error(
          `itemIsSelected(${i}): "${itemIsSelected}" does not match stored selection state "${this.items[i].selected}"`
        );
      }
      if (itemIsSelected) {
        indices.push(i);
      }
    }
    return indices;
  }

  /**
   * Get the return of SelectionWidgetController.getSelectionRanges
   */
  getSelectionRanges() {
    return this.#controller.getSelectionRanges();
  }
}

customElements.define("test-selection-widget", TestSelectionWidget);
