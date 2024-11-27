/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);
const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
);

const { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

const { gAccountSetupLogger, standardPorts, assert } = AccountCreationUtils;

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Incoming Form Template
 * Template ID: #accountHubEmailIncomingFormTemplate (from accountHubEmailIncomingFormTemplate.inc.xhtml)
 */
class EmailIncomingForm extends AccountHubStep {
  /**
   * The incoming server protocol.
   *
   * @type {HTMLInputElement}
   */
  #incomingProtocol;

  /**
   * The incoming server hostname.
   *
   * @type {HTMLInputElement}
   */
  #incomingHostname;

  /**
   * The incoming server port.
   *
   * @type {HTMLInputElement}
   */
  #incomingPort;

  /**
   * The incoming server connection security.
   *
   * @type {HTMLInputElement}
   */
  #incomingConnectionSecurity;

  /**
   * The incoming server authentication method.
   *
   * @type {HTMLInputElement}
   */
  #incomingAuthenticationMethod;

  /**
   * The incoming username.
   *
   * @type {HTMLInputElement}
   */
  #incomingUsername;

  /**
   * The current email incoming config form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * Indicates if the form has been updated by the user.
   *
   * @type {Boolean}
   */
  #edited;

  connectedCallback() {
    if (this.hasConnected) {
      super.connectedCallback();
      return;
    }

    this.hasConnected = true;
    super.connectedCallback();

    const template = document
      .getElementById("accountHubIncomingEmailFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#incomingProtocol = this.querySelector("#incomingProtocol");
    this.#incomingPort = this.querySelector("#incomingPort");
    this.#incomingHostname = this.querySelector("#incomingHostname");
    this.#incomingConnectionSecurity = this.querySelector(
      "#incomingConnectionSecurity"
    );
    this.#incomingAuthenticationMethod = this.querySelector(
      "#incomingAuthMethod"
    );
    this.#incomingUsername = this.querySelector("#incomingUsername");
    this.setupEventListeners();
    this.#currentConfig = {};
    this.#edited = false;
  }

  /**
   * Set up the event listeners for this workflow.
   */
  setupEventListeners() {
    this.#incomingHostname.addEventListener("input", () => {
      this.#configChanged();
      this.#adjustOAuth2Visibility();
    });

    this.#incomingUsername.addEventListener("input", () => {
      this.#configChanged();
    });

    this.#incomingAuthenticationMethod.addEventListener("command", () => {
      this.#configChanged();
    });

    this.#incomingConnectionSecurity.addEventListener("command", () => {
      this.#configChanged();
      this.#adjustPortToSSLAndProtocol();
    });
    this.#incomingPort.addEventListener("input", () => {
      this.#configChanged();
      this.#adjustSSLToPort();
    });

    this.#incomingProtocol.addEventListener("command", () => {
      this.#configChanged();
      this.#adjustPortToSSLAndProtocol();
    });

    this.querySelector("#advancedConfigurationIncoming").addEventListener(
      "click",
      this
    );
  }

  handleEvent(event) {
    switch (event.target.id) {
      case "advancedConfigurationIncoming":
        this.dispatchEvent(
          new CustomEvent("advanced-config", {
            bubbles: true,
          })
        );
        break;
      default:
        break;
    }
  }

  /**
   * @typedef {object} ConfigFormState
   * @property {AccountConfig} config - The updated AccountConfig.
   * @property {Boolean} edited - If form has been edited.
   */

  /**
   * Return the current state of the email setup form, with the updated
   * incoming fields, and a property that tells if the form has been edited.
   *
   * @returns {ConfigFormState} State details.
   */
  captureState() {
    return {
      config: this.getIncomingUserConfig(),
      edited: this.#edited,
    };
  }

  /**
   * Sets the state of the incoming email config state.
   *
   * @param {AccountConfig} configData - Applies the config data to this state.
   */
  setState(configData) {
    this.#currentConfig = configData;
    this.#edited = false;
    this.updateFields(this.#currentConfig);
  }

  /**
   * Dispatches an event to the email controller whenever there is a change in
   * configuration with the detail of the incoming config being complete.
   */
  #configChanged() {
    let completed = false;
    this.#edited = true;
    try {
      const completeConfig = this.getIncomingUserConfig().isIncomingComplete();
      const validForm =
        this.querySelector("#incomingEmailForm").checkValidity();
      completed = completeConfig && validForm;
    } catch (error) {
      // We're just trying to get the config values here, so if it fails
      // we can silently fail.
    }

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed },
      })
    );
  }

  /**
   * Make OAuth2 visible as an authentication method when a hostname that
   * OAuth2 can be used with is entered.
   * @param {AccountConfig} [accountConfig] - Complete AccountConfig.
   */
  #adjustOAuth2Visibility(accountConfig) {
    // Get current config.
    const config = accountConfig || this.getIncomingUserConfig();

    // If the incoming server hostname supports OAuth2, enable it.
    const incomingDetails = OAuth2Providers.getHostnameDetails(
      config.incoming.hostname,
      config.incoming.type
    );

    this.querySelector("#incomingAuthMethodOAuth2").hidden = !incomingDetails;
    if (incomingDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for incoming server ${config.incoming.hostname} is ${incomingDetails}`
      );
    }

    this.#currentConfig = config;
  }

  /**
   * Automatically fill port field when connection security has changed in,
   * unless the user entered a non-standard port.
   *
   * @param {AccountConfig} [accountConfig] - Complete AccountConfig.
   */
  #adjustPortToSSLAndProtocol(accountConfig) {
    // Get current config.
    const config = accountConfig || this.getIncomingUserConfig();

    if (config.incoming.port && !standardPorts.includes(config.incoming.port)) {
      return;
    }

    switch (config.incoming.type) {
      case "imap":
        this.#incomingPort.value =
          config.incoming.socketType == Ci.nsMsgSocketType.SSL ? 993 : 143;
        break;

      case "pop3":
        this.#incomingPort.value =
          config.incoming.socketType == Ci.nsMsgSocketType.SSL ? 995 : 110;
        break;

      case "exchange":
        this.#incomingPort.value = 443;
        break;
    }

    config.incoming.port = this.#incomingPort.value;
    this.#currentConfig = config;
  }

  /**
   * If the user changed the port manually, adjust the SSL value,
   * (only) if the new port is impossible with the old SSL value.
   *
   * @param {AccountConfig} [accountConfig] - Complete AccountConfig.
   */
  #adjustSSLToPort(accountConfig) {
    const config = accountConfig || this.getIncomingUserConfig();

    if (!standardPorts.includes(config.incoming.port)) {
      return;
    }

    if (config.incoming.type == "imap") {
      // Implicit TLS for IMAP is on port 993.
      if (
        config.incoming.port == 993 &&
        config.incoming.socketType != Ci.nsMsgSocketType.SSL
      ) {
        this.#incomingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
      } else if (
        config.incoming.port == 143 &&
        config.incoming.socketType == Ci.nsMsgSocketType.SSL
      ) {
        this.#incomingConnectionSecurity.value =
          Ci.nsMsgSocketType.alwaysSTARTTLS;
      }
    }

    if (config.incoming.type == "pop3") {
      // Implicit TLS for POP3 is on port 995.
      if (
        config.incoming.port == 995 &&
        config.incoming.socketType != Ci.nsMsgSocketType.SSL
      ) {
        this.#incomingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
      } else if (
        config.incoming.port == 110 &&
        config.incoming.socketType == Ci.nsMsgSocketType.SSL
      ) {
        this.#incomingConnectionSecurity.value =
          Ci.nsMsgSocketType.alwaysSTARTTLS;
      }
    }

    config.incoming.socketType = this.#incomingConnectionSecurity.value;

    this.#currentConfig = config;
  }

  /**
   * Returns an Account Config object with all the sanitized user-inputted
   * data for a manual config email guess attempt.
   *
   * @returns {AccountConfig}
   */
  getIncomingUserConfig() {
    const config = this.#currentConfig;
    config.source = AccountConfig.kSourceUser;

    try {
      const inHostnameValue = this.#incomingHostname.value;
      config.incoming.hostname = Sanitizer.hostname(inHostnameValue);
      this.#incomingHostname.value = config.incoming.hostname;
      this.#incomingHostname.setCustomValidity("");
    } catch (error) {
      gAccountSetupLogger.warn(error);
      this.#incomingHostname.setCustomValidity(error._message);
    }

    try {
      config.incoming.port = Sanitizer.integerRange(
        this.#incomingPort.valueAsNumber,
        1,
        65535
      );
      this.#incomingPort.setCustomValidity("");
    } catch (error) {
      // Include default "Auto".
      config.incoming.port = undefined;
      this.#incomingPort.setCustomValidity(error._message);
    }

    config.incoming.type = Sanitizer.translate(this.#incomingProtocol.value, {
      1: "imap",
      2: "pop3",
      3: "exchange",
      0: null,
    });
    config.incoming.socketType = Sanitizer.integer(
      this.#incomingConnectionSecurity.value
    );
    config.incoming.auth = Sanitizer.integer(
      this.#incomingAuthenticationMethod.value
    );
    config.incoming.username = this.#incomingUsername.value;

    return config;
  }

  /**
   * Updates the fields with the confirmed AccountConfig from
   * guessConfig, called by parent template.
   *
   * @param {AccountConfig} config - The config to present to the user.
   */
  updateFields(config) {
    assert(config instanceof AccountConfig);

    const isExchange = config.incoming.type == "exchange";

    this.querySelector("#incomingProtocolExchange").hidden = !isExchange;
    this.#incomingProtocol.value = Sanitizer.translate(
      config.incoming.type,
      { imap: 1, pop3: 2, exchange: 3 },
      1
    );
    this.#incomingHostname.value = config.incoming.hostname;
    this.#incomingConnectionSecurity.value = Sanitizer.enum(
      config.incoming.socketType,
      [0, 1, 2, 3],
      0
    );
    this.#incomingAuthenticationMethod.value = Sanitizer.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    this.#incomingUsername.value = config.incoming.username;

    // If a port number was specified other than "Auto"
    if (config.incoming.port) {
      this.#incomingPort.value = config.incoming.port;
    } else {
      this.#adjustPortToSSLAndProtocol(config);
    }

    this.#adjustOAuth2Visibility(config);
  }
}

customElements.define("email-manual-incoming-form", EmailIncomingForm);
