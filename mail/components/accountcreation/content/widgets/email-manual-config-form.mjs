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

const CONFIG_CHANGE_INPUT_DEBOUNCE_MS = 100;

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

  /**
   * Whether the form is currently showing validation errors.
   *
   * @type {boolean}
   */
  #isShowingErrors = false;

  /**
   * A key representing the currently rendered field error summary.
   *
   * @type {string}
   */
  #fieldErrorNotificationKey = "";

  /**
   * The latest field error notification render request.
   *
   * @type {number}
   */
  #fieldErrorNotificationRequest = 0;

  /**
   * The queued config change timer.
   *
   * @type {?number}
   */
  #configChangeTimer = null;

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

    this.#setupEventListeners();
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#queueConfigChange();
        break;
      case "change":
        if (event.currentTarget == this.#sameUsernameCheckbox) {
          this.#hideOutgoingUsername(this.#sameUsernameCheckbox.checked);
        }
        this.#runConfigChanged();
        break;
      default:
        break;
    }
  }

  /**
   * Set up event listeners for fields that update the manual configuration.
   */
  #setupEventListeners() {
    for (const input of this.#validatedInputs) {
      input.addEventListener("input", this);
    }

    for (const field of [
      this.#incomingConnectionSecurity,
      this.#incomingAuthenticationMethod,
      this.#sameUsernameCheckbox,
      this.#outgoingConnectionSecurity,
      this.#outgoingAuthenticationMethod,
    ]) {
      field.addEventListener("change", this);
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
    this.#clearQueuedConfigChange();
    this.#isShowingErrors = false;
    this.#clearFieldErrors();
    this.clearNotifications();
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
   * Validate the current form values and show an error summary if needed.
   *
   * @returns {Promise<boolean>} Whether the form is valid.
   */
  async validate() {
    this.#clearQueuedConfigChange();
    const errors = this.#captureConfig({ showErrors: true });
    this.#isShowingErrors = !!errors.length;

    if (!errors.length) {
      this.clearNotifications();
      return true;
    }

    await this.#showFieldErrorNotification(errors);
    return false;
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
   * The inputs that can show validation errors.
   *
   * @returns {AccountHubInput[]}
   */
  get #validatedInputs() {
    return [
      this.#incomingHostname,
      this.#incomingUsername,
      this.#incomingPort,
      this.#outgoingHostname,
      this.#outgoingUsername,
      this.#outgoingPort,
    ];
  }

  /**
   * Update the stored configuration from the current fields.
   *
   * @param {object} options
   * @param {boolean} [options.showErrors=false] - Whether invalid fields should
   *   show their error state.
   * @returns {Array<{input: AccountHubInput, labelId: string}>} Invalid fields.
   */
  #captureConfig({ showErrors = false } = {}) {
    const config = this.#currentConfig.copy();
    const errors = [];

    config.source = AccountConfig.kSourceUser;
    config.outgoing.type = "smtp";
    config.outgoing.existingServerKey = null;
    config.outgoing.useGlobalPreferredServer = false;

    this.#validateField({
      config,
      errors,
      input: this.#incomingHostname,
      labelId: "account-hub-result-hostname-label",
      parse: input => InputSanitizer.hostname(input.value),
      update: value => {
        config.incoming.hostname = value;
        this.#incomingHostname.value = value;
      },
      showErrors,
    });
    this.#validateField({
      config,
      errors,
      input: this.#incomingUsername,
      labelId: "account-hub-result-username-label",
      parse: input => InputSanitizer.nonemptystring(input.value),
      update: value => {
        config.incoming.username = value;
      },
      showErrors,
    });
    this.#validateField({
      config,
      errors,
      input: this.#incomingPort,
      labelId: "account-hub-on-port-label",
      parse: input =>
        InputSanitizer.integerRange(input.valueAsNumber, 1, 65535),
      update: value => {
        config.incoming.port = value;
      },
      showErrors,
    });

    config.incoming.socketType = InputSanitizer.integer(
      this.#incomingConnectionSecurity.value
    );
    config.incoming.auth = InputSanitizer.integer(
      this.#incomingAuthenticationMethod.value
    );

    this.#validateField({
      config,
      errors,
      input: this.#outgoingHostname,
      labelId: "account-hub-result-hostname-label",
      parse: input => InputSanitizer.hostname(input.value),
      update: value => {
        config.outgoing.hostname = value;
        this.#outgoingHostname.value = value;
      },
      showErrors,
    });

    if (this.#sameUsernameCheckbox.checked) {
      this.#outgoingUsername.setErrorState("");
      config.outgoing.username = config.incoming.username;
    } else {
      this.#validateField({
        config,
        errors,
        input: this.#outgoingUsername,
        labelId: "account-hub-result-username-label",
        parse: input => InputSanitizer.nonemptystring(input.value),
        update: value => {
          config.outgoing.username = value;
        },
        showErrors,
      });
    }

    this.#validateField({
      config,
      errors,
      input: this.#outgoingPort,
      labelId: "account-hub-on-port-label",
      parse: input =>
        InputSanitizer.integerRange(input.valueAsNumber, 1, 65535),
      update: value => {
        config.outgoing.port = value;
      },
      showErrors,
    });

    config.outgoing.socketType = InputSanitizer.integer(
      this.#outgoingConnectionSecurity.value
    );
    config.outgoing.auth = InputSanitizer.integer(
      this.#outgoingAuthenticationMethod.value
    );

    this.#currentConfig = config;
    return errors;
  }

  /**
   * Validate one input and update a config value if valid.
   *
   * @param {object} options
   * @param {Array} options.errors - Validation errors to append to.
   * @param {AccountHubInput} options.input - The input to validate.
   * @param {string} options.labelId - Fluent ID for the input label.
   * @param {Function} options.parse - Parse and validate the input value.
   * @param {Function} options.update - Update the config with the parsed value.
   * @param {boolean} options.showErrors - Whether to show the input error state.
   */
  #validateField({ errors, input, labelId, parse, update, showErrors }) {
    try {
      update(parse(input));
      input.setErrorState("");
    } catch (error) {
      if (showErrors) {
        input.setErrorState(error?._message || "invalid");
      }
      errors.push({ input, labelId });
    }
  }

  /**
   * Queue a config update after the user stops typing.
   */
  #queueConfigChange() {
    this.#clearQueuedConfigChange();
    this.#configChangeTimer = this.ownerDocument.documentGlobal.setTimeout(
      () => {
        this.#configChangeTimer = null;
        this.#runConfigChanged();
      },
      CONFIG_CHANGE_INPUT_DEBOUNCE_MS
    );
  }

  /**
   * Clear a queued config update.
   */
  #clearQueuedConfigChange() {
    if (!this.#configChangeTimer) {
      return;
    }

    this.ownerDocument.documentGlobal.clearTimeout(this.#configChangeTimer);
    this.#configChangeTimer = null;
  }

  /**
   * Run any queued config update immediately.
   */
  #runConfigChanged() {
    this.#clearQueuedConfigChange();
    this.#configChanged().catch(console.error);
  }

  /**
   * Handle a field update and keep the footer in sync with visible errors.
   */
  async #configChanged() {
    const errors = this.#captureConfig({ showErrors: this.#isShowingErrors });
    const completed = !this.#isShowingErrors || !errors.length;

    if (this.#isShowingErrors) {
      if (errors.length) {
        await this.#showFieldErrorNotification(errors);
      } else {
        this.#isShowingErrors = false;
        this.clearNotifications();
      }
    }

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed },
      })
    );
  }

  /**
   * Clear validation states from every field in this form.
   */
  #clearFieldErrors() {
    for (const input of this.#validatedInputs) {
      input.setErrorState("");
    }
  }

  /**
   * Show a notification listing every invalid field.
   *
   * @param {Array<{input: AccountHubInput, labelId: string}>} errors - Invalid
   *   fields to include in the notification.
   */
  async #showFieldErrorNotification(errors) {
    const fieldErrorNotificationKey = errors
      .map(({ input }) => input.id)
      .join(",");
    if (fieldErrorNotificationKey == this.#fieldErrorNotificationKey) {
      return;
    }

    const renderRequest = ++this.#fieldErrorNotificationRequest;
    const labels = await document.l10n.formatValues(
      errors.map(({ labelId }) => labelId)
    );
    if (renderRequest != this.#fieldErrorNotificationRequest) {
      return;
    }

    const listFormat = new Intl.ListFormat(undefined, {
      style: "long",
      type: "conjunction",
    });
    const list = document.createElement("ul");
    list.classList.add("manual-config-error-list");
    const listItem = document.createElement("li");
    let errorIndex = 0;

    for (const part of listFormat.formatToParts(labels)) {
      if (part.type != "element") {
        listItem.append(part.value);
        continue;
      }

      const { input } = errors[errorIndex++];
      const link = document.createElement("a");
      link.href = "#";
      link.textContent = part.value;
      link.addEventListener("click", event => {
        event.preventDefault();
        input.scrollIntoView({ block: "center" });
        input.ownerDocument.documentGlobal.requestAnimationFrame(() => {
          input.focus({ preventScroll: true });
        });
      });
      listItem.append(link);
    }

    list.append(listItem);
    this.#fieldErrorNotificationKey = fieldErrorNotificationKey;

    this.showNotification({
      description: list,
      expanded: true,
      fluentTitleId: "account-hub-manual-config-error-summary",
      type: "error",
    });
  }

  /**
   * Hides the outgoing username and makes the username not required.
   *
   * @param {boolean} isHidden - If the username should be hidden.
   */
  #hideOutgoingUsername(isHidden) {
    this.#outgoingUsername.hidden = isHidden;
    this.#outgoingUsername.required = !isHidden;
    this.#sameUsernameCheckbox.setAriaExpanded(!isHidden);
  }

  /**
   * Clear the field error notification state.
   */
  clearNotifications() {
    this.#fieldErrorNotificationKey = "";
    this.#fieldErrorNotificationRequest++;
    super.clearNotifications();
  }

  /**
   * Reset all the form values for testing purposes.
   */
  resetState() {
    this.#clearQueuedConfigChange();
    this.querySelector("#manualConfigForm").reset();
    this.#sameUsernameCheckbox.checked = false;
    this.#outgoingUsername.hidden = false;
    this.#outgoingUsername.required = true;
    this.#isShowingErrors = false;
    this.#clearFieldErrors();
    this.clearNotifications();
  }
}

customElements.define("email-manual-config-form", EmailManualConfigForm);
