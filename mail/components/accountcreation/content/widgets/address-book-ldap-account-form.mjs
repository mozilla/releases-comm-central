/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
);

/**
 * @typedef {object} LDAPCredentials
 * @property {string} name - The name of the LDAP directory.
 * @property {string} hostname - The hostname of the LDAP directory.
 * @property {string} port - The port for the LDAP directory.
 * @property {boolean} ssl - SSL enabled.
 * @property {string} baseDn - The baseDN for the LDAP directory.
 * @property {string} bindDn - The bindDN for the LDAP directory.
 */

/**
 * Account Hub LDAP Account Form Template
 * Template ID: #accountHubAddressBookLdapAccountFormTemplate
 * (from accountHubAddressBookLdapAccountFormTemplate.inc.xhtml)
 */
class AddressBookLdapAccountForm extends AccountHubStep {
  /**
   * The name of the LDAP directory.
   *
   * @type {HTMLInputElement}
   */
  #name;

  /**
   * The hostname of the LDAP directory.
   *
   * @type {HTMLInputElement}
   */
  #hostname;

  /**
   * The port for the LDAP directory.
   *
   * @type {HTMLInputElement}
   */
  #port;

  /**
   * @type {LDAPCredentials}
   */
  #stateData = {
    name: "",
    hostname: "",
    port: 389, // Default LDAP port.
    ssl: false,
    baseDn: "",
    bindDn: "",
  };

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubAddressBookLdapAccountFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
    this.querySelector("#ldapAccountForm").reset();

    this.#name = this.querySelector("#name");
    this.#hostname = this.querySelector("#hostname");
    this.#port = this.querySelector("#port");

    this.showBrandingHeader();
    this.#setupEventListeners();
  }

  /**
   * Set up the event listeners for this workflow.
   */
  #setupEventListeners() {
    this.#name.addEventListener("input", this);
    this.#hostname.addEventListener("input", this);
    this.#port.addEventListener("input", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#formUpdated();
        break;
    }
  }

  /**
   * Sets the state for the LDAP form.
   */
  setState() {
    this.querySelector("#ldapAccountForm").reset();
  }

  #formUpdated() {
    const nameValidity = this.#name.checkValidity();
    let hostnameValidity = false;
    let portValidty = false;

    this.#name.ariaInvalid = !nameValidity;
    if (!nameValidity) {
      this.#name.setAttribute("aria-described", "nameErrorMessage");
    } else {
      this.#name.removeAttribute("aria-describedby");
    }

    try {
      this.#stateData.hostname = Sanitizer.hostname(this.#hostname.value);
      this.#hostname.ariaInvalid = false;
      this.#hostname.removeAttribute("aria-describedby");
      this.#hostname.setCustomValidity("");
      hostnameValidity = true;
    } catch (error) {
      this.#hostname.setCustomValidity(error._message);
      this.#hostname.ariaInvalid = true;
      this.#hostname.setAttribute("aria-describedby", "hostnameErrorMessage");
    }

    try {
      this.#stateData.port = Sanitizer.integerRange(
        this.#port.valueAsNumber,
        1,
        65535
      );
      this.#port.ariaInvalid = false;
      this.#port.removeAttribute("aria-describedby");
      this.#port.setCustomValidity("");
      portValidty = true;
    } catch (error) {
      this.#port.setCustomValidity(error._message);
      this.#port.ariaInvalid = true;
      this.#port.setAttribute("aria-describedby", "portErrorMessage");
    }

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: {
          completed: nameValidity && hostnameValidity && portValidty,
        },
      })
    );
  }
}

customElements.define(
  "address-book-ldap-account-form",
  AddressBookLdapAccountForm
);
