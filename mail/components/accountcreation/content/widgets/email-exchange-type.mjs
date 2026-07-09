/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";
import "./account-hub-radio-card-large.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-input.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-select.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-checkbox.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Account Hub Email Exchange type choice and config form.
 * Template ID: #accountHubEmailExchangeTypeTemplate (from accountHubEmailExchangeType.inc.xhtml)
 *
 * @tagname email-exchange-type
 */
class EmailExchangeType extends AccountHubStep {
  /**
   * The account type radio cards.
   *
   * @type {NodeListOf<HTMLElement>}
   */
  #accountTypeCards;

  /**
   * The Authentication Method select.
   *
   * @type {AccountHubSelect}
   */
  #authenticationSelect;

  /**
   * The available authentication options.
   *
   * @type {object}
   */
  #authenticationOptions;

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

    this.#authenticationSelect = this.querySelector(
      "#exchangeTypeAuthentication"
    );
    this.#accountTypeCards = this.querySelectorAll(
      "account-hub-radio-card-large"
    );
    this.#authenticationOptions = {
      normalPassword: this.querySelector("#incomingAuthMethodCleartext"),
      ntlm: this.querySelector("#incomingAuthMethodNtlm"),
      oauth2: this.querySelector("#incomingAuthMethodOAuth2"),
    };

    this.querySelector("#exchangeTypeForm").addEventListener("change", this);

    this.#updateAuthenticationOptions();
  }

  handleEvent(event) {
    switch (event.type) {
      case "change":
        this.#updateAuthenticationOptions();
        break;
    }
  }

  /**
   * Update the available authentication options based on the account type.
   */
  #updateAuthenticationOptions() {
    const selectedAccountType =
      Array.from(this.#accountTypeCards).find(card => card.checked)?.value ||
      this.#accountTypeCards[0]?.value;
    const isGraphSelected = selectedAccountType == "graph";

    this.#authenticationOptions.normalPassword.hidden = isGraphSelected;
    this.#authenticationOptions.ntlm.hidden = isGraphSelected;

    if (isGraphSelected) {
      this.#authenticationSelect.value = Ci.nsMsgAuthMethod.OAuth2;
    }
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
