/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";
import "./account-hub-select.mjs"; // eslint-disable-line import/no-unassigned-import

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
  }

  /**
   * Sets the state of the manual config form.
   *
   * @param {AccountConfig} configData - An account configuration object.
   */
  setState(configData) {
    this.#currentConfig = configData;
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
