/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

class AccountHubEmail extends HTMLElement {
  /**
   * The email setup form.
   *
   * @type {HTMLFormElement}
   */
  #emailFormSubview;

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

  /**
   * The manual configuration email setup form.
   *
   * @type {HTMLFormElement}
   */
  #manualConfigureEmailFormSubview;

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
   * Email Config Loading Subview
   *
   * @type {HTMLElement}
   */
  #emailLoadingSubview;

  /**
   * Lookup Email title of Dialog.
   *
   * @type {HTMLElement}
   */
  #lookupEmailConfigurationTitle;

  /**
   * Lookup Email subheader of Dialog.
   *
   * @type {HTMLElement}
   */
  #lookupEmailConfigurationSubheader;

  /**
   * The Adding Account title of Dialog.
   *
   * @type {HTMLElement}
   */
  #addingAccountTitle;

  /**
   * The Adding Account subheader of Dialog.
   *
   * @type {HTMLElement}
   */
  #addingAccountSubheader;

  /**
   * Email Added Subview
   *
   * @type {HTMLElement}
   */
  #emailAddedSubview;

  /**
   * The back button.
   *
   * @type {HTMLButtonElement}
   */
  #backButton;

  /**
   * The retest button.
   *
   * @type {HTMLButtonElement}
   */
  #retestButton;

  /**
   * The stop button.
   *
   * @type {HTMLButtonElement}
   */
  #stopButton;

  /**
   * The submit form button.
   *
   * @type {HTMLButtonElement}
   */
  #continueButton;

  /**
   * The account added finish button.
   *
   * @type {HTMLButtonElement}
   */
  #finishButton;

  /**
   * The cancel button.
   *
   * @type {HTMLButtonElement}
   */
  #cancelButton;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    const template = document.getElementById("accountHubEmailSetup");
    this.appendChild(template.content.cloneNode(true));

    // Email/Password form elements.
    this.#emailFormSubview = this.querySelector("#emailFormSubview");
    this.#realName = this.querySelector("#realName");
    this.#email = this.querySelector("#email");
    this.#password = this.querySelector("#password");
    this.#passwordToggleButton = this.querySelector("#passwordToggleButton");
    this.#manualConfigButton = this.querySelector(
      "#emailManuallyConfigureButton"
    );

    this.#manualConfigureEmailFormSubview = this.querySelector(
      "#manualConfigureEmailFormSubview"
    );
    this.#incomingProtocol = this.querySelector("#incomingProtocol");
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

    this.#emailAddedSubview = this.querySelector("#emailAddedSubview");
    this.#finishButton = this.querySelector("#emailFinishButton");

    this.#emailLoadingSubview = this.querySelector("#emailLoadingSubview");
    this.#stopButton = this.querySelector("#emailStopButton");
    this.#backButton = this.querySelector("#emailGoBackButton");
    this.#cancelButton = this.querySelector("#emailCancelButton");

    this.initUI();
    this.setupEventListeners();
  }

  /**
   * Initialize the UI of one of the email setup subviews.
   *
   * @param {string} subview - Subview for which the UI is being inititialized.
   */

  initUI(subview) {
    this.hideSubviews();

    switch (subview) {
      case "manualEmail":
        this.#manualConfigureEmailFormSubview.hidden = false;
        this.setFooterButtons("manualEmail");
        this.#checkValidManualEmailForm();
        break;
      case "emailAdded":
        this.#emailAddedSubview.hidden = false;
        this.setFooterButtons("emailAdded");
        break;
      case "loading":
        this.#emailLoadingSubview.hidden = false;
        this.setFooterButtons("loading");
        break;
      default:
        // Set the email view as the default view.
        this.#emailFormSubview.hidden = false;
        // Populate the account name if we can get some user info.
        if ("@mozilla.org/userinfo;1" in Cc) {
          const userInfo = Cc["@mozilla.org/userinfo;1"].getService(
            Ci.nsIUserInfo
          );
          this.#realName.value = userInfo.fullname;
        }

        this.#realName.focus();
        this.setFooterButtons("email");
        this.#checkValidEmailForm();
        break;
    }
  }

  /**
   * Set up the event listeners for this workflow.
   */
  setupEventListeners() {
    this.#emailFormSubview.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
    });

    this.#realName.addEventListener("input", () => this.#checkValidEmailForm());
    this.#email.addEventListener("input", () => this.#checkValidEmailForm());
    this.#password.addEventListener("input", () => this.#onPasswordInput());

    this.#passwordToggleButton.addEventListener("click", event => {
      this.#togglePasswordInput(
        event.target.getAttribute("aria-pressed") === "false"
      );
    });

    // Set the manual email config button. This should hide the current email
    // form and display the manual configuration email form.
    this.#manualConfigButton.addEventListener("click", event => {
      this.#incomingUsername.value = this.#email.value;
      this.#outgoingUsername.value = this.#email.value;
      this.initUI("manualEmail");
    });

    // Set the Cancel button.
    this.#cancelButton.addEventListener("click", () => {
      // Go back to the main account hub view.
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "START" },
        })
      );
    });

    this.#manualConfigureEmailFormSubview.addEventListener("submit", event => {
      event.preventDefault();
      event.stopPropagation();
    });

    // Set the Back button.
    this.#backButton.addEventListener("click", () => {
      // Go back to basic email form subview.
      this.initUI();
    });
  }

  /**
   * Check whether the user entered the minimum amount of information needed to
   * leave the email form and is allowed to proceed to the detection step.
   */
  #checkValidEmailForm() {
    const isValidForm =
      this.#email.checkValidity() && this.#realName.checkValidity();
    this.#domain = isValidForm
      ? this.#email.value.split("@")[1].toLowerCase()
      : "";
    this.#continueButton.disabled = !isValidForm;
    this.#manualConfigButton.hidden = !isValidForm;
  }

  #checkValidManualEmailForm() {
    // TODO: Put manual config validation here
    const isValidForm = false;

    this.#retestButton.disabled = !isValidForm;
    this.#continueButton.disabled = !isValidForm;
  }

  /**
   * Handle the password visibility toggle on password input on the email form.
   */
  #onPasswordInput() {
    if (!this.#password.value) {
      this.#togglePasswordInput(false);
    }
  }

  /**
   * Toggle the password field type between `password` and `text` to allow users
   * reading their typed password on the email form.
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
   * Hide all of the subviews in the account hub email flow to show
   * whichever subview needs to be shown.
   */
  hideSubviews() {
    this.#emailAddedSubview.hidden = true;
    this.#emailFormSubview.hidden = true;
    this.#emailLoadingSubview.hidden = true;
    this.#manualConfigureEmailFormSubview.hidden = true;
  }

  /**
   * Set the footer buttons for the current subview.
   *
   * @param {string} subview - Subview for which footer is initialized.
   */
  setFooterButtons(subview) {
    this.#manualConfigButton.hidden = true;
    this.#retestButton.hidden = true;
    this.#finishButton.hidden = true;
    this.#continueButton.hidden = true;
    this.#backButton.hidden = true;
    this.#cancelButton.hidden = true;

    // Reset the footer icons to base two column buttons
    this.querySelector("#accountHubEmailFooter").childNodes[0].className =
      "dialog-menu-container two-columns";

    let footerButtons;

    switch (subview) {
      case "email":
        this.querySelector("#footerButtonsLeftColumn").hidden = false;
        this.querySelector("#footerButtonsCenterColumn").hidden = true;
        this.querySelector("#footerButtonsRightColumn").hidden = false;
        this.#cancelButton.hidden = false;
        this.#continueButton.hidden = false;

        // Add the footer buttons to the end of the email form subview.
        footerButtons = this.querySelector("#accountHubEmailFooter");
        this.#emailFormSubview.append(footerButtons);
        break;
      case "manualEmail":
        this.querySelector("#footerButtonsLeftColumn").hidden = false;
        this.querySelector("#footerButtonsCenterColumn").hidden = true;
        this.querySelector("#footerButtonsRightColumn").hidden = false;
        this.querySelector("#footerButtonsRightColumn").prepend(
          this.#backButton
        );
        this.#retestButton.hidden = false;
        this.#continueButton.hidden = false;
        this.#backButton.hidden = false;

        // Add the footer buttons to the end of the manual email form subview.
        footerButtons = this.querySelector("#accountHubEmailFooter");
        this.#manualConfigureEmailFormSubview.append(footerButtons);
        break;
      case "loading":
        this.querySelector("#footerButtonsLeftColumn").hidden = false;
        this.querySelector("#footerButtonsCenterColumn").hidden = true;
        this.querySelector("#footerButtonsRightColumn").hidden = false;
        this.querySelector("#footerButtonsLeftColumn").prepend(
          this.#backButton
        );
        // TODO: Conditionally added stop button when loading auto config.
        this.#continueButton.hidden = false;
        this.#backButton.hidden = false;

        // Add the footer buttons to the end of email loading subview.
        footerButtons = this.querySelector("#accountHubEmailFooter");
        this.#emailLoadingSubview.append(footerButtons);
        break;
      case "emailAdded":
        this.querySelector("#footerButtonsLeftColumn").hidden = true;
        this.querySelector("#footerButtonsCenterColumn").hidden = false;
        this.querySelector("#footerButtonsRightColumn").hidden = true;
        this.querySelector("#accountHubEmailFooter").childNodes[0].className =
          "dialog-menu-container center-column";
        this.#finishButton.hidden = false;

        // Add the footer buttons to the end of email added subview.
        footerButtons = this.querySelector("#accountHubEmailFooter");
        this.#emailLoadingSubview.append(footerButtons);
        break;
      default:
        break;
    }
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

    this.#emailFormSubview.reset();
    this.#manualConfigureEmailFormSubview.reset();
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
