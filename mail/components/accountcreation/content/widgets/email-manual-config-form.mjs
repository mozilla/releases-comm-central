/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";
import "./account-hub-select.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-input.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-checkbox.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Account Hub Email Manual Config Form Template
 * Template ID: #accountHubEmailManualConfigFormTemplate (from accountHubEmailManualConfigFormTemplate.inc.xhtml)
 */
class EmailManualConfigForm extends AccountHubStep {
  /**
   * The account config object that gets updated by the manual config form.
   *
   * @type {AccountConfig}
   */
  #currentConfig = {};

  /**
   * The checkbox that hides and shows the outgoing username.
   *
   * @type {HTMLInputElement}
   */
  #sameUsernameCheckbox;

  /**
   * The outgoing username input.
   *
   * @type {HTMLInputElement}
   */
  #outgoingUsername;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailManualConfigFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#sameUsernameCheckbox = this.querySelector("#sameUsername");
    this.#outgoingUsername = this.querySelector("#manualOutgoingUsername");
    this.#sameUsernameCheckbox.setAriaControlsElements(this.#outgoingUsername);

    this.#sameUsernameCheckbox.addEventListener("change", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "change":
        this.#outgoingUsername.hidden = this.#sameUsernameCheckbox.checked;
        this.#outgoingUsername.required = !this.#sameUsernameCheckbox.checked;
        break;
      default:
        break;
    }
  }

  /**
   * Sets the state of the manual config form.
   *
   * @param {AccountConfig} configData - An account configuration object.
   */
  setState(configData) {
    this.#currentConfig = configData;

    const incomingType = configData.incoming?.type;
    let incomingTypeId;

    switch (incomingType) {
      case "imap":
        incomingTypeId = "account-hub-manual-config-imap-title";
        break;
      case "pop3":
        incomingTypeId = "account-hub-manual-config-pop3-title";
        break;
    }

    this.setTitle(incomingTypeId);
  }

  /**
   * Returns an account config object based on the data inputted in this form.
   *
   * @returns {AccountConfig} - An account configuration object that has been
   *  updated by this form.
   */
  captureState() {
    return this.#currentConfig;
  }
}

customElements.define("email-manual-config-form", EmailManualConfigForm);
