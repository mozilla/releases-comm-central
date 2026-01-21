/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * @typedef {object} AddressBookLogin
 * @property {string} username - Username to log in to the address book with
 * @property {string} server - The URL or domain of the server the address book
 *  is stored on.
 */

/**
 * Account Hub Address Book Remote Account Form Template
 * Template ID: #accountHubAddressBookRemoteAccountFormTemplate
 * (from accountHubAddressBookRemoteAccountFormTemplate.inc.xhtml)
 */
class AddressBookRemoteAccountForm extends AccountHubStep {
  /**
   * @type {HTMLInputElement}
   */
  #username;

  /**
   * @type {HTMLInputElement}
   */
  #davServer;

  /**
   * @type {AddressBookLogin}
   */
  #currentData = {
    username: "",
    server: "",
  };

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubAddressBookRemoteAccountFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#username = this.querySelector("#username");
    this.#davServer = this.querySelector("#davServer");
    this.#username.addEventListener("input", this);
    this.#davServer.addEventListener("input", this);
    this.resetState();

    this.showBrandingHeader();
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#checkFormValidity();
        break;
      default:
        break;
    }
  }

  /**
   * Reset the form data and internal state.
   */
  resetState() {
    this.querySelector("#accountHubRemoteAddressBookForm").reset();
    this.#currentData = {
      username: "",
      server: "",
    };
    this.#checkFormValidity();
  }

  /**
   * Called whenever the custom element is shown. Resets the state and focuses
   * the first input.
   */
  setState() {
    this.resetState();
    this.querySelector("#username").focus();
  }

  /**
   * Returns the current state of the entered data.
   *
   * @returns {AddressBookLogin}
   */
  captureState() {
    return this.#currentData;
  }

  /**
   * Check the validity of the inputs, updating their validation state and
   * storing the current values in #currentData.
   */
  #checkFormValidity() {
    const usernameValidity = this.#username.checkValidity();
    const username = this.#username.value;
    const domain = username.toLowerCase().split("@")[1];
    const needsServer = !usernameValidity || !username.includes("@") || !domain;
    this.#davServer.required = needsServer;
    const serverValidity = Boolean(domain) || this.#davServer.checkValidity();

    this.#username.ariaInvalid = !usernameValidity;
    this.#davServer.ariaInvalid = !serverValidity;

    this.#currentData = {
      username,
      server: this.#davServer.value || domain || "",
    };

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed: usernameValidity && serverValidity },
      })
    );
  }
}

customElements.define(
  "address-book-remote-account-form",
  AddressBookRemoteAccountForm
);
