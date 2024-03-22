/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  ANIMATION_DURATION_MS,
  reducedMotionMedia,
  TreeListboxMixin,
} from "chrome://messenger/content/tree-listbox-mixin.mjs";

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

  _onDragEnd() {
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
