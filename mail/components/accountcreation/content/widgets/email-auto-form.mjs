/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountHubStep } from "./account-hub-step.mjs";

/**
 * Account Hub Email Auto Form Template
 * Template ID: #accountHubEmailAutoFormTemplate (from accountHubEmailAutoFormTemplate.inc.xhtml)
 */
class EmailAutoForm extends AccountHubStep {
  /**
   * The account name field.
   *
   * @type {HTMLInputElement}
   */
  #realName;

  /**
   * The email field.
   *
   * @type {HTMLInputElement}
   */
  #email;

  /**
   * The current email auto config form inputs.
   *
   * @type {Object}
   */
  #currentConfig;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubEmailAutoFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#realName = this.querySelector("#realName");
    this.#email = this.querySelector("#email");
    this.#currentConfig = {};

    if ("@mozilla.org/userinfo;1" in Cc) {
      const userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      this.#realName.value = userInfo.fullname;
    }

    this.#realName.focus();
    this.#checkValidEmailForm();

    this.setupEventListeners();
  }

  /**
   * Set up the event listeners for this workflow.
   */
  setupEventListeners() {
    // Auto email config event listeners.
    this.#realName.addEventListener("input", () => {
      this.#checkValidEmailForm();
    });
    this.#email.addEventListener("input", () => {
      this.#checkValidEmailForm();
    });
  }

  resetState() {
    this.querySelector("#autoConfigEmailForm").reset();
    this.#currentConfig = {};
  }

  /**
   * Check whether the user entered the minimum amount of information needed to
   * update the hostname and domain for the complete form.
   */
  #checkValidEmailForm() {
    const isValidForm = this.querySelector("form").checkValidity();

    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed: isValidForm },
      })
    );

    const domain = isValidForm
      ? this.#email.value.split("@")[1].toLowerCase()
      : "";
    // TODO: Check for domain extension when validating email address.
    const outgoingHostname = domain;
    const incomingHostname = domain;
    const incomingUsername = isValidForm ? this.#email.value : "";
    const outgoingUsername = isValidForm ? this.#email.value : "";

    this.#currentConfig = {
      realName: this.#realName.value,
      email: this.#email.value,
      outgoingHostname,
      incomingHostname,
      outgoingUsername,
      incomingUsername,
    };
  }

  /**
   * Return the current state of the email setup form.
   */
  captureState() {
    return this.#currentConfig;
  }

  set disabled(val) {
    for (const input of this.querySelectorAll("input")) {
      input.disabled = val;
    }
  }
}

customElements.define("email-auto-form", EmailAutoForm);
