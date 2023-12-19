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

const ANIMATION_DURATION_MS = 200;
const reducedMotionMedia = matchMedia("(prefers-reduced-motion)");

/**
 * Main tree view container that takes care of generating the main scrollable
 * DIV and the tree table.
 */
class TreeView extends HTMLElement {
  static observedAttributes = ["rows"];

  /**
   * The number of rows on either side to keep of the visible area to keep in
   * memory in order to avoid visible blank spaces while the user scrolls.
   *
   * This member is visible for testing and should not be used outside of this
   * class in production code.
   *
   * @type {integer}
   */
  _toleranceSize = 0;

  /**
   * Set the size of the tolerance buffer based on the number of rows which can
   * be visible at once.
   */
  #calculateToleranceBufferSize() {
    this._toleranceSize = this.#calculateVisibleRowCount() * 2;
  }

  /**
   * Index of the first row that exists in the DOM. Includes rows in the
   * tolerance buffer if they have been added.
   *
   * @type {integer}
   */
  #firstBufferRowIndex = 0;

  /**
   * Index of the last row that exists in the DOM. Includes rows in the
   * tolerance buffer if they have been added.
   *
   * @type {integer}
   */
  #lastBufferRowIndex = 0;

  /**
   * Index of the first visible row.
   *
   * @type {integer}
   */
  #firstVisibleRowIndex = 0;

  /**
   * Index of the last visible row.
   *
   * @type {integer}
   */
  #lastVisibleRowIndex = 0;

  /**
   * Row indices mapped to the row elements that exist in the DOM.
   *
   * @type {Map<integer, HTMLTableRowElement>}
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

  /**
   * The function storing the timeout callback for the delayed select feature in
   * order to clear it when not needed.
   *
   * @type {integer}
   */
  _selectTimeout = null;

  /**
   * A handle to the callback to fill the buffer when we aren't busy painting.
   *
   * @type {number}
   */
  #bufferFillIdleCallbackHandle = null;

  /**
   * The virtualized table containing our rows.
   *
   * @type {TreeViewTable}
   */
  table = null;

  /**
   * An event to fire to indicate the work of filling the buffer is complete.
   * This will fire once both visible and tolerance rows are ready. It will also
   * fire if no change to the buffer is required.
   *
   * This member is visible in order to provide a reliable indicator to tests
   * that all expected rows should be in place. It should not be used in
   * production code.
   *
   * @type {Event}
   */
  _rowBufferReadyEvent = null;

  /**
   * Fire the provided event, if any, in order to indicate that any necessary
   * buffer modification work is complete, including if no work is necessary.
   */
  #dispatchRowBufferReadyEvent() {
    // Don't fire if we're currently waiting on buffer fills; let the callback
    // do that when it's finished.
    if (this._rowBufferReadyEvent && !this.#bufferFillIdleCallbackHandle) {
      this.dispatchEvent(this._rowBufferReadyEvent);
    }
  }

  /**
   * Determine the height of the visible row area, excluding any chrome which
   * covers elements.
   *
   * WARNING: This may cause synchronous reflow if used after modifying the DOM.
   *
   * @returns {integer} - The height of the area into which visible rows are
   *   rendered.
   */
  #calculateVisibleHeight() {
    // Account for the table header height in a sticky position above the body.
    return this.clientHeight - this.table.header.clientHeight;
  }

  /**
   * Determine how many rows are visible in the client presently.
   *
   * WARNING: This may cause synchronous reflow if used after modifying the DOM.
   *
   * @returns {integer} - The number of visible or partly-visible rows.
   */
  #calculateVisibleRowCount() {
    return Math.ceil(
      this.#calculateVisibleHeight() / this._rowElementClass.ROW_HEIGHT
    );
  }

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

    this.addEventListener("scroll", this);

    let lastHeight = 0;
    this.resizeObserver = new ResizeObserver(entries => {
      // The width of the table isn't important to virtualizing the table. Skip
      // updating if the height hasn't changed.
      if (this.clientHeight == lastHeight) {
        this.#dispatchRowBufferReadyEvent();
        return;
      }

      if (!this._rowElementClass) {
        this.#dispatchRowBufferReadyEvent();
        return;
      }

      // The number of rows in the tolerance buffer is based on the number of
      // rows which can be visible. Update it.
      this.#calculateToleranceBufferSize();

      // There's not much point in reducing the number of rows on resize. Scroll
      // height remains the same and we can retain the extra rows in the buffer.
      if (this.clientHeight > lastHeight) {
        this._ensureVisibleRowsAreDisplayed();
      } else {
        this.#dispatchRowBufferReadyEvent();
      }

      lastHeight = this.clientHeight;
    });
    this.resizeObserver.observe(this);
  }

  disconnectedCallback() {
    this.#resetRowBuffer();
    this.resizeObserver.disconnect();
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    this._rowElementName = newValue || "tree-view-table-row";
    this._rowElementClass = customElements.get(this._rowElementName);

    this.#calculateToleranceBufferSize();

    if (this._view) {
      this.reset();
    }
  }

  handleEvent(event) {
    switch (event.type) {
      case "keyup": {
        if (
          ["Tab", "F6"].includes(event.key) &&
          this.currentIndex == -1 &&
          this.selectedIndex == -1 &&
          this._view?.rowCount
        ) {
          this.currentIndex = this.#firstVisibleRowIndex;
        }
        break;
      }
      case "click": {
        if (event.button !== 0) {
          return;
        }

        const row = event.target.closest(`tr[is="${this._rowElementName}"]`);
        if (!row) {
          return;
        }

        const index = row.index;

        if (event.target.classList.contains("tree-button-thread")) {
          if (this._view.isContainerOpen(index)) {
            let children = 0;
            for (
              let i = index + 1;
              i < this._view.rowCount && this._view.getLevel(i) > 0;
              i++
            ) {
              children++;
            }
            this._selectRange(index, index + children, event[accelKeyName]);
          } else {
            const addedRows = this.expandRowAtIndex(index);
            this._selectRange(index, index + addedRows, event[accelKeyName]);
          }
          this.table.body.focus();
          return;
        }

        if (this._view.isContainer(index) && event.target.closest(".twisty")) {
          if (this._view.isContainerOpen(index)) {
            this.collapseRowAtIndex(index);
          } else {
            const addedRows = this.expandRowAtIndex(index);
            this.scrollToIndex(
              index + Math.min(addedRows, this.#calculateVisibleRowCount() - 1)
            );
          }
          this.table.body.focus();
          return;
        }

        // Handle the click as a CTRL extension if it happens on the checkbox
        // image inside the selection column.
        if (event.target.classList.contains("tree-view-row-select-checkbox")) {
          if (event.shiftKey) {
            this._selectRange(-1, index, event[accelKeyName]);
          } else {
            this._toggleSelected(index);
          }
          this.table.body.focus();
          return;
        }

        if (event.target.classList.contains("tree-button-request-delete")) {
          this.table.body.dispatchEvent(
            new CustomEvent("request-delete", {
              bubbles: true,
              detail: {
                index,
              },
            })
          );
          this.table.body.focus();
          return;
        }

        if (event.target.classList.contains("tree-button-flag")) {
          this.table.body.dispatchEvent(
            new CustomEvent("toggle-flag", {
              bubbles: true,
              detail: {
                isFlagged: row.dataset.properties.includes("flagged"),
                index,
              },
            })
          );
          this.table.body.focus();
          return;
        }

        if (event.target.classList.contains("tree-button-unread")) {
          this.table.body.dispatchEvent(
            new CustomEvent("toggle-unread", {
              bubbles: true,
              detail: {
                isUnread: row.dataset.properties.includes("unread"),
                index,
              },
            })
          );
          this.table.body.focus();
          return;
        }

        if (event.target.classList.contains("tree-button-spam")) {
          this.table.body.dispatchEvent(
            new CustomEvent("toggle-spam", {
              bubbles: true,
              detail: {
                isJunk: row.dataset.properties.split(" ").includes("junk"),
                index,
              },
            })
          );
          this.table.body.focus();
          return;
        }

        if (event[accelKeyName] && !event.shiftKey) {
          this._toggleSelected(index);
        } else if (event.shiftKey) {
          this._selectRange(-1, index, event[accelKeyName]);
        } else {
          this._selectSingle(index);
        }

        this.table.body.focus();
        break;
      }
      case "keydown": {
        // Row and cell navigation on Windows. Supports JAWS and NVDA.
        // Row and cell navigation on Linux. Supports Orca.
        // TODO: Add navigation for macOS.
        // macOS VoiceOver uses the Caps Lock key or both Control + Option.
        const isA11yCellNavigation =
          (AppConstants.platform == "win" && event.altKey && event.ctrlKey) ||
          (AppConstants.platform == "linux" && event.altKey && event.shiftKey);

        if (event[otherKeyName]) {
          return;
        }

        const currentIndex = this.currentIndex == -1 ? 0 : this.currentIndex;
        let newIndex;
        switch (event.key) {
          case "ArrowUp":
            this.removeCurrentCellClass();
            newIndex = currentIndex - 1;
            break;
          case "ArrowDown":
            this.removeCurrentCellClass();
            newIndex = currentIndex + 1;
            break;
          case "ArrowLeft":
          case "ArrowRight": {
            event.preventDefault();
            if (isA11yCellNavigation) {
              this.navigateRowCells(event);
              return;
            }
            if (this.currentIndex == -1) {
              return;
            }
            const isArrowRight = event.key == "ArrowRight";
            const isRTL = this.matches(":dir(rtl)");
            if (isArrowRight == isRTL) {
              // Collapse action.
              const currentLevel = this._view.getLevel(this.currentIndex);
              if (this._view.isContainerOpen(this.currentIndex)) {
                this.collapseRowAtIndex(this.currentIndex);
                return;
              } else if (currentLevel == 0) {
                return;
              }

              const parentIndex = this._view.getParentIndex(this.currentIndex);
              if (parentIndex != -1) {
                newIndex = parentIndex;
              }
            } else if (this._view.isContainer(this.currentIndex)) {
              // Expand action.
              if (!this._view.isContainerOpen(this.currentIndex)) {
                const addedRows = this.expandRowAtIndex(this.currentIndex);
                this.scrollToIndex(
                  this.currentIndex +
                    Math.min(addedRows, this.#calculateVisibleRowCount() - 1)
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
              currentIndex - this.#calculateVisibleRowCount()
            );
            break;
          case "PageDown":
            newIndex = Math.min(
              this._view.rowCount - 1,
              currentIndex + this.#calculateVisibleRowCount()
            );
            break;
        }

        if (newIndex != undefined) {
          newIndex = this._clampIndex(newIndex);
          if (newIndex != null) {
            if (event[accelKeyName] && !event.shiftKey) {
              // Change focus, but not selection.
              this.currentIndex = newIndex;
            } else if (event.shiftKey) {
              this._selectRange(-1, newIndex, event[accelKeyName]);
            } else {
              this._selectSingle(newIndex, true);
            }
          }
          event.preventDefault();
          return;
        }

        // Space bar keystroke selection toggling.
        if (event.key == " " && this.currentIndex != -1) {
          // Don't do anything if we're on macOS and the target row is already
          // selected.
          if (
            AppConstants.platform == "macosx" &&
            this._selection.isSelected(this.currentIndex)
          ) {
            return;
          }

          // Handle the macOS exception of toggling the selection with only
          // the space bar since CMD+Space is captured by the OS.
          if (event[accelKeyName] || AppConstants.platform == "macosx") {
            this._toggleSelected(this.currentIndex);
            event.preventDefault();
          } else if (!this._selection.isSelected(this.currentIndex)) {
            // The target row is not currently selected.
            this._selectSingle(this.currentIndex, true);
            event.preventDefault();
          }
        }
        break;
      }
      case "scroll":
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
    this.reset();

    this.dispatchEvent(new CustomEvent("viewchange"));
  }

  /**
   * Using a keyboard, navigate cells in a row left or right.
   * @param {KeyboardEvent} event
   */
  navigateRowCells(event) {
    const row = this.querySelector("tr.current");

    // If direction is rtl, nextKey is "ArrowLeft" and prevKey is "ArrowRight".
    // If direction if ltr, nextKey is "ArrowRight" and prevKey is "ArrowLeft".
    const nextKey = document.dir === "rtl" ? "ArrowLeft" : "ArrowRight";

    // Find the next visible cell if there is already a current cell.
    const currentCell = row.querySelector("td.current-cell");
    if (currentCell) {
      const cell = this.adjacentVisibleSiblingCell(event, currentCell, nextKey);
      if (!cell) {
        return;
      }
      currentCell.classList.remove("current-cell");
      cell.classList.add("current-cell");
      cell.focus();
      this.table.body.setAttribute("aria-activedescendant", cell.id);
      return;
    }

    // Add IDs to columns.
    for (const rowCell of row.querySelectorAll("td")) {
      rowCell.setAttribute(
        `id`,
        `${row.id}-${rowCell.getAttribute("data-column-name")}`
      );
    }

    // Select the first visible cell.
    const cell = row.querySelector("td:not([hidden])");
    if (!cell) {
      return;
    }
    cell.classList.add("current-cell");
    cell.focus();
    this.table.body.setAttribute("aria-activedescendant", cell.id);
  }

  /**
   * Select sibling cell.
   * @param {KeyboardEvent} event
   * @param {HTMLTableCellElement} currentCell - Cell HTML element.
   * @param {string} nextKey - Key used for moving to next cell.
   * @returns {?HTMLTableCellElement} Sibling cell or null.
   */
  adjacentSiblingCell(event, currentCell, nextKey) {
    return event.key == nextKey
      ? currentCell.nextElementSibling
      : currentCell.previousElementSibling;
  }

  /**
   * Select next or previous visible adjacent cell.
   * @param {KeyboardEvent} event
   * @param {HTMLTableCellElement} currentCell - Cell HTML element.
   * @param {string} nextKey - Key used for moving to next cell.
   * @returns {?HTMLTableCellElement} Visible sibling cell or null.
   */
  adjacentVisibleSiblingCell(event, currentCell, nextKey) {
    const cell = this.adjacentSiblingCell(event, currentCell, nextKey);
    return cell?.hidden
      ? this.adjacentVisibleSiblingCell(event, cell, nextKey)
      : cell;
  }

  /**
   * Remove .current-cell class from any cells.
   */
  removeCurrentCellClass() {
    for (const cell of this.querySelectorAll("td.current-cell")) {
      cell.classList.remove("current-cell");
    }
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
   * Clear all rows from the buffer, empty the table body, and reset spacers.
   */
  #resetRowBuffer() {
    this.#cancelToleranceFillCallback();
    this.table.body.replaceChildren();
    this._rows.clear();
    this.#firstBufferRowIndex = 0;
    this.#lastBufferRowIndex = 0;
    this.#firstVisibleRowIndex = 0;

    // Set the height of the bottom spacer to account for the now-missing rows.
    // We want to ensure that the overall scroll height does not decrease.
    // Otherwise, we may lose our scroll position and cause unnecessary
    // scrolling. However, we don't always want to change the height of the top
    // spacer for the same reason.
    const rowCount = this._view?.rowCount ?? 0;
    this.table.spacerBottom.setHeight(
      rowCount * this._rowElementClass.ROW_HEIGHT
    );
  }

  /**
   * Clear all rows from the list and create them again.
   */
  reset() {
    this.#resetRowBuffer();
    this._ensureVisibleRowsAreDisplayed();
  }

  /**
   * Updates all existing rows in place, without removing all the rows and
   * starting again. This can be used if the row element class hasn't changed
   * and its `index` setter is capable of handling any modifications required.
   */
  invalidate() {
    this.invalidateRange(this.#firstBufferRowIndex, this.#lastBufferRowIndex);
  }

  /**
   * Perform the actions necessary to invalidate the specified row. Implemented
   * separately to allow {@link invalidateRange} to handle testing event fires
   * on its own.
   *
   * @param {integer} index
   */
  #doInvalidateRow(index) {
    const rowCount = this._view?.rowCount ?? 0;
    const row = this.getRowAtIndex(index);
    if (row) {
      if (index >= rowCount) {
        this._removeRowAtIndex(index);
      } else {
        row.index = index;
        row.selected = this._selection.isSelected(index);
      }
    } else if (
      index >= this.#firstBufferRowIndex &&
      index <= Math.min(rowCount - 1, this.#lastBufferRowIndex)
    ) {
      this._addRowAtIndex(index);
    }
  }

  /**
   * Invalidate the rows between `startIndex` and `endIndex`.
   *
   * @param {integer} startIndex
   * @param {integer} endIndex
   */
  invalidateRange(startIndex, endIndex) {
    for (
      let index = Math.max(startIndex, this.#firstBufferRowIndex),
        last = Math.min(endIndex, this.#lastBufferRowIndex);
      index <= last;
      index++
    ) {
      this.#doInvalidateRow(index);
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
    this.#doInvalidateRow(index);
    this.#dispatchRowBufferReadyEvent();
  }

  /**
   * A contiguous range, inclusive of both extremes.
   *
   * @typedef InclusiveRange
   * @property {integer} first - The inclusive start of the range.
   * @property {integer} last - The inclusive end of the range.
   */

  /**
   * Calculate the range of rows we wish to have in a filled tolerance buffer
   * based on a given range of visible rows.
   *
   * @param {integer} firstVisibleRow - The first visible row in the range.
   * @param {integer} lastVisibleRow - The last visible row in the range.
   * @param {integer} dataRowCount - The total number of available rows in the
   *   source data.
   * @returns {InclusiveRange} - The full range of the desired buffer.
   */
  #calculateDesiredBufferRange(firstVisibleRow, lastVisibleRow, dataRowCount) {
    const desiredRowRange = {};

    desiredRowRange.first = Math.max(firstVisibleRow - this._toleranceSize, 0);
    desiredRowRange.last = Math.min(
      lastVisibleRow + this._toleranceSize,
      dataRowCount - 1
    );

    return desiredRowRange;
  }

  #createToleranceFillCallback() {
    // Don't schedule a new buffer fill callback if we already have one.
    if (!this.#bufferFillIdleCallbackHandle) {
      this.#bufferFillIdleCallbackHandle = requestIdleCallback(deadline =>
        this.#fillToleranceBuffer(deadline)
      );
    }
  }

  #cancelToleranceFillCallback() {
    cancelIdleCallback(this.#bufferFillIdleCallbackHandle);
    this.#bufferFillIdleCallbackHandle = null;
  }

  /**
   * Fill the buffer with tolerance rows above and below the visible rows.
   *
   * As fetching data and modifying the DOM is expensive, this is intended to be
   * run within an idle callback and includes management of the idle callback
   * handle and creation of further callbacks if work is not completed.
   *
   * @param {IdleDeadline} deadline - A deadline object for fetching the
   *   remaining time in the idle tick.
   */
  #fillToleranceBuffer(deadline) {
    this.#bufferFillIdleCallbackHandle = null;

    const rowCount = this._view?.rowCount ?? 0;
    if (!rowCount) {
      return;
    }

    const bufferRange = this.#calculateDesiredBufferRange(
      this.#firstVisibleRowIndex,
      this.#lastVisibleRowIndex,
      rowCount
    );

    // Set the amount of time to leave in the deadline to fill another row. In
    // order to cooperatively schedule work, we shouldn't overrun the time
    // allotted for the idle tick. This value should be set such that it leaves
    // enough time to perform another row fill and adjust the relevant spacer
    // while doing the maximal amount of work per callback.
    const MS_TO_LEAVE_PER_FILL = 1.25;

    // Fill in the beginning of the buffer.
    if (bufferRange.first < this.#firstBufferRowIndex) {
      for (
        let i = this.#firstBufferRowIndex - 1;
        i >= bufferRange.first &&
        deadline.timeRemaining() > MS_TO_LEAVE_PER_FILL;
        i--
      ) {
        this._addRowAtIndex(i, this.table.body.firstElementChild);

        // Update as we go in case we need to wait for the next idle.
        this.#firstBufferRowIndex = i;
      }

      // Adjust the height of the top spacer to account for the new rows we've
      // added.
      this.table.spacerTop.setHeight(
        this.#firstBufferRowIndex * this._rowElementClass.ROW_HEIGHT
      );

      // If we haven't completed the work of filling the tolerance buffer,
      // schedule a new job to do so.
      if (this.#firstBufferRowIndex != bufferRange.first) {
        this.#createToleranceFillCallback();
        return;
      }
    }

    // Fill in the end of the buffer.
    if (bufferRange.last > this.#lastBufferRowIndex) {
      for (
        let i = this.#lastBufferRowIndex + 1;
        i <= bufferRange.last &&
        deadline.timeRemaining() > MS_TO_LEAVE_PER_FILL;
        i++
      ) {
        this._addRowAtIndex(i);

        // Update as we go in case we need to wait for the next idle.
        this.#lastBufferRowIndex = i;
      }

      // Adjust the height of the bottom spacer to account for the new rows
      // we've added.
      this.table.spacerBottom.setHeight(
        (rowCount - 1 - this.#lastBufferRowIndex) *
          this._rowElementClass.ROW_HEIGHT
      );

      // If we haven't completed the work of filling the tolerance buffer,
      // schedule a new job to do so.
      if (this.#lastBufferRowIndex != bufferRange.last) {
        this.#createToleranceFillCallback();
        return;
      }
    }

    // Notify tests that we have finished work.
    this.#dispatchRowBufferReadyEvent();
  }

  /**
   * The calculated ranges which determine the shape of the row buffer at
   * various stages of processing.
   *
   * @typedef RowBufferRanges
   * @property {InclusiveRange} visibleRows - The range of rows which should be
   *   displayed to the user.
   * @property {integer?} pruneBefore - The index of the row before which any
   *   additional rows should be discarded.
   * @property {integer?} pruneAfter - The index of the row after which any
   *   additional rows should be discarded.
   * @property {InclusiveRange} finalizedRows - The range of rows which should
   *   exist in the row buffer after any additions and removals have been made.
   */

  /**
   * Calculate the values necessary for building the list of visible rows and
   * retaining any rows in the buffer which fall inside the desired tolerance
   * and form a contiguous range with the visible rows.
   *
   * WARNING: This function makes calculations based on existing DOM dimensions.
   * Do not use it after you have modified the DOM.
   *
   * @returns {RowBufferRanges}
   */
  #calculateRowBufferRanges(dataRowCount) {
    /** @type {RowBufferRanges} */
    const ranges = {
      visibleRows: {},
      pruneBefore: null,
      pruneAfter: null,
      finalizedRows: {},
    };

    // We adjust the row buffer in several stages. First, we'll use the new
    // scroll position to determine the boundaries of the buffer. Then, we'll
    // create and add any new rows which are necessary to fit the new
    // boundaries. Next, we prune rows added in previous scrolls which now fall
    // outside the boundaries. Finally, we recalculate the height of the spacers
    // which position the visible rows within the rendered area.
    ranges.visibleRows.first = Math.max(
      Math.floor(this.scrollTop / this._rowElementClass.ROW_HEIGHT),
      0
    );

    const lastPossibleVisibleRow = Math.ceil(
      (this.scrollTop + this.#calculateVisibleHeight()) /
        this._rowElementClass.ROW_HEIGHT
    );

    ranges.visibleRows.last =
      Math.min(lastPossibleVisibleRow, dataRowCount) - 1;

    // Determine the number of rows desired in the tolerance buffer in order to
    // determine whether there are any that we can save.
    const desiredRowRange = this.#calculateDesiredBufferRange(
      ranges.visibleRows.first,
      ranges.visibleRows.last,
      dataRowCount
    );

    // Determine which rows are no longer wanted in the buffer. If we've
    // scrolled past the previous visible rows, it's possible that the tolerance
    // buffer will still contain some rows we'd like to have in the buffer. Note
    // that we insist on a contiguous range of rows in the buffer to simplify
    // determining which rows exist and appropriately spacing the viewport.
    if (this.#lastBufferRowIndex < ranges.visibleRows.first) {
      // There is a discontiguity between the visible rows and anything that's
      // in the buffer. Prune everything before the visible rows.
      ranges.pruneBefore = ranges.visibleRows.first;
      ranges.finalizedRows.first = ranges.visibleRows.first;
    } else if (this.#firstBufferRowIndex < desiredRowRange.first) {
      // The range of rows in the buffer overlaps the start of the visible rows,
      // but there are rows outside of the desired buffer as well. Prune them.
      ranges.pruneBefore = desiredRowRange.first;
      ranges.finalizedRows.first = desiredRowRange.first;
    } else {
      // Determine the beginning of the finalized buffer based on whether the
      // buffer contains rows before the start of the visible rows.
      ranges.finalizedRows.first = Math.min(
        ranges.visibleRows.first,
        this.#firstBufferRowIndex
      );
    }

    if (this.#firstBufferRowIndex > ranges.visibleRows.last) {
      // There is a discontiguity between the visible rows and anything that's
      // in the buffer. Prune everything after the visible rows.
      ranges.pruneAfter = ranges.visibleRows.last;
      ranges.finalizedRows.last = ranges.visibleRows.last;
    } else if (this.#lastBufferRowIndex > desiredRowRange.last) {
      // The range of rows in the buffer overlaps the end of the visible rows,
      // but there are rows outside of the desired buffer as well. Prune them.
      ranges.pruneAfter = desiredRowRange.last;
      ranges.finalizedRows.last = desiredRowRange.last;
    } else {
      // Determine the end of the finalized buffer based on whether the buffer
      // contains rows after the end of the visible rows.
      ranges.finalizedRows.last = Math.max(
        ranges.visibleRows.last,
        this.#lastBufferRowIndex
      );
    }

    return ranges;
  }

  /**
   * Display the table rows which should be shown in the visible area and
   * request filling of the tolerance buffer when idle.
   */
  _ensureVisibleRowsAreDisplayed() {
    this.#cancelToleranceFillCallback();

    const rowCount = this._view?.rowCount ?? 0;
    this.placeholder?.classList.toggle("show", !rowCount);

    if (!rowCount || this.#calculateVisibleRowCount() == 0) {
      return;
    }

    if (this.scrollTop > rowCount * this._rowElementClass.ROW_HEIGHT) {
      // Beyond the end of the list. We're about to scroll anyway, so clear
      // everything out and wait for it to happen. Don't call `invalidate` here,
      // or you'll end up in an infinite loop.
      this.table.spacerTop.setHeight(0);
      this.#resetRowBuffer();
      return;
    }

    const ranges = this.#calculateRowBufferRanges(rowCount);

    // *WARNING: Do not request any DOM dimensions after this point. Modifying
    // the DOM will invalidate existing calculations and any additional requests
    // will cause synchronous reflow.

    // Add a row if the table is empty. Either we're initializing or have
    // invalidated the tree, and the next two steps pass over row zero if there
    // are no rows already in the buffer.
    if (
      this.#lastBufferRowIndex == 0 &&
      this.table.body.childElementCount == 0 &&
      ranges.visibleRows.first == 0
    ) {
      this._addRowAtIndex(0);
    }

    // Expand the row buffer to include newly-visible rows which weren't already
    // visible or preloaded in the tolerance buffer.

    const earliestMissingEndRowIdx = Math.max(
      this.#lastBufferRowIndex + 1,
      ranges.visibleRows.first
    );
    for (let i = earliestMissingEndRowIdx; i <= ranges.visibleRows.last; i++) {
      // We are missing rows at the end of the buffer. Either the last row of
      // the existing buffer lies within the range of visible rows and we begin
      // there, or the entire range of visible rows occurs after the end of the
      // buffer and we fill in from the start.
      this._addRowAtIndex(i);
    }

    const latestMissingStartRowIdx = Math.min(
      this.#firstBufferRowIndex - 1,
      ranges.visibleRows.last
    );
    for (let i = latestMissingStartRowIdx; i >= ranges.visibleRows.first; i--) {
      // We are missing rows at the start of the buffer. We'll add them working
      // backwards so that we can prepend. Either the first row of the existing
      // buffer lies within the range of visible rows and we begin there, or the
      // entire range of visible rows occurs before the end of the buffer and we
      // fill in from the end.
      this._addRowAtIndex(i, this.table.body.firstElementChild);
    }

    // Prune the buffer of any rows outside of our desired buffer range.
    if (ranges.pruneBefore !== null) {
      const pruneBeforeRow = this.getRowAtIndex(ranges.pruneBefore);
      let rowToPrune = pruneBeforeRow.previousElementSibling;
      while (rowToPrune) {
        this._removeRowAtIndex(rowToPrune.index);
        rowToPrune = pruneBeforeRow.previousElementSibling;
      }
    }

    if (ranges.pruneAfter !== null) {
      const pruneAfterRow = this.getRowAtIndex(ranges.pruneAfter);
      let rowToPrune = pruneAfterRow.nextElementSibling;
      while (rowToPrune) {
        this._removeRowAtIndex(rowToPrune.index);
        rowToPrune = pruneAfterRow.nextElementSibling;
      }
    }

    // Set the indices of the new first and last rows in the DOM. They may come
    // from the tolerance buffer if we haven't exhausted it.
    this.#firstBufferRowIndex = ranges.finalizedRows.first;
    this.#lastBufferRowIndex = ranges.finalizedRows.last;

    this.#firstVisibleRowIndex = ranges.visibleRows.first;
    this.#lastVisibleRowIndex = ranges.visibleRows.last;

    // Adjust the height of the spacers to ensure that visible rows fall within
    // the visible space and the overall scroll height is correct.
    this.table.spacerTop.setHeight(
      this.#firstBufferRowIndex * this._rowElementClass.ROW_HEIGHT
    );

    this.table.spacerBottom.setHeight(
      (rowCount - this.#lastBufferRowIndex - 1) *
        this._rowElementClass.ROW_HEIGHT
    );

    // The row buffer ideally contains some tolerance on either end to avoid
    // creating rows and fetching data for them during short scrolls. However,
    // actually creating those rows can be expensive, and during a long scroll
    // we may throw them away very quickly. To save the expense, only fill the
    // buffer while idle.

    this.#createToleranceFillCallback();
  }

  /**
   * Index of the first visible or partly visible row.
   *
   * @returns {integer}
   */
  getFirstVisibleIndex() {
    return this.#firstVisibleRowIndex;
  }

  /**
   * Index of the last visible or partly visible row.
   *
   * @returns {integer}
   */
  getLastVisibleIndex() {
    return this.#lastVisibleRowIndex;
  }

  /**
   * Ensures that the row at `index` is on the screen.
   *
   * @param {integer} index
   */
  scrollToIndex(index, instant = false) {
    const rowCount = this._view.rowCount;
    if (rowCount == 0) {
      // If there are no rows, make sure we're scrolled to the top.
      this.scrollTo({ top: 0, behavior: "instant" });
      return;
    }
    if (index < 0 || index >= rowCount) {
      // Bad index. Report, and do nothing.
      console.error(
        `<${this.localName} id="${this.id}"> tried to scroll to a row that doesn't exist: ${index}`
      );
      return;
    }

    const topOfRow = this._rowElementClass.ROW_HEIGHT * index;
    const scrollTop = this.scrollTop;
    const visibleHeight = this.#calculateVisibleHeight();
    const behavior = instant ? "instant" : "auto";

    // Scroll up to the row.
    if (topOfRow < scrollTop) {
      this.scrollTo({ top: topOfRow, behavior });
      return;
    }

    // Scroll down to the row.
    const bottomOfRow = topOfRow + this._rowElementClass.ROW_HEIGHT;
    if (bottomOfRow > scrollTop + visibleHeight) {
      this.scrollTo({ top: bottomOfRow - visibleHeight, behavior });
      return;
    }

    // Call `scrollTo` even if the row is in view, to stop any earlier smooth
    // scrolling that might be happening.
    this.scrollTo({ top: this.scrollTop, behavior });
  }

  /**
   * Updates the list to reflect added or removed rows.
   *
   * @param {integer} index - The position in the existing list where rows were
   *   added or removed.
   * @param {integer} delta - The change in number of rows; positive if rows
   *   were added and negative if rows were removed.
   */
  rowCountChanged(index, delta) {
    if (!this._selection) {
      return;
    }

    this._selection.adjustSelection(index, delta);
    this._updateCurrentIndexClasses();
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
    const row = document.createElement("tr", { is: this._rowElementName });
    row.setAttribute("is", this._rowElementName);
    this.table.body.insertBefore(row, before);
    row.setAttribute("aria-setsize", this._view.rowCount);
    row.style.height = `${this._rowElementClass.ROW_HEIGHT}px`;
    row.index = index;
    if (this._selection?.isSelected(index)) {
      row.selected = true;
    }
    if (this.currentIndex === index) {
      row.classList.add("current");
      this.table.body.setAttribute("aria-activedescendant", row.id);
    }
    this._rows.set(index, row);
  }

  /**
   * Removes the row element at `index` from the DOM and map of rows.
   *
   * @param {integer} index
   */
  _removeRowAtIndex(index) {
    const row = this._rows.get(index);
    row?.remove();
    this._rows.delete(index);
  }

  /**
   * Returns the row element at `index` or null if `index` is out of range.
   *
   * @param {integer} index
   * @returns {HTMLTableRowElement}
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
    // Even if the row to be collapsed is already selected, set
    // selectIndex to ensure currentIndex also points to the correct row.
    let selectedIndex = this.selectedIndex;
    while (selectedIndex >= index) {
      if (selectedIndex == index) {
        this.selectedIndex = index;
        break;
      }
      selectedIndex = this._view.getParentIndex(selectedIndex);
    }

    // Check if the view calls rowCountChanged. If it didn't, we'll have to
    // call it. This can happen if the view has no reference to the tree.
    let rowCountDidChange = false;
    const rowCountChangeListener = () => {
      rowCountDidChange = true;
    };

    const countBefore = this._view.rowCount;
    this.addEventListener("rowcountchange", rowCountChangeListener);
    this._view.toggleOpenState(index);
    this.removeEventListener("rowcountchange", rowCountChangeListener);
    const countAdded = this._view.rowCount - countBefore;

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
    const rowCountChangeListener = () => {
      rowCountDidChange = true;
    };

    const countBefore = this._view.rowCount;
    this.addEventListener("rowcountchange", rowCountChangeListener);
    this._view.toggleOpenState(index);
    this.removeEventListener("rowcountchange", rowCountChangeListener);
    const countAdded = this._view.rowCount - countBefore;

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

    this._selection.currentIndex = index;
    this._updateCurrentIndexClasses();
    if (index >= 0 && index < this._view.rowCount) {
      this.scrollToIndex(index);
    }
  }

  /**
   * Set the "current" class on the right row, and remove it from all other rows.
   */
  _updateCurrentIndexClasses() {
    const index = this.currentIndex;

    for (const row of this.querySelectorAll(
      `tr[is="${this._rowElementName}"].current`
    )) {
      row.classList.remove("current");
    }

    if (!this._view || index < 0 || index > this._view.rowCount - 1) {
      this.table.body.removeAttribute("aria-activedescendant");
      return;
    }

    const row = this.getRowAtIndex(index);
    if (row) {
      // We need to clear the attribute in order to let screen readers know that
      // a new message has been selected even if the ID is identical. For
      // example when we delete the first message with ID 0, the next message
      // becomes ID 0 itself. Therefore the attribute wouldn't trigger the screen
      // reader to announce the new message without being cleared first.
      this.table.body.removeAttribute("aria-activedescendant");
      row.classList.add("current");
      this.table.body.setAttribute("aria-activedescendant", row.id);
    }
  }

  /**
   * Select and focus the given index.
   *
   * @param {integer} index - The index to select.
   * @param {boolean} [delaySelect=false] - If the selection should be delayed.
   */
  _selectSingle(index, delaySelect = false) {
    const changeSelection =
      this._selection.count != 1 || !this._selection.isSelected(index);
    // Update the TreeSelection selection to trigger a tree reset().
    if (changeSelection) {
      this._selection.select(index);
    }
    this.currentIndex = index;
    if (changeSelection) {
      this.onSelectionChanged(delaySelect);
    }
  }

  /**
   * Start or extend a range selection to the given index and focus it.
   *
   * @param {number} start - Start index of selection. -1 for current index.
   * @param {number} end - End index of selection.
   * @param {boolean} extend[false] - If the new selection range should extend
   *   the current selection.
   */
  _selectRange(start, end, extend = false) {
    this._selection.rangedSelect(start, end, extend);
    this.currentIndex = start == -1 ? end : start;
    this.onSelectionChanged();
  }

  /**
   * Toggle the selection state at the given index and focus it.
   *
   * @param {integer} index - The index to toggle.
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
   * Select all rows.
   */
  selectAll() {
    this._selection.selectAll();
    this.onSelectionChanged();
  }

  /**
   * Toggle between selecting all rows or none, depending on the current
   * selection state.
   */
  toggleSelectAll() {
    if (!this.selectedIndices.length) {
      const index = this._view.rowCount - 1;
      this._selection.selectAll();
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

    const min = {};
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
    const indices = [];
    const rangeCount = this._selection.getRangeCount();

    for (let range = 0; range < rangeCount; range++) {
      const min = {};
      const max = {};
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
    this.setSelectedIndices(indices);
  }

  /**
   * An array of the indices of all selected rows.
   *
   * @param {integer[]} indices
   * @param {boolean} suppressEvent - Prevent a "select" event firing.
   */
  setSelectedIndices(indices, suppressEvent) {
    this._selection.clearSelection();
    for (const index of indices) {
      this._selection.toggleSelect(index);
    }
    this.onSelectionChanged(false, suppressEvent);
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
    const wasSelected = this._selection.isSelected(index);
    if (selected === undefined) {
      selected = !wasSelected;
    }

    if (selected != wasSelected) {
      this._selection.toggleSelect(index);
      this.onSelectionChanged(false, suppressEvent);
    }

    return selected;
  }

  /**
   * Loop through all available child elements of the placeholder slot and
   * show those that are needed.
   * @param {array} idsToShow - Array of ids to show.
   */
  updatePlaceholders(idsToShow) {
    for (const element of this.placeholder.children) {
      element.hidden = !idsToShow.includes(element.id);
    }
  }

  /**
   * Update the classes on the table element to reflect the current selection
   * state, and dispatch an event to allow implementations to handle the
   * change in the selection state.
   *
   * @param {boolean} [delaySelect=false] - If the selection should be delayed.
   * @param {boolean} [suppressEvent=false] - Prevent a "select" event firing.
   */
  onSelectionChanged(delaySelect = false, suppressEvent = false) {
    const selectedCount = this._selection.count;
    const allSelected = selectedCount == this._view.rowCount;

    this.table.classList.toggle("all-selected", allSelected);
    this.table.classList.toggle("some-selected", !allSelected && selectedCount);
    this.table.classList.toggle("multi-selected", selectedCount > 1);

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

    if (suppressEvent) {
      return;
    }

    // No need to handle a delayed select if not required.
    if (!delaySelect) {
      // Clear the timeout in case something was still running.
      if (this._selectTimeout) {
        window.clearTimeout(this._selectTimeout);
      }
      this.dispatchEvent(new CustomEvent("select", { bubbles: true }));
      return;
    }

    const delay = this.dataset.selectDelay || 50;
    if (delay != -1) {
      if (this._selectTimeout) {
        window.clearTimeout(this._selectTimeout);
      }
      this._selectTimeout = window.setTimeout(() => {
        this.dispatchEvent(new CustomEvent("select", { bubbles: true }));
        this._selectTimeout = null;
      }, delay);
    }
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
   * The header row for the table.
   *
   * @type {TreeViewTableHeader}
   */
  header;

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
    this.spacerTop.ariaHidden = "true";
    fragment.append(this.spacerTop);

    this.body = document.createElement("tbody", {
      is: "tree-view-table-body",
    });
    fragment.append(this.body);

    this.spacerBottom = document.createElement("tbody", {
      is: "tree-view-table-spacer",
    });
    this.spacerBottom.ariaHidden = "true";
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
    const columnsWidths = Services.xulStore.getValue(url, "columns", "widths");
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
    const lastResizableColumn = this.columns.findLast(
      c => !c.hidden && (c.resizable ?? true)
    );

    for (const column of this.columns) {
      document.getElementById(column.id).hidden = column.hidden;

      // No need to update the splitter visibility if the column is
      // specifically not resizable.
      if (column.resizable === false) {
        continue;
      }

      document.getElementById(column.id).resizable =
        column != lastResizableColumn;
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
  /**
   * An array of all table header cells that can be reordered.
   *
   * @returns {HTMLTableCellElement[]}
   */
  get #orderableChildren() {
    return [...this.querySelectorAll("th[draggable]:not([hidden])")];
  }

  /**
   * Used to simulate a change in the order. The element remains in the same
   * DOM position.
   *
   * @param {HTMLTableRowElement} element - The row to animate.
   * @param {number} to - The new Y position of the element after animation.
   */
  static _transitionTranslation(element, to) {
    if (!reducedMotionMedia.matches) {
      element.style.transition = `transform ${ANIMATION_DURATION_MS}ms ease`;
    }
    element.style.transform = to ? `translateX(${to}px)` : null;
  }

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
    this.addEventListener("dragstart", this);
    this.addEventListener("dragover", this);
    this.addEventListener("dragend", this);
    this.addEventListener("drop", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "keypress":
        this.#onKeyPress(event);
        break;
      case "dragstart":
        this.#onDragStart(event);
        break;
      case "dragover":
        this.#onDragOver(event);
        break;
      case "dragend":
        this.#onDragEnd();
        break;
      case "drop":
        this.#onDrop(event);
        break;
    }
  }

  #onKeyPress(event) {
    if (!event.altKey || !["ArrowRight", "ArrowLeft"].includes(event.key)) {
      this.triggerTableHeaderRovingTab(event);
      return;
    }

    const column = event.target.closest(`th[is="tree-view-table-header-cell"]`);
    if (!column) {
      return;
    }

    const visibleColumns = this.parentNode.columns.filter(c => !c.hidden);
    const forward =
      event.key == (document.dir === "rtl" ? "ArrowLeft" : "ArrowRight");

    // Bail out if the user is trying to shift backward the first column, or
    // shift forward the last column.
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
  }

  #onDragStart(event) {
    if (!event.target.closest("th[draggable]")) {
      // This shouldn't be necessary, but is?!
      event.preventDefault();
      return;
    }

    const orderable = this.#orderableChildren;
    if (orderable.length < 2) {
      return;
    }

    const headerCell = orderable.find(th => th.contains(event.target));
    const rect = headerCell.getBoundingClientRect();

    this._dragInfo = {
      cell: headerCell,
      // How far can we move `headerCell` horizontally.
      min: orderable.at(0).getBoundingClientRect().left - rect.left,
      max: orderable.at(-1).getBoundingClientRect().right - rect.right,
      // Where is the drag event starting.
      startX: event.clientX,
      offsetX: event.clientX - rect.left,
    };

    headerCell.classList.add("column-dragging");
    // Prevent `headerCell` being used as the drag image. We don't
    // really want any drag image, but there's no way to not have one.
    event.dataTransfer.setDragImage(document.createElement("img"), 0, 0);
  }

  #onDragOver(event) {
    if (!this._dragInfo) {
      return;
    }

    const { cell, min, max, startX, offsetX } = this._dragInfo;
    // Move `cell` with the mouse pointer.
    const dragX = Math.min(max, Math.max(min, event.clientX - startX));
    cell.style.transform = `translateX(${dragX}px)`;

    const thisRect = this.getBoundingClientRect();

    // How much space is there before the `cell`? We'll see how many cells fit
    // in the space and put the `cell` in after them.
    const spaceBefore = Math.max(
      0,
      event.clientX + this.scrollLeft - offsetX - thisRect.left
    );
    // The width of all cells seen in the loop so far.
    let totalWidth = 0;
    // If we've looped past the cell being dragged.
    let afterDraggedTh = false;
    // The cell before where a drop would take place. If null, drop would
    // happen at the start of the table header.
    let header = null;

    for (const headerCell of this.#orderableChildren) {
      if (headerCell == cell) {
        afterDraggedTh = true;
        continue;
      }

      const rect = headerCell.getBoundingClientRect();
      const enoughSpace = spaceBefore > totalWidth + rect.width / 2;

      let multiplier = 0;
      if (enoughSpace) {
        if (afterDraggedTh) {
          multiplier = -1;
        }
        header = headerCell;
      } else if (!afterDraggedTh) {
        multiplier = 1;
      }
      TreeViewTableHeader._transitionTranslation(
        headerCell,
        multiplier * cell.clientWidth
      );

      totalWidth += rect.width;
    }

    this._dragInfo.dropTarget = header;

    event.preventDefault();
  }

  #onDragEnd() {
    if (!this._dragInfo) {
      return;
    }

    this._dragInfo.cell.classList.remove("column-dragging");
    delete this._dragInfo;

    for (const headerCell of this.#orderableChildren) {
      headerCell.style.transform = null;
      headerCell.style.transition = null;
    }
  }

  #onDrop(event) {
    if (!this._dragInfo) {
      return;
    }

    const { cell, startX, dropTarget } = this._dragInfo;

    const newColumns = this.parentNode.columns.map(column => ({ ...column }));

    const draggedColumn = newColumns.find(c => c.id == cell.id);
    const initialPosition = newColumns.indexOf(draggedColumn);

    let targetCell;
    let newPosition;
    if (!dropTarget) {
      // Get the first visible cell.
      targetCell = this.querySelector("th:not([hidden])");
      newPosition = newColumns.indexOf(
        newColumns.find(c => c.id == targetCell.id)
      );
    } else {
      // Get the next non hidden sibling.
      targetCell = dropTarget.nextElementSibling;
      while (targetCell.hidden) {
        targetCell = targetCell.nextElementSibling;
      }
      newPosition = newColumns.indexOf(
        newColumns.find(c => c.id == targetCell.id)
      );
    }

    // Reduce the new position index if we're moving forward in order to get the
    // accurate index position of the column we're taking the position of.
    if (event.clientX > startX) {
      newPosition -= 1;
    }

    newColumns.splice(newPosition, 0, newColumns.splice(initialPosition, 1)[0]);

    // Update the ordinal of the columns to reflect the new positions.
    newColumns.forEach((column, index) => {
      column.ordinal = index;
    });

    this.querySelector("tr").insertBefore(cell, targetCell);

    this.dispatchEvent(
      new CustomEvent("reorder-columns", {
        bubbles: true,
        detail: {
          columns: newColumns,
        },
      })
    );
    event.preventDefault();
  }

  /**
   * Create all the table header cells based on the currently set columns.
   */
  setColumns() {
    this.row.replaceChildren();

    for (const column of this.parentNode.columns) {
      /** @type {TreeViewTableHeaderCell} */
      const cell = document.createElement("th", {
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

    this.updateRovingTab();
  }

  /**
   * Get all currently visible columns of the table header.
   *
   * @returns {Array} An array of buttons.
   */
  get headerColumns() {
    return this.row.querySelectorAll(`th:not([hidden]) button`);
  }

  /**
   * Update the `tabindex` attribute of the currently visible columns.
   */
  updateRovingTab() {
    for (const button of this.headerColumns) {
      button.tabIndex = -1;
    }
    // Allow focus on the first available button.
    this.headerColumns[0].tabIndex = 0;
  }

  /**
   * Handles the keypress event on the table header.
   *
   * @param {Event} event - The keypress DOMEvent.
   */
  triggerTableHeaderRovingTab(event) {
    if (!["ArrowRight", "ArrowLeft"].includes(event.key)) {
      return;
    }

    const headerColumns = [...this.headerColumns];
    const focusableButton = headerColumns.find(b => b.tabIndex != -1);
    let elementIndex = headerColumns.indexOf(focusableButton);

    // Find the adjacent focusable element based on the pressed key.
    const isRTL = document.dir == "rtl";
    if (
      (isRTL && event.key == "ArrowLeft") ||
      (!isRTL && event.key == "ArrowRight")
    ) {
      elementIndex++;
      if (elementIndex > headerColumns.length - 1) {
        elementIndex = 0;
      }
    } else if (
      (!isRTL && event.key == "ArrowLeft") ||
      (isRTL && event.key == "ArrowRight")
    ) {
      elementIndex--;
      if (elementIndex == -1) {
        elementIndex = headerColumns.length - 1;
      }
    }

    // Move the focus to a new column and update the tabindex attribute.
    const newFocusableButton = headerColumns[elementIndex];
    if (newFocusableButton) {
      focusableButton.tabIndex = -1;
      newFocusableButton.tabIndex = 0;
      newFocusableButton.focus();
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
    this.draggable = true;

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

    this.resizable = column.resizable ?? true;

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

    this.#button.addEventListener("contextmenu", event => {
      event.stopPropagation();
      const table = this.closest("table");
      if (table.editable) {
        table
          .querySelector("#columnPickerMenuPopup")
          .openPopup(event.target, { triggerEvent: event });
      }
    });

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
        this.closest("tree-view").toggleSelectAll();
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
    this.dataset.resizable = val;

    let splitter = this.querySelector("hr");

    // Add a splitter if we don't have one already.
    if (!splitter) {
      splitter = document.createElement("hr", { is: "pane-splitter" });
      splitter.setAttribute("is", "pane-splitter");
      this.appendChild(splitter);
      splitter.resizeDirection = "horizontal";
      splitter.resizeElement = this;
      splitter.id = `${this.id}Splitter`;
      // Emit a custom event after a resize action. Methods at implementation
      // level should listen to this event if the edited column size needs to
      // be stored or used.
      splitter.addEventListener("splitter-resized", () => {
        this.dispatchEvent(
          new CustomEvent("column-resized", {
            bubbles: true,
            detail: {
              splitter,
              column: this.id,
            },
          })
        );
      });
    }

    this.style.setProperty("width", val ? `var(--${splitter.id}-width)` : null);
    // Disable the splitter if this is not a resizable column.
    splitter.isDisabled = !val;
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

      const columns = this.closest("table").columns;
      for (const column of columns) {
        const item = this.#context.querySelector(`[value="${column.id}"]`);
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
      this.#context.openPopup(event.target, {
        position: "after_end",
        triggerEvent: event,
      });
    });
  }

  /**
   * Add all toggable columns to the context menu popup of the picker button.
   */
  #initPopup() {
    const table = this.closest("table");
    const columns = table.columns;
    const items = new DocumentFragment();
    for (const column of columns) {
      // Skip those columns we don't want to allow hiding.
      if (column.picker === false) {
        continue;
      }

      const menuitem = document.createXULElement("menuitem");
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
    const restoreItem = document.createXULElement("menuitem");
    restoreItem.id = "restoreColumnOrder";
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
    this.setAttribute("role", "treegrid");
    this.setAttribute("aria-multiselectable", "true");

    const treeView = this.closest("tree-view");
    this.addEventListener("keyup", treeView);
    this.addEventListener("click", treeView);
    this.addEventListener("keydown", treeView);

    if (treeView.dataset.labelId) {
      this.setAttribute("aria-labelledby", treeView.dataset.labelId);
    }
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

    this.tabIndex = -1;
    this.list = this.closest("tree-view");
    this.view = this.list.view;
    this.setAttribute("aria-selected", !!this.selected);
  }

  /**
   * The 0-based position of this row in the list. Override this setter to
   * fill layout based on values from the list's view. Always call back to
   * this class's getter/setter when inheriting.
   *
   * @note Don't short-circuit the setter if the given index is equal to the
   * existing index. Rows can be reused to display new data at the same index.
   *
   * @type {integer}
   */
  get index() {
    return this._index;
  }

  set index(index) {
    this.setAttribute(
      "role",
      this.list.table.body.getAttribute("role") === "treegrid"
        ? "row"
        : "option"
    );
    this.setAttribute("aria-posinset", index + 1);
    this.id = `${this.list.id}-row${index}`;

    const isGroup = this.view.isContainer(index);
    this.classList.toggle("children", isGroup);

    const isGroupOpen = this.view.isContainerOpen(index);
    if (isGroup) {
      this.setAttribute("aria-expanded", isGroupOpen);
    } else {
      this.removeAttribute("aria-expanded");
    }
    this.classList.toggle("collapsed", !isGroupOpen);
    this._index = index;

    const table = this.closest("table");
    for (const column of table.columns) {
      const cell = this.querySelector(`.${column.id.toLowerCase()}-column`);
      // No need to do anything if this cell doesn't exist. This can happen
      // for non-table layouts.
      if (!cell) {
        continue;
      }

      // Always clear the colspan when updating the columns.
      cell.removeAttribute("colspan");

      // Set role as gridcell for keyboard navigation
      if (this.getAttribute("role") == "row") {
        cell.setAttribute("role", "gridcell");
      }

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
          img.tabIndex = -1;
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
      const last = table.columns.filter(c => !c.hidden).pop();
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
    for (const cell of this.querySelectorAll("td")) {
      cell.setAttribute("aria-selected", !!selected);
    }
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
