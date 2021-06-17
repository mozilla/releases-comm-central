/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
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
   * Note that behaviour is undefined if there are no rows. This may need to
   * be fixed in future but no current use case ever has no rows.
   */
  class TreeListbox extends HTMLUListElement {
    /**
     * The index of the selected row. This should always have a value between
     * 0 and `rowCount - 1`. It is set to 0 in `connectedCallback`.
     *
     * @type {integer}
     */
    _selectedIndex;

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

      /**
       * Adds the 'option' role and 'children' class to `ancestor` if
       * appropriate and any descendants that are list items.
       */
      function initRows(ancestor) {
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
          if (i + 1 < descendants.length && row.contains(descendants[i + 1])) {
            row.classList.add("children");
          }
        }
      }
      initRows(this);

      // There should always be a selected item. How this works for lists
      // without any items is at this stage undefined.
      this.selectedIndex = 0;

      this.addEventListener("click", event => {
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
          row.dispatchEvent(
            new CustomEvent(didCollapse ? "collapsed" : "expanded", {
              bubbles: true,
            })
          );
          if (didCollapse && row.querySelector("ul > li.selected")) {
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
          return;
        }

        this.selectedIndex = this.rows.findIndex(r => r == row);
      });

      this.addEventListener("keydown", event => {
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
                selected.classList.toggle("collapsed", true);
                selected.dispatchEvent(
                  new CustomEvent("collapsed", { bubbles: true })
                );
              }
            } else if (selected.classList.contains("children")) {
              if (selected.classList.contains("collapsed")) {
                selected.classList.remove("collapsed");
                selected.dispatchEvent(
                  new CustomEvent("expanded", { bubbles: true })
                );
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
      });

      let observer = new MutationObserver(mutations => {
        for (let mutation of mutations) {
          let ancestor = mutation.target.closest("li");

          for (let node of mutation.addedNodes) {
            if (node.localName == "li") {
              initRows(node);
              if (ancestor) {
                ancestor.classList.add("children");
              }
            }
          }

          if (!ancestor) {
            continue;
          }

          for (let node of mutation.removedNodes) {
            if (
              node.localName == "ul" ||
              (node.localName == "li" && !mutation.target.querySelector("li"))
            ) {
              ancestor.classList.remove("children");
              ancestor.classList.remove("collapsed");
            }
          }
        }
      });
      observer.observe(this, { subtree: true, childList: true });
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
     * The index of the selected row. This should always have a value between
     * 0 and `rowCount - 1`. It is set to 0 in `connectedCallback`.
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
      row.classList.add("selected");
      row.setAttribute("aria-selected", true);
      this.setAttribute("aria-activedescendant", row.id);
      this.scrollToIndex(index);

      this._selectedIndex = index;
      if (current != row) {
        this.dispatchEvent(new CustomEvent("select"));
      }
    }
  }
  customElements.define("tree-listbox", TreeListbox, { extends: "ul" });

  /**
   * A more powerful list designed to be used with a view (nsITreeView or
   * whatever replaces it in time) and be scalable to a very large number of
   * items if necessary. Multiple selections are possible and changes in the
   * connected view are cause updates to the list (provided `rowCountChanged`/
   * `invalidate` are called as appropriate). Nested rows are not currently
   * possible but this is planned.
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
     * In a selection, index of the first-selected row.
     *
     * @type {integer}
     */
    _anchorIndex = 0;

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    _currentIndex = 0;

    _selectedIndicies = [];

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

        if (event.ctrlKey) {
          this._anchorIndex = index;
          this.currentIndex = index;
          this.toggleSelectionAtIndex(index);
        } else if (event.shiftKey) {
          let topIndex = Math.min(this._anchorIndex, index);
          let bottomIndex = Math.max(this._anchorIndex, index);

          this.currentIndex = index;
          this._setSelectionRange(topIndex, bottomIndex);
        } else {
          this.selectedIndex = index;
        }
      });

      this.addEventListener("keydown", event => {
        if (
          event.altKey ||
          (event.ctrlKey && event.key != "a" && event.key != "A") ||
          event.metaKey
        ) {
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
          case "A":
          case "a":
            if (event.ctrlKey) {
              this._anchorIndex = 0;
              this.currentIndex = this._view.rowCount - 1;
              this._setSelectionRange(0, this.currentIndex);
              event.preventDefault();
            }
            return;
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
          this.currentIndex = newIndex;
          this._setSelectionRange(this._anchorIndex, newIndex);
        } else {
          this.selectedIndex = newIndex;
        }
        event.preventDefault();
      });

      let lastTime = 0;
      let timer = null;
      this.addEventListener("scroll", () => {
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
      if (this._view) {
        this._view.setTree(null);
      }

      this._view = view;
      this._view.setTree(this);
      this._rowElementName = this.getAttribute("rows") || "tree-view-listrow";
      this._rowElementClass = customElements.get(this._rowElementName);
      this.invalidate();
      this.selectedIndex = -1;

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

      this.filler.style.minHeight =
        this._view.rowCount * this._rowElementClass.ROW_HEIGHT + "px";
      this._ensureVisibleRowsAreDisplayed();
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
     * TODO: Currently this is barely optimised.
     *
     * @param {integer} index
     */
    rowCountChanged(index, delta) {
      for (let i = 0; i < this._selectedIndicies.length; i++) {
        if (index <= this._selectedIndicies[i]) {
          if (delta < 0 && this._selectedIndicies[i] < index - delta) {
            // A selected row was removed, take it out of _selectedIndicies.
            this._selectedIndicies.splice(i--, 1);
            continue;
          }
          this._selectedIndicies[i] += delta;
        }
      }

      let rowCount = this._view.rowCount;
      let oldRowCount = rowCount - delta;
      if (
        // Change happened beyond the rows that exist in the DOM and
        index > this._lastRowIndex &&
        // we weren't at the end of the list.
        this._lastRowIndex + 1 < oldRowCount
      ) {
        this.filler.style.minHeight =
          rowCount * this._rowElementClass.ROW_HEIGHT + "px";
        return;
      }

      this.invalidate();

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
      if (this._selectedIndicies.includes(index)) {
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
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get currentIndex() {
      return this._currentIndex;
    }

    set currentIndex(index) {
      if (index < 0 || index > this._view.rowCount - 1) {
        return;
      }
      for (let row of this.querySelectorAll(
        `${this._rowElementName}.current`
      )) {
        row.classList.remove("current");
      }

      this._currentIndex = index;
      this.getRowAtIndex(index)?.classList.add("current");
      this.scrollToIndex(index);
      this.setAttribute("aria-activedescendant", `row${index}`);
    }

    /**
     * In a selection, index of the most-recently-selected row.
     *
     * @type {integer}
     */
    get selectedIndex() {
      return this._selectedIndicies.length ? this._selectedIndicies[0] : -1;
    }

    set selectedIndex(index) {
      if (this._selectedIndicies.length == 1 && this.selectedIndex == index) {
        return;
      }

      for (let row of this.querySelectorAll(
        `${this._rowElementName}.selected`
      )) {
        row.selected = false;
      }
      this._selectedIndicies.length = 0;

      if (index < 0 || index > this._view.rowCount - 1) {
        this._anchorIndex = 0;
        this.currentIndex = 0;
        return;
      }

      this._anchorIndex = index;
      this.currentIndex = index;
      this._selectedIndicies.push(index);
      if (this.getRowAtIndex(index)) {
        this.getRowAtIndex(index).selected = true;
      }

      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * An array of the indicies of all selected rows.
     *
     * @type {integer[]}
     */
    get selectedIndicies() {
      return this._selectedIndicies.slice();
    }

    set selectedIndicies(indicies) {
      this._selectedIndicies = indicies.slice();
      for (let [index, row] of this._rows) {
        row.selected = indicies.includes(index);
      }
      this.dispatchEvent(new CustomEvent("select"));
    }

    /**
     * Selects every row from topIndex to bottomIndex, inclusive.
     *
     * @param {integer} topIndex
     * @param {integer} bottomIndex
     */
    _setSelectionRange(topIndex, bottomIndex) {
      if (topIndex > bottomIndex) {
        [topIndex, bottomIndex] = [bottomIndex, topIndex];
      }
      topIndex = this._clampIndex(topIndex);
      bottomIndex = this._clampIndex(bottomIndex);

      for (let i of this._selectedIndicies.slice()) {
        this.toggleSelectionAtIndex(i, false, true);
      }
      for (let i = topIndex; i <= bottomIndex; i++) {
        this.toggleSelectionAtIndex(i, true, true);
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
      let i = this._selectedIndicies.indexOf(index);
      let wasSelected = i >= 0;
      if (selected === undefined) {
        selected = !wasSelected;
      }

      let row = this.getRowAtIndex(index);
      if (row) {
        row.selected = selected;
      }

      if (selected != wasSelected) {
        if (wasSelected) {
          this._selectedIndicies.splice(i, 1);
        } else {
          this._selectedIndicies.push(index);
        }

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

    /**
     * CSS to apply to this row.
     *
     * @type {string}
     */
    static styles = "";

    /**
     * The inner HTML for this row. Construct it using DOM methods or from a
     * template. Performance is important here.
     *
     * @type {HTMLDocumentFragment}
     */
    static get fragment() {
      if (!this.hasOwnProperty("_fragment")) {
        this._fragment = document.createDocumentFragment();
      }
      return document.importNode(this._fragment, true);
    }

    constructor() {
      super();

      this.attachShadow({ mode: "open" });
      let style = document.createElement("style");
      style.textContent = this.constructor.styles;
      this.shadowRoot.appendChild(style);

      this.shadowRoot.appendChild(this.constructor.fragment);
    }

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
