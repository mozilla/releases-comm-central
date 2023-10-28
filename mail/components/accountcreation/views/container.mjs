/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Custom Element containing the main account hub dialog. Used to append the
 * needed CSS files to the shadowDom to prevent style leakage.
 * NOTE: This could directly extend an HTMLDialogElement if it had a shadowRoot.
 */
class AccountHubContainer extends HTMLElement {
  /** @type {HTMLDialogElement} */
  modal;

  /** @type {DOMLocalization} */
  l10n;

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
    shadowRoot.appendChild(style);

    const template = document.getElementById("accountHubDialog");
    const clonedNode = template.content.cloneNode(true);
    shadowRoot.appendChild(clonedNode);
    this.modal = shadowRoot.querySelector("dialog");

    // We need to create an internal DOM localization in order to let fluent
    // see the IDs inside our shadowRoot.
    this.l10n = new DOMLocalization([
      "branding/brand.ftl",
      "messenger/accountcreation/accountHub.ftl",
      "messenger/accountcreation/accountSetup.ftl",
    ]);
    this.l10n.connectRoot(shadowRoot);
  }

  disconnectedCallback() {
    this.l10n.disconnectRoot(this.shadowRoot);
  }
}
customElements.define("account-hub-container", AccountHubContainer);
