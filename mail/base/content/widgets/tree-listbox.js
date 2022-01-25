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
       * The index of the selected row. If there are no rows, the value is -1.
       * Otherwise, should always have a value between 0 and `rowCount - 1`.
       * It is set to 0 in `connectedCallback` if there are rows.
       *
       * @type {integer}
       */
      _selectedIndex = -1;

      connectedCallback() {
        if (this.hasConnected) {
          return;
        }
        this.hasConnected = true;

        this.setAttribute("is", "tree-listbox");
        this.setAttribute("role", "listbox");
        this.setAttribute(
          "aria-keyshortcuts",
          "Up Down Left Right PageUp PageDown Home End"
        );
        this.tabIndex = 0;

        this._initRows(this);

        if (this.querySelector("li")) {
          this.selectedIndex = 0;
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
          let rowIndex = this.rows.indexOf(row);
          let didCollapse = row.classList.toggle("collapsed");
          if (didCollapse && row.querySelector(":is(ol, ul) > li.selected")) {
            // The selected row was hidden. Select the visible ancestor of it.
            this.selectedIndex = rowIndex;
          } else if (this.selectedIndex > rowIndex) {
            // Rows above the selected row have appeared or disappeared.
            // Update the index of the selected row, but don't fire a 'select'
            // event.
            this._selectedIndex = this.rows.indexOf(
              this.querySelector("li.selected")
            );
          }
          row.dispatchEvent(
            new CustomEvent(didCollapse ? "collapsed" : "expanded", {
              bubbles: true,
            })
          );

          if (didCollapse) {
            // The row was collapsed.
            this._animateCollapseRow(row);
          } else {
            // The row was revealed.
            this._animateExpandRow(row);
          }
          return;
        }

        this.selectedIndex = this.rows.findIndex(r => r == row);
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
            // Get the top of the selected row, and remove the page height.
            let selectedBox = this.getRowAtIndex(
              this.selectedIndex
            ).getBoundingClientRect();
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
            // Get the top of the selected row, and add the page height.
            let selectedBox = this.getRowAtIndex(
              this.selectedIndex
            ).getBoundingClientRect();
            let y = selectedBox.top + this.clientHeight;

            // Find the last row below there.
            let rows = this.rows;
            let i = this.rowCount - 1;
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
            let selected = this.getRowAtIndex(this.selectedIndex);

            let isArrowRight = event.key == "ArrowRight";
            let isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              let parent = selected.parentNode.closest(".children");
              if (
                parent &&
                (!selected.classList.contains("children") ||
                  selected.classList.contains("collapsed"))
              ) {
                this.selectedIndex = this.rows.indexOf(parent);
                break;
              }
              if (selected.classList.contains("children")) {
                this.collapseRowAtIndex(this.selectedIndex);
              }
            } else if (selected.classList.contains("children")) {
              if (selected.classList.contains("collapsed")) {
                this.expandRowAtIndex(this.selectedIndex);
              } else {
                this.selectedIndex = this.rows.indexOf(
                  selected.querySelector("li")
                );
              }
            }
            break;
          }
          default:
            return;
        }

        event.preventDefault();
      }

      _mutationObserver = new MutationObserver(mutations => {
        for (let mutation of mutations) {
          let ancestor = mutation.target.closest("li");

          for (let node of mutation.addedNodes) {
            if (node.nodeType != Node.ELEMENT_NODE || node.localName != "li") {
              continue;
            }

            node.classList.remove("selected");
            this._initRows(node);
            if (ancestor) {
              ancestor.classList.add("children");
            }

            if (this._selectedIndex == -1) {
              // There were no rows before this one was added. Select it.
              this.selectedIndex = 0;
            } else if (this._selectedIndex >= this.rows.indexOf(node)) {
              // The selected row is further down the list than the inserted
              // row. Update the selected index.
              this._selectedIndex += 1 + node.querySelectorAll("li").length;
            }
          }

          for (let node of mutation.removedNodes) {
            if (node.nodeType != Node.ELEMENT_NODE) {
              continue;
            }

            if (
              node.classList.contains("selected") ||
              node.querySelector(".selected")
            ) {
              // The selected row was removed from the tree. We need to find a
              // new row to select.
              if (ancestor) {
                // An ancestor remains in the tree. Select it.
                this.selectedIndex = this.rows.indexOf(ancestor);
              } else {
                let previousRow = mutation.previousSibling;
                if (previousRow && previousRow.nodeType != Node.ELEMENT_NODE) {
                  previousRow = previousRow.previousElementSibling;
                }
                if (previousRow) {
                  // There is a previous sibling. Select it.
                  this.selectedIndex = this.rows.indexOf(previousRow);
                } else if (this.childElementCount) {
                  // There is a next sibling. Select it.
                  this._selectedIndex = -1; // Force the setter to do something.
                  this.selectedIndex = 0;
                } else {
                  // There's nothing left. Clear the selection.
                  this._selectedIndex = -1;
                  this.dispatchEvent(new CustomEvent("select"));
                }
              }
            } else {
              let selectedRow = this.querySelector(".selected");
              if (
                selectedRow &&
                mutation.previousSibling &&
                mutation.previousSibling.compareDocumentPosition(selectedRow) &
                  Node.DOCUMENT_POSITION_FOLLOWING
              ) {
                // The selected row is further down the list than the removed
                // row. Update the selected index.
                if (node.localName == "li") {
                  this._selectedIndex--;
                }
                this._selectedIndex -= node.querySelectorAll("li").length;
              }
            }

            if (
              ancestor &&
              (node.localName == "ul" ||
                (node.localName == "li" &&
                  !mutation.target.querySelector("li")))
            ) {
              // There's no rows left under `ancestor`.
              ancestor.classList.remove("children");
              ancestor.classList.remove("collapsed");
            }
          }
        }
      });

      /**
       * Adds the 'option' role and 'children' class to `ancestor` if
       * appropriate and any descendants that are list items.
       */
      _initRows(ancestor) {
        let descendants = ancestor.querySelectorAll("li");

        if (ancestor.localName == "li") {
          ancestor.setAttribute("role", "option");
          if (descendants.length > 0) {
            ancestor.classList.add("children");
          }
        }

        for (let i = 0; i < descendants.length - 1; i++) {
          let row = descendants[i];
          row.setAttribute("role", "option");
          row.classList.remove("selected");
          if (i + 1 < descendants.length && row.contains(descendants[i + 1])) {
            row.classList.add("children");
          }
        }

        // Don't add any inline style if we don't need to animate.
        if (reducedMotionMedia.matches) {
          return;
        }

        // Add the height attribute to the inline style of a child list in order
        // to override the CSS declaration and guarantee a smooth transition
        // unaffected by the addition or removal of the `.collapsed` class.
        if (ancestor.matches("li.collapsed > :is(ol, ul)")) {
          ancestor.style.height = "0";
        }
        for (let childList of ancestor.querySelectorAll(
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
        return [...this.querySelectorAll("li")].filter(
          r => !r.parentNode.closest(".collapsed")
        );
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
       * @return {integer}
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
       * @return {HTMLLIElement?}
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
        return this._selectedIndex;
      }

      set selectedIndex(index) {
        index = this._clampIndex(index);
        if (index == this._selectedIndex) {
          return;
        }

        let current = this.querySelector(".selected");
        if (current) {
          current.classList.remove("selected");
          current.setAttribute("aria-selected", false);
        }

        let row = this.getRowAtIndex(index);
        if (!row) {
          if (this._selectedIndex != -1) {
            this._selectedIndex = -1;
            this.dispatchEvent(new CustomEvent("select"));
          }
          return;
        }

        row.classList.add("selected");
        row.setAttribute("aria-selected", true);
        this.setAttribute("aria-activedescendant", row.id);
        this.scrollToIndex(index);

        this._selectedIndex = index;
        if (current != row) {
          this.dispatchEvent(new CustomEvent("select"));
        }
      }

      /**
       * Collapses the row at `index` if it can be collapsed. If the selected
       * row is a descendant of the collapsing row, selection is moved to the
       * collapsing row.
       *
       * @param {integer} index
       */
      collapseRowAtIndex(index) {
        let row = this.getRowAtIndex(index);
        if (row.querySelector(".selected")) {
          this.selectedIndex = index;
        }

        if (
          row.classList.contains("children") &&
          !row.classList.contains("collapsed")
        ) {
          row.classList.add("collapsed");
          row.dispatchEvent(new CustomEvent("collapsed", { bubbles: true }));
          this._animateCollapseRow(row);
        }
      }

      /**
       * Expands the row at `index` if it can be expanded.
       *
       * @param {integer} index
       */
      expandRowAtIndex(index) {
        let row = this.getRowAtIndex(index);
        if (
          row.classList.contains("children") &&
          row.classList.contains("collapsed")
        ) {
          row.classList.remove("collapsed");
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

        let childList = row.querySelector(":is(ol, ul)");
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

        let childList = row.querySelector(":is(ol, ul)");
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
      this.setAttribute(
        "aria-keyshortcuts",
        this.getAttribute("aria-keyshortcuts") + " Alt+Up Alt+Down"
      );

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

      let row = this.rows[this.selectedIndex];
      if (row.parentElement != this) {
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

      this._selectedIndex = this.rows.findIndex(r => r == row);
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

      let selectedRow = this.rows[this.selectedIndex];

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
      this._selectedIndex = this.rows.findIndex(r => r == selectedRow);
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
        { duration: ANIMATION_DURATION_MS, fill: "both" }
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
     * Row indicies mapped to the row elements that exist in the DOM.
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
      this.setAttribute(
        "aria-keyshortcuts",
        "Up Down Left Right Space Shift+Space PageUp PageDown"
      );
      this.tabIndex = 0;

      this.attachShadow({ mode: "open" });

      this.filler = document.createElement("div");
      this.shadowRoot.appendChild(this.filler);
      this.shadowRoot.appendChild(document.createElement("slot"));

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

        if (event.ctrlKey) {
          this.currentIndex = index;
          this.toggleSelectionAtIndex(index);
        } else if (event.shiftKey) {
          this._selection.rangedSelect(-1, index, false);
          this.scrollToIndex(index);
          this.dispatchEvent(new CustomEvent("select"));
        } else {
          this.selectedIndex = index;
        }
      });

      this.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey) {
          return;
        }

        let newIndex = this.currentIndex;
        switch (event.key) {
          case "ArrowUp":
            newIndex = this.currentIndex - 1;
            break;
          case "ArrowDown":
            newIndex = this.currentIndex + 1;
            break;
          case "ArrowLeft":
          case "ArrowRight": {
            let isArrowRight = event.key == "ArrowRight";
            let isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              // Collapse action.
              let currentLevel = this._view.getLevel(newIndex);
              if (this._view.isContainerOpen(newIndex)) {
                this.collapseRowAtIndex(newIndex);
                return;
              } else if (currentLevel == 0) {
                return;
              }

              let parentIndex = this._view.getParentIndex(newIndex);
              if (parentIndex != -1) {
                this.selectedIndex = parentIndex;
              }
            } else if (this._view.isContainer(newIndex)) {
              // Expand action.
              if (!this._view.isContainerOpen(newIndex)) {
                let addedRows = this.expandRowAtIndex(newIndex);
                this.scrollToIndex(
                  newIndex +
                    Math.min(
                      addedRows,
                      this.clientHeight / this._rowElementClass.ROW_HEIGHT - 1
                    )
                );
              } else {
                this.selectedIndex++;
              }
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
              this.currentIndex -
                Math.floor(this.clientHeight / this._rowElementClass.ROW_HEIGHT)
            );
            break;
          case "PageDown":
            newIndex = Math.min(
              this._view.rowCount - 1,
              this.currentIndex +
                Math.floor(this.clientHeight / this._rowElementClass.ROW_HEIGHT)
            );
            break;
          case " ":
            if (event.originalTarget.closest("button")) {
              return;
            }
            break;
          default:
            return;
        }

        newIndex = this._clampIndex(newIndex);
        if (event.shiftKey) {
          this._selection.rangedSelect(-1, newIndex, false);
          this.scrollToIndex(newIndex);
          this.dispatchEvent(new CustomEvent("select"));
        } else {
          this.selectedIndex = newIndex;
        }
        event.preventDefault();
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
      this._rowElementName = this.getAttribute("rows") || "tree-view-listrow";
      this._rowElementClass = customElements.get(this._rowElementName);
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

      if (rowCount && this.currentIndex == -1) {
        this.currentIndex = 0;
      }
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
     * @return {integer}
     */
    _clampIndex(index) {
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
     * @return {HTMLLIElement}
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
        return;
      }

      this.getRowAtIndex(index)?.classList.add("current");
      this.scrollToIndex(index);
      this.setAttribute("aria-activedescendant", `${this.id}-row${index}`);
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get selectedIndex() {
      if (!this._selection.count) {
        return -1;
      }

      let min = {};
      this._selection.getRangeAt(0, min, {});
      return min.value;
    }

    set selectedIndex(index) {
      if (this._selection.count == 1 && this._selection.isSelected(index)) {
        return;
      }

      this._selection.select(index);
      this.currentIndex = index;
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * An array of the indicies of all selected rows.
     *
     * @type {integer[]}
     */
    get selectedIndicies() {
      let indicies = [];
      let rangeCount = this._selection.getRangeCount();

      for (let range = 0; range < rangeCount; range++) {
        let min = {};
        let max = {};
        this._selection.getRangeAt(range, min, max);

        if (min.value == -1) {
          continue;
        }

        for (let index = min.value; index <= max.value; index++) {
          indicies.push(index);
        }
      }

      return indicies;
    }

    set selectedIndicies(indicies) {
      this._selection.clearSelection();
      for (let index of indicies) {
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
      this.setAttribute("aria-posinset", index);
      this.id = `${this.list.id}-row${index}`;
      this.classList.toggle("children", this.view.isContainer(index));
      this.classList.toggle("collapsed", !this.view.isContainerOpen(index));
      this._index = index;
    }

    get selected() {
      return this.classList.contains("selected");
    }

    set selected(selected) {
      this.setAttribute("aria-selected", selected);
      this.classList.toggle("selected", !!selected);

      // Throw focus back to the list if something in this row had it.
      if (!selected && document.activeElement == this) {
        this.list.focus();
      }
    }
  }
  customElements.define("tree-view-listrow", TreeViewListrow);
}
