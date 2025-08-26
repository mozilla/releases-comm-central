/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This element is placed in the drop location to indicate where dropping will
 * place the dragged item.
 *
 * @tagname drop-indicator
 * @attribute {boolean} horizontal - When set, the drop indicator is for an
 *   horizontal context.
 * @cssproperty [--drop-indicator-z-index=3]
 */
class DropIndicator extends HTMLImageElement {
  /**
   * Calculate the inset-block correction if the indicator is horizontal so we
   * can correctly center align it by accounting for its height. We hardcode the
   * half of the SVG height (6px) because the element might not return the proper
   * size when made visible on first run.
   *
   * @type {number}
   */
  get blockCorrection() {
    return this.hasAttribute("horizontal") ? 6 : 0;
  }

  /**
   * Calculate the inset-inline correction if the indicator is vertical so we
   * can correctly center align it by accounting for its width. We hardcode the
   * half of the SVG width (6px) because the element might not return the proper
   * size when made visible on first run.
   *
   * @type {number}
   */
  get inlineCorrection() {
    return !this.hasAttribute("horizontal") ? 6 : 0;
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "drop-indicator");
    this.src = "";
    this.alt = "";
    this.hidden = true;
  }

  /**
   * Make the drop indicator visible and position it where needed. The values
   * we're receiving will be relative to the stacking context of the elements
   * where the drag and drop operation is currently happening.
   * The element is by default positioned absolute to the parent container of
   * the reorderable list, and the inset* inline style values represent the
   * block and inline values of the target of the drop operation.
   *
   * @param {number} blockStart - The block location of where the drop indicator
   *   should be visible.
   * @param {number} inlineStart - The inline location of where the drop
   *   indicator should be visible.
   */
  show(blockStart, inlineStart) {
    this.hidden = false;
    // You might feel tempted to use Math.round() to get nice integer pixel
    // values but that would make the indicator position randomly shift by a
    // a bunch of subpixels depending on users' font size, density, and theme.
    this.style.insetBlockStart = `${blockStart - this.blockCorrection}px`;
    this.style.insetInlineStart = `${inlineStart - this.inlineCorrection}px`;
  }

  /**
   * Hide the drop indicator.
   */
  hide() {
    this.hidden = true;
    this.style.removeProperty("inset-inline-start");
    this.style.removeProperty("inset-block-start");
  }
}
customElements.define("drop-indicator", DropIndicator, { extends: "img" });
