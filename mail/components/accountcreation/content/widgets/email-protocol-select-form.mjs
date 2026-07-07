/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Protocol Select Form Template
 * Template ID: #accountHubEmailProtocolSelectFormTemplate
 * (from accountHubEmailProtocolSelectFormTemplate.inc.xhtml)
 */
class EmailProtocolSelectForm extends AccountHubStep {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailProtocolSelectFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
  }

  /**
   * Selects the protocol matching the current config.
   *
   * @param {AccountConfig} configData - An account configuration object.
   */
  setState(configData) {
    let protocolSelect = configData?.incoming?.type || "imap";
    if (["exchange", "ews", "graph"].includes(protocolSelect)) {
      protocolSelect = "microsoft";
    }

    const selectedInput = this.querySelector(
      `input[name="protocol-select"][value="${protocolSelect}"]`
    );
    (selectedInput || this.querySelector(`input[value="imap"]`)).checked = true;
  }

  /**
   * Returns the selected incoming protocol.
   *
   * @returns {{protocolSelect: string}}
   */
  captureState() {
    return {
      protocolSelect: this.querySelector(
        `input[name="protocol-select"]:checked`
      ).value,
    };
  }
}

customElements.define("email-protocol-select-form", EmailProtocolSelectForm);
