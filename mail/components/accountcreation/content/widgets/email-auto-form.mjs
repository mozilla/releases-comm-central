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
   * Manual config button.
   *
   * @type {HTMLButtonElement}
   */
  #manualConfigButton;

  /**
   * The current email auto config form inputs.
   *
   * @type {object}
   */
  #currentConfig;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    super.connectedCallback();

    const template = document
      .getElementById("accountHubEmailAutoFormTemplate")
      .content.cloneNode(true);
    this.appendChild(template);

    this.#realName = this.querySelector("#realName");
    this.#email = this.querySelector("#email");
    this.#manualConfigButton = this.querySelector("#manualConfiguration");
    this.#realName.addEventListener("input", this);
    this.#email.addEventListener("input", this);
    this.#manualConfigButton.addEventListener("click", this);
    this.resetState();
  }

  handleEvent(event) {
    switch (event.type) {
      case "input":
      case "change":
        this.checkValidEmailForm();
        break;
      case "click":
        if (event.target.id == "manualConfiguration") {
          this.dispatchEvent(
            new CustomEvent("edit-configuration", {
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
   * Resets currentConfig, and resets and re-validates the form.
   */
  resetState() {
    this.querySelector("#autoConfigEmailForm").reset();
    this.#currentConfig = {};

    if ("@mozilla.org/userinfo;1" in Cc) {
      const userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      this.#realName.value = userInfo.fullname;
    }
    this.checkValidEmailForm();
  }

  /**
   * This sets the focus, and the focus needs to be applied to the correct
   * field when this view is either loaded or is revisited by going back.
   */
  setState() {
    const focusedInput = this.#realName.value ? this.#email : this.#realName;
    focusedInput.focus();
  }

  /**
   * Check whether the user entered the minimum amount of information needed to
   * update the hostname and domain for the complete form.
   */
  checkValidEmailForm() {
    const nameValidity = this.#realName.checkValidity();
    const emailValidity = this.#email.checkValidity();

    this.#realName.setAttribute("aria-invalid", !nameValidity);
    this.#email.setAttribute("aria-invalid", !emailValidity);
    const completed = nameValidity && emailValidity;

    // TODO: Check for domain extension when validating email address.

    this.#currentConfig = {
      realName: this.#realName.value,
      email: this.#email.value,
    };

    this.#manualConfigButton.classList.toggle("visibility-hidden", !completed);
    this.dispatchEvent(
      new CustomEvent("config-updated", {
        bubbles: true,
        detail: { completed },
      })
    );
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
