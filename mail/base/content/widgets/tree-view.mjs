/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
import { TreeSelection } from "chrome://messenger/content/tree-selection.mjs";

// Account for the mac OS accelerator key variation.
// Use these strings to check keyboard event properties.
const accelKeyName = AppConstants.platform == "macosx" ? "metaKey" : "ctrlKey";
const otherKeyName = AppConstants.platform == "macosx" ? "ctrlKey" : "metaKey";

/**
 * Main tree view container that takes care of generating the main scrollable
 * DIV and the tree table.
 */
class TreeView extends HTMLElement {
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

    // Prevent this element from being part of the roving tab focus since we
    // handle that independently for the TreeViewTableBody and we don't want any
    // interference from this.
    this.tabIndex = -1;
    this.classList.add("tree-view-scrollable-container");

    this.table = document.createElement("table", { is: "tree-view-table" });
    this.appendChild(this.table);

    this.placeholder = this.querySelector(`slot[name="placeholders"]`);

    this.addEventListener("keyup", event => {
      if (
        ["Tab", "F6"].includes(event.key) &&
        this.currentIndex == -1 &&
        this._view?.rowCount
      ) {
        let selectionChanged = false;
        if (this.selectedIndex == -1) {
          this._selection.select(0);
          selectionChanged = true;
        }
        this.currentIndex = this.selectedIndex;
        if (selectionChanged) {
          this.onSelectionChanged();
        }
      }
    });

    this.addEventListener("click", event => {
      if (event.button !== 0) {
        return;
      }

      let row = event.target.closest(`tr[is="${this._rowElementName}"]`);
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
        this.focus();
        return;
      }

      if (event[accelKeyName] && event.shiftKey) {
        return;
      }

      // Handle the click as a CTRL extension if it happens on the checkbox
      // image inside the selection column.
      if (event.target.classList.contains("tree-view-row-select-checkbox")) {
        if (event.shiftKey) {
          this._selectRange(index);
        } else {
          this._toggleSelected(index);
        }
        this.focus();
        return;
      }

      if (event.target.classList.contains("tree-button-delete")) {
        // Temporarily enforce the selection of only one row. We should extend
        // this and allow interacting with this feature even if the specific
        // row is not part of the selection.
        // TODO: Implement a changeSelectionWithoutContentLoad method.
        this._selectSingle(index);
        this.dispatchEvent(
          new CustomEvent("request-delete", {
            bubbles: true,
          })
        );
        this.focus();
        return;
      }

      if (event.target.classList.contains("tree-button-flag")) {
        // Temporarily enforce the selection of only one row. We should extend
        // this and allow interacting with this feature even if the specific
        // row is not part of the selection.
        // TODO: Implement a changeSelectionWithoutContentLoad method.
        this._selectSingle(index);
        this.dispatchEvent(
          new CustomEvent("toggle-flag", {
            bubbles: true,
          })
        );
        this.focus();
        return;
      }

      if (event.target.classList.contains("tree-button-unread")) {
        // Temporarily enforce the selection of only one row. We should extend
        // this and allow interacting with this feature even if the specific
        // row is not part of the selection.
        // TODO: Implement a changeSelectionWithoutContentLoad method.
        this._selectSingle(index);
        this.dispatchEvent(
          new CustomEvent("toggle-unread", {
            bubbles: true,
          })
        );
        this.focus();
        return;
      }

      if (event.target.classList.contains("tree-button-spam")) {
        // Temporarily enforce the selection of only one row. We should extend
        // this and allow interacting with this feature even if the specific
        // row is not part of the selection.
        // TODO: Implement a changeSelectionWithoutContentLoad method.
        this._selectSingle(index);
        this.dispatchEvent(
          new CustomEvent("toggle-spam", {
            bubbles: true,
            detail: {
              isJunk: event.target
                .closest(`tr[is="${this._rowElementName}"]`)
                ?.dataset.properties.split(" ")
                .find(p => p == "junk"),
            },
          })
        );
        this.focus();
        return;
      }

      if (event[accelKeyName]) {
        this._toggleSelected(index);
      } else if (event.shiftKey) {
        this._selectRange(index);
      } else {
        this._selectSingle(index);
      }

      this.focus();
    });

    this.addEventListener("keydown", event => {
      if (event.altKey || event[otherKeyName]) {
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
        if (newIndex != null && (!event[accelKeyName] || !event.shiftKey)) {
          // Else, if both modifiers pressed, do nothing.
          if (event.shiftKey) {
            this._selectRange(newIndex);
          } else if (event[accelKeyName]) {
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
          if (event[accelKeyName]) {
            this._toggleSelected(this.currentIndex);
          } else {
            this._selectSingle(this.currentIndex);
          }
        }
        event.preventDefault();
      }
    });

    // Ensure that there are enough rows for scrolling/resizing to appear
    // seamless, but don't do it more frequently than 10 times per second,
    // as it's expensive.
    let lastTime = 0;
    let lastHeight = 0;
    let timer = null;
    let throttledUpdate = () => {
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
    };
    this.addEventListener("scroll", () => throttledUpdate());
    this.resizeObserver = new ResizeObserver(entries => {
      // There's not much point in reducing the number of rows on resize.
      if (this.clientHeight > lastHeight) {
        throttledUpdate();
      }
      lastHeight = this.clientHeight;
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    for (let row of this._rows.values()) {
      row.remove();
    }
    this._rows.clear();

    while (this.lastChild) {
      this.lastChild.remove();
    }

    this.resizeObserver.disconnect();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    this._rowElementName = newValue || "tree-view-table-row";
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
        this._selection = new TreeSelection();
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

    // Clear the height of the top spacer to avoid confusing
    // `_ensureVisibleRowsAreDisplayed`.
    this.table.spacerTop.setHeight(0);
    this.invalidate();

    this.dispatchEvent(new CustomEvent("viewchange"));
  }

  /**
   * Set the colspan of the spacer row cells.
   *
   * @param {int} count - The amount of visible columns.
   */
  setSpacersColspan(count) {
    // Add an extra column if the table is editable to account for the column
    // picker column.
    if (this.parentNode.editable) {
      count++;
    }
    this.table.spacerTop.setColspan(count);
    this.table.spacerBottom.setColspan(count);
  }

  /**
   * Clear all rows from the list and create them again.
   */
  invalidate() {
    this.table.body.replaceChildren();
    this._rows.clear();
    this._firstRowIndex = 0;
    this._lastRowIndex = 0;

    // Temporarily set the height of the spacerBottom to account for the full
    // height of the entire table to prevent the list from visually jumping
    // up and down during rebuild.
    let rowCount = this._view ? this._view.rowCount : 0;
    this.table.spacerBottom.setHeight(
      rowCount * this._rowElementClass.ROW_HEIGHT
    );
    this._ensureVisibleRowsAreDisplayed();
  }

  /**
   * Invalidate the rows between `startIndex` and `endIndex`.
   *
   * @param {integer} startIndex
   * @param {integer} endIndex
   */
  invalidateRange(startIndex, endIndex) {
    for (
      let index = Math.max(startIndex, this._firstRowIndex),
        last = Math.min(endIndex, this._lastRowIndex);
      index <= last;
      index++
    ) {
      this.invalidateRow(index);
    }
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
    let rowCount = this._view ? this._view.rowCount : 0;
    this.placeholder?.classList.toggle("show", !rowCount);

    if (!rowCount) {
      return;
    }

    if (this.scrollTop > rowCount * this._rowElementClass.ROW_HEIGHT) {
      // Beyond the end of the list. We're about to scroll anyway, so clear
      // everything out and wait for to happen. Don't call `invalidate` here,
      // or you'll end up in an infinite loop.
      this.table.body.replaceChildren();
      this._rows.clear();
      this._firstRowIndex = 0;
      this._lastRowIndex = 0;
      this.table.spacerTop.setHeight(0);
      this.table.spacerBottom.setHeight(
        rowCount * this._rowElementClass.ROW_HEIGHT
      );
      return;
    }

    let first = Math.max(
      0,
      Math.floor(this.scrollTop / this._rowElementClass.ROW_HEIGHT) -
        this.constructor.OVERFLOW_BUFFER
    );
    let last = Math.min(
      rowCount - 1,
      Math.floor(
        (this.scrollTop + this.clientHeight) / this._rowElementClass.ROW_HEIGHT
      ) + this.constructor.OVERFLOW_BUFFER
    );

    this.table.spacerTop.setHeight(first * this._rowElementClass.ROW_HEIGHT);

    for (
      let i = Math.min(this._firstRowIndex - 1, last), iTo = Math.max(first, 0);
      i >= iTo;
      i--
    ) {
      this._addRowAtIndex(i, this.table.body.firstElementChild);
    }
    if (this._lastRowIndex == 0 && this.table.body.childElementCount == 0) {
      // Special case for first call.
      this._addRowAtIndex(0);
    }
    for (
      let i = Math.max(this._lastRowIndex + 1, first),
        iTo = Math.min(last + 1, rowCount);
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
    while (row) {
      row.remove();
      this._rows.delete(row.index);
      row = lastActualRow.nextElementSibling;
    }

    this._firstRowIndex = first;
    this._lastRowIndex = last;

    this.table.spacerBottom.setHeight(
      (rowCount - last - 1) * this._rowElementClass.ROW_HEIGHT
    );
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
  scrollToIndex(index, instant = false) {
    const topOfRow = this._rowElementClass.ROW_HEIGHT * index;
    let { scrollTop, clientHeight } = this;
    // Account for the table header height in a sticky position above the
    // body. If the list is not in a table layout, the thead height is 0.
    clientHeight -= this.table.header.clientHeight;

    if (topOfRow < scrollTop) {
      this.scrollTo({
        left: 0,
        top: topOfRow,
        behavior: instant ? "instant" : "auto",
      });
      return;
    }

    const bottomOfRow = topOfRow + this._rowElementClass.ROW_HEIGHT;
    if (bottomOfRow > scrollTop + clientHeight) {
      this.scrollTo({
        left: 0,
        top: bottomOfRow - clientHeight,
        behavior: instant ? "instant" : "auto",
      });
    }
  }

  /**
   * Updates the list to reflect added or removed rows.
   *
   * @param {integer} index
   */
  rowCountChanged(index, delta) {
    if (!this._selection) {
      return;
    }

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
    let row = document.createElement("tr", { is: this._rowElementName });
    row.setAttribute("is", this._rowElementName);
    this.table.body.insertBefore(row, before);
    row.setAttribute("role", "option");
    row.setAttribute("aria-setsize", this._view.rowCount);
    row.style.height = `${this._rowElementClass.ROW_HEIGHT}px`;
    if (this._selection?.isSelected(index)) {
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
    return this._selection ? this._selection.currentIndex : -1;
  }

  set currentIndex(index) {
    if (!this._view) {
      return;
    }

    for (let row of this.querySelectorAll(
      `tr[is="${this._rowElementName}"].current`
    )) {
      row.classList.remove("current");
    }

    this._selection.currentIndex = index;

    if (index < 0 || index > this._view.rowCount - 1) {
      this.table.removeAttribute("aria-activedescendant");
      return;
    }

    this.getRowAtIndex(index)?.classList.add("current");
    this.scrollToIndex(index);
    this.table.setAttribute("aria-activedescendant", `${this.id}-row${index}`);
  }

  /**
   * Select and focus the given index.
   *
   * @param {number} index - The index to select.
   */
  _selectSingle(index) {
    let changeSelection =
      this._selection.count != 1 || !this._selection.isSelected(index);
    // Update the TreeSelection selection to trigger a tree invalidate().
    if (changeSelection) {
      this._selection.select(index);
    }
    this.currentIndex = index;
    if (changeSelection) {
      this.onSelectionChanged();
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
    this.onSelectionChanged();
  }

  /**
   * Toggle the selection state at the given index and focus it.
   *
   * @param {number} index - The index to toggle.
   */
  _toggleSelected(index) {
    this._selection.toggleSelect(index);
    // We hack the internals of the TreeSelection to clear the
    // shiftSelectPivot.
    this._selection._shiftSelectPivot = null;
    this.currentIndex = index;
    this.onSelectionChanged();
  }

  /**
   * Toggle between selecting all rows or none, depending on the current
   * selection state.
   */
  toggleSelectAll() {
    if (!this.selectedIndices.length) {
      const index = this._view.rowCount - 1;
      this._selection.rangedSelect(0, index, true);
      this.currentIndex = index;
    } else {
      this._selection.clearSelection();
    }
    // Make sure the body is focused when the selection is changed as
    // clicking on the "select all" header button steals the focus.
    this.focus();

    this.onSelectionChanged();
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
    this.onSelectionChanged();
  }

  /**
   * Changes the selection state of the row at `index`.
   *
   * @param {integer} index
   * @param {boolean?} selected - if set, set the selection state to this
   *   value, otherwise toggle the current state
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
        this.onSelectionChanged();
      }
    }

    return selected;
  }

  /**
   * Loop through all available child elements of the placeholder slot and
   * show those that are needed.
   * @param {array} idsToShow - Array of ids to show.
   */
  updatePlaceholders(idsToShow) {
    for (let element of this.placeholder.children) {
      element.hidden = !idsToShow.includes(element.id);
    }
  }

  /**
   * Update the classes on the table element to reflect the current selection
   * state, and dispatch an event to allow implementations to handle the
   * change in the selection state.
   */
  onSelectionChanged() {
    const selectedCount = this.selectedIndices.length;
    const allSelected = selectedCount == this._view.rowCount;

    this.table.classList.toggle("all-selected", allSelected);
    this.table.classList.toggle("some-selected", !allSelected && selectedCount);

    const selectButton = this.table.querySelector(".tree-view-header-select");
    // Some implementations might not use a select header.
    if (selectButton) {
      // Only mark the `select` button as "checked" if all rows are selected.
      selectButton.toggleAttribute("aria-checked", allSelected);
      // The default action for the header button is to deselect all messages
      // if even one message is currently selected.
      document.l10n.setAttributes(
        selectButton,
        selectedCount
          ? "threadpane-column-header-deselect-all"
          : "threadpane-column-header-select-all"
      );
    }

    this.dispatchEvent(new CustomEvent("select"));
  }
}
customElements.define("tree-view", TreeView);

/**
 * The main <table> element containing the thead and the TreeViewTableBody
 * tbody. This class is used to expose all those methods and custom events
 * needed at the implementation level.
 */
class TreeViewTable extends HTMLTableElement {
  /**
   * The array of objects containing the data to generate the needed columns.
   * Keep this public so child elements can access it if needed.
   * @type {Array}
   */
  columns;

  /**
   * Array containing the IDs of templates holding menu items to dynamically add
   * to the menupopup of the column picker.
   * @type {Array}
   */
  popupMenuTemplates = [];

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "tree-view-table");
    this.classList.add("tree-table");

    // Use a fragment to append child elements to later add them all at once
    // to the DOM. Performance is important.
    const fragment = new DocumentFragment();

    this.header = document.createElement("thead", {
      is: "tree-view-table-header",
    });
    fragment.append(this.header);

    this.spacerTop = document.createElement("tbody", {
      is: "tree-view-table-spacer",
    });
    fragment.append(this.spacerTop);

    this.body = document.createElement("tbody", {
      is: "tree-view-table-body",
    });
    fragment.append(this.body);

    this.spacerBottom = document.createElement("tbody", {
      is: "tree-view-table-spacer",
    });
    fragment.append(this.spacerBottom);

    this.append(fragment);
  }

  /**
   * If set to TRUE before generating the columns, the table will
   * automatically create a column picker in the table header.
   *
   * @type {boolean}
   */
  set editable(val) {
    this.dataset.editable = val;
  }

  get editable() {
    return this.dataset.editable === "true";
  }

  /**
   * Set the id attribute of the TreeViewTableBody for selection and styling
   * purpose.
   *
   * @param {string} id - The string ID to set.
   */
  setBodyID(id) {
    this.body.id = id;
  }

  setPopupMenuTemplates(array) {
    this.popupMenuTemplates = array;
  }

  /**
   * Set the columns array of the table. This should only be used during
   * initialization and any following change to the columns visibility should
   * be handled via the updateColumns() method.
   *
   * @param {Array} columns - The array of columns to generate.
   */
  setColumns(columns) {
    this.columns = columns;
    this.header.setColumns();
    this.#updateView();
  }

  /**
   * Update the currently visible columns.
   *
   * @param {Array} columns - The array of columns to update. It should match
   * the original array set via the setColumn() method since this method will
   * only update the column visibility without generating new elements.
   */
  updateColumns(columns) {
    this.columns = columns;
    this.#updateView();
  }

  /**
   * Store the newly resized column values in the xul store.
   *
   * @param {string} url - The document URL used to store the values.
   * @param {DOMEvent} event - The dom event bubbling from the resized action.
   */
  setColumnsWidths(url, event) {
    const width = event.detail.splitter.width;
    const column = event.detail.column;
    const newValue = `${column}:${width}`;
    let newWidths;

    // Check if we already have stored values and update it if so.
    let columnsWidths = Services.xulStore.getValue(url, "columns", "widths");
    if (columnsWidths) {
      let updated = false;
      columnsWidths = columnsWidths.split(",");
      for (let index = 0; index < columnsWidths.length; index++) {
        const cw = columnsWidths[index].split(":");
        if (cw[0] == column) {
          cw[1] = width;
          updated = true;
          columnsWidths[index] = newValue;
          break;
        }
      }
      // Push the new value into the array if we didn't have an existing one.
      if (!updated) {
        columnsWidths.push(newValue);
      }
      newWidths = columnsWidths.join(",");
    } else {
      newWidths = newValue;
    }

    // Store the values as a plain string with the current format:
    //   columnID:width,columnID:width,...
    Services.xulStore.setValue(url, "columns", "widths", newWidths);
  }

  /**
   * Restore the previously saved widths of the various columns if we have
   * any.
   *
   * @param {string} url - The document URL used to store the values.
   */
  restoreColumnsWidths(url) {
    let columnsWidths = Services.xulStore.getValue(url, "columns", "widths");
    if (!columnsWidths) {
      return;
    }

    for (let column of columnsWidths.split(",")) {
      column = column.split(":");
      this.querySelector(`#${column[0]}`)?.style.setProperty(
        `--${column[0]}Splitter-width`,
        `${column[1]}px`
      );
    }
  }

  /**
   * Update the visibility of the currently available columns.
   */
  #updateView() {
    let visibleColumns = this.columns.filter(c => !c.hidden);

    for (let column of this.columns) {
      document.getElementById(column.id).hidden = column.hidden;

      // No need to update the splitter visibility if the column is
      // specifically not resizable.
      if (column.resizable === false) {
        continue;
      }

      document.getElementById(`${column.id}Splitter`).hidden =
        visibleColumns[visibleColumns.length - 1] == column
          ? true
          : column.hidden;
    }
  }
}
customElements.define("tree-view-table", TreeViewTable, { extends: "table" });

/**
 * Class used to generate the thead of the TreeViewTable. This class will take
 * care of handling columns sizing and sorting order, with bubbling events to
 * allow listening for those changes on the implementation level.
 */
class TreeViewTableHeader extends HTMLTableSectionElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "tree-view-table-header");
    this.classList.add("tree-table-header");
    this.row = document.createElement("tr");
    this.appendChild(this.row);

    this.addEventListener("keypress", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "keypress":
        if (!event.altKey || !["ArrowRight", "ArrowLeft"].includes(event.key)) {
          return;
        }

        let column = event.target.closest(
          `th[is="tree-view-table-header-cell"]`
        );
        if (!column) {
          return;
        }

        let visibleColumns = this.parentNode.columns.filter(c => !c.hidden);
        let forward =
          event.key == (document.dir === "rtl" ? "ArrowLeft" : "ArrowRight");

        // Bail out if the user is trying to shift backward the first column,
        // or shift forward the last column.
        if (
          (!forward && visibleColumns.at(0)?.id == column.id) ||
          (forward && visibleColumns.at(-1)?.id == column.id)
        ) {
          return;
        }

        event.preventDefault();
        this.dispatchEvent(
          new CustomEvent("shift-column", {
            bubbles: true,
            detail: {
              column: column.id,
              forward,
            },
          })
        );
        break;
    }
  }

  /**
   * Create all the table header cells based on the currently set columns.
   */
  setColumns() {
    this.row.replaceChildren();

    for (let column of this.parentNode.columns) {
      let cell = document.createElement("th", {
        is: "tree-view-table-header-cell",
      });
      this.row.appendChild(cell);
      cell.setColumn(column);
    }

    // Create a column picker if the table is editable.
    if (this.parentNode.editable) {
      const picker = document.createElement("th", {
        is: "tree-view-table-column-picker",
      });
      this.row.appendChild(picker);
    }
  }
}
customElements.define("tree-view-table-header", TreeViewTableHeader, {
  extends: "thead",
});

/**
 * Class to generated the TH elements for the TreeViewTableHeader.
 */
class TreeViewTableHeaderCell extends HTMLTableCellElement {
  /**
   * The div needed to handle the header button in an absolute position.
   * @type {HTMLElement}
   */
  #container;

  /**
   * The clickable button to change the sorting of the table.
   * @type {HTMLButtonElement}
   */
  #button;

  /**
   * If this cell is resizable.
   * @type {boolean}
   */
  #resizable = true;

  /**
   * If this cell can be clicked to affect the sorting order of the tree.
   * @type {boolean}
   */
  #sortable = true;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "tree-view-table-header-cell");

    this.#container = document.createElement("div");
    this.#container.classList.add(
      "tree-table-cell",
      "tree-table-cell-container"
    );

    this.#button = document.createElement("button");
    this.#container.appendChild(this.#button);
    this.appendChild(this.#container);
  }

  /**
   * Set the proper data to the newly generated table header cell and create
   * the needed child elements.
   *
   * @param {object} column - The column object with all the data to generate
   *   the correct header cell.
   */
  setColumn(column) {
    // Set a public ID so parent elements can loop through the available
    // columns after they're created.
    this.id = column.id;
    this.#button.id = `${column.id}Button`;

    // Add custom classes if needed.
    if (column.classes) {
      this.#button.classList.add(...column.classes);
    }

    if (column.l10n?.header) {
      document.l10n.setAttributes(this.#button, column.l10n.header);
    }

    // Add an image if this is a table header that needs to display an icon,
    // and set the column as icon.
    if (column.icon) {
      this.dataset.type = "icon";
      const img = document.createElement("img");
      img.src = "";
      img.alt = "";
      this.#button.appendChild(img);
    }

    this.#resizable = column.resizable ?? true;
    this.dataset.resizable = this.#resizable;
    // Add a splitter if this is a resizable column.
    if (this.#resizable) {
      let splitter = document.createElement("hr", { is: "pane-splitter" });
      splitter.setAttribute("is", "pane-splitter");
      this.appendChild(splitter);
      splitter.resizeDirection = "horizontal";
      splitter.resizeElement = this;
      splitter.id = `${column.id}Splitter`;
      this.style.setProperty("width", `var(--${splitter.id}-width)`);
      // Emit a custom event after a resize action. Methods at implementation
      // level should listen to this event if the edited column size needs to
      // be stored or used.
      splitter.addEventListener("splitter-resized", () => {
        this.dispatchEvent(
          new CustomEvent("column-resized", {
            bubbles: true,
            detail: {
              splitter,
              column: column.id,
            },
          })
        );
      });
    }

    this.hidden = column.hidden;

    this.#sortable = column.sortable ?? true;
    // Make the button clickable if the column can trigger a sorting of rows.
    if (this.#sortable) {
      this.#button.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("sort-changed", {
            bubbles: true,
            detail: {
              column: column.id,
            },
          })
        );
      });
    }

    // This is the column handling the thread toggling.
    if (column.thread) {
      this.#button.classList.add("tree-view-header-thread");
      this.#button.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("thread-changed", {
            bubbles: true,
          })
        );
      });
    }

    // This is the column handling bulk selection.
    if (column.select) {
      this.#button.classList.add("tree-view-header-select");
      this.#button.addEventListener("click", () => {
        this.closest("table").body.toggleSelectAll();
      });
    }

    // This is the column handling delete actions.
    if (column.delete) {
      this.#button.classList.add("tree-view-header-delete");
    }
  }

  /**
   * Set this table header as responsible for the sorting of rows.
   *
   * @param {string["ascending"|"descending"]} direction - The new sorting
   *   direction.
   */
  setSorting(direction) {
    this.#button.classList.add("sorting", direction);
  }

  /**
   * If this current column can be resized.
   *
   * @type {boolean}
   */
  set resizable(val) {
    this.#resizable = val;
  }

  get resizable() {
    return this.#resizable;
  }

  /**
   * If the current column can trigger a sorting of rows.
   *
   * @type {boolean}
   */
  set sortable(val) {
    this.#sortable = val;
    this.#button.disabled = !val;
  }

  get sortable() {
    return this.#sortable;
  }
}
customElements.define("tree-view-table-header-cell", TreeViewTableHeaderCell, {
  extends: "th",
});

/**
 * Class used to generate a column picker used for the TreeViewTableHeader in
 * case the visibility of the columns of a table can be changed.
 *
 * Include treeView.ftl for strings.
 */
class TreeViewTableColumnPicker extends HTMLTableCellElement {
  /**
   * The clickable button triggering the picker context menu.
   * @type {HTMLButtonElement}
   */
  #button;

  /**
   * The menupopup allowing users to show and hide columns.
   * @type {XULElement}
   */
  #context;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "tree-view-table-column-picker");
    this.classList.add("tree-table-cell-container");

    this.#button = document.createElement("button");
    document.l10n.setAttributes(this.#button, "tree-list-view-column-picker");
    this.#button.classList.add("button-flat", "button-column-picker");
    this.appendChild(this.#button);

    const img = document.createElement("img");
    img.src = "";
    img.alt = "";
    this.#button.appendChild(img);

    this.#context = document.createXULElement("menupopup");
    this.#context.id = "columnPickerMenuPopup";
    this.#context.setAttribute("position", "bottomleft topleft");
    this.appendChild(this.#context);
    this.#context.addEventListener("popupshowing", event => {
      // Bail out if we're opening a submenu.
      if (event.target.id != this.#context.id) {
        return;
      }

      if (!this.#context.hasChildNodes()) {
        this.#initPopup();
      }

      let columns = this.closest("table").columns;
      for (let column of columns) {
        let item = this.#context.querySelector(`[value="${column.id}"]`);
        if (!item) {
          continue;
        }

        if (!column.hidden) {
          item.setAttribute("checked", "true");
          continue;
        }

        item.removeAttribute("checked");
      }
    });

    this.#button.addEventListener("click", event => {
      this.#context.openPopup(event.target, { triggerEvent: event });
    });
  }

  /**
   * Add all toggable columns to the context menu popup of the picker button.
   */
  #initPopup() {
    let table = this.closest("table");
    let columns = table.columns;
    let items = new DocumentFragment();
    for (let column of columns) {
      // Skip those columns we don't want to allow hiding.
      if (column.picker === false) {
        continue;
      }

      let menuitem = document.createXULElement("menuitem");
      items.append(menuitem);
      menuitem.setAttribute("type", "checkbox");
      menuitem.setAttribute("name", "toggle");
      menuitem.setAttribute("value", column.id);
      menuitem.setAttribute("closemenu", "none");
      if (column.l10n?.menuitem) {
        document.l10n.setAttributes(menuitem, column.l10n.menuitem);
      }

      menuitem.addEventListener("command", () => {
        this.dispatchEvent(
          new CustomEvent("columns-changed", {
            bubbles: true,
            detail: {
              target: menuitem,
              value: column.id,
            },
          })
        );
      });
    }

    items.append(document.createXULElement("menuseparator"));
    let restoreItem = document.createXULElement("menuitem");
    restoreItem.addEventListener("command", () => {
      this.dispatchEvent(
        new CustomEvent("restore-columns", {
          bubbles: true,
        })
      );
    });
    document.l10n.setAttributes(
      restoreItem,
      "tree-list-view-column-picker-restore"
    );
    items.append(restoreItem);

    for (const templateID of table.popupMenuTemplates) {
      items.append(document.getElementById(templateID).content.cloneNode(true));
    }

    this.#context.replaceChildren(items);
  }
}
customElements.define(
  "tree-view-table-column-picker",
  TreeViewTableColumnPicker,
  { extends: "th" }
);

/**
 * A more powerful list designed to be used with a view (nsITreeView or
 * whatever replaces it in time) and be scalable to a very large number of
 * items if necessary. Multiple selections are possible and changes in the
 * connected view are cause updates to the list (provided `rowCountChanged`/
 * `invalidate` are called as appropriate).
 *
 * Rows are provided by a custom element that inherits from
 * TreeViewTableRow below. Set the name of the custom element as the "rows"
 * attribute.
 *
 * Include tree-listbox.css for appropriate styling.
 */
class TreeViewTableBody extends HTMLTableSectionElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.tabIndex = 0;
    this.setAttribute("is", "tree-view-table-body");
    this.setAttribute("aria-multiselectable", "true");
  }
}
customElements.define("tree-view-table-body", TreeViewTableBody, {
  extends: "tbody",
});

/**
 * Base class for rows in a TreeViewTableBody. Rows have a fixed height and
 * their position on screen is managed by the owning list.
 *
 * Sub-classes should override ROW_HEIGHT, styles, and fragment to suit the
 * intended layout. The index getter/setter should be overridden to fill the
 * layout with values.
 */
class TreeViewTableRow extends HTMLTableRowElement {
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

    this.list = this.closest("tree-view");
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

    let table = this.closest("table");
    for (let column of table.columns) {
      let cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
      // No need to do anything if this cell doesn't exist. This can happen
      // for non-table layouts.
      if (!cell) {
        continue;
      }

      // Always clear the colspan when updating the columns.
      cell.removeAttribute("colspan");

      // No need to do anything if this column is hidden.
      if (cell.hidden) {
        continue;
      }

      // Handle the special case for the selectable checkbox column.
      if (column.select) {
        let img = cell.firstElementChild;
        if (!img) {
          cell.classList.add("tree-view-row-select");
          img = document.createElement("img");
          img.src = "";
          img.classList.add("tree-view-row-select-checkbox");
          cell.replaceChildren(img);
        }
        document.l10n.setAttributes(
          img,
          this.list._selection.isSelected(index)
            ? "tree-list-view-row-deselect"
            : "tree-list-view-row-select"
        );
        continue;
      }

      // No need to do anything if an earlier call to this function already
      // added the cell contents.
      if (cell.firstElementChild) {
        continue;
      }
    }

    // Account for the column picker in the last visible column if the table
    // if editable.
    if (table.editable) {
      let last = table.columns.filter(c => !c.hidden).pop();
      this.querySelector(`.${last.id.toLowerCase()}-column`)?.setAttribute(
        "colspan",
        "2"
      );
    }
  }

  /**
   * Tracks the selection state of the current row.
   *
   * @type {boolean}
   */
  get selected() {
    return this.classList.contains("selected");
  }

  set selected(selected) {
    this.setAttribute("aria-selected", !!selected);
    this.classList.toggle("selected", !!selected);
  }
}
customElements.define("tree-view-table-row", TreeViewTableRow, {
  extends: "tr",
});

/**
 * Simple tbody spacer used above and below the main tbody for space
 * allocation and ensuring the correct scrollable height.
 */
class TreeViewTableSpacer extends HTMLTableSectionElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.cell = document.createElement("td");
    const row = document.createElement("tr");
    row.appendChild(this.cell);
    this.appendChild(row);
  }

  /**
   * Set the cell colspan to reflect the number of visible columns in order
   * to generate a correct HTML markup.
   *
   * @param {int} count - The columns count.
   */
  setColspan(count) {
    this.cell.setAttribute("colspan", count);
  }

  /**
   * Set the height of the cell in order to occupy the empty area that will
   * be filled by new rows on demand when needed.
   *
   * @param {int} val - The pixel height the row should occupy.
   */
  setHeight(val) {
    this.cell.style.height = `${val}px`;
  }
}
customElements.define("tree-view-table-spacer", TreeViewTableSpacer, {
  extends: "tbody",
});
