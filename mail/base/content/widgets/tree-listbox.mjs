/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Animation variables for expanding and collapsing child lists.
const ANIMATION_DURATION_MS = 200;
const ANIMATION_EASING = "ease";
const reducedMotionMedia = matchMedia("(prefers-reduced-motion)");

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
 * @fires {CustomEvent} collapsed - Fired on a row when it is collapsed.
 *   Bubbles.
 * @fires {CustomEvent} expanded - Fired on a row when it is expanded. Bubbles.
 * @fires {CustomEvent} select - Fired when the selection changes.
 * @attribute {"tree"|"listbox"} role - Must be either tree or listbox,
 *   depending on the mode of the widget.
 */
const TreeListboxMixin = Base =>
  class extends Base {
    /**
     * The selected and focused item, or null if there is none.
     *
     * @type {?HTMLLIElement}
     */
    _selectedRow = null;

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
      const rows = this.rows;
      if (!this.selectedRow && rows.length) {
        // TODO: This should only really happen on "focus".
        this.selectedRow = rows[0];
      }

      this.addEventListener("click", this);
      this.addEventListener("keydown", this);
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

      this.selectedRow = row;
      if (document.activeElement != this) {
        // Overflowing elements with tabindex=-1 steal focus. Grab it back.
        this.focus();
      }
    }

    _onKeyDown(event) {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      switch (event.key) {
        case "ArrowUp":
          this.selectedIndex = this._clampIndex(this.selectedIndex - 1);
          break;
        case "ArrowDown":
          this.selectedIndex = this._clampIndex(this.selectedIndex + 1);
          break;
        case "Home":
          this.selectedIndex = 0;
          break;
        case "End":
          this.selectedIndex = this.rowCount - 1;
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
          this.selectedIndex = i;
          break;
        }
        case "PageDown": {
          if (!this.selectedRow) {
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
          this.selectedIndex = i;
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
              this.selectedRow = parentNode;
              break;
            }
            if (selected.classList.contains("children")) {
              this.collapseRow(selected);
            }
          } else if (selected.classList.contains("children")) {
            if (selected.classList.contains("collapsed")) {
              this.expandRow(selected);
            } else {
              this.selectedRow = selected.querySelector("li");
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
        default:
          return;
      }

      event.preventDefault();
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
        this.selectedRow = null;
        return;
      }
      if (!this.selectedRow) {
        // TODO: This should only really happen on "focus".
        this.selectedRow = newRows[0];
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
        this.selectedRow = newRows[0];
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
      this.selectedRow = selectRow;
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
        childList.style.height = "0";
      }
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
     * The index of the selected row. If there are no rows, the value is -1.
     * Otherwise, should always have a value between 0 and `rowCount - 1`.
     * It is set to 0 in `connectedCallback` if there are rows.
     *
     * @type {integer}
     */
    get selectedIndex() {
      return this.rows.findIndex(row => row == this.selectedRow);
    }

    set selectedIndex(index) {
      index = this._clampIndex(index);
      this.selectedRow = this.getRowAtIndex(index);
    }

    /**
     * The selected and focused item, or null if there is none.
     *
     * @type {?HTMLLIElement}
     */
    get selectedRow() {
      return this._selectedRow;
    }

    set selectedRow(row) {
      if (row == this._selectedRow) {
        return;
      }

      if (this._selectedRow) {
        this._selectedRow.classList.remove("selected");
        this._selectedRow.setAttribute("aria-selected", "false");
      }

      this._selectedRow = row ?? null;
      if (row) {
        row.classList.add("selected");
        row.setAttribute("aria-selected", "true");
        this.setAttribute("aria-activedescendant", row.id);
        row.firstElementChild.scrollIntoView({ block: "nearest" });
      } else {
        this.removeAttribute("aria-activedescendant");
      }

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
          this.selectedRow = row;
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
          childList.style.height = "0";
        }
        return;
      }

      const childListHeight = childList.scrollHeight;

      const animation = childList.animate(
        [{ height: `${childListHeight}px` }, { height: "0" }],
        {
          duration: ANIMATION_DURATION_MS,
          easing: ANIMATION_EASING,
          fill: "both",
        }
      );
      animation.onfinish = () => {
        childList.style.height = "0";
        animation.cancel();
      };
    }

    /**
     * Animate the revealing of a row containing child items.
     *
     * @param {HTMLLIElement} row - The parent row element.
     */
    _animateExpandRow(row) {
      const childList = row.querySelector("ol, ul");

      if (reducedMotionMedia.matches) {
        if (childList) {
          childList.style.height = null;
        }
        return;
      }

      const childListHeight = childList.scrollHeight;

      const animation = childList.animate(
        [{ height: "0" }, { height: `${childListHeight}px` }],
        {
          duration: ANIMATION_DURATION_MS,
          easing: ANIMATION_EASING,
          fill: "both",
        }
      );
      animation.onfinish = () => {
        childList.style.height = null;
        animation.cancel();
      };
    }
  };

/**
 * An unordered list with the functionality of TreeListboxMixin.
 *
 * @extends HTMLUListElement
 * @mixes TreeListboxMixin
 * @tagname tree-listbox
 */
class TreeListbox extends TreeListboxMixin(HTMLUListElement) {}
customElements.define("tree-listbox", TreeListbox, { extends: "ul" });

/**
 * An ordered list with the functionality of TreeListboxMixin, plus the
 * ability to re-order the top-level list by drag-and-drop/Alt+Up/Alt+Down.
 *
 * @fires {CustomEvent} ordered - Fired when the list is re-ordered. The
 *   detail field contains the row that was re-ordered.
 * @note All children of this element should be HTML. If there are XUL
 *   elements, you're gonna have a bad time.
 * @extends HTMLOListElement
 * @mixes TreeListboxMixin
 * @tagname orderable-tree-listbox
 */
class OrderableTreeListbox extends TreeListboxMixin(HTMLOListElement) {
  connectedCallback() {
    super.connectedCallback();
    this.setAttribute("is", "orderable-tree-listbox");

    this.addEventListener("dragstart", this);
    window.addEventListener("dragover", this);
    window.addEventListener("drop", this);
    window.addEventListener("dragend", this);
  }

  handleEvent(event) {
    super.handleEvent(event);

    switch (event.type) {
      case "dragstart":
        this._onDragStart(event);
        break;
      case "dragover":
        this._onDragOver(event);
        break;
      case "drop":
        this._onDrop(event);
        break;
      case "dragend":
        this._onDragEnd(event);
        break;
    }
  }

  /**
   * An array of all top-level rows that can be reordered. Override this
   * getter to prevent reordering of one or more rows.
   *
   * @note So far this has only been used to prevent the last row being
   *   moved. Any other use is untested. It likely also works for rows at
   *   the top of the list.
   *
   * @returns {HTMLLIElement[]}
   */
  get _orderableChildren() {
    return [...this.children];
  }

  _onKeyDown(event) {
    super._onKeyDown(event);

    if (
      !event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      !["ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      return;
    }

    const row = this.selectedRow;
    if (!row || row.parentElement != this) {
      return;
    }

    let otherRow;
    if (event.key == "ArrowUp") {
      otherRow = row.previousElementSibling;
    } else {
      otherRow = row.nextElementSibling;
    }
    if (!otherRow) {
      return;
    }

    // Check we can move these rows.
    const orderable = this._orderableChildren;
    if (!orderable.includes(row) || !orderable.includes(otherRow)) {
      return;
    }

    const reducedMotion = reducedMotionMedia.matches;

    this.scrollToIndex(this.rows.indexOf(otherRow));

    // Temporarily disconnect the mutation observer to stop it changing things.
    this._mutationObserver.disconnect();
    if (event.key == "ArrowUp") {
      if (!reducedMotion) {
        const { top: otherTop } = otherRow.getBoundingClientRect();
        const { top: rowTop, height: rowHeight } = row.getBoundingClientRect();
        OrderableTreeListbox._animateTranslation(otherRow, 0 - rowHeight);
        OrderableTreeListbox._animateTranslation(row, rowTop - otherTop);
      }
      this.insertBefore(row, otherRow);
    } else {
      if (!reducedMotion) {
        const { top: otherTop, height: otherHeight } =
          otherRow.getBoundingClientRect();
        const { top: rowTop, height: rowHeight } = row.getBoundingClientRect();
        OrderableTreeListbox._animateTranslation(otherRow, rowHeight);
        OrderableTreeListbox._animateTranslation(
          row,
          rowTop - otherTop - otherHeight + rowHeight
        );
      }
      this.insertBefore(row, otherRow.nextElementSibling);
    }
    this._mutationObserver.observe(this, { subtree: true, childList: true });

    // Rows moved.
    this.domChanged();
    this.dispatchEvent(new CustomEvent("ordered", { detail: row }));
  }

  _onDragStart(event) {
    if (!event.target.closest("[draggable]")) {
      // This shouldn't be necessary, but is?!
      event.preventDefault();
      return;
    }

    const orderable = this._orderableChildren;
    if (orderable.length < 2) {
      return;
    }

    for (const topLevelRow of orderable) {
      if (topLevelRow.contains(event.target)) {
        const rect = topLevelRow.getBoundingClientRect();
        this._dragInfo = {
          row: topLevelRow,
          // How far can we move `topLevelRow` upwards?
          min: orderable[0].getBoundingClientRect().top - rect.top,
          // How far can we move `topLevelRow` downwards?
          max:
            orderable[orderable.length - 1].getBoundingClientRect().bottom -
            rect.bottom,
          // Where is the pointer relative to the scroll box of the list?
          // (Not quite, the Y position of `this` is not removed, but we'd
          // only have to do the same where this value is used.)
          scrollY: event.clientY + this.scrollTop,
          // Where is the pointer relative to `topLevelRow`?
          offsetY: event.clientY - rect.top,
        };
        topLevelRow.classList.add("dragging");

        // Prevent `topLevelRow` being used as the drag image. We don't
        // really want any drag image, but there's no way to not have one.
        event.dataTransfer.setDragImage(document.createElement("img"), 0, 0);
        return;
      }
    }
  }

  _onDragOver(event) {
    if (!this._dragInfo) {
      return;
    }

    const { row, min, max, scrollY: dragScollY, offsetY } = this._dragInfo;

    // Move `row` with the mouse pointer.
    const dragY = Math.min(
      max,
      Math.max(min, event.clientY + this.scrollTop - dragScollY)
    );
    row.style.transform = `translateY(${dragY}px)`;

    const thisRect = this.getBoundingClientRect();
    // How much space is there above `row`? We'll see how many rows fit in
    // the space and put `row` in after them.
    const spaceAbove = Math.max(
      0,
      event.clientY + this.scrollTop - offsetY - thisRect.top
    );
    // The height of all rows seen in the loop so far.
    let totalHeight = 0;
    // If we've looped past the row being dragged.
    let afterDraggedRow = false;
    // The row before where a drop would take place. If null, drop would
    // happen at the start of the list.
    let targetRow = null;

    for (const topLevelRow of this._orderableChildren) {
      if (topLevelRow == row) {
        afterDraggedRow = true;
        continue;
      }

      const rect = topLevelRow.getBoundingClientRect();
      const enoughSpace = spaceAbove > totalHeight + rect.height / 2;

      let multiplier = 0;
      if (enoughSpace) {
        if (afterDraggedRow) {
          multiplier = -1;
        }
        targetRow = topLevelRow;
      } else if (!afterDraggedRow) {
        multiplier = 1;
      }
      OrderableTreeListbox._transitionTranslation(
        topLevelRow,
        multiplier * row.clientHeight
      );

      totalHeight += rect.height;
    }

    this._dragInfo.dropTarget = targetRow;
    event.preventDefault();
  }

  _onDrop(event) {
    if (!this._dragInfo) {
      return;
    }

    const { row, dropTarget } = this._dragInfo;

    let targetRow;
    if (dropTarget) {
      targetRow = dropTarget.nextElementSibling;
    } else {
      targetRow = this.firstElementChild;
    }

    event.preventDefault();
    // Temporarily disconnect the mutation observer to stop it changing things.
    this._mutationObserver.disconnect();
    this.insertBefore(row, targetRow);
    this._mutationObserver.observe(this, { subtree: true, childList: true });
    // Rows moved.
    this.domChanged();
    this.dispatchEvent(new CustomEvent("ordered", { detail: row }));
  }

  _onDragEnd(event) {
    if (!this._dragInfo) {
      return;
    }

    this._dragInfo.row.classList.remove("dragging");
    delete this._dragInfo;

    for (const topLevelRow of this.children) {
      topLevelRow.style.transition = null;
      topLevelRow.style.transform = null;
    }
  }

  /**
   * Used to animate a real change in the order. The element is moved in the
   * DOM, then the animation makes it appear to move from the original
   * position to the new position
   *
   * @param {HTMLLIElement} element - The row to animate.
   * @param {number} from - Original Y position of the element relative to
   *   its current position.
   */
  static _animateTranslation(element, from) {
    const animation = element.animate(
      [
        { transform: `translateY(${from}px)` },
        { transform: "translateY(0px)" },
      ],
      {
        duration: ANIMATION_DURATION_MS,
        fill: "both",
      }
    );
    animation.onfinish = () => animation.cancel();
  }

  /**
   * Used to simulate a change in the order. The element remains in the same
   * DOM position.
   *
   * @param {HTMLLIElement} element - The row to animate.
   * @param {number} to - The new Y position of the element after animation.
   */
  static _transitionTranslation(element, to) {
    if (!reducedMotionMedia.matches) {
      element.style.transition = `transform ${ANIMATION_DURATION_MS}ms`;
    }
    element.style.transform = to ? `translateY(${to}px)` : null;
  }
}
customElements.define("orderable-tree-listbox", OrderableTreeListbox, {
  extends: "ol",
});
