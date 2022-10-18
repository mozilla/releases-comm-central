/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Customization palette container for the unified toolbar. Contained in a
 * custom element for state management. When visible, the document should have
 * the customizingUnifiedToolbar class.
 * Template: #unified-toolbar-customization-template.
 */
class UnifiedToolbarCustomization extends HTMLElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;
    const template = document
      .getElementById("unified-toolbar-customization-template")
      .content.cloneNode(true);
    template.querySelector("form").addEventListener(
      "submit",
      event => {
        event.preventDefault();
        this.toggle(false);
      },
      {
        passive: false,
      }
    );
    template
      .querySelector("#unifiedToolbarCustomizationCancel")
      .addEventListener("click", () => {
        this.toggle(false);
      });
    this.append(template);
  }

  /**
   * Toggle unified toolbar customization.
   *
   * @param {boolean} [visible] - If passed, defines if customization should
   *   be active.
   */
  toggle(visible) {
    document.documentElement.classList.toggle(
      "customizingUnifiedToolbar",
      visible
    );
  }
}
customElements.define(
  "unified-toolbar-customization",
  UnifiedToolbarCustomization
);
