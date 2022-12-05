/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { getDefaultItemIdsForSpace } from "resource:///modules/CustomizableItems.mjs";
import "./customizable-element.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Unified toolbar container custom element. Used to contain the state
 * management and interaction logic. Template: #unifiedToolbarTemplate.
 * Requires unifiedToolbarPopups.inc.xhtml to be in a popupset of the same
 * document.
 */
class UnifiedToolbar extends HTMLElement {
  /**
   * List containing the customizable content of the unified toolbar.
   *
   * @type {?HTMLUListElement}
   */
  #toolbarContent = null;

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

    // TODO Don't show context menu when there is a native one, like for example
    // in a search field.
    template
      .querySelector("#unifiedToolbarContainer")
      .addEventListener("contextmenu", event => {
        document
          .getElementById("unifiedToolbarMenu")
          .openPopupAtScreen(event.screenX, event.screenY, true);
      });
    this.#toolbarContent = template.querySelector("#unifiedToolbarContent");
    this.initialize();

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

  /**
   * Initialize the unified toolbar contents.
   */
  initialize() {
    const defaultItems = getDefaultItemIdsForSpace();
    this.#toolbarContent.replaceChildren(
      ...defaultItems.map(itemId => {
        const element = document.createElement("li", {
          is: "customizable-element",
        });
        element.setAttribute("item-id", itemId);
        return element;
      })
    );
  }
}
customElements.define("unified-toolbar", UnifiedToolbar);
