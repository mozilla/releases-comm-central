/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * The subview manager should contain multiple subview containers, each with
 * their own ID. The subviews should have the hidden attribute by default. It
 * will be toggled by this manager.
 * The size of the default subview dictates the viewport size of any other
 * subview.
 *
 * @tagname calendar-dialog-subview-manager
 * @attribute {string} default-subview - ID of the subview that should be shown by
 *   default.
 * @fires subviewchanged Emitted whenever the subview changed. Contains the ID
 *   of the now visible subview as detail.
 */
class CalendarDialogSubviewManager extends HTMLElement {
  /**
   * ID of the current subview.
   *
   * @type {?string}
   */
  #currentSubview;

  connectedCallback() {
    this.showDefaultSubview();
  }

  /**
   * Switch the visible subview. When going from the default subview to another
   * subview, the dimensions are locked. Once back on the default subview,
   * dimensions are unlocked again.
   *
   * @param {string} id - ID of the subview to show.
   * @fires subviewchanged Event fired when the subview changes. The detail is
   *   the ID of the new subview.
   * @throws {Error} When no subview matching the ID can be found.
   */
  showSubview(id) {
    if (id === this.#currentSubview) {
      // Already the active subview.
      return;
    }
    const newView = this.querySelector(`[id="${id}"]`);
    if (!newView) {
      throw new Error(`No subview with the id ${id} found.`);
    }
    if (this.#currentSubview) {
      const currentSubview = this.querySelector(
        `[id="${this.#currentSubview}"]`
      );
      const goingToDefault = this.#isDefaultSubview(id);
      // Fix the size for any non-default subview, while letting the default
      // subview resize dynamically.
      if (!this.style.height && !goingToDefault) {
        const subviewSize = currentSubview.getBoundingClientRect();
        this.style.height = `${subviewSize.height}px`;
        this.style.width = `${subviewSize.width}px`;
      } else if (goingToDefault) {
        this.style.height = "";
        this.style.width = "";
      }
      currentSubview.hidden = true;
    }
    newView.hidden = false;
    this.#currentSubview = id;
    this.dispatchEvent(
      new CustomEvent("subviewchanged", {
        detail: id,
      })
    );
  }

  /**
   * @param {string} id - A subview ID.
   * @returns {boolean} True if the ID matches the one of the default subview.
   */
  #isDefaultSubview(id) {
    return id === this.getAttribute("default-subview");
  }

  /**
   * @returns {boolean} If the currently displayed subview is the default
   *   subview.
   */
  isDefaultSubviewVisible() {
    return this.#isDefaultSubview(this.#currentSubview);
  }

  /**
   * Show the default subview.
   */
  showDefaultSubview() {
    this.showSubview(this.getAttribute("default-subview"));
  }
}
customElements.define(
  "calendar-dialog-subview-manager",
  CalendarDialogSubviewManager
);
