/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

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
 * @typedef {object} LDAPAdvancedCredentials
 * @property {number} maxResults - The max results for the LDAP Directory.
 * @property {number} scope - The scope (number value) of the LDAP Directory.
 * @property {string} loginMethod - The login method of the LDAP directory.
 * @property {string} searchFilter - The search filter on the LDAP Directory.
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
   * The max results for the LDAP directory.
   *
   * @type {HTMLInputElement}
   */
  #maxResults;

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

  /**
   * @type {LDAPAdvancedCredentials}
   */
  #advancedStateData = {
    maxResults: 0,
    scope: Ci.nsILDAPURL.SCOPE_SUBTREE,
    loginMethod: "",
    searchFilter: "",
  };

  /**
   * Whether the form is an advanced form.
   *
   * @type {boolean}
   */
  #isAdvanced = false;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubAddressBookLdapAccountFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#name = this.querySelector("#name");
    this.#hostname = this.querySelector("#hostname");
    this.#port = this.querySelector("#port");
    this.#maxResults = this.querySelector("#maxResults");

    this.resetState();
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
    this.#maxResults.addEventListener("input", this);
    this.querySelector("#advancedConfigurationLdap").addEventListener(
      "click",
      this
    );
    this.querySelector("#simpleConfigurationLdap").addEventListener(
      "click",
      this
    );
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.#formUpdated();
        break;
      case "click":
        this.#isAdvanced = !this.#isAdvanced;
        this.querySelector("#ldapFormBody").classList.toggle(
          "advanced",
          this.#isAdvanced
        );
        break;
    }
  }

  /**
   * Sets the state for the LDAP form.
   */
  setState() {
    this.classList.toggle("stacked", lazy.UIFontSize.size >= 17);
    this.resetState();
    this.#name.focus();
  }

  /**
   * Resets the LDAP creation form.
   */
  resetState() {
    this.querySelector("#ldapAccountForm").reset();
    this.#isAdvanced = false;
    this.querySelector("#ldapFormBody").classList.remove("advanced");

    this.#stateData = {
      name: "",
      hostname: "",
      port: 389, // Default LDAP port.
      ssl: false,
      baseDn: "",
      bindDn: "",
    };

    this.#advancedStateData = {
      maxResults: 0,
      scope: Ci.nsILDAPURL.SCOPE_SUBTREE,
      loginMethod: "",
      searchFilter: "",
    };

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: {
          completed: false,
        },
      })
    );
  }

  /**
   * Returns the state data for the LDAP form, including advanced form data.
   *
   * @returns {LDAPFormData}
   */
  captureState() {
    this.#stateData.baseDn = this.querySelector("#baseDN").value;
    this.#stateData.bindDn = this.querySelector("#bindDN").value;
    this.#stateData.ssl = this.querySelector("#enableSSL").checked;

    if (this.#isAdvanced) {
      this.#advancedStateData.scope = this.querySelector("#scope").value;
      this.#advancedStateData.loginMethod =
        this.querySelector("#loginMethod").value;
      this.#advancedStateData.searchFilter =
        this.querySelector("#search").value;
    } else {
      this.#advancedStateData = {
        maxResults: 0,
        scope: Ci.nsILDAPURL.SCOPE_SUBTREE,
        loginMethod: "",
        searchFilter: "",
      };
    }

    return {
      ...this.#stateData,
      ...this.#advancedStateData,
      isAdvanced: this.#isAdvanced,
    };
  }

  #formUpdated() {
    const nameValidity = this.#name.checkValidity();
    let hostnameValidity = false;
    let portValidty = false;
    let maxResultsValidity = true;

    this.#name.ariaInvalid = !nameValidity;

    if (!nameValidity) {
      this.#name.setAttribute("aria-described", "nameErrorMessage");
    } else {
      this.#name.removeAttribute("aria-describedby");
      this.#stateData.name = this.#name.value;
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

    // Set maxResults in credentials if the input is valid and the form
    // is the advanced form. If credentials value is set and the form is no
    // longer advanced, capture state resets the credentials value.
    if (this.#isAdvanced && this.#maxResults.value) {
      try {
        this.#advancedStateData.maxResults = Sanitizer.integerRange(
          this.#maxResults.valueAsNumber,
          1,
          2147483647
        );
        this.#maxResults.setCustomValidity("");
        this.#maxResults.ariaInvalid = false;
        this.#maxResults.removeAttribute("aria-describedby");
        maxResultsValidity = true;
      } catch (error) {
        maxResultsValidity = false;
        this.#maxResults.setCustomValidity(error._message);
        this.#maxResults.ariaInvalid = true;
        this.#maxResults.setAttribute(
          "aria-describedby",
          "maxResultsErrorMessage"
        );
      }
    }

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: {
          completed:
            nameValidity &&
            hostnameValidity &&
            portValidty &&
            maxResultsValidity,
        },
      })
    );
  }
}

customElements.define(
  "address-book-ldap-account-form",
  AddressBookLdapAccountForm
);
