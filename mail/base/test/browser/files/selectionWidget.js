/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { SelectionWidgetController } = ChromeUtils.import(
  "resource:///modules/SelectionWidgetController.jsm"
);

/**
 * Data for a selectable item.
 *
 * @typedef {Object} ItemData
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
  #itemId = 0;

  connectedCallback() {
    let widget = this;

    widget.tabIndex = 0;
    widget.setAttribute("role", "listbox");
    widget.setAttribute("aria-label", "Test selection widget");
    widget.setAttribute(
      "aria-orientation",
      widget.getAttribute("layout-direction")
    );

    this.#itemId = 0;

    this.#controller = new SelectionWidgetController(
      widget,
      widget.getAttribute("selection-model"),
      {
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
        setFocusableItem(index, focus) {
          widget.#focusItem.tabIndex = -1;
          widget.#focusItem =
            index == null ? widget : widget.items[index].element;
          widget.#focusItem.tabIndex = 0;
          if (focus) {
            widget.#focusItem.focus();
          }
        },
        setItemSelectionState(index, selected) {
          widget.items[index].selected = selected;
          widget.items[index].element.classList.toggle("selected", selected);
          widget.items[index].element.setAttribute("aria-selected", selected);
        },
      }
    );
  }

  /**
   * Create new items and add them to the widget.
   *
   * @param {number} index - The starting index at which to add the items.
   * @param {string[]} textList - The textContent for the items to add. Each
   *   entry in the array will create one item in the same order.
   */
  addItems(index, textList) {
    for (let [i, text] of textList.entries()) {
      let element = this.ownerDocument.createElement("span");
      element.textContent = text;
      element.id = `widgetItem${this.#itemId}`;
      element.setAttribute("role", "option");
      this.#itemId++;
      this.insertBefore(element, this.items[index + i]?.element ?? null);
      this.items.splice(index + i, 0, { element });
    }
    this.#controller.addedSelectableItems(index, textList.length);
  }

  /**
   * Remove items from the widget.
   *
   * @param {index} - The starting index at which to remove items.
   * @param {number} - How many items to remove.
   */
  removeItems(index, number) {
    let itemsToRemove = this.items.splice(index, number);
    this.#controller.removingSelectableItems(index, number);
    for (let { element } of itemsToRemove) {
      element.remove();
    }
  }

  /**
   * Select an item.
   *
   * @param {index} - The index of the item to select.
   */
  selectItem(index) {
    this.#controller.selectSingle(index);
  }

  /**
   * Get the list of selected item's indices.
   *
   * @return {number[]} - The indices for selected items.
   */
  selectedIndicies() {
    let indices = [];
    for (let i = 0; i < this.items.length; i++) {
      if (this.items[i].selected) {
        indices.push(i);
      }
    }
    return indices;
  }
}

customElements.define("test-selection-widget", TestSelectionWidget);
