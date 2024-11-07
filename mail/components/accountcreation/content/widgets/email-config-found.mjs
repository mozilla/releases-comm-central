/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

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
   * The Account Config object with the selected incoming set.
   *
   * @type {AccountConfig}
   */
  #selectedConfig;

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

    this.#protocolForm.addEventListener("change", event => {
      // Remove 'selected' class from all label elements.
      this.querySelectorAll("label.selected").forEach(label => {
        label.classList.remove("selected");
      });

      // Add 'selected' class to the parent label of the selected radio button.
      event.target.closest("label").classList.add("selected");
      this.#selectConfig(event.target.value);
    });

    this.querySelector("#editConfiguration").addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("edit-configuration", {
          bubbles: true,
        })
      );
    });

    this.#currentConfig = {};
  }

  /**
   * Return the current state of the email setup form.
   */
  captureState() {
    return this.#selectedConfig;
  }

  /**
   * Sets the state of the email config found state.
   *
   * @param {AccountConfig} configData - Applies the config data to this state.
   */
  setState(configData) {
    this.#currentConfig = configData;
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
  }

  /**
   * Sets the current selected config.
   *
   * @param {String} configType - The config type (imap, pop3, exchange).
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
    const incomingSSL = Sanitizer.translate(incoming.socketType, {
      0: "no-encryption",
      2: "starttls",
      3: "ssl",
    });
    document.l10n.setAttributes(
      this.querySelector("#incomingAuth"),
      `account-setup-result-${incomingSSL}`
    );

    // Set the selectedConfig to have the selected as incoming if it is
    // different than the default incoming config, and move the default to
    // the alternatives.
    this.#selectedConfig = this.#currentConfig.copy();

    if (incoming.type != this.#selectedConfig.incoming?.type) {
      this.#selectedConfig.incomingAlternatives.unshift(
        this.#currentConfig.incoming
      );
      this.#selectedConfig.incoming = incoming;
      this.#selectedConfig.incomingAlternatives =
        this.#currentConfig.incomingAlternatives.filter(
          alternative => alternative != incoming
        );
    }

    // Hide outgoing config details if unavailable.
    if (!outgoing || incoming.type === "exchange") {
      this.querySelector("#outgoingConfigType").hidden = true;
      this.querySelector("#outgoingConfig").hidden = true;
      this.querySelector("#configSelection").classList.add("single");

      document.l10n.setAttributes(
        this.querySelector("#incomingTypeText"),
        "account-hub-result-ews-text"
      );

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
    const outgoingSsl = Sanitizer.translate(outgoing.socketType, {
      0: "no-encryption",
      2: "starttls",
      3: "ssl",
    });
    document.l10n.setAttributes(
      this.querySelector("#outgoingAuth"),
      `account-setup-result-${outgoingSsl}`
    );
  }
}

customElements.define("email-config-found", EmailConfigFound);
