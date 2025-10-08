/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { EmailPasswordForm } from "./email-password-form.mjs";

/**
 * @typedef {UsernamePassword} EmailAuthentication
 * @property {string} [username] - Optional username to use for authentication.
 */

/**
 * Subview for password entry when required for autodiscovery with optional
 * username field.
 * Template ID: #accountHubEmailAuthenticationFormTemplate
 *
 * @tagname email-authentication-form
 */
class EmailAuthenticationForm extends EmailPasswordForm {
  _templateId = "accountHubEmailAuthenticationFormTemplate";

  /**
   * @type {HTMLInputElement}
   */
  #username;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    super.connectedCallback();

    this.#username = this.querySelector("#username");
  }

  /**
   * Get the state from the form.
   *
   * @returns {EmailAuthentication}
   */
  captureState() {
    return {
      ...super.captureState(),
      username: this.#username.value,
    };
  }
}

customElements.define("email-authentication-form", EmailAuthenticationForm);
