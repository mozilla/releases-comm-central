/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Credentials Confirmation Step.
 * Template ID: #accountHubEmailCredentialsConfirmationTemplate (from accountHubEmailCredentialsConfirmationTemplate.inc.xhtml)
 */
class EmailCredentialsConfirmation extends AccountHubStep {
  /**
   * The redirection host.
   *
   * @type {string}
   */
  #host = "";

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailCredentialsConfirmationTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.querySelector("#manualConfiguration").addEventListener("click", this);

    super.showBrandingHeader();
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (event.target.id === "manualConfiguration") {
          this.dispatchEvent(
            new CustomEvent("edit-configuration", {
              bubbles: true,
            })
          );
        }
        break;
      default:
        break;
    }
  }

  /**
   * Updates the step with the user's credentials that are to be submitted.
   *
   * @param {object} credentials - Object containing domain and email.
   * @param {string} credentials.host - Domain.
   * @param {string} credentials.username - Email.
   * @param {string} credentials.scheme - Host scheme (HTTP/HTTPS);
   */
  setState(credentials) {
    this.#host = credentials.host;

    this.querySelector("#hostname").textContent = credentials.host;
    this.querySelector("#username").textContent = credentials.username;
    const socketType = this.querySelector("#socketType");

    if (credentials.scheme == "https") {
      socketType.textContent = "SSL/TLS";
      delete socketType.dataset.l10nId;
    } else {
      this.l10n.setAttributes(socketType, "account-hub-ssl-noencryption");
    }

    this.l10n.setAttributes(
      this.querySelector("#confirmationQuestion"),
      "exchange-dialog-question",
      {
        domain: credentials.host,
      }
    );
    return credentials;
  }

  captureState() {
    return {
      host: this.#host,
    };
  }

  /**
   * Clears the credentials from the step.
   *
   */
  resetState() {
    this.querySelector("#hostname").textContent = "";
    this.querySelector("#username").textContent = "";
    delete this.querySelector("#socketType").dataset.l10nId;
    this.querySelector("#socketType").textContent = "";
  }
}

customElements.define(
  "email-credentials-confirmation",
  EmailCredentialsConfirmation
);
