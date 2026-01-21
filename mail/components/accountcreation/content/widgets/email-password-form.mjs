/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

/**
 * @typedef {object} UsernamePassword
 * @property {string} password - Password used with an existing username to
 *  login.
 * @property {boolean} rememberPassword - Remember the password when fetching
 *  account information.
 */

/**
 * Account Hub Email Password Form Template
 * Template ID: #accountHubEmailPasswordFormTemplate (from accountHubEmailPasswordFormTemplate.inc.xhtml)
 */
export class EmailPasswordForm extends AccountHubStep {
  constructor() {
    super();
    XPCOMUtils.defineLazyPreferenceGetter(
      this,
      "rememberSignons",
      "signon.rememberSignons",
      true,
      (prefName, oldValue, newValue) => this.#setRememberPasswordInput(newValue)
    );
  }

  /**
   * The password input field
   *
   * @type {HTMLInputElement}
   */
  #password;

  _templateId = "accountHubEmailPasswordFormTemplate";

  /**
   * The remember checkbox.
   *
   * @type {HTMLInputElement}
   */
  #rememberPassword;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById(this._templateId)
      .content.cloneNode(true);
    this.appendChild(template);

    this.#password = this.querySelector("#password");
    this.#rememberPassword = this.querySelector("#rememberPassword");

    this.#password.focus();

    // Disable the remember password checkbox if the pref is false.
    this.#setRememberPasswordInput(this.rememberSignons);

    this.#password.addEventListener("input", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
        this.dispatchEvent(
          new CustomEvent("config-updated", {
            bubbles: true,
            detail: { completed: this.#password.checkValidity() },
          })
        );
        break;
      default:
        break;
    }
  }

  /**
   * Resets the password field.
   */
  setState() {
    this.querySelector("#passwordForm").reset();
    this.querySelector("#password").focus();
  }

  /**
   * Return the current state of the email setup form.
   *
   * @returns {UsernamePassword}
   */
  captureState() {
    return {
      password: this.#password.value,
      rememberPassword: this.#rememberPassword.checked,
    };
  }

  /**
   * Updates the remember password input checkbox depending on the user's
   * preference for allowing remembering a password.
   *
   * @param {boolean} allowed - If form is allowed to remember password.
   */
  #setRememberPasswordInput(allowed) {
    this.#rememberPassword.toggleAttribute("checked", allowed);
    this.#rememberPassword.disabled = !allowed;
  }
}

customElements.define("email-password-form", EmailPasswordForm);
