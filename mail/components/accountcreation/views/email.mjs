/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class AccountHubEmail extends HTMLElement {
  /**
   * The email setup form.
   *
   * @type {HTMLFormElement}
   */
  #form;

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
   * The password field.
   *
   * @type {HTMLInputElement}
   */
  #password;

  /**
   * The password visibility button.
   *
   * @type {HTMLButtonElement}
   */
  #passwordToggleButton;

  /**
   * The submit form button.
   *
   * @type {HTMLButtonElement}
   */
  #continueButton;

  /**
   * The manual email config button.
   *
   * @type {HTMLButtonElement}
   */
  #manualConfigButton;

  /**
   * The domain name extrapolated from the email address.
   *
   * @type {string}
   */
  #domain = "";

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    let template = document.getElementById("accountHubEmailSetup");
    this.appendChild(template.content.cloneNode(true));

    this.#form = this.querySelector("form");
    this.#realName = this.querySelector("#realName");
    this.#email = this.querySelector("#email");
    this.#password = this.querySelector("#password");
    this.#passwordToggleButton = this.querySelector("#passwordToggleButton");
    this.#continueButton = this.querySelector("#emailContinueButton");
    this.#manualConfigButton = this.querySelector(
      "#emailManuallyConfigureButton"
    );

    this.initUI();

    this.setupEventListeners();
  }

  /**
   * Initialize the UI of the email setup flow.
   */
  initUI() {
    // Populate the account name if we can get some user info.
    if ("@mozilla.org/userinfo;1" in Cc) {
      let userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      this.#realName.value = userInfo.fullname;
    }

    this.#realName.focus();
    this.#checkValidForm();
  }

  /**
   * Set up the event listeners for this workflow only once.
   */
  setupEventListeners() {
    this.#form.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
      console.log("submit");
    });

    this.#realName.addEventListener("input", () => this.#checkValidForm());
    this.#email.addEventListener("input", () => this.#checkValidForm());
    this.#password.addEventListener("input", () => this.#onPasswordInput());

    this.#passwordToggleButton.addEventListener("click", event => {
      this.#togglePasswordInput(
        event.target.getAttribute("aria-pressed") === "false"
      );
    });

    // Set the manual email config button.
    this.#manualConfigButton.addEventListener("click", event => {
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "MANUAL_EMAIL" },
        })
      );
    });

    // Set the Cancel/Back button.
    this.querySelector("#emailGoBackButton").addEventListener("click", () => {
      // If in first view, go back to start, otherwise go back in the flow.
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "START" },
        })
      );
    });
  }

  /**
   * Check whether the user entered the minimum amount of information needed to
   * leave the first view and is allowed to proceed to the detection step.
   */
  #checkValidForm() {
    const isValidForm =
      this.#email.checkValidity() && this.#realName.checkValidity();
    this.#domain = isValidForm
      ? this.#email.value.split("@")[1].toLowerCase()
      : "";

    this.#continueButton.disabled = !isValidForm;
    this.#manualConfigButton.hidden = !isValidForm;
  }

  /**
   * Handle the password visibility toggle on password input.
   */
  #onPasswordInput() {
    if (!this.#password.value) {
      this.#togglePasswordInput(false);
    }
  }

  /**
   * Toggle the password field type between `password` and `text` to allow users
   * reading their typed password.
   *
   * @param {boolean} show - If the password field should become a text field.
   */
  #togglePasswordInput(show) {
    this.#password.type = show ? "text" : "password";
    this.#passwordToggleButton.setAttribute("aria-pressed", show.toString());
    document.l10n.setAttributes(
      this.#passwordToggleButton,
      show
        ? "account-setup-password-toggle-hide"
        : "account-setup-password-toggle-show"
    );
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
    this.#togglePasswordInput(false);
    // TODO
    // Before resetting we need to:
    // - Clean up the fields.
    // - Reset the autoconfig (cached server info).
    // - Reset the view to the initial screen.
    return true;
  }
}
customElements.define("account-hub-email", AccountHubEmail);
