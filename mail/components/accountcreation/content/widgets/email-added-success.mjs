/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Auto Form Template
 * Template ID: #accountHubEmailAddedSuccessTemplate (from accountHubEmailAutoFormTemplate.inc.xhtml)
 */
class EmailAddedSuccess extends AccountHubStep {
  /**
   * The current email account.
   *
   * @type {nsIMsgAccount}
   */
  #account;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailAddedSuccessTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    super.showBrandingHeader();

    this.querySelector(".account-hub-link-container").addEventListener(
      "click",
      this
    );
  }

  /**
   * Sets the email account for this step.
   *
   * @param {nsIMsgAccount} account - The email account created.
   */
  setState(account) {
    this.#account = account;
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        window.MsgAccountManager(
          event.target.id === "accountHubEncryptionLink"
            ? "am-e2e.xhtml"
            : null,
          this.#account?.incomingServer
        );
        break;
    }
  }
}

customElements.define("email-added-success", EmailAddedSuccess);
