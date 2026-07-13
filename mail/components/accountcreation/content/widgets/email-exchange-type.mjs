/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";
import "./account-hub-radio-card-large.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-input.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-select.mjs"; // eslint-disable-line import/no-unassigned-import
import "./account-hub-checkbox.mjs"; // eslint-disable-line import/no-unassigned-import

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
const { InputSanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/InputSanitizer.sys.mjs"
);

const GRAPH_URL_ORIGIN = "https://graph.microsoft.com";

const EXCHANGE_TYPE_FROM_CONFIG = {
  exchange: "ews",
  ews: "ews",
  graph: "graph",
};

const EXCHANGE_AUTH_METHODS = [
  Ci.nsMsgAuthMethod.passwordCleartext,
  Ci.nsMsgAuthMethod.NTLM,
  Ci.nsMsgAuthMethod.OAuth2,
];

/**
 * Account Hub Email Exchange type choice and config form.
 * Template ID: #accountHubEmailExchangeTypeTemplate (from accountHubEmailExchangeType.inc.xhtml)
 *
 * @tagname email-exchange-type
 */
class EmailExchangeType extends AccountHubStep {
  /**
   * The current account configuration.
   *
   * @type {AccountConfig}
   */
  #currentConfig = new AccountConfig();

  /**
   * The form for the Exchange type step.
   *
   * @type {HTMLFormElement}
   */
  #form;

  /**
   * The username input.
   *
   * @type {AccountHubInput}
   */
  #usernameInput;

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
   * The container for default and custom OAuth settings.
   *
   * @type {HTMLElement}
   */
  #oauthOptions;

  /**
   * The checkbox for using default OAuth settings.
   *
   * @type {HTMLInputElement}
   */
  #defaultOauthCheckbox;

  /**
   * The custom OAuth settings.
   *
   * @type {HTMLElement}
   */
  #oauthCustomOptions;

  /**
   * The custom OAuth tenant ID input.
   *
   * @type {AccountHubInput}
   */
  #oauthTenantInput;

  /**
   * The custom OAuth application ID input.
   *
   * @type {AccountHubInput}
   */
  #oauthApplicationInput;

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

    this.#form = this.querySelector("#exchangeTypeForm");
    this.#usernameInput = this.querySelector("#exchangeTypeUsername");
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
    this.#oauthOptions = this.querySelector("#exchangeTypeOauthOptions");
    this.#defaultOauthCheckbox = this.querySelector(
      "#exchangeTypeDefaultOauth"
    );
    this.#oauthCustomOptions = this.querySelector("#exchangeTypeOauthCustom");
    this.#oauthTenantInput = this.querySelector("#exchangeTypeOauthTenant");
    this.#oauthApplicationInput = this.querySelector("#exchangeTypeOauthApp");
    this.#authenticationSelect.select.ariaControlsElements = [
      this.#oauthOptions,
    ];
    this.#defaultOauthCheckbox.setAriaControlsElements(
      this.#oauthTenantInput,
      this.#oauthApplicationInput
    );

    this.#form.addEventListener("change", this);
    this.#form.addEventListener("input", this);
    this.querySelector("#advancedConfigurationExchange").addEventListener(
      "click",
      this
    );

    this.#updateAuthenticationOptions();
    this.#checkFormValidity();
  }

  handleEvent(event) {
    switch (event.type) {
      case "change":
        this.#updateAuthenticationOptions();
        break;
      case "input":
        this.#checkFormValidity();
        break;
      case "click":
        if (event.currentTarget.id === "advancedConfigurationExchange") {
          this.dispatchEvent(
            new CustomEvent("advanced-config", {
              bubbles: true,
            })
          );
        }
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

    this.#updateOauthOptions();
    this.#checkFormValidity();
  }

  /**
   * Update the visibility of the OAuth defaults and custom options.
   */
  #updateOauthOptions() {
    const isOAuth2Selected =
      this.#authenticationSelect.value == Ci.nsMsgAuthMethod.OAuth2;
    const customOptionsHidden =
      !isOAuth2Selected || this.#defaultOauthCheckbox.checked;

    this.#oauthOptions.hidden = !isOAuth2Selected;
    this.#authenticationSelect.select.ariaExpanded = isOAuth2Selected;
    this.#oauthCustomOptions.hidden = customOptionsHidden;
    this.#defaultOauthCheckbox.setAriaExpanded(!customOptionsHidden);

    for (const input of this.#oauthCustomOptions.querySelectorAll("input")) {
      if (input.required || input.dataset.wasRequired) {
        input.required = !customOptionsHidden;
        input.dataset.wasRequired = true;
      }
    }
  }

  /**
   * Dispatches an event whenever the form validity changes.
   */
  #checkFormValidity() {
    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed: this.#form.checkValidity() },
      })
    );
  }

  /**
   * The selected Exchange account type.
   *
   * @returns {string} The selected account type.
   */
  #getSelectedAccountType() {
    return (
      Array.from(this.#accountTypeCards).find(card => card.checked)?.value ||
      this.#accountTypeCards[0]?.value
    );
  }

  /**
   * Recommend an account type based on the format of a URL
   *
   * @param {string} serviceURL The URL to analyze for recommendation
   * @returns {string} Protocol type recommendation
   */
  #getRecommendedAccountType(serviceURL) {
    const url = new URL(serviceURL);

    if (url.origin === GRAPH_URL_ORIGIN) {
      return EXCHANGE_TYPE_FROM_CONFIG.graph;
    }
    return EXCHANGE_TYPE_FROM_CONFIG.ews;
  }

  /**
   * Sets the state of the Exchange type subview.
   *
   * @param {AccountConfig} configData - An account configuration object.
   */
  setState(configData) {
    this.#currentConfig = configData;

    const serviceURL = configData.incoming.exchangeURL;

    const recommendedType = this.#getRecommendedAccountType(serviceURL);

    for (const card of this.#accountTypeCards) {
      const isRecommended = card.value === recommendedType;
      card.classList.toggle("recommended", isRecommended);
      card.querySelector(".recommended-description").hidden = !isRecommended;
    }

    const incomingType =
      EXCHANGE_TYPE_FROM_CONFIG[configData.incoming.type] || recommendedType;
    const selectedCard = Array.from(this.#accountTypeCards).find(
      card => card.value == incomingType
    );
    selectedCard.checked = true;

    this.#usernameInput.value = configData.incoming.username || "";
    this.#defaultOauthCheckbox.checked =
      !configData.incoming.oauthSettings?.useCustomDetails;
    this.#oauthTenantInput.value =
      configData.incoming.oauthSettings?.tenant || "";
    this.#oauthApplicationInput.value =
      configData.incoming.oauthSettings?.clientId || "";
    this.#authenticationSelect.value = String(
      InputSanitizer.enum(
        configData?.incoming?.auth,
        EXCHANGE_AUTH_METHODS,
        Ci.nsMsgAuthMethod.OAuth2
      )
    );
    this.#updateAuthenticationOptions();
  }

  /**
   * Get the resulting Exchange account settings.
   *
   * @returns {AccountConfig} The updated account configuration.
   */
  captureState() {
    const config = this.#currentConfig.copy();
    const accountType = this.#getSelectedAccountType();
    const hostname = URL.parse(config.incoming.exchangeURL).hostname;

    config.source = AccountConfig.kSourceUser;
    config.incoming.type = accountType;
    config.incoming.hostname = hostname;
    config.incoming.port = 443;
    config.incoming.socketType = Ci.nsMsgSocketType.SSL;
    config.incoming.auth = InputSanitizer.integer(
      this.#authenticationSelect.value
    );
    config.incoming.username = this.#usernameInput.value;
    config.incoming.oauthSettings = null;

    if (
      config.incoming.auth == Ci.nsMsgAuthMethod.OAuth2 &&
      !this.#defaultOauthCheckbox.checked
    ) {
      const tenant = InputSanitizer.nonemptystring(
        this.#oauthTenantInput.value
      );
      config.incoming.oauthSettings = {
        useCustomDetails: true,
        tenant,
        clientId: InputSanitizer.nonemptystring(
          this.#oauthApplicationInput.value
        ),
        authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
        tokenEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
      };
    }

    return config;
  }
}

customElements.define("email-exchange-type", EmailExchangeType);
