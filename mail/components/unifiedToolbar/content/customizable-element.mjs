/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Attributes:
 * - palette: ID of the palette the item belongs to.
 */
class CustomizableElement extends HTMLLIElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "customizable-element");
  }

  /**
   * Holds a reference to the palette this element belongs to.
   *
   * @type {CustomizationPalette}
   */
  get palette() {
    return this.getRootNode().querySelector(`#${this.getAttribute("palette")}`);
  }
}
customElements.define("customizable-element", CustomizableElement, {
  extends: "li",
});
