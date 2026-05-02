/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Exchange type choice and config form.
 * Template ID: #accountHubEmailExchangeTypeTemplate (from accountHubEmailExchangeType.inc.xhtml)
 *
 * @tagname email-exchange-type
 */
class EmailExchangeType extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailExchangeTypeTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
  }

  /**
   * Sets the state of the Exchange settings subview.
   *
   * @param {AccountConfig} _configData - An account configuration object.
   */
  setState(_configData) {}

  /**
   * Get the resulting Exchange account settings.
   */
  captureState() {}
}

customElements.define("email-exchange-type", EmailExchangeType);
