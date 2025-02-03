/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Animation variables for expanding and collapsing child lists.
const ANIMATION_EASING = "ease";
export const ANIMATION_DURATION_MS = 200;
export const reducedMotionMedia = matchMedia("(prefers-reduced-motion)");

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Provides keyboard and mouse interaction to a (possibly nested) list.
 * It is intended for lists with a small number (up to 1000?) of items.
 * Only one item can be selected at a time. Maintenance of the items in the
 * list is not managed here. Styling of the list is not managed here. Expects
 * the tree itself to scroll and not any of its parents. List items must have
 * at least one child which contains the main content of the list item.
 *
 * The following class names apply to list items:
 * - selected: Indicates the currently selected list item.
 * - children: If the list item has descendants.
 * - collapsed: If the list item's descendants are hidden.
 *
 * List items can provide their own twisty element, which will operate when
 * clicked on if given the class name "twisty".
 *
 * If a list item can't be selected it should have the "unselectable" class.
 *
 * @mixin
 * @fires CustomEvent#collapsed - Fired on a row when it is collapsed.
 *   Bubbles.
 * @fires CustomEvent#expanded - Fired on a row when it is expanded. Bubbles.
 * @fires CustomEvent#select - Fired when the selection changes.
 * @property {"tree"|"listbox"} role - Must be either tree or listbox,
 *   depending on the mode of the widget.
 */
export const TreeListboxMixin = Base =>
  class extends Base {
    /**
     * The currently active row, or null if there is none, in a single or multi
     * selection. If the user is in multiselection, the selectedRow will match the
     * last clicked row where the focus currently is.
     *
     * @type {?HTMLLIElement}
     */
    #selectedRow = null;

    get selectedRow() {
      return this.#selectedRow;
    }

    set selectedRow(row) {
      this.#selectedRow = row ?? null;
    }

    /**
     * The index of the selected/active row. If there are no rows, the value is
     * -1. Otherwise, should always have a value between 0 and `rowCount - 1`.
     *
     * @type {integer}
     */
    get selectedIndex() {
      return this.rows.findIndex(row => row == this.selectedRow);
    }

    set selectedIndex(index) {
      this.updateSelection(this.getRowAtIndex(this._clampIndex(index)));
    }

    /**
     * The map of the currently selected rows.
     *
     * @type {Map<integer, HTMLLIElement>}
     */
    #selection = new Map();

    get selection() {
      return this.#selection;
    }

    /**
     * Every visible row. Rows with collapsed ancestors are not included.
     *
     * @type {HTMLLIElement[]}
     */
    get rows() {
      return [...this.querySelectorAll("li:not(.unselectable)")].filter(row => {
        const collapsed = row.parentNode.closest("li.collapsed");
        if (collapsed && this.contains(collapsed)) {
          return false;
        }
        return true;
      });
    }

    /**
     * The number of visible rows.
     *
     * @type {integer}
     */
    get rowCount() {
      return this.rows.length;
    }

    /**
     * If the current listbox supports multiselection.
     *
     * @type {boolean}
     */
    get isMultiselect() {
      return this.ariaMultiSelectable == "true";
    }

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-listbox");

      switch (this.getAttribute("role")) {
        case "tree":
          this.isTree = true;
          break;
        case "listbox":
          this.isTree = false;
          break;
        default:
          throw new RangeError(`Unsupported role ${this.getAttribute("role")}`);
      }
      this.tabIndex = 0;

      this.domChanged();
      this._initRows();
      if (!this.selectedRow && this.rows.length) {
        // TODO: This should only really happen on "focus".
        this.updateSelection(this.getRowAtIndex(0));
      }

      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
      this.addEventListener("contextmenu", this);
      this._mutationObserver.observe(this, {
        subtree: true,
        childList: true,
      });
    }

    handleEvent(event) {
      switch (event.type) {
        case "click":
          this._onClick(event);
          break;
        case "keydown":
          this._onKeyDown(event);
          break;
        case "contextmenu":
          this._onContextMenu(event);
          break;
      }
    }

    _onClick(event) {
      if (event.button !== 0) {
        return;
      }

      const row = event.target.closest("li:not(.unselectable)");
      if (!row) {
        return;
      }

      if (
        row.classList.contains("children") &&
        (event.target.closest(".twisty") || event.detail == 2)
      ) {
        if (row.classList.contains("collapsed")) {
          this.expandRow(row);
        } else {
          this.collapseRow(row);
        }
        return;
      }

      this.updateSelection(row, event);

      if (document.activeElement != this) {
        // Overflowing elements with tabindex=-1 steal focus. Grab it back.
        this.focus();
      }
    }

    _onKeyDown(event) {
      if (event.altKey) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          this.updateSelection(
            this.getRowAtIndex(this._clampIndex(this.selectedIndex - 1)),
            event
          );
          break;
        case "ArrowDown":
          this.updateSelection(
            this.getRowAtIndex(this._clampIndex(this.selectedIndex + 1)),
            event
          );
          break;
        case "Home":
          this.updateSelection(this.getRowAtIndex(0), event);
          break;
        case "End":
          this.updateSelection(this.getRowAtIndex(this.rowCount - 1), event);
          break;
        case "PageUp": {
          if (!this.selectedRow) {
            break;
          }
          // Get the top of the selected row, and remove the page height.
          const selectedBox = this.selectedRow.getBoundingClientRect();
          const y = selectedBox.top - this.clientHeight;

          // Find the last row below there.
          const rows = this.rows;
          let i = this.selectedIndex - 1;
          while (i > 0 && rows[i].getBoundingClientRect().top >= y) {
            i--;
          }
          this.updateSelection(this.getRowAtIndex(this._clampIndex(i)), event);
          break;
        }
        case "PageDown": {
          if (!this.selectedRow) {
            break;
          }

          if (!this.#selection.size) {
            break;
          }

          // Get the top of the selected row, and add the page height.
          const selectedBox = this.selectedRow.getBoundingClientRect();
          const y = selectedBox.top + this.clientHeight;

          // Find the last row below there.
          const rows = this.rows;
          let i = rows.length - 1;
          while (
            i > this.selectedIndex &&
            rows[i].getBoundingClientRect().top >= y
          ) {
            i--;
          }
          this.updateSelection(this.getRowAtIndex(this._clampIndex(i)), event);
          break;
        }
        case "ArrowLeft":
        case "ArrowRight": {
          const selected = this.selectedRow;
          if (!selected) {
            break;
          }

          const isArrowRight = event.key == "ArrowRight";
          const isRTL = this.matches(":dir(rtl)");
          if (isArrowRight == isRTL) {
            const parentNode = selected.parentNode.closest(
              ".children:not(.unselectable)"
            );
            if (
              parentNode &&
              (!selected.classList.contains("children") ||
                selected.classList.contains("collapsed"))
            ) {
              this.updateSelection(parentNode);
              break;
            }
            if (selected.classList.contains("children")) {
              this.collapseRow(selected);
            }
          } else if (selected.classList.contains("children")) {
            if (selected.classList.contains("collapsed")) {
              this.expandRow(selected);
            } else {
              this.updateSelection(selected.querySelector("li"));
            }
          }
          break;
        }
        case "Enter": {
          const selected = this.selectedRow;
          if (!selected?.classList.contains("children")) {
            return;
          }
          if (selected.classList.contains("collapsed")) {
            this.expandRow(selected);
          } else {
            this.collapseRow(selected);
          }
          break;
        }
        case "Escape":
          if (this.#selection.size > 1) {
            this.updateSelection([...this.#selection.values()].at(0));
          }
          break;
        default:
          return;
      }

      event.preventDefault();
    }

    /**
     * Handle the context menu trigger on a tree row.
     *
     * @param {DOMEvent} event
     */
    _onContextMenu(event) {
      const row = event.target.closest("li:not(.unselectable)");
      if (!row) {
        return;
      }

      // No need to do anything if the context menu was triggered from the
      // currently active row or from a row that is not part of the current
      // selection.
      if (
        this.selectedRow == row ||
        !this.#selection.has(this.rows.indexOf(row))
      ) {
        return;
      }

      this.querySelector("li.current").classList.remove("current");
      this.selectedRow = row;
      row.classList.add("current");
      this.setAttribute("aria-activedescendant", row.id);
      row.firstElementChild.scrollIntoView({ block: "nearest" });
    }

    /**
     * Data for the rows in the DOM.
     *
     * @typedef {object} TreeRowData
     * @property {HTMLLIElement} row - The row item.
     * @property {HTMLLIElement[]} ancestors - The ancestors of the row,
     *   ordered closest to furthest away.
     */

    /**
     * Data for all items beneath this node, including collapsed items,
     * ordered as they are in the DOM.
     *
     * @type {TreeRowData[]}
     */
    _rowsData = [];

    /**
     * Call whenever the tree nodes or ordering changes. This should only be
     * called externally if the mutation observer has been dis-connected and
     * re-connected.
     */
    domChanged() {
      this._rowsData = Array.from(this.querySelectorAll("li"), row => {
        const ancestors = [];
        for (
          let parentRow = row.parentNode.closest("li");
          this.contains(parentRow);
          parentRow = parentRow.parentNode.closest("li")
        ) {
          ancestors.push(parentRow);
        }
        return { row, ancestors };
      });
    }

    _mutationObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType != Node.ELEMENT_NODE || !node.matches("li")) {
            continue;
          }
          // No item can already be selected on addition.
          node.classList.remove("selected");
        }
      }
      const oldRowsData = this._rowsData;
      this.domChanged();
      this._initRows();
      let newRows = this.rows;
      if (!newRows.length) {
        this.updateSelection(null);
        return;
      }
      if (!this.selectedRow) {
        // TODO: This should only really happen on "focus".
        this.updateSelection(newRows[0]);
        return;
      }
      if (newRows.includes(this.selectedRow)) {
        // Selected row is still visible.
        return;
      }
      const oldSelectedIndex = oldRowsData.findIndex(
        entry => entry.row == this.selectedRow
      );
      if (oldSelectedIndex < 0) {
        // Unexpected, the selectedRow was not in our _rowsData list.
        this.updateSelection(newRows[0]);
        return;
      }
      // Find the closest ancestor that is still shown.
      const existingAncestor = oldRowsData[oldSelectedIndex].ancestors.find(
        row => newRows.includes(row)
      );
      if (existingAncestor) {
        // We search as if the existingAncestor is the full list. This keeps
        // the selection within the ancestor, or moves it to the ancestor if
        // no child is found.
        // NOTE: Includes existingAncestor itself, so should be non-empty.
        newRows = newRows.filter(row => existingAncestor.contains(row));
      }
      // We have lost the selectedRow, so we select a new row.  We want to try
      // and find the element that exists both in the new rows and in the old
      // rows, that directly preceded the previously selected row. We then
      // want to select the next visible row that follows this found element
      // in the new rows.
      // If rows were replaced with new rows, this will select the first of
      // the new rows.
      // If rows were simply removed, this will select the next row that was
      // not removed.
      let beforeIndex = -1;
      for (let i = oldSelectedIndex; i >= 0; i--) {
        beforeIndex = this._rowsData.findIndex(
          entry => entry.row == oldRowsData[i].row
        );
        if (beforeIndex >= 0) {
          break;
        }
      }
      // Start from just after the found item, or 0 if none were found
      // (beforeIndex == -1), find the next visible item. Otherwise we default
      // to selecting the last row.
      let selectRow = newRows[newRows.length - 1];
      for (let i = beforeIndex + 1; i < this._rowsData.length; i++) {
        if (newRows.includes(this._rowsData[i].row)) {
          selectRow = this._rowsData[i].row;
          break;
        }
      }
      this.updateSelection(selectRow);
    });

    /**
     * Set the role attribute and classes for all descendants of the widget.
     */
    _initRows() {
      const descendantItems = this.querySelectorAll("li");
      const descendantLists = this.querySelectorAll("ol, ul");

      for (let i = 0; i < descendantItems.length; i++) {
        const row = descendantItems[i];
        row.setAttribute("role", this.isTree ? "treeitem" : "option");
        if (
          i + 1 < descendantItems.length &&
          row.contains(descendantItems[i + 1])
        ) {
          row.classList.add("children");
          if (this.isTree) {
            row.setAttribute(
              "aria-expanded",
              !row.classList.contains("collapsed")
            );
          }
        } else {
          row.classList.remove("children");
          row.classList.remove("collapsed");
          row.removeAttribute("aria-expanded");
        }
        row.setAttribute("aria-selected", row.classList.contains("selected"));
      }

      if (this.isTree) {
        for (const list of descendantLists) {
          list.setAttribute("role", "group");
        }
      }

      for (const childList of this.querySelectorAll(
        "li.collapsed > :is(ol, ul)"
      )) {
        this._hideChildList(childList);
      }
    }

    /**
     * Clamps `index` to a value between 0 and `rowCount - 1`.
     *
     * @param {integer} index
     * @returns {integer}
     */
    _clampIndex(index) {
      if (index >= this.rowCount) {
        return this.rowCount - 1;
      }
      if (index < 0) {
        return 0;
      }
      return index;
    }

    /**
     * Ensures that the row at `index` is on the screen.
     *
     * @param {integer} index
     */
    scrollToIndex(index) {
      this.getRowAtIndex(index)?.scrollIntoView({ block: "nearest" });
    }

    /**
     * Returns the row element at `index` or null if `index` is out of range.
     *
     * @param {integer} index
     * @returns {HTMLLIElement?}
     */
    getRowAtIndex(index) {
      return this.rows[index];
    }

    /**
     * Update the selection map to reflect the current state of selected rows.
     *
     * @param {?HTMLLIElement} row - The row the user interacted with, if it
     *   exists.
     * @param {?Event|null} event - The DOM Event if provided.
     */
    updateSelection(row, event = null) {
      // No need to do anything if no keyboard even is present and the row is
      // the currently selected one.
      if (
        this.selectedRow == row &&
        !event?.shiftKey &&
        !event?.metaKey &&
        !event?.ctrlKey &&
        this.#selection.size == 1
      ) {
        return;
      }

      // Cache the previous selected index in case we need it for SHIFT range
      // selections.
      const previousIndex = this.selectedIndex;
      this.selectedRow = row;
      // The row is null, bail out and update the tree classes.
      if (!row) {
        this.updateRowClasses();
        return;
      }

      const index = this.rows.indexOf(row);

      // Simply clear the selection and only add this single row if the widget
      // doesn't implement multiselection.
      if (!this.isMultiselect || !event) {
        this.#selection.clear();
        this.#selection.set(index, row);
        this.updateRowClasses();
        return;
      }

      // If the selection is currently empty, ignore any modifier and simply add
      // the newly selected row.
      if (!this.#selection.size) {
        this.#selection.set(index, row);
        this.updateRowClasses();
        return;
      }

      const accelKey =
        AppConstants.platform == "macosx" ? event.metaKey : event.ctrlKey;

      // Only select one row in the array if no modifier is used.
      if (!event.shiftKey && !accelKey) {
        // No need to do anything if the user selected the same row.
        if (this.#selection.has(index) && this.#selection.size == 1) {
          return;
        }

        this.#selection.clear();
        this.#selection.set(index, row);
        this.updateRowClasses();
        return;
      }

      // Add or remove the row from the selection if CTRL is pressed.
      if (accelKey) {
        // No need to do anything if the user clicked on the only selected row
        // even if using a modifier key as we don't allow deselecting all rows.
        if (
          this.#selection.size == 1 &&
          this.#selection.has(index) &&
          event?.type == "click"
        ) {
          return;
        }

        // Remove the clicked row from the current selection only if we have
        // multiple rows selected and the event is a click.
        if (
          this.#selection.size > 1 &&
          this.#selection.has(index) &&
          event?.type == "click"
        ) {
          this.#selection.delete(index);
          this.updateRowClasses();
          return;
        }

        this.#selection.set(index, row);
        this.updateRowClasses();
        return;
      }

      // If SHIFT is pressed, we need to handle a range selection.
      if (event.shiftKey) {
        if (index > previousIndex) {
          for (let i = previousIndex; i <= index; i++) {
            if (this.#selection.has(i)) {
              continue;
            }
            this.#selection.set(i, this.getRowAtIndex(i));
          }
          this.updateRowClasses();
          return;
        }

        if (index < previousIndex) {
          for (let i = previousIndex; i >= index; i--) {
            if (this.#selection.has(i)) {
              continue;
            }
            this.#selection.set(i, this.getRowAtIndex(i));
          }
          this.updateRowClasses();
        }
      }
    }

    /**
     * Do a full reset of the current selection and apply the new range.
     *
     * @param {HTMLLIElement[]} rows - The array of rows to select.
     */
    swapSelection(rows) {
      this.#selection.clear();
      if (!rows.length) {
        return;
      }

      for (const row of rows) {
        const index = this.rows.indexOf(row);
        this.#selection.set(index, row);
      }

      this.selectedRow = rows.at(-1);
      this.updateRowClasses();
      this.focus();
    }

    /**
     * Update the classes of the listbox to visually reflect the current state
     * of selected items. This method also is responsible of emitting the
     * "select" custom event.
     */
    updateRowClasses() {
      this.classList.toggle("multi-selected", this.#selection.size > 1);

      for (const row of this.querySelectorAll("li.selected")) {
        row.classList.remove("selected", "current");
        row.ariaSelected = "false";
      }

      if (!this.#selection.size) {
        this.removeAttribute("aria-activedescendant");
        this.dispatchEvent(new CustomEvent("select"));
        return;
      }

      // If we're at this point and we don't have an active index it means that
      // the user removed the previous active index from the current selection.
      // Find the last available item ID in the current selection and set the
      // new active row.
      if (!this.selectedIndex || !this.#selection.get(this.selectedIndex)) {
        const index = this._clampIndex([...this.#selection.keys()].at(-1));
        this.selectedRow = this.getRowAtIndex(index);
      }

      this.#selection.forEach((row, index) => {
        row.classList.add("selected");
        row.ariaSelected = "true";

        if (this.selectedIndex == index) {
          row.classList.add("current");
          this.setAttribute("aria-activedescendant", row.id);
          if (this.isTree) {
            // We don't want to scroll to the item and its entire subtree, so
            // scroll only to the first child. Typically items in a tree have
            // a block containing the item icon, name, etc. followed by a list
            // containing the child items, so this works.
            row.firstElementChild.scrollIntoView({ block: "nearest" });
          } else {
            // Not a tree item, scroll the whole item into view.
            row.scrollIntoView({ block: "nearest" });
          }
        }
      });

      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Collapses the row at `index` if it can be collapsed. If the selected
     * row is a descendant of the collapsing row, selection is moved to the
     * collapsing row.
     *
     * @param {integer} index
     */
    collapseRowAtIndex(index) {
      this.collapseRow(this.getRowAtIndex(index));
    }

    /**
     * Expands the row at `index` if it can be expanded.
     *
     * @param {integer} index
     */
    expandRowAtIndex(index) {
      this.expandRow(this.getRowAtIndex(index));
    }

    /**
     * Collapses the row if it can be collapsed. If the selected row is a
     * descendant of the collapsing row, selection is moved to the collapsing
     * row.
     *
     * @param {HTMLLIElement} row - The row to collapse.
     */
    collapseRow(row) {
      if (
        row.classList.contains("children") &&
        !row.classList.contains("collapsed")
      ) {
        if (row.contains(this.selectedRow)) {
          this.updateSelection(row);
        }
        row.classList.add("collapsed");
        if (this.isTree) {
          row.setAttribute("aria-expanded", "false");
        }
        row.dispatchEvent(new CustomEvent("collapsed", { bubbles: true }));
        this._animateCollapseRow(row);
      }
    }

    /**
     * Expands the row if it can be expanded.
     *
     * @param {HTMLLIElement} row - The row to expand.
     */
    expandRow(row) {
      if (
        row.classList.contains("children") &&
        row.classList.contains("collapsed")
      ) {
        row.classList.remove("collapsed");
        if (this.isTree) {
          row.setAttribute("aria-expanded", "true");
        }
        row.dispatchEvent(new CustomEvent("expanded", { bubbles: true }));
        this._animateExpandRow(row);
      }
    }

    /**
     * Animate the collapsing of a row containing child items.
     *
     * @param {HTMLLIElement} row - The parent row element.
     */
    _animateCollapseRow(row) {
      const childList = row.querySelector("ol, ul");

      if (reducedMotionMedia.matches) {
        if (childList) {
          this._hideChildList(childList);
        }
        return;
      }

      const childListHeight = childList.scrollHeight;

      childList.animation?.cancel();
      childList.classList.remove("animating-expand");
      childList.classList.add("animating-collapse");
      childList.animation = childList.animate(
        [{ height: `${childListHeight}px` }, { height: "0" }],
        {
          duration: ANIMATION_DURATION_MS,
          easing: ANIMATION_EASING,
          fill: "both",
        }
      );
      childList.animation.onfinish = () => {
        childList.classList.remove("animating-collapse");
        this._hideChildList(childList);
        childList.animation.cancel();
        delete childList.animation;
      };
    }

    /**
     * Animate the revealing of a row containing child items.
     *
     * @param {HTMLLIElement} row - The parent row element.
     */
    _animateExpandRow(row) {
      const childList = row.querySelector("ol, ul");
      childList.hidden = false;

      if (reducedMotionMedia.matches) {
        if (childList) {
          childList.style.height = null;
        }
        return;
      }

      const childListHeight = childList.scrollHeight;

      childList.animation?.cancel();
      childList.classList.remove("animating-collapse");
      childList.classList.add("animating-expand");
      childList.animation = childList.animate(
        [{ height: "0" }, { height: `${childListHeight}px` }],
        {
          duration: ANIMATION_DURATION_MS,
          easing: ANIMATION_EASING,
          fill: "both",
        }
      );
      childList.animation.onfinish = () => {
        childList.classList.remove("animating-expand");
        childList.style.height = null;
        childList.animation.cancel();
        delete childList.animation;
      };
    }

    /**
     * Set the appropriate styles on the child list of a collapsed row.
     *
     * @param {HTMLOListElement|HTMLUListElement} childList
     */
    _hideChildList(childList) {
      childList.style.height = "0";
      // If we're currently collapsing or expanding, don't hide the element.
      // We don't want to be hidden during an animation.
      if (
        !childList.classList.contains("animating-collapse") &&
        !childList.classList.contains("animating-expand")
      ) {
        childList.hidden = true;
      }
    }
  };
