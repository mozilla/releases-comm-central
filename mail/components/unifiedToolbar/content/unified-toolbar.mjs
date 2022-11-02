/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// Temporary, should be dynamically loaded based on customiozation state.
import "./search-bar.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Unified toolbar container custom element. Used to contain the state
 * management and interaction logic. Template: #unifiedToolbarTemplate.
 * Requires unifiedToolbarPopups.inc.xhtml to be in a popupset of the same
 * document.
 */
class UnifiedToolbar extends HTMLElement {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    // No shadow root so other stylesheets can style the contents of the
    // toolbar, like the window controls.
    this.hasConnected = true;
    const template = document
      .getElementById("unifiedToolbarTemplate")
      .content.cloneNode(true);

    template
      .querySelector("#unifiedToolbarContainer")
      .addEventListener("contextmenu", event => {
        document
          .getElementById("unifiedToolbarMenu")
          .openPopupAtScreen(event.screenX, event.screenY, true);
      });

    this.append(template);

    document
      .getElementById("unifiedToolbarCustomize")
      .addEventListener("command", () => {
        this.#ensureCustomizationInserted().then(() =>
          document.querySelector("unified-toolbar-customization").toggle(true)
        );
      });
  }

  /**
   * Make sure the customization for unified toolbar is injected into the
   * document.
   *
   * @returns {Promise<void>}
   */
  async #ensureCustomizationInserted() {
    if (document.querySelector("unified-toolbar-customization")) {
      return;
    }
    await import("./unified-toolbar-customization.mjs");
    const customization = document.createElement(
      "unified-toolbar-customization"
    );
    document.body.appendChild(customization);
  }
}
customElements.define("unified-toolbar", UnifiedToolbar);
