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

const { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

const { gAccountSetupLogger, standardPorts, assert } = AccountCreationUtils;

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Outgoing Form Template
 * Template ID: #accountHubEmailOutgoingFormTemplate (from accountHubEmailOutgoingFormTemplate.inc.xhtml)
 */
class EmailOutgoingForm extends AccountHubStep {
  /**
   * The current email outgoing config form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * The outgoing server username.
   *
   * @type {HTMLInputElement}
   */
  #outgoingUsername;

  /**
   * The outgoing server hostname.
   *
   * @type {HTMLInputElement}
   */
  #outgoingHostname;

  /**
   * The outgoing server port.
   *
   * @type {HTMLInputElement}
   */
  #outgoingPort;

  /**
   * The outgoing server connection security.
   *
   * @type {HTMLInputElement}
   */
  #outgoingConnectionSecurity;

  /**
   * The outgoing server authentication method.
   *
   * @type {HTMLInputElement}
   */
  #outgoingAuthenticationMethod;

  connectedCallback() {
    if (this.hasConnected) {
      super.connectedCallback();
      return;
    }

    super.connectedCallback();

    const template = document
      .getElementById("accountHubOutgoingEmailFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#outgoingPort = this.querySelector("#outgoingPort");
    this.#outgoingUsername = this.querySelector("#outgoingUsername");
    this.#outgoingHostname = this.querySelector("#outgoingHostname");
    this.#outgoingConnectionSecurity = this.querySelector(
      "#outgoingConnectionSecurity"
    );
    this.#outgoingAuthenticationMethod = this.querySelector(
      "#outgoingAuthMethod"
    );
    this.setupEventListeners();
    this.#currentConfig = {};
  }

  /**
   * Set up the event listeners for this workflow.
   */
  setupEventListeners() {
    this.#outgoingHostname.addEventListener("input", () => {
      this.#configChanged();
      this.#adjustOAuth2Visibility();
    });
    this.#outgoingPort.addEventListener("input", () => {
      this.#configChanged();
      this.#adjustSSLToPort();
    });
    this.#outgoingConnectionSecurity.addEventListener("command", () => {
      this.#configChanged();
      this.#adjustPortToSSLAndProtocol();
    });
    this.#outgoingAuthenticationMethod.addEventListener("command", event => {
      this.#configChanged();
      // Disable the outgoing username field if the "No Authentication" option
      // is selected.
      this.#outgoingUsername.disabled = event.target.value == 1;
    });
    this.#outgoingUsername.addEventListener("input", () => {
      this.#configChanged();
    });

    this.querySelector("#advancedConfigurationOutgoing").addEventListener(
      "click",
      this
    );
    this.querySelector("#outgoingSecurityWarning").addEventListener(
      "click",
      this
    );
  }

  handleEvent(event) {
    switch (event.target.id) {
      case "advancedConfigurationOutgoing":
        this.dispatchEvent(
          new CustomEvent("advanced-config", {
            bubbles: true,
          })
        );
        break;
      case "moreInfoLink":
        openLinkExternally(
          Services.urlFormatter.formatURLPref("app.support.baseURL"),
          { addToHistory: false }
        );
        break;
      default:
        break;
    }
  }

  /**
   * Return the current state of the email setup form, with the updated
   * outgoing fields.
   *
   * @returns {AccountConfig}
   */
  captureState() {
    return this.getConfig();
  }

  /**
   * Dispatches an event to the email controller whenever there is a change in
   * configuration which means the form needs to be retested.
   */
  #configChanged() {
    this.#currentConfig = this.getConfig();
    this.querySelector("#outgoingEmailForm").checkValidity();
    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed: false },
      })
    );
  }

  /**
   * Sets the state of the outgoing email config state.
   *
   * @param {AccountConfig} configData - Applies the config data to this state.
   */
  setState(configData) {
    this.#currentConfig = configData;
    this.updateFields(this.#currentConfig);
    this.#currentConfig = this.getConfig();
    this.querySelector("#outgoingEmailForm").checkValidity();
  }

  /**
   * Make OAuth2 visible as an authentication method when a hostname that
   * OAuth2 can be used with is entered.
   *
   * @param {AccountConfig} [accountConfig] - The config to present to the user.
   */
  #adjustOAuth2Visibility(accountConfig) {
    // Get current config.
    const config = accountConfig || this.getConfig();

    // If the smtp hostname supports OAuth2, enable it.
    const outgoingDetails = OAuth2Providers.getHostnameDetails(
      config.outgoing.hostname,
      config.outgoing.type ? config.outgoing.type : "smtp"
    );
    this.querySelector("#outgoingAuthMethodOAuth2").hidden = !outgoingDetails;
    if (outgoingDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for outgoing server ${config.outgoing.hostname} is ${outgoingDetails}`
      );
    }
  }

  /**
   * Automatically fill port field when connection security has changed in
   * manual edit, unless the user entered a non-standard port.
   *
   * @param {AccountConfig} [accountConfig] - The config to present to the user.
   */
  #adjustPortToSSLAndProtocol(accountConfig) {
    // Get current config.
    const config = accountConfig || this.getConfig();
    const socketType = config.outgoing.socketType;
    const plainSecurity = socketType == Ci.nsMsgSocketType.plain;

    // If connection security chosen is none, show insecure connection warning.
    this.#outgoingConnectionSecurity.classList.toggle("warning", plainSecurity);
    if (plainSecurity) {
      this.#outgoingConnectionSecurity.setAttribute("aria-invalid", true);
      this.#outgoingConnectionSecurity.setAttribute(
        "aria-describedby",
        "outgoingSecurityWarning"
      );
      this.querySelector("#outgoingSecurityWarning").setAttribute(
        "role",
        "alert"
      );
    } else {
      this.#outgoingConnectionSecurity.setAttribute("aria-invalid", false);
      this.#outgoingConnectionSecurity.removeAttribute("aria-describedby");
      this.querySelector("#outgoingSecurityWarning").removeAttribute("role");
    }

    if (config.outgoing.port && !standardPorts.includes(config.outgoing.port)) {
      return;
    }

    // Implicit TLS for SMTP is on port 465.
    if (socketType == Ci.nsMsgSocketType.SSL) {
      this.#outgoingPort.value = 465;
    } else if (
      (config.outgoing.port == 465 || !config.outgoing.port) &&
      socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
    ) {
      // Implicit TLS for SMTP is on port 465. STARTTLS won't work there.
      this.#outgoingPort.value = 587;
    }

    config.outgoing.port = this.#outgoingPort.value;

    this.currentConifg = config;
  }

  /**
   * If the user changed the port manually, adjust the SSL value,
   * (only) if the new port is impossible with the old SSL value.
   *
   * @param {AccountConfig} [accountConfig] - Complete AccountConfig.
   */
  #adjustSSLToPort(accountConfig) {
    const config = accountConfig || this.getConfig();

    if (!standardPorts.includes(config.outgoing.port)) {
      return;
    }
    if (
      config.outgoing.port == 465 &&
      config.outgoing.socketType != Ci.nsMsgSocketType.SSL
    ) {
      this.#outgoingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
    } else if (
      (config.outgoing.port == 587 || config.outgoing.port == 25) &&
      config.outgoing.socketType == Ci.nsMsgSocketType.SSL
    ) {
      // Port 587 and port 25 are for plain or STARTTLS. Not for Implicit TLS.
      this.#outgoingConnectionSecurity.value =
        Ci.nsMsgSocketType.alwaysSTARTTLS;
    }

    config.outgoing.socketType = this.#outgoingConnectionSecurity.value;
    this.#currentConfig = config;
  }

  /**
   * Returns an Account Config object with all the sanitized user-inputted
   * data for a manual config email guess attempt.
   *
   * @returns {AccountConfig}
   */
  getConfig() {
    const config = this.#currentConfig;
    config.source = AccountConfig.kSourceUser;

    // The user specified a custom SMTP server.
    config.outgoing.type = "smtp";
    config.outgoing.existingServerKey = null;
    config.outgoing.useGlobalPreferredServer = false;

    try {
      const input = this.#outgoingHostname.value;
      config.outgoing.hostname = Sanitizer.hostname(input);
      this.#outgoingHostname.value = config.outgoing.hostname;
      this.#outgoingHostname.setCustomValidity("");
      this.#outgoingHostname.setAttribute("aria-invalid", false);
      this.#outgoingHostname.removeAttribute("aria-describedby");
    } catch (error) {
      gAccountSetupLogger.warn(error);
      this.#outgoingHostname.setCustomValidity(error._message);
      this.#outgoingHostname.setAttribute("aria-invalid", true);
      this.#outgoingHostname.setAttribute(
        "aria-describedby",
        "outgoingHostnameErrorMessage"
      );
    }

    try {
      config.outgoing.port = Sanitizer.integerRange(
        this.#outgoingPort.valueAsNumber,
        1,
        65535
      );
      this.#outgoingPort.setCustomValidity("");
      this.#outgoingPort.setAttribute("aria-invalid", false);
      this.#outgoingPort.removeAttribute("aria-describedby");
    } catch (error) {
      // Include default "Auto".
      config.outgoing.port = undefined;
      this.#outgoingPort.setCustomValidity(error._message);
      this.#outgoingPort.setAttribute("aria-invalid", true);
      this.#outgoingPort.setAttribute(
        "aria-describedby",
        "outgoingPortErrorMessage"
      );
    }

    config.outgoing.socketType = Sanitizer.integer(
      this.#outgoingConnectionSecurity.value
    );
    config.outgoing.auth = Sanitizer.integer(
      this.#outgoingAuthenticationMethod.value
    );

    config.outgoing.username = this.#outgoingUsername.value;
    !this.#outgoingUsername.value
      ? this.#outgoingUsername.setAttribute(
          "aria-describedby",
          "outgoingUsernameErrorMessage"
        )
      : this.#outgoingUsername.removeAttribute("aria-describedby");
    this.#outgoingUsername.setAttribute(
      "aria-invalid",
      !this.#outgoingUsername.value
    );

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

    this.#outgoingHostname.value = config.outgoing.hostname;
    this.#outgoingUsername.value = config.outgoing.username;

    this.#outgoingConnectionSecurity.value = Sanitizer.enum(
      config.outgoing.socketType,
      [-1, 0, 1, 2, 3],
      0
    );
    this.#outgoingAuthenticationMethod.value = Sanitizer.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );

    // If a port number was specified other than "Auto"
    if (config.outgoing.port) {
      this.#outgoingPort.value = config.outgoing.port;
    } else {
      this.#adjustPortToSSLAndProtocol(config);
    }

    this.#adjustOAuth2Visibility(config);
  }

  set disabled(val) {
    this.#outgoingPort.disabled = val;
    this.#outgoingUsername.disabled =
      val || this.#outgoingAuthenticationMethod == 1;
    this.#outgoingHostname.disabled = val;
    this.#outgoingConnectionSecurity.disabled = val;
    this.#outgoingAuthenticationMethod.disabled = val;
    this.querySelector("#advancedConfigurationOutgoing").disabled = val;
  }
}

customElements.define("email-manual-outgoing-form", EmailOutgoingForm);
