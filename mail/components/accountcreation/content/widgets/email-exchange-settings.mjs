/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { InputSanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/InputSanitizer.sys.mjs"
);

import { AccountHubStep } from "./account-hub-step.mjs";
import "./account-hub-input.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Account Hub Email Exchange Settings
 * Template ID: #accountHubEmailExchangeSettingsTemplate (from accountHubEmailExchangeSettingsTemplate.inc.xhtml)
 *
 * @tagname email-exchange-settings
 */
class EmailExchangeSettings extends AccountHubStep {
  _formSelector = "#exchangeSettingsForm";

  /**
   * The current email auto config form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * The service URL component.
   *
   * @type {AccountHubInput}
   */
  #serviceURL;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailExchangeSettingsTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#serviceURL = this.querySelector("#serviceURL");
    this.#serviceURL.addEventListener("input", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#updateContinueState();
        break;
      default:
        break;
    }
  }

  /**
   * Sets the state of the Exchange settings subview.
   *
   * @param {AccountConfig} configData - An account configuration object.
   */
  setState(configData) {
    this.#currentConfig = configData;
    this.#serviceURL.value = configData?.incoming.exchangeURL ?? "";
    this.#updateContinueState();
    this.#serviceURL.focus();
  }

  /**
   * Get the resulting Exchange account settings.
   */
  captureState() {
    const config = this.#currentConfig.copy();

    config.incoming.exchangeURL = this.#getServiceURL();

    return config;
  }

  /**
   * Update the Continue button state based on the service URL input validity.
   */
  #updateContinueState() {
    this.#serviceURL.setErrorState("");

    const completed =
      this.querySelector(this._formSelector).checkValidity() &&
      this.#isServiceURLValid();

    if (!completed) {
      this.#serviceURL.setErrorState("error");
    } else {
      this.#serviceURL.setErrorState("");
    }

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: {
          completed,
        },
      })
    );
  }

  /**
   * Get the sanitized Exchange service URL from the service URL input.
   *
   * @returns {string} The sanitized URL, or an empty string if the input is not
   *   a valid URL.
   */
  #getServiceURL() {
    try {
      const inputValue = this.#serviceURL.value.trim();
      const url = InputSanitizer.url(inputValue);
      return url;
    } catch {
      return "";
    }
  }

  /**
   * Check whether the service URL input contains a valid HTTP(S) URL.
   *
   * @returns {boolean} Whether the service URL is valid.
   */
  #isServiceURLValid() {
    const serviceURL = this.#getServiceURL();
    const url = URL.parse(serviceURL);

    if (!url || (url.protocol !== "http:" && url.protocol !== "https:")) {
      return false;
    }
    return true;
  }
}

customElements.define("email-exchange-settings", EmailExchangeSettings);
