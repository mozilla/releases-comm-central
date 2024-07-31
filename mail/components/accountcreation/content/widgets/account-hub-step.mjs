/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-header.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Account Hub Step Template
 * Template ID: #accountHubStepTemplate (from accountHubStepTemplate.inc.xhtml)
 *
 * @slot header - Content displayed as the header.
 * @slot subheader - Content displayed as the subheader
 * @slot content - Body content for the step.
 */
export class AccountHubStep extends HTMLElement {
  /** @type {DOMLocalization} */
  l10n;

  /**
   * The header template.
   *
   * @type {HTMLElement}
   */
  #header;

  async connectedCallback() {
    if (this.shadowRoot) {
      // Already connected, no need to run it again.
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    // Load styles in the shadowRoot so we don't leak it.
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/accountHub.css";

    const template = document.getElementById("accountHubStepTemplate");
    const clonedNode = template.content.cloneNode(true);
    shadowRoot.append(style, clonedNode);

    this.l10n = new DOMLocalization([
      "branding/brand.ftl",
      "messenger/accountcreation/accountHub.ftl",
      "messenger/accountcreation/accountSetup.ftl",
    ]);
    this.l10n.connectRoot(shadowRoot);
    this.#header = this.shadowRoot.querySelector("account-hub-header");
    this.#setHeader();
  }

  /**
   * Applies the fluent ID's to the step's header text elements.
   */
  #setHeader() {
    if (this.hasAttribute("title-id")) {
      document.l10n.setAttributes(
        this.shadowRoot.querySelector("#title"),
        this.getAttribute("title-id")
      );
    }

    if (this.hasAttribute("subheader-id")) {
      document.l10n.setAttributes(
        this.shadowRoot.querySelector("#subheader"),
        this.getAttribute("subheader-id")
      );
    }
  }

  showBrandingHeader() {
    this.#header.showBrandingHeader();
  }

  /**
   * Calls the error notification method in the header template.
   *
   * @param {String} errorTitleID - The fluent ID of the error title.
   * @param {String} errorTextID - The fluent ID of the error text.
   */
  showErrorNotification(errorTitleID, errorTextID = "") {
    this.#header.showErrorNotification(errorTitleID, errorTextID);
  }

  /**
   * Calls the clear notification method in the header template.
   */
  clearNotifications() {
    this.#header.clearNotifications();
  }
}

customElements.define("account-hub-step", AccountHubStep);
