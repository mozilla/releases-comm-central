/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const { InputSanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/InputSanitizer.sys.mjs"
);

const { assert } = AccountCreationUtils;

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
   * The incoming server hostname.
   *
   * @type {AccountHubInput}
   */
  #incomingHostname;

  /**
   * The incoming server port.
   *
   * @type {AccountHubInput}
   */
  #incomingPort;

  /**
   * The incoming server connection security.
   *
   * @type {AccountHubSelect}
   */
  #incomingConnectionSecurity;

  /**
   * The incoming server authentication method.
   *
   * @type {AccountHubSelect}
   */
  #incomingAuthenticationMethod;

  /**
   * The incoming username.
   *
   * @type {AccountHubInput}
   */
  #incomingUsername;

  /**
   * The checkbox that hides and shows the outgoing username.
   *
   * @type {AccountHubCheckbox}
   */
  #sameUsernameCheckbox;

  /**
   * The outgoing username input.
   *
   * @type {AccountHubInput}
   */
  #outgoingUsername;

  /**
   * The outgoing server hostname.
   *
   * @type {AccountHubInput}
   */
  #outgoingHostname;

  /**
   * The outgoing server port.
   *
   * @type {AccountHubInput}
   */
  #outgoingPort;

  /**
   * The outgoing server connection security.
   *
   * @type {AccountHubSelect}
   */
  #outgoingConnectionSecurity;

  /**
   * The outgoing server authentication method.
   *
   * @type {AccountHubSelect}
   */
  #outgoingAuthenticationMethod;

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

    this.#incomingPort = this.querySelector("#manualIncomingPort");
    this.#incomingHostname = this.querySelector("#manualIncomingHostname");
    this.#incomingConnectionSecurity = this.querySelector(
      "#manualIncomingConnectionSecurity"
    );
    this.#incomingAuthenticationMethod = this.querySelector(
      "#manualIncomingAuthMethod"
    );
    this.#incomingUsername = this.querySelector("#manualIncomingUsername");

    this.#outgoingPort = this.querySelector("#manualOutgoingPort");
    this.#outgoingHostname = this.querySelector("#manualOutgoingHostname");
    this.#outgoingConnectionSecurity = this.querySelector(
      "#manualOutgoingConnectionSecurity"
    );
    this.#outgoingAuthenticationMethod = this.querySelector(
      "#manualOutgoingAuthMethod"
    );
    this.#sameUsernameCheckbox = this.querySelector("#sameUsername");
    this.#outgoingUsername = this.querySelector("#manualOutgoingUsername");
    this.#sameUsernameCheckbox.setAriaControlsElements(this.#outgoingUsername);

    this.#sameUsernameCheckbox.addEventListener("change", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "change":
        this.#hideOutgoingUsername(this.#sameUsernameCheckbox.checked);
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
    this.#updateFields(this.#currentConfig);
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

  /**
   * Updates the fields with the confirmed AccountConfig from
   * guessConfig, called by parent template.
   *
   * @param {AccountConfig} config - The config to present to the user.
   */
  #updateFields(config) {
    assert(config instanceof AccountConfig);

    this.#incomingHostname.value = config.incoming.hostname;
    this.#incomingConnectionSecurity.value = InputSanitizer.enum(
      config.incoming.socketType,
      [-1, 0, 1, 2, 3],
      0
    );

    // If a port number was specified other than "Auto".
    if (config.incoming.port) {
      this.#incomingPort.value = config.incoming.port;
    } else {
      // TODO: Add function for adjusting incoming port.
      // this.#adjustPortToSSLAndProtocol(config);
    }

    this.#incomingAuthenticationMethod.value = InputSanitizer.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    this.#incomingUsername.value = config.incoming.username;

    // TODO: Add function for adjusting incoming Oauth.
    // this.#adjustOAuth2Visibility(config);

    this.#outgoingHostname.value = config.outgoing.hostname;
    this.#outgoingUsername.value = config.outgoing.username;

    this.#sameUsernameCheckbox.checked =
      config.outgoing.username === config.incoming.username;
    this.#hideOutgoingUsername(
      config.outgoing.username === config.incoming.username
    );

    this.#outgoingConnectionSecurity.value = InputSanitizer.enum(
      config.outgoing.socketType,
      [-1, 0, 1, 2, 3],
      0
    );
    this.#outgoingAuthenticationMethod.value = InputSanitizer.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );

    // If a port number was specified other than "Auto".
    if (config.outgoing.port) {
      this.#outgoingPort.value = config.outgoing.port;
    } else {
      // TODO: Add function for adjusting outgoing port.
      // this.#adjustPortToSSLAndProtocol(config);
    }

    // TODO: Add function for adjusting outgoing OAuth
    // this.#adjustOAuth2Visibility(config);
  }

  /**
   * Hides the outgoing username and makes the username not required.
   *
   * @param {boolean} isHidden - If the username should be hidden.
   */
  #hideOutgoingUsername(isHidden) {
    this.#outgoingUsername.hidden = isHidden;
    this.#outgoingUsername.required = !isHidden;
  }

  /**
   * Reset all the form values for testing purposes.
   */
  resetState() {
    this.querySelector("#manualConfigForm").reset();
    this.#sameUsernameCheckbox.checked = false;
    this.#outgoingUsername.hidden = false;
    this.#outgoingUsername.required = true;
  }
}

customElements.define("email-manual-config-form", EmailManualConfigForm);
