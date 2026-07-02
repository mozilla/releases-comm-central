/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-header.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Account Hub Step Template
 * Template ID: #accountHubStepTemplate (from accountHubStepTemplate.inc.xhtml)
 *
 * @slot content - Body content for the step.
 * @attribute {string} title-id - ID of the string to use as title for the step.
 * @attribute {string} subheader-id - ID of the string to use as sub title for
 *  the step.
 * @attribute {string} subheader-text - String to display as the subheader.
 *  Can only specify either this or subheader-id, if both are present the
 *  id will take precedence.
 */
export class AccountHubStep extends HTMLElement {
  static observedAttributes = ["is-first-run", "title-id"];

  /** @type {DOMLocalization} */
  l10n;

  /**
   * The header template.
   *
   * @type {HTMLElement}
   */
  #header;

  connectedCallback() {
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
    ]);
    this.l10n.connectRoot(shadowRoot);
    this.#header = this.shadowRoot.querySelector("account-hub-header");
    this.#setHeader();
  }

  attributeChangedCallback(attributeName) {
    if (!this.shadowRoot) {
      return;
    }

    switch (attributeName) {
      case "is-first-run": {
        this.#header?.refresh();
        break;
      }
      case "title-id": {
        this.#setHeader();
        break;
      }
    }
  }

  /**
   * Applies the fluent ID's to the step's header text elements.
   */
  #setHeader() {
    if (!this.shadowRoot) {
      return;
    }

    const title = this.shadowRoot.querySelector("#title");
    const subheader = this.shadowRoot.querySelector("#subheader");

    delete title.dataset.l10nId;
    delete title.dataset.l10nArgs;
    title.textContent = "";

    if (this.hasAttribute("title-id")) {
      document.l10n.setAttributes(title, this.getAttribute("title-id"));
    }

    if (this.hasAttribute("subheader-id")) {
      document.l10n.setAttributes(subheader, this.getAttribute("subheader-id"));

      this.#header.showSubheader();
      return;
    }

    if (this.hasAttribute("subheader-text")) {
      subheader.textContent = this.getAttribute("subheader-text");

      this.#header.showSubheader();
    }
  }

  /**
   * Sets the step title-id attribute, to trigger an update of the text.
   *
   * @param {string} [fluentId] - ID of the l10n string. Leave
   *  blank/empty to remove the title.
   */
  setTitle(fluentId) {
    if (!fluentId) {
      this.removeAttribute("title-id");
      return;
    }

    this.setAttribute("title-id", fluentId);
  }

  /**
   * Show the branding header
   */
  showBrandingHeader() {
    this.#header.showBrandingHeader();
  }

  /**
   * Calls the error notification method in the header template.
   *
   * @param {object} options
   */
  showNotification(options) {
    this.#header.showNotification(options);
  }

  /**
   * Calls the clear notification method in the header template.
   */
  clearNotifications() {
    this.#header.clearNotifications();
  }
}

customElements.define("account-hub-step", AccountHubStep);
