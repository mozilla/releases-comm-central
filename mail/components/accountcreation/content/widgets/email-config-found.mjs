/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

const {
  AccountCreationUtils: { AddonInstaller },
} = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);
const { InputSanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/InputSanitizer.sys.mjs"
);
const { openLinkExternally } = ChromeUtils.importESModule(
  "resource:///modules/LinkHelper.sys.mjs"
);

/**
 * Account Hub Config Found Template
 * Template ID: #accountHubConfigFoundTemplate (from accountHubConfigFoundTemplate.inc.xhtml)
 */

class EmailConfigFound extends AccountHubStep {
  /**
   * The current email auto config form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * The email auto config form.
   *
   * @type {HTMLElement}
   */
  #protocolForm;

  /**
   * The Account Config object with the selected incoming set.
   *
   * @type {AccountConfig}
   */
  #selectedConfig;

  /**
   * The object containing the add-on information.
   *
   * @type {object}
   */
  #addon;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailConfigFoundTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#protocolForm = this.querySelector("#protocolForm");

    this.#protocolForm.addEventListener("change", event => {
      // Remove 'selected' class from all label elements.
      this.querySelectorAll("label.selected").forEach(label => {
        label.classList.remove("selected");
      });

      // Add 'selected' class to the parent label of the selected radio button.
      event.target.closest("label").classList.add("selected");
      this.#selectConfig(event.target.value);
    });

    this.querySelector("#editConfiguration").addEventListener("click", this);
    this.querySelector("#addonInstall").addEventListener("click", this);
    this.querySelector("#addonInfo").addEventListener("click", this);

    this.#currentConfig = {};
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (event.target.id === "editConfiguration") {
          this.dispatchEvent(
            new CustomEvent("edit-configuration", {
              bubbles: true,
            })
          );
        } else if (event.target.id === "addonInstall") {
          this.querySelector("#addonInstall").disabled = true;
          this.dispatchEvent(
            new CustomEvent("install-addon", {
              bubbles: true,
            })
          );
        } else if (event.target.id === "addonInfo") {
          openLinkExternally(event.target.href);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Return the current state of the email setup form.
   */
  captureState() {
    return this.#selectedConfig.copy();
  }

  /**
   * Sets the state of the email config found state.
   *
   * @param {AccountConfig} configData - Applies the config data to this state.
   */
  setState(configData) {
    this.#currentConfig = configData;
    this.setAddon();
    this.#updateFields();
  }

  /**
   * Updates the select config options.
   */
  #updateFields() {
    if (!this.#currentConfig) {
      return;
    }

    const configLabels = [
      this.querySelector("#imap"),
      this.querySelector("#pop3"),
      this.querySelector("#exchange"),
      this.querySelector("#ews"),
      this.querySelector("#graph"),
    ];

    const alternatives = this.#currentConfig.incomingAlternatives.map(
      a => a.type
    );

    // Initially hide all config options and reset recommended class.
    for (const config of configLabels) {
      config.hidden =
        config.id !== this.#currentConfig.incoming.type &&
        !alternatives.includes(config.id);
      config.classList.toggle(
        "recommended-protocol",
        config.id === this.#currentConfig.incoming.type
      );
      config.querySelector("input").checked =
        config.id === this.#currentConfig.incoming.type;
    }

    // Dispatch a change event so config selection logic can run.
    const recommendedTypeLabel = this.querySelector(
      `#${this.#currentConfig.incoming.type}`
    );
    const event = new Event("change", { bubbles: true });
    recommendedTypeLabel.querySelector("input").dispatchEvent(event);
    recommendedTypeLabel.focus();
  }

  /**
   * Sets the text content and tooltip for an element.
   *
   * @param {HTMLElement} element - The element to update.
   * @param {string} value - The value to display.
   */
  #setTextAndTitle(element, value) {
    element.textContent = value;
    element.title = value;
  }

  /**
   * Returns the localization ID for the given socket type.
   *
   * @param {nsMsgSocketType} socketType - The socket type from the account config.
   * @returns {string} The localization ID for the socket type.
   */
  #getSocketTypeL10nId(socketType) {
    const socketTypeName = InputSanitizer.translate(socketType, {
      [Ci.nsMsgSocketType.plain]: "account-hub-result-no-encryption",
      [Ci.nsMsgSocketType.alwaysSTARTTLS]: "account-hub-result-starttls",
      [Ci.nsMsgSocketType.SSL]: "account-hub-result-ssl",
    });
    return socketTypeName;
  }

  /**
   * Returns the localization ID for the given authentication type.
   *
   * @param {nsMsgAuthMethod} auth - The authentication type from the account config.
   * @returns {string} The localization ID for the authentication type.
   */
  #getAuthTypeL10nId(auth) {
    const authTypeName = InputSanitizer.translate(
      auth,
      {
        [Ci.nsMsgAuthMethod.none]: "account-hub-result-auth-none",
        [Ci.nsMsgAuthMethod.passwordCleartext]:
          "account-hub-result-auth-password",
        [Ci.nsMsgAuthMethod.passwordEncrypted]:
          "account-hub-result-auth-encrypted-password",
        [Ci.nsMsgAuthMethod.GSSAPI]: "account-hub-result-auth-gssapi",
        [Ci.nsMsgAuthMethod.NTLM]: "account-hub-result-auth-ntlm",
        [Ci.nsMsgAuthMethod.External]: "account-hub-result-auth-external",
        [Ci.nsMsgAuthMethod.secure]: "vencrypted-password",
        [Ci.nsMsgAuthMethod.OAuth2]: "account-hub-result-auth-oauth2",
      },
      "account-hub-result-auth-none"
    );
    return authTypeName;
  }

  /**
   * Shows or hides the shared incoming/outgoing config details.
   *
   * @param {boolean} [isVisible=true] - Whether the shared details should be visible.
   */
  #setSharedConfigVisiblity(isVisible = true) {
    const sharedConfigClassName = "is-showing-shared-config";

    this.querySelector("#configSelection").classList.toggle(
      sharedConfigClassName,
      isVisible
    );
  }

  /**
   * Sets the current selected config.
   *
   * @param {string} configType - The config type (imap, pop3, exchange).
   */
  #selectConfig(configType) {
    // Grab the config from the list of configs in #currentConfig.
    const incoming = [
      this.#currentConfig.incoming,
      ...this.#currentConfig.incomingAlternatives,
    ].find(({ type }) => type === configType);

    const outgoing = this.#currentConfig.outgoing;

    const incomingType = this.querySelector("#incomingType");
    if (incoming.type === "ews" || incoming.type === "graph") {
      document.l10n.setAttributes(
        incomingType,
        `account-hub-result-${incoming.type}-expanded-text`
      );
    } else {
      incomingType.removeAttribute("data-l10n-id");
      this.#setTextAndTitle(incomingType, incoming.type);
    }

    const incomingSocketTypeL10Id = this.#getSocketTypeL10nId(
      incoming.socketType
    );
    const incomingAuthTypeL10Id = this.#getAuthTypeL10nId(incoming.auth);

    this.#setTextAndTitle(
      this.querySelector("#incomingHost"),
      incoming.hostname
    );
    this.#setTextAndTitle(this.querySelector("#incomingPort"), incoming.port);
    this.#setTextAndTitle(
      this.querySelector("#incomingUsername"),
      incoming.username
    );
    document.l10n.setAttributes(
      this.querySelector("#incomingSocketType"),
      incomingSocketTypeL10Id
    );
    document.l10n.setAttributes(
      this.querySelector("#incomingAuthenticationType"),
      incomingAuthTypeL10Id
    );

    this.querySelector("#owlExchangeDescription").hidden = true;
    this.querySelector("#editConfiguration").hidden = false;

    this.#selectedConfig = this.#currentConfig.copy();
    this.#selectedConfig.incoming = incoming;

    this.#setContinueState();

    if (
      !outgoing ||
      incoming.type == "ews" ||
      incoming.type == "exchange" ||
      incoming.type == "graph"
    ) {
      this.querySelector("#outgoingConfig").hidden = true;
      this.#setSharedConfigVisiblity(false);
      document.l10n.setAttributes(
        this.querySelector("#incomingTypeText"),
        "account-hub-result-ews-text"
      );

      // Single-server configs (EWS/Graph/Exchange) don't present port details
      // in this UI.
      this.querySelector("#incomingPortConfig").hidden = true;

      // Show OWL add-on installation option if incoming type is exchange
      // (not ews) and the add-on is not already installed.
      if (
        incoming.type == "exchange" &&
        this.#addon &&
        !this.#addon.isInstalled
      ) {
        this.querySelector("#owlExchangeDescription").hidden = false;
        this.querySelector("#addonInstall").disabled = false;
        const link = this.querySelector("#addonInfo");
        link.textContent = this.#addon.description;
        link.href = this.#addon.websiteURL;
        if (this.#addon.icon32) {
          this.querySelector("#addonIcon").src = this.#addon.icon32;
        }
      }

      this.querySelector("#editConfiguration").hidden =
        incoming.type === "exchange" && !this.#addon?.isInstalled;

      this.querySelector("#configSelection").classList.add("single");
      return;
    }

    this.querySelector("#configSelection").classList.remove("single");
    this.querySelector("#incomingPortConfig").hidden = false;
    this.querySelector("#outgoingConfigType").hidden = false;
    this.querySelector("#outgoingConfig").hidden = false;

    this.#setTextAndTitle(this.querySelector("#outgoingType"), outgoing.type);
    this.#setTextAndTitle(
      this.querySelector("#outgoingHost"),
      outgoing.hostname
    );
    this.#setTextAndTitle(this.querySelector("#outgoingPort"), outgoing.port);
    document.l10n.setAttributes(
      this.querySelector("#incomingTypeText"),
      "account-hub-result-incoming-legend"
    );

    const hasSharedConfigDetails =
      incoming.username === outgoing.username &&
      incoming.socketType === outgoing.socketType &&
      incoming.auth === outgoing.auth;

    this.#setSharedConfigVisiblity(hasSharedConfigDetails);

    if (hasSharedConfigDetails) {
      this.#setTextAndTitle(
        this.querySelector("#sharedUsername"),
        incoming.username
      );
      document.l10n.setAttributes(
        this.querySelector("#sharedSocketType"),
        incomingSocketTypeL10Id
      );
      document.l10n.setAttributes(
        this.querySelector("#sharedAuthenticationType"),
        incomingAuthTypeL10Id
      );
    } else {
      this.#setTextAndTitle(
        this.querySelector("#outgoingUsername"),
        outgoing.username
      );
      document.l10n.setAttributes(
        this.querySelector("#outgoingSocketType"),
        this.#getSocketTypeL10nId(outgoing.socketType)
      );
      document.l10n.setAttributes(
        this.querySelector("#outgoingAuthenticationType"),
        this.#getAuthTypeL10nId(outgoing.auth)
      );
    }
  }

  /**
   * Sets and updates the add-on for exchange.
   */
  async setAddon() {
    // Get the first available add-on in the config object.
    this.#addon = this.#currentConfig.addons?.at(0);

    if (!this.#addon) {
      return;
    }

    const installer = new AddonInstaller(this.#addon);
    this.#addon.isInstalled = await installer.isInstalled();
    this.#addon.isDisabled = await installer.isDisabled();

    if (this.#addon.isInstalled) {
      const exchangeConfigs = [
        this.#currentConfig.incoming,
        ...this.#currentConfig.incomingAlternatives,
      ].filter(config => config.type == "exchange");
      for (const config of exchangeConfigs) {
        config.addonAccountType = this.#addon.useType.addonAccountType;
      }
      this.querySelector("#owlExchangeDescription").hidden = true;
      this.querySelector("#editConfiguration").hidden = false;
      return;
    }

    if (this.#addon.isDisabled) {
      this.querySelector("#addonInstall").disabled = true;

      // Trigger an add-on update check. If an update is available,
      // enable the install button to (re)install.
      AddonManager.getAddonByID(this.#addon.id).then(addon => {
        if (!addon) {
          return;
        }
        const listener = {
          onUpdateAvailable() {
            this.querySelector("#addonInstall").disabled = false;
          },
          onNoUpdateAvailable() {},
        };
        addon.findUpdates(listener, AddonManager.UPDATE_WHEN_USER_REQUESTED);
      });
    }
  }

  /**
   * Dispatches an event to email.mjs to enable/disable the continue button
   * based on if an Exchange config option was selected and the add-on is
   * installed.
   */
  #setContinueState() {
    const addonInstalled =
      this.#selectedConfig.incoming.type === "exchange" &&
      this.#addon?.isInstalled;

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: {
          completed:
            this.#selectedConfig.incoming.type != "exchange" || addonInstalled,
        },
      })
    );
  }
}

customElements.define("email-config-found", EmailConfigFound);
