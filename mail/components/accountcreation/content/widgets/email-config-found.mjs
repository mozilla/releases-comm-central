/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

const {
  AccountCreationUtils: { AddonInstaller },
} = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
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
   * The install link.
   *
   * @type {HTMLElement}
   */
  #installAddon;

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
      super.connectedCallback();
      return;
    }

    this.hasConnected = true;
    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailConfigFoundTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#protocolForm = this.querySelector("#protocolForm");
    this.#installAddon = this.querySelector("#addonInstall");

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
          this.dispatchEvent(
            new CustomEvent("install-addon", {
              bubbles: true,
            })
          );
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
    ];

    if (Services.prefs.getBoolPref("experimental.mail.ews.enabled", true)) {
      configLabels.push(this.querySelector("#ews"));
    }

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
   * Sets the current selected config.
   *
   * @param {string} configType - The config type (imap, pop3, exchange).
   */
  #selectConfig(configType) {
    const username = this.#currentConfig.incoming.username;

    // Grab the config from the list of configs in #currentConfig.
    const incoming = [
      this.#currentConfig.incoming,
      ...this.#currentConfig.incomingAlternatives,
    ].find(({ type }) => type === configType);

    const outgoing = this.#currentConfig.outgoing;

    this.querySelector("#incomingType").textContent = incoming.type;
    this.querySelector("#incomingHost").textContent = incoming.hostname;
    this.querySelector("#incomingUsername").textContent = username;
    this.querySelector("#incomingType").title = incoming.type;
    this.querySelector("#incomingHost").title = incoming.hostname;
    this.querySelector("#incomingUsername").title = username;
    this.querySelector("#owlExchangeDescription").hidden = true;
    this.querySelector("#editConfiguration").hidden = false;
    const incomingSocketType = Sanitizer.translate(incoming.socketType, {
      0: "no-encryption", // account-setup-result-no-encryption
      2: "starttls", // account-setup-result-no-starttls
      3: "ssl", // account-setup-result-no-ssl
    });
    document.l10n.setAttributes(
      this.querySelector("#incomingSocketType"),
      `account-setup-result-${incomingSocketType}`
    );

    this.#selectedConfig = this.#currentConfig.copy();
    this.#selectedConfig.incoming = incoming;

    this.#setContinueState();

    // Hide outgoing config details if unavailable.
    if (!outgoing || incoming.type === "ews" || incoming.type === "exchange") {
      this.querySelector("#outgoingConfigType").hidden = true;
      this.querySelector("#outgoingConfig").hidden = true;
      document.l10n.setAttributes(
        this.querySelector("#incomingTypeText"),
        "account-hub-result-ews-text"
      );

      this.querySelector("#owlExchangeDescription").hidden =
        (incoming.type === "exchange" && this.#addon?.isInstalled) ||
        incoming.type === "ews";

      // FIXME: Bug 1899649 is tracking being able to edit an EWS config.
      this.querySelector("#editConfiguration").hidden =
        incoming.type === "exchange" && !this.#addon?.isInstalled;

      this.querySelector("#configSelection").classList.add("single");
      return;
    }

    this.querySelector("#configSelection").classList.remove("single");
    document.l10n.setAttributes(
      this.querySelector("#incomingTypeText"),
      "account-hub-result-incoming-server-legend"
    );
    this.querySelector("#outgoingConfigType").hidden = false;
    this.querySelector("#outgoingConfig").hidden = false;

    this.querySelector("#outgoingType").textContent = outgoing.type;
    this.querySelector("#outgoingHost").textContent = outgoing.hostname;
    this.querySelector("#outgoingUsername").textContent = outgoing.username;
    this.querySelector("#outgoingType").title = outgoing.type;
    this.querySelector("#outgoingHost").title = outgoing.hostname;
    this.querySelector("#outgoingUsername").title = outgoing.username;
    const outgoingSocketType = Sanitizer.translate(outgoing.socketType, {
      0: "no-encryption", // account-setup-result-no-encryption
      2: "starttls", // account-setup-result-starttls
      3: "ssl", // account-setup-result-ssl
    });
    document.l10n.setAttributes(
      this.querySelector("#outgoingSocketType"),
      `account-setup-result-${outgoingSocketType}`
    );
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
      this.#installAddon.disabled = true;

      // Trigger an add-on update check. If an update is available,
      // enable the install button to (re)install.
      AddonManager.getAddonByID(this.#addon.id).then(addon => {
        if (!addon) {
          return;
        }
        const listener = {
          onUpdateAvailable() {
            this.querySelector("#installAddon").disabled = false;
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
