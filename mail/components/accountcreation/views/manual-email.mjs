/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class AccountHubManualEmailSetup extends HTMLElement {
  /**
   * The manual email setup form.
   *
   * @type {HTMLFormElement}
   */
  #form;

  /**
   * The incoming server protocol.
   *
   * @type {HTMLInputElement}
   */
  #incomingProtocol;

  /**
   * The incoming server hostname.
   *
   * @type {HTMLInputElement}
   */
  #incomingHostname;

  /**
   * The incoming server port.
   *
   * @type {HTMLInputElement}
   */
  #incomingPort;

  /**
   * The incoming server connection security.
   *
   * @type {HTMLInputElement}
   */
  #incomingConnectionSecurity;

  /**
   * The incoming server authentication method.
   *
   * @type {HTMLInputElement}
   */
  #incomingAuthenticationMethod;

  /**
   * The incoming username.
   *
   * @type {HTMLInputElement}
   */
  #incomingUsername;

  /**
   * The outgoing server hostname.
   *
   * @type {HTMLInputElement}
   */
  #outgoingHostname;

  /**
   * The outgoing server port.
   *
   * @type {HTMLInputElement}
   */
  #outgoingPort;

  /**
   * The outgoing server connection security.
   *
   * @type {HTMLInputElement}
   */
  #outgoingConnectionSecurity;

  /**
   * The outgoing server authentication method.
   *
   * @type {HTMLInputElement}
   */
  #outgoingAuthenticationMethod;

  /**
   * The outgoing username.
   *
   * @type {HTMLInputElement}
   */
  #outgoingUsername;

  /**
   * The submit form button.
   *
   * @type {HTMLButtonElement}
   */
  #continueButton;

  /**
   * The retest button.
   *
   * @type {HTMLButtonElement}
   */
  #retestButton;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    const template = document.getElementById(
      "accountHubManuallyConfigureEmailSetup"
    );
    this.appendChild(template.content.cloneNode(true));

    this.#form = this.querySelector("form");
    this.#incomingProtocol = this.querySelector("#incomingProtocol");
    this.outgoingProtocol = this.querySelector("outgoingProtocol");
    this.#incomingPort = this.querySelector("#incomingPort");
    this.#outgoingPort = this.querySelector("#outgoingPort");
    this.#incomingHostname = this.querySelector("#incomingHostname");
    this.#outgoingHostname = this.querySelector("#outgoingHostname");
    this.#incomingConnectionSecurity = this.querySelector(
      "#incomingConnectionSecurity"
    );
    this.#outgoingConnectionSecurity = this.querySelector(
      "#outgoingConnectionSecurity"
    );
    this.#incomingAuthenticationMethod = this.querySelector(
      "#incomingAuthenticationMethod"
    );
    this.#outgoingAuthenticationMethod = this.querySelector(
      "#outgoingAuthenticationMethod"
    );
    this.#incomingUsername = this.querySelector("#incomingUsername");
    this.#outgoingUsername = this.querySelector("#outgoingUsername");
    this.#continueButton = this.querySelector("#emailContinueButton");
    this.#retestButton = this.querySelector("#emailRetestButton");

    this.initUI();

    this.setupEventListeners();
  }

  /**
   * Initialize the UI of the email setup flow.
   */
  initUI() {}

  /**
   * Set up the event listeners for this workflow only once.
   */
  setupEventListeners() {
    this.#form.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
      console.log("submit");
    });

    // Set the Cancel/Back button.
    this.querySelector("#emailGoBackButton").addEventListener("click", () => {
      // If in first view, go back to start, otherwise go back in the flow.
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "MAIL" },
        })
      );
    });
  }

  /**
   * Check whether the user entered the minimum amount of information needed to
   * leave the first view and is allowed to proceed to the detection step.
   */
  #checkValidForm() {
    const isValidForm = false;

    this.#retestButton.disabled = !isValidForm;
    this.#continueButton.disabled = !isValidForm;
  }

  /**
   * Check if any operation is currently in process and return true only if we
   * can leave this view.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  reset() {
    // TODO
    // Check for:
    // - Non-abortable operations (autoconfig, email account setup, etc)

    this.#form.reset();
    // TODO
    // Before resetting we need to:
    // - Clean up the fields.
    // - Reset the autoconfig (cached server info).
    // - Reset the view to the initial screen.
    return true;
  }
}
customElements.define("account-hub-manual-email", AccountHubManualEmailSetup);
