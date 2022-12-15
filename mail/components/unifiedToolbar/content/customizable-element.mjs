/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import CUSTOMIZABLE_ITEMS from "resource:///modules/CustomizableItemsDetails.mjs";

/**
 * Wrapper element for elements whose position can be customized.
 *
 * Template ID: #unifiedToolbarCustomizableElementTemplate
 * Attributes:
 * - item-id: ID of the customizable item this represents. Not observed.
 * - disabled: Gets passed on to the live content.
 */
export default class CustomizableElement extends HTMLLIElement {
  static get observedAttributes() {
    return ["disabled"];
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.setAttribute("is", "customizable-element");

    const template = document
      .getElementById("unifiedToolbarCustomizableElementTemplate")
      .content.cloneNode(true);

    const details = CUSTOMIZABLE_ITEMS.find(
      item => item.id === this.getAttribute("item-id")
    );
    if (!details) {
      throw new Error(
        `Could not find definition for ${this.getAttribute("item-id")}`
      );
    }
    this.append(template);
    this.#initializeFromDetails(details).catch(console.error);
  }

  attributeChangedCallback(attribute) {
    if (attribute !== "disabled") {
      return;
    }
    const isDisabled = this.hasAttribute("disabled");
    for (const child of this.querySelector(".live-content")?.children ?? []) {
      child.toggleAttribute("disabled", isDisabled);
    }
  }

  /**
   * Initialize the template contents from item details. Can't operate on the
   * template directly due to being async.
   *
   * @param {CustomizableItemDetails} itemDetails
   */
  async #initializeFromDetails(itemDetails) {
    if (this.details) {
      return;
    }
    this.details = itemDetails;
    this.classList.add(itemDetails.id);
    if (Array.isArray(itemDetails.requiredModules)) {
      await Promise.all(
        itemDetails.requiredModules.map(module => {
          return import(module); // eslint-disable-line no-unsanitized/method
        })
      );
    }
    if (itemDetails.templateId) {
      const contentTemplate = document.getElementById(itemDetails.templateId);
      this.querySelector(".live-content").append(
        contentTemplate.content.cloneNode(true)
      );
      if (this.hasAttribute("disabled")) {
        this.attributeChangedCallback("disabled");
      }
    }
    document.l10n.setAttributes(
      this.querySelector(".preview-label"),
      `${itemDetails.labelId}-label`
    );
  }

  /**
   * Holds a reference to the palette this element belongs to.
   *
   * @type {CustomizationPalette}
   */
  get palette() {
    const paletteClass = this.details.spaces?.length
      ? "space-specific-palette"
      : "generic-palette";
    return this.getRootNode().querySelector(`.${paletteClass}`);
  }

  /**
   * If multiple instances of this element are allowed in the same space.
   *
   * @type {boolean}
   */
  get allowMultiple() {
    return Boolean(this.details?.allowMultiple);
  }

  /**
   * Human readable label for the widget.
   *
   * @type {string}
   */
  get label() {
    return this.querySelector(".preview-label").textContent;
  }
}
customElements.define("customizable-element", CustomizableElement, {
  extends: "li",
});
