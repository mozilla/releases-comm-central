/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  ChromeUtils.defineModuleGetter(
    this,
    "JSTreeSelection",
    "resource:///modules/JsTreeSelection.jsm"
  );

  // Animation variables for expanding and collapsing child lists.
  const ANIMATION_DURATION_MS = 200;
  const ANIMATION_EASING = "ease";
  let reducedMotionMedia = matchMedia("(prefers-reduced-motion)");

  /**
   * Provides keyboard and mouse interaction to a (possibly nested) list.
   * It is intended for lists with a small number (up to 1000?) of items.
   * Only one item can be selected at a time. Maintenance of the items in the
   * list is not managed here. Styling of the list is not managed here.
   *
   * The following class names apply to list items:
   * - selected: Indicates the currently selected list item.
   * - children: If the list item has descendants.
   * - collapsed: If the list item's descendants are hidden.
   *
   * List items can provide their own twisty element, which will operate when
   * clicked on if given the class name "twisty".
   *
   * This class fires "collapsed", "expanded" and "select" events.
   */
  let TreeListboxMixin = Base =>
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
            throw new RangeError(
              `Unsupported role ${this.getAttribute("role")}`
            );
        }
        this.tabIndex = 0;

        this.domChanged();
        this._initRows();
        let rows = this.rows;
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

        let row = event.target.closest("li");
        if (!row) {
          return;
        }

        if (
          row.classList.contains("children") &&
          event.target.closest(".twisty")
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
            let selectedBox = this.selectedRow.getBoundingClientRect();
            let y = selectedBox.top - this.clientHeight;

            // Find the last row below there.
            let rows = this.rows;
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
            let selectedBox = this.selectedRow.getBoundingClientRect();
            let y = selectedBox.top + this.clientHeight;

            // Find the last row below there.
            let rows = this.rows;
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
            let selected = this.selectedRow;
            if (!selected) {
              break;
            }

            let isArrowRight = event.key == "ArrowRight";
            let isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              let parent = selected.parentNode.closest(".children");
              if (
                parent &&
                (!selected.classList.contains("children") ||
                  selected.classList.contains("collapsed"))
              ) {
                this.selectedRow = parent;
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
          let ancestors = [];
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
        for (let mutation of mutations) {
          for (let node of mutation.addedNodes) {
            if (node.nodeType != Node.ELEMENT_NODE || !node.matches("li")) {
              continue;
            }
            // No item can already be selected on addition.
            node.classList.remove("selected");
          }
        }
        let oldRowsData = this._rowsData;
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
        let oldSelectedIndex = oldRowsData.findIndex(
          entry => entry.row == this.selectedRow
        );
        if (oldSelectedIndex < 0) {
          // Unexpected, the selectedRow was not in our _rowsData list.
          this.selectedRow = newRows[0];
          return;
        }
        // Find the closest ancestor that is still shown.
        let existingAncestor = oldRowsData[
          oldSelectedIndex
        ].ancestors.find(row => newRows.includes(row));
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
        let descendantItems = this.querySelectorAll("li");
        let descendantLists = this.querySelectorAll("ol, ul");

        for (let i = 0; i < descendantItems.length; i++) {
          let row = descendantItems[i];
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
          for (let list of descendantLists) {
            list.setAttribute("role", "group");
          }
        }

        // Don't add any inline style if we don't need to animate.
        if (reducedMotionMedia.matches) {
          return;
        }

        for (let childList of this.querySelectorAll(
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
        return [...this.querySelectorAll("li")].filter(row => {
          let collapsed = row.parentNode.closest("li.collapsed");
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
          row.scrollIntoView({ block: "nearest" });
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
        if (reducedMotionMedia.matches) {
          return;
        }

        let childList = row.querySelector("ol, ul");
        let childListHeight = childList.scrollHeight;

        let animation = childList.animate(
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
        if (reducedMotionMedia.matches) {
          return;
        }

        let childList = row.querySelector("ol, ul");
        let childListHeight = childList.scrollHeight;

        let animation = childList.animate(
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
   */
  class TreeListbox extends TreeListboxMixin(HTMLUListElement) {}
  customElements.define("tree-listbox", TreeListbox, { extends: "ul" });

  /**
   * An ordered list with the functionality of TreeListboxMixin, plus the
   * ability to re-order the top-level list by drag-and-drop/Alt+Up/Alt+Down.
   *
   * This class fires an "ordered" event when the list is re-ordered.
   *
   * @note All children of this element should be HTML. If there are XUL
   * elements, you're gonna have a bad time.
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

      let row = this.selectedRow;
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
      let orderable = this._orderableChildren;
      if (!orderable.includes(row) || !orderable.includes(otherRow)) {
        return;
      }

      let reducedMotion = reducedMotionMedia.matches;

      this.scrollToIndex(this.rows.indexOf(otherRow));

      // Temporarily disconnect the mutation observer to stop it changing things.
      this._mutationObserver.disconnect();
      if (event.key == "ArrowUp") {
        if (!reducedMotion) {
          let { top: otherTop } = otherRow.getBoundingClientRect();
          let { top: rowTop, height: rowHeight } = row.getBoundingClientRect();
          OrderableTreeListbox._animateTranslation(otherRow, 0 - rowHeight);
          OrderableTreeListbox._animateTranslation(row, rowTop - otherTop);
        }
        this.insertBefore(row, otherRow);
      } else {
        if (!reducedMotion) {
          let {
            top: otherTop,
            height: otherHeight,
          } = otherRow.getBoundingClientRect();
          let { top: rowTop, height: rowHeight } = row.getBoundingClientRect();
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

      let orderable = this._orderableChildren;
      if (orderable.length < 2) {
        return;
      }

      for (let topLevelRow of orderable) {
        if (topLevelRow.contains(event.target)) {
          let rect = topLevelRow.getBoundingClientRect();
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

      let { row, min, max, scrollY, offsetY } = this._dragInfo;

      // Move `row` with the mouse pointer.
      let dragY = Math.min(
        max,
        Math.max(min, event.clientY + this.scrollTop - scrollY)
      );
      row.style.transform = `translateY(${dragY}px)`;

      let thisRect = this.getBoundingClientRect();
      // How much space is there above `row`? We'll see how many rows fit in
      // the space and put `row` in after them.
      let spaceAbove = Math.max(
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

      for (let topLevelRow of this._orderableChildren) {
        if (topLevelRow == row) {
          afterDraggedRow = true;
          continue;
        }

        let rect = topLevelRow.getBoundingClientRect();
        let enoughSpace = spaceAbove > totalHeight + rect.height / 2;

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

      let { row, dropTarget } = this._dragInfo;

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

      for (let topLevelRow of this.children) {
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
      let animation = element.animate(
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

  /**
   * A more powerful list designed to be used with a view (nsITreeView or
   * whatever replaces it in time) and be scalable to a very large number of
   * items if necessary. Multiple selections are possible and changes in the
   * connected view are cause updates to the list (provided `rowCountChanged`/
   * `invalidate` are called as appropriate).
   *
   * Rows are provided by a custom element that inherits from
   * TreeViewListrow below. Set the name of the custom element as the "rows"
   * attribute.
   *
   * Include tree-listbox.css for appropriate styling.
   */
  class TreeViewListbox extends HTMLElement {
    static observedAttributes = ["rows"];

    /**
     * How many rows outside the visible area to keep in memory. We keep some
     * rows above and below those that are visible to avoid blank space
     * appearing when the user scrolls.
     *
     * @type {integer}
     */
    static OVERFLOW_BUFFER = 10;

    /**
     * Index of the first row that exists in the DOM.
     *
     * @type {integer}
     */
    _firstRowIndex = 0;

    /**
     * Index of the last row that exists in the DOM.
     *
     * @type {integer}
     */
    _lastRowIndex = 0;

    /**
     * Row indices mapped to the row elements that exist in the DOM.
     *
     * @type {Map(integer -> Element)}
     */
    _rows = new Map();

    /**
     * The current view.
     *
     * @type {nsITreeView}
     */
    _view = null;

    /**
     * The current selection.
     *
     * @type {nsITreeSelection}
     */
    _selection = null;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("role", "listbox");
      this.tabIndex = 0;

      this.attachShadow({ mode: "open" });

      this.filler = document.createElement("div");
      this.shadowRoot.appendChild(this.filler);
      this.shadowRoot.appendChild(document.createElement("slot"));

      this.setAttribute("aria-multiselectable", "true");

      this.addEventListener("focus", event => {
        if (this._preventFocusHandler) {
          this._preventFocusHandler = false;
          return;
        }
        if (this.currentIndex == -1 && this._view.rowCount) {
          let selectionChanged = false;
          if (this.selectedIndex == -1) {
            this._selection.select(0);
            selectionChanged = true;
          }
          this.currentIndex = this.selectedIndex;
          if (selectionChanged) {
            this.dispatchEvent(new CustomEvent("select"));
          }
        }
      });

      this.addEventListener("mousedown", event => {
        if (
          this == document.activeElement ||
          !event.target.closest(this._rowElementName)
        ) {
          return;
        }
        // We prevent the focus handler because it can change the selection
        // state, which currently rebuilds the view. If this happens the mouseup
        // event will be on a different element, which means it will not receive
        // the "click" event.
        // Instead, we let the click handler change the selection state instead
        // of the focus handler.
        // Ideally, instead of this hack, we would not rebuild the view when
        // just the selection changes since it should be a light operation.
        this._preventFocusHandler = true;
        // We expect the property to be cleared in the focus handler, because
        // the default mousedown will invoke it, but we clear the property at
        // the next loop just in case.
        setTimeout(() => {
          this._preventFocusHandler = false;
        });
      });

      this.addEventListener("click", event => {
        if (event.button !== 0) {
          return;
        }

        let row = event.target.closest(this._rowElementName);
        if (!row) {
          return;
        }

        let index = row.index;

        if (this._view.isContainer(index) && event.target.closest(".twisty")) {
          if (this._view.isContainerOpen(index)) {
            this.collapseRowAtIndex(index);
          } else {
            let addedRows = this.expandRowAtIndex(index);
            this.scrollToIndex(
              index +
                Math.min(
                  addedRows,
                  this.clientHeight / this._rowElementClass.ROW_HEIGHT - 1
                )
            );
          }
          return;
        }

        if (event.ctrlKey && event.shiftKey) {
          return;
        }

        if (event.ctrlKey) {
          this._toggleSelected(index);
        } else if (event.shiftKey) {
          this._selectRange(index);
        } else {
          this._selectSingle(index);
        }
      });

      this.addEventListener("keydown", event => {
        if (event.altKey || event.metaKey) {
          return;
        }

        let currentIndex = this.currentIndex == -1 ? 0 : this.currentIndex;
        let newIndex;
        switch (event.key) {
          case "ArrowUp":
            newIndex = currentIndex - 1;
            break;
          case "ArrowDown":
            newIndex = currentIndex + 1;
            break;
          case "ArrowLeft":
          case "ArrowRight": {
            event.preventDefault();
            if (this.currentIndex == -1) {
              return;
            }
            let isArrowRight = event.key == "ArrowRight";
            let isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              // Collapse action.
              let currentLevel = this._view.getLevel(this.currentIndex);
              if (this._view.isContainerOpen(this.currentIndex)) {
                this.collapseRowAtIndex(this.currentIndex);
                return;
              } else if (currentLevel == 0) {
                return;
              }

              let parentIndex = this._view.getParentIndex(this.currentIndex);
              if (parentIndex != -1) {
                newIndex = parentIndex;
              }
            } else if (this._view.isContainer(this.currentIndex)) {
              // Expand action.
              if (!this._view.isContainerOpen(this.currentIndex)) {
                let addedRows = this.expandRowAtIndex(this.currentIndex);
                this.scrollToIndex(
                  this.currentIndex +
                    Math.min(
                      addedRows,
                      this.clientHeight / this._rowElementClass.ROW_HEIGHT - 1
                    )
                );
              } else {
                newIndex = this.currentIndex + 1;
              }
            }
            if (newIndex != undefined) {
              this._selectSingle(newIndex);
            }
            return;
          }
          case "Home":
            newIndex = 0;
            break;
          case "End":
            newIndex = this._view.rowCount - 1;
            break;
          case "PageUp":
            newIndex = Math.max(
              0,
              currentIndex -
                Math.floor(this.clientHeight / this._rowElementClass.ROW_HEIGHT)
            );
            break;
          case "PageDown":
            newIndex = Math.min(
              this._view.rowCount - 1,
              currentIndex +
                Math.floor(this.clientHeight / this._rowElementClass.ROW_HEIGHT)
            );
            break;
        }

        if (newIndex != undefined) {
          newIndex = this._clampIndex(newIndex);
          if (newIndex != null && (!event.ctrlKey || !event.shiftKey)) {
            // Else, if both modifiers pressed, do nothing.
            if (event.shiftKey) {
              this._selectRange(newIndex);
            } else if (event.ctrlKey) {
              // Change focus, but not selection.
              this.currentIndex = newIndex;
            } else {
              this._selectSingle(newIndex);
            }
          }
          event.preventDefault();
          return;
        }

        if (event.key == " ") {
          if (this.currentIndex != -1 && !event.shiftKey) {
            if (event.ctrlKey) {
              this._toggleSelected(this.currentIndex);
            } else {
              this._selectSingle(this.currentIndex);
            }
          }
          event.preventDefault();
        }
      });

      let lastTime = 0;
      let timer = null;
      this.addEventListener("scroll", () => {
        if (reducedMotionMedia.matches) {
          this._ensureVisibleRowsAreDisplayed();
          return;
        }

        let now = Date.now();
        let diff = now - lastTime;

        if (diff > 100) {
          this._ensureVisibleRowsAreDisplayed();
          lastTime = now;
        } else if (!timer) {
          timer = setTimeout(() => {
            this._ensureVisibleRowsAreDisplayed();
            lastTime = now;
            timer = null;
          }, 100 - diff);
        }
      });

      window.addEventListener("load", this);
      window.addEventListener("resize", this);
    }

    disconnectedCallback() {
      for (let row of this._rows.values()) {
        row.remove();
      }
      this._rows.clear();

      while (this.shadowRoot.lastChild) {
        this.shadowRoot.lastChild.remove();
      }

      window.removeEventListener("load", this);
      window.removeEventListener("resize", this);
    }

    handleEvent(event) {
      switch (event.type) {
        case "load":
        case "resize":
          this._ensureVisibleRowsAreDisplayed();
          break;
      }
    }

    attributeChangedCallback(name, oldValue, newValue) {
      this._rowElementName = newValue || "tree-view-listrow";
      this._rowElementClass = customElements.get(this._rowElementName);

      if (this._view) {
        this.invalidate();
      }
    }

    /**
     * The current view for this list.
     *
     * @type {nsITreeView}
     */
    get view() {
      return this._view;
    }

    set view(view) {
      this._selection = null;
      if (this._view) {
        this._view.setTree(null);
        this._view.selection = null;
      }
      if (this._selection) {
        this._selection.view = null;
      }

      this._view = view;
      if (view) {
        try {
          this._selection = new JSTreeSelection();
          this._selection.tree = this;
          this._selection.view = view;

          view.selection = this._selection;
          view.setTree(this);
        } catch (ex) {
          // This isn't a XULTreeElement, and we can't make it one, so if the
          // `setTree` call crosses XPCOM, an exception will be thrown.
          if (ex.result != Cr.NS_ERROR_XPC_BAD_CONVERT_JS) {
            throw ex;
          }
        }
      }
      this.invalidate();

      this.dispatchEvent(new CustomEvent("viewchange"));
    }

    /**
     * Clear all rows from the list and create them again.
     */
    invalidate() {
      for (let row of this._rows.values()) {
        row.remove();
      }
      this._rows.clear();
      this._firstRowIndex = 0;
      this._lastRowIndex = 0;

      let rowCount = this._view ? this._view.rowCount : 0;
      this.filler.style.minHeight =
        rowCount * this._rowElementClass.ROW_HEIGHT + "px";
      this._ensureVisibleRowsAreDisplayed();
    }

    /**
     * Invalidate the row at `index` in place. If `index` refers to a row that
     * should exist but doesn't (because the row count increased), adds a row.
     * If `index` refers to a row that does exist but shouldn't (because the
     * row count decreased), removes it.
     *
     * @param {integer} index
     */
    invalidateRow(index) {
      let row = this.getRowAtIndex(index);
      if (row) {
        if (index >= this._view.rowCount) {
          row.remove();
          this._rows.delete(index);
        } else {
          row.index = index;
          row.selected = this._selection.isSelected(index);
        }
      } else if (index >= this._firstRowIndex && index <= this._lastRowIndex) {
        this._addRowAtIndex(index);
      }
    }

    /**
     * Fills the view with rows at the current scroll position. Also creates
     * `OVERFLOW_BUFFER` rows above and below the visible rows. Performance
     * here is important.
     */
    _ensureVisibleRowsAreDisplayed() {
      if (!this.view || this.view.rowCount == 0) {
        return;
      }

      let { clientHeight, scrollTop } = this;

      let first = Math.max(
        0,
        Math.floor(scrollTop / this._rowElementClass.ROW_HEIGHT) -
          this.constructor.OVERFLOW_BUFFER
      );
      let last = Math.min(
        this._view.rowCount - 1,
        Math.floor(
          (scrollTop + clientHeight) / this._rowElementClass.ROW_HEIGHT
        ) + this.constructor.OVERFLOW_BUFFER
      );

      for (
        let i = this._firstRowIndex - 1, iTo = Math.max(first, 0);
        i >= iTo;
        i--
      ) {
        this._addRowAtIndex(i, this.firstElementChild);
      }
      if (this._lastRowIndex == 0 && this.childElementCount == 0) {
        // Special case for first call.
        this._addRowAtIndex(0);
      }
      for (
        let i = this._lastRowIndex + 1,
          iTo = Math.min(last + 1, this._view.rowCount);
        i < iTo;
        i++
      ) {
        this._addRowAtIndex(i);
      }

      let firstActualRow = this.getRowAtIndex(first);
      let row = firstActualRow.previousElementSibling;
      while (row) {
        row.remove();
        this._rows.delete(row.index);
        row = firstActualRow.previousElementSibling;
      }

      let lastActualRow = this.getRowAtIndex(last);
      row = lastActualRow.nextElementSibling;
      while (lastActualRow.nextElementSibling) {
        row.remove();
        this._rows.delete(row.index);
        row = lastActualRow.nextElementSibling;
      }

      this._firstRowIndex = first;
      this._lastRowIndex = last;
    }

    /**
     * Index of the first visible or partly visible row.
     *
     * @returns {integer}
     */
    getFirstVisibleIndex() {
      return Math.ceil(this.scrollTop / this._rowElementClass.ROW_HEIGHT);
    }

    /**
     * Ensures that the row at `index` is on the screen.
     *
     * @param {integer} index
     */
    scrollToIndex(index) {
      let topIndex = this._rowElementClass.ROW_HEIGHT * index;
      let bottomIndex = topIndex + this._rowElementClass.ROW_HEIGHT;

      let { clientHeight, scrollTop } = this;
      if (topIndex < scrollTop) {
        this.scrollTo(0, topIndex);
      } else if (bottomIndex > scrollTop + clientHeight) {
        this.scrollTo(0, bottomIndex - clientHeight);
      }
    }

    /**
     * Updates the list to reflect added or removed rows.
     *
     * @param {integer} index
     */
    rowCountChanged(index, delta) {
      this._selection.adjustSelection(index, delta);
      this.dispatchEvent(new CustomEvent("rowcountchange"));
    }

    /**
     * Clamps `index` to a value between 0 and `rowCount - 1`.
     *
     * @param {integer} index
     * @returns {integer}
     */
    _clampIndex(index) {
      if (!this._view.rowCount) {
        return null;
      }
      if (index < 0) {
        return 0;
      }
      if (index >= this._view.rowCount) {
        return this._view.rowCount - 1;
      }
      return index;
    }

    /**
     * Creates a new row element and adds it to the DOM.
     *
     * @param {integer} index
     */
    _addRowAtIndex(index, before = null) {
      let row = this.insertBefore(
        document.createElement(this._rowElementName),
        before
      );
      row.setAttribute("role", "option");
      row.setAttribute("aria-setsize", this._view.rowCount);
      row.style.top = `${this._rowElementClass.ROW_HEIGHT * index}px`;
      row.style.height = `${this._rowElementClass.ROW_HEIGHT}px`;
      if (this._selection.isSelected(index)) {
        row.selected = true;
      }
      if (this.currentIndex === index) {
        row.classList.add("current");
      }
      row.index = index;
      this._rows.set(index, row);
    }

    /**
     * Returns the row element at `index` or null if `index` is out of range.
     *
     * @param {integer} index
     * @returns {HTMLLIElement}
     */
    getRowAtIndex(index) {
      return this._rows.get(index) ?? null;
    }

    /**
     * Collapses the row at `index` if it can be collapsed. If the selected
     * row is a descendant of the collapsing row, selection is moved to the
     * collapsing row.
     *
     * @param {integer} index
     */
    collapseRowAtIndex(index) {
      if (!this._view.isContainerOpen(index)) {
        return;
      }

      // If the selected row is going to be collapsed, move the selection.
      let selectedIndex = this.selectedIndex;
      while (selectedIndex > index) {
        selectedIndex = this._view.getParentIndex(selectedIndex);
        if (selectedIndex == index) {
          this.selectedIndex = index;
          break;
        }
      }

      // Check if the view calls rowCountChanged. If it didn't, we'll have to
      // call it. This can happen if the view has no reference to the tree.
      let rowCountDidChange = false;
      let rowCountChangeListener = () => {
        rowCountDidChange = true;
      };

      let countBefore = this._view.rowCount;
      this.addEventListener("rowcountchange", rowCountChangeListener);
      this._view.toggleOpenState(index);
      this.removeEventListener("rowcountchange", rowCountChangeListener);
      let countAdded = this._view.rowCount - countBefore;

      // Call rowCountChanged, if it hasn't already happened.
      if (countAdded && !rowCountDidChange) {
        this.invalidateRow(index);
        this.rowCountChanged(index + 1, countAdded);
      }

      this.dispatchEvent(
        new CustomEvent("collapsed", { bubbles: true, detail: index })
      );
    }

    /**
     * Expands the row at `index` if it can be expanded.
     *
     * @param {integer} index
     * @returns {integer} - the number of rows that were added
     */
    expandRowAtIndex(index) {
      if (!this._view.isContainer(index) || this._view.isContainerOpen(index)) {
        return 0;
      }

      // Check if the view calls rowCountChanged. If it didn't, we'll have to
      // call it. This can happen if the view has no reference to the tree.
      let rowCountDidChange = false;
      let rowCountChangeListener = () => {
        rowCountDidChange = true;
      };

      let countBefore = this._view.rowCount;
      this.addEventListener("rowcountchange", rowCountChangeListener);
      this._view.toggleOpenState(index);
      this.removeEventListener("rowcountchange", rowCountChangeListener);
      let countAdded = this._view.rowCount - countBefore;

      // Call rowCountChanged, if it hasn't already happened.
      if (countAdded && !rowCountDidChange) {
        this.invalidateRow(index);
        this.rowCountChanged(index + 1, countAdded);
      }

      this.dispatchEvent(
        new CustomEvent("expanded", { bubbles: true, detail: index })
      );

      return countAdded;
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get currentIndex() {
      return this._selection.currentIndex;
    }

    set currentIndex(index) {
      if (!this._view) {
        return;
      }

      for (let row of this.querySelectorAll(
        `${this._rowElementName}.current`
      )) {
        row.classList.remove("current");
      }

      this._selection.currentIndex = index;

      if (index < 0 || index > this._view.rowCount - 1) {
        this.removeAttribute("aria-activedescendant");
        return;
      }

      this.getRowAtIndex(index)?.classList.add("current");
      this.scrollToIndex(index);
      this.setAttribute("aria-activedescendant", `${this.id}-row${index}`);
    }

    /**
     * Select and focus the given index.
     *
     * @param {number} index - The index to select.
     */
    _selectSingle(index) {
      let changeSelection =
        this._selection.count != 1 || !this._selection.isSelected(index);
      if (changeSelection) {
        this._selection.select(index);
      }
      this.currentIndex = index;
      if (changeSelection) {
        this.dispatchEvent(new CustomEvent("select"));
      }
    }

    /**
     * Start or extend a range selection to the given index and focus it.
     *
     * @param {number} index - The index to select.
     */
    _selectRange(index) {
      this._selection.rangedSelect(-1, index, false);
      this.currentIndex = index;
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Toggle the selection state at the given index and focus it.
     *
     * @param {number} index - The index to toggle.
     */
    _toggleSelected(index) {
      this._selection.toggleSelect(index);
      // We hack the internals of the JSTreeSelection to clear the
      // shiftSelectPivot.
      this._selection._shiftSelectPivot = null;
      this.currentIndex = index;
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get selectedIndex() {
      if (!this._selection?.count) {
        return -1;
      }

      let min = {};
      this._selection.getRangeAt(0, min, {});
      return min.value;
    }

    set selectedIndex(index) {
      this._selectSingle(index);
    }

    /**
     * An array of the indices of all selected rows.
     *
     * @type {integer[]}
     */
    get selectedIndices() {
      let indices = [];
      let rangeCount = this._selection.getRangeCount();

      for (let range = 0; range < rangeCount; range++) {
        let min = {};
        let max = {};
        this._selection.getRangeAt(range, min, max);

        if (min.value == -1) {
          continue;
        }

        for (let index = min.value; index <= max.value; index++) {
          indices.push(index);
        }
      }

      return indices;
    }

    set selectedIndices(indices) {
      this._selection.clearSelection();
      for (let index of indices) {
        this._selection.toggleSelect(index);
      }
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Changes the selection state of the row at `index`.
     *
     * @param {integer} index
     * @param {boolean?} selected - if set, set the selection state to this
     *     value, otherwise toggle the current state
     * @param {boolean?} suppressEvent - prevent a "select" event firing
     * @returns {boolean} - if the index is now selected
     */
    toggleSelectionAtIndex(index, selected, suppressEvent) {
      let wasSelected = this._selection.isSelected(index);
      if (selected === undefined) {
        selected = !wasSelected;
      }

      if (selected != wasSelected) {
        this._selection.toggleSelect(index);

        if (!suppressEvent) {
          this.dispatchEvent(new CustomEvent("select"));
        }
      }

      return selected;
    }
  }
  customElements.define("tree-view-listbox", TreeViewListbox);

  /**
   * Base class for rows in a TreeViewListbox. Rows have a fixed height and
   * their position on screen is managed by the owning list.
   *
   * Sub-classes should override ROW_HEIGHT, styles, and fragment to suit the
   * intended layout. The index getter/setter should be overridden to fill the
   * layout with values.
   */
  class TreeViewListrow extends HTMLElement {
    /**
     * Fixed height of this row. Rows in the list will be spaced this far
     * apart. This value must not change at runtime.
     *
     * @type {integer}
     */
    static ROW_HEIGHT = 50;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.list = this.parentNode;
      this.view = this.list.view;
      this.setAttribute("aria-selected", !!this.selected);
    }

    /**
     * The 0-based position of this row in the list. Override this setter to
     * fill layout based on values from the list's view. Always call back to
     * this class's getter/setter when inheriting.
     *
     * @type {integer}
     */
    get index() {
      return this._index;
    }

    set index(index) {
      this.setAttribute("aria-posinset", index + 1);
      this.id = `${this.list.id}-row${index}`;
      this.classList.toggle("children", this.view.isContainer(index));
      this.classList.toggle("collapsed", !this.view.isContainerOpen(index));
      this._index = index;
    }

    get selected() {
      return this.classList.contains("selected");
    }

    set selected(selected) {
      this.setAttribute("aria-selected", !!selected);
      this.classList.toggle("selected", !!selected);
    }
  }
  customElements.define("tree-view-listrow", TreeViewListrow);
}
