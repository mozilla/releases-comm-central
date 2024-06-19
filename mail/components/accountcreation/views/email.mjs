/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AccountCreationUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);
const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const { CreateInBackend } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/CreateInBackend.sys.mjs"
);

const { ConfigVerifier } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/ConfigVerifier.sys.mjs"
);

const { GuessConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/GuessConfig.sys.mjs"
);
const { Sanitizer } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/Sanitizer.sys.mjs"
);

const { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

const { CancelledException, gAccountSetupLogger, standardPorts, assert } =
  AccountCreationUtils;

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

  /**
   * Store methods to interrupt abortable operations like testing
   * a server configuration or installing an add-on.
   *
   * @type {Abortable}
   */
  // eslint-disable-next-line no-unused-private-class-members
  #abortable;

  /**
   * The current Account Config object based on the users form element inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * A Config Verifier object that verfies the currentConfig
   *
   * @type {ConfigVerifier}
   */
  #configVerifier;

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
      "#incomingAuthMethod"
    );
    this.#outgoingAuthenticationMethod = this.querySelector(
      "#outgoingAuthMethod"
    );
    this.#incomingUsername = this.querySelector("#incomingUsername");
    this.#outgoingUsername = this.querySelector("#outgoingUsername");
    this.#continueButton = this.querySelector("#emailContinueButton");
    this.#retestButton = this.querySelector("#emailRetestButton");

    this.#emailAddedSubview = this.querySelector("#emailAddedSubview");
    this.#finishButton = this.querySelector("#emailFinishButton");

    this.#emailLoadingSubview = this.querySelector("#emailLoadingSubview");
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
    this.clearNotifications();

    switch (subview) {
      case "manualEmail":
        this.#manualConfigureEmailFormSubview.hidden = false;
        this.setNotificationBar("manualEmail");
        this.setFooterButtons("manualEmail");

        // Update currentConfig since there are default values on the form.
        this.#currentConfig = this.getManualUserConfig();
        break;
      case "emailAdded":
        this.#emailAddedSubview.hidden = false;
        this.setFooterButtons("emailAdded");
        break;
      case "loading":
        this.#emailLoadingSubview.hidden = false;
        this.setFooterButtons();
        this.querySelector("#addingAccountTitle").hidden = false;
        this.querySelector("#addingAccountSubheader").hidden = false;
        this.querySelector("#lookupEmailConfigurationTitle").hidden = true;
        this.querySelector("#lookupEmailConfigurationSubheader").hidden = true;

        break;
      case "lookup":
        this.#emailLoadingSubview.hidden = false;
        this.setFooterButtons();
        this.querySelector("#addingAccountTitle").hidden = true;
        this.querySelector("#addingAccountSubheader").hidden = true;
        this.querySelector("#lookupEmailConfigurationTitle").hidden = false;
        this.querySelector("#lookupEmailConfigurationSubheader").hidden = false;
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
        this.setNotificationBar("email");
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

    this.#passwordToggleButton.addEventListener("click", event => {
      this.#togglePasswordInput(event.target.ariaPressed === "false");
    });

    // Auto email config event listeners.
    this.#realName.addEventListener("input", () => {
      this.#checkValidEmailForm();
    });
    this.#email.addEventListener("input", () => {
      this.#checkValidEmailForm();
    });

    this.#password.addEventListener("input", () => {
      this.#onPasswordInput();
    });

    // Manual email config event listeners.
    this.#incomingHostname.addEventListener("change", () => {
      this.#adjustOAuth2Visibility();
    });
    this.#outgoingHostname.addEventListener("change", () => {
      this.#adjustOAuth2Visibility();
    });
    this.#incomingPort.addEventListener("change", () => {
      this.#adjustSSLToPort(true);
    });
    this.#outgoingPort.addEventListener("change", () => {
      this.#adjustSSLToPort(false);
    });
    this.#incomingConnectionSecurity.addEventListener("command", () => {
      this.#adjustPortToSSLAndProtocol(true);
    });
    this.#outgoingConnectionSecurity.addEventListener("command", () => {
      this.#adjustPortToSSLAndProtocol(false);
    });
    this.#incomingProtocol.addEventListener("command", () => {
      this.#adjustPortToSSLAndProtocol(true);
    });

    this.#outgoingAuthenticationMethod.addEventListener("command", event => {
      // Disable the outgoing username field if the "No Authentication" option
      // is selected.
      this.#outgoingUsername.disabled = event.target.value == 1;
    });

    // Set the continue button which attempts to validate and add the email
    // account.
    this.#continueButton.addEventListener("click", () => {
      this.onContinue();
    });

    // Set the manual email config button. This should hide the current email
    // form and display the manual configuration email form.
    this.#manualConfigButton.addEventListener("click", () => {
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

    // Set the Finsh button.
    this.#finishButton.addEventListener("click", () => {
      // Go back to the main account hub view.
      this.dispatchEvent(
        new CustomEvent("open-view", {
          bubbles: true,
          composed: true,
          detail: { type: "START" },
        })
      );
    });

    // Set the manual email config button. This should hide the current email
    // form and display the manual configuration email form.
    this.#retestButton.addEventListener("click", () => {
      this.testManualConfig();
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
    this.#outgoingHostname.value = this.#domain;
    this.#incomingHostname.value = this.#domain;
    this.#incomingUsername.value = isValidForm ? this.#email.value : "";
    this.#outgoingUsername.value = isValidForm ? this.#email.value : "";

    this.#continueButton.disabled = !isValidForm;
    this.#manualConfigButton.hidden = !isValidForm;
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
   * Make OAuth2 visible as an authentication method when a hostname that
   * OAuth2 can be used with is entered.
   *
   * @param {AccountConfig} [accountConfig] - Complete Account Config.
   */
  #adjustOAuth2Visibility(accountConfig) {
    this.#currentConfig = accountConfig || this.getManualUserConfig();
    this.#currentConfig.incoming.oauthSettings = {};
    this.#currentConfig.outgoing.oauthSettings = {};

    // If the incoming server hostname supports OAuth2, enable it.
    const incomingDetails = OAuth2Providers.getHostnameDetails(
      this.#currentConfig.incoming.hostname
    );

    this.querySelector("#incomingAuthMethodOAuth2").hidden = !incomingDetails;
    if (incomingDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for incoming server ${
          this.#currentConfig.incoming.hostname
        } is ${incomingDetails}`
      );
      [
        this.#currentConfig.incoming.oauthSettings.issuer,
        this.#currentConfig.incoming.oauthSettings.scope,
      ] = incomingDetails;
    }

    // If the smtp hostname supports OAuth2, enable it.
    const outgoingDetails = OAuth2Providers.getHostnameDetails(
      this.#currentConfig.outgoing.hostname
    );
    this.querySelector("#outgoingAuthMethodOAuth2").hidden = !outgoingDetails;
    if (outgoingDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for outgoing server ${
          this.#currentConfig.outgoing.hostname
        } is ${outgoingDetails}`
      );
      [
        this.#currentConfig.outgoing.oauthSettings.issuer,
        this.#currentConfig.outgoing.oauthSettings.scope,
      ] = outgoingDetails;
    }

    this.#validateManualConfigForm();
  }

  /**
   * Automatically fill port field when connection security has changed in
   * manual edit, unless the user entered a non-standard port.
   *
   * @param {boolean} incoming - True if incoming port, else outgoing port.
   * @param {AccountConfig} [accountConfig] - Complete AccountConfig.
   */
  #adjustPortToSSLAndProtocol(incoming, accountConfig) {
    const config = accountConfig || this.getManualUserConfig();
    const configDirection = incoming ? config.incoming : config.outgoing;

    if (configDirection.port && !standardPorts.includes(configDirection.port)) {
      return;
    }

    if (incoming) {
      switch (configDirection.type) {
        case "imap":
          this.#incomingPort.value =
            configDirection.socketType == Ci.nsMsgSocketType.SSL ? 993 : 143;
          break;

        case "pop3":
          this.#incomingPort.value =
            configDirection.socketType == Ci.nsMsgSocketType.SSL ? 995 : 110;
          break;

        case "exchange":
          this.#incomingPort.value = 443;
          break;
      }
      configDirection.port = this.#incomingPort.value;
      config.incoming = configDirection;
    } else {
      // Implicit TLS for SMTP is on port 465.
      if (configDirection.socketType == Ci.nsMsgSocketType.SSL) {
        this.#outgoingPort.value = 465;
      } else if (
        (configDirection.port == 465 || !configDirection.port) &&
        configDirection.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
      ) {
        // Implicit TLS for SMTP is on port 465. STARTTLS won't work there.
        this.#outgoingPort.value = 587;
      }

      configDirection.port = this.#outgoingPort.value;
      config.outgoing = configDirection;
    }

    this.#currentConfig = config;
    this.#validateManualConfigForm();
  }

  /**
   * If the user changed the port manually, adjust the SSL value,
   * (only) if the new port is impossible with the old SSL value.
   *
   * @param {boolean} incoming - True if incoming port, else outgoing port.
   */
  #adjustSSLToPort(incoming) {
    const config = this.getManualUserConfig();
    const configDirection = incoming ? config.incoming : config.outgoing;

    if (!standardPorts.includes(configDirection.port)) {
      return;
    }

    if (incoming) {
      if (configDirection.type == "imap") {
        // Implicit TLS for IMAP is on port 993.
        if (
          configDirection.port == 993 &&
          configDirection.socketType != Ci.nsMsgSocketType.SSL
        ) {
          this.#incomingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
        } else if (
          configDirection.port == 143 &&
          configDirection.socketType == Ci.nsMsgSocketType.SSL
        ) {
          this.#incomingConnectionSecurity.value =
            Ci.nsMsgSocketType.alwaysSTARTTLS;
        }
      }

      if (configDirection.type == "pop3") {
        // Implicit TLS for POP3 is on port 995.
        if (
          configDirection.port == 995 &&
          configDirection.socketType != Ci.nsMsgSocketType.SSL
        ) {
          this.#incomingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
        } else if (
          configDirection.port == 110 &&
          configDirection.socketType == Ci.nsMsgSocketType.SSL
        ) {
          this.#incomingConnectionSecurity.value =
            Ci.nsMsgSocketType.alwaysSTARTTLS;
        }
      }

      configDirection.socketType = this.#incomingConnectionSecurity.value;
      config.incoming = configDirection;
    } else {
      // Outgoing port change.
      if (
        configDirection.port == 465 &&
        configDirection.socketType != Ci.nsMsgSocketType.SSL
      ) {
        this.#outgoingConnectionSecurity.value = Ci.nsMsgSocketType.SSL;
      } else if (
        (configDirection.port == 587 || configDirection.port == 25) &&
        configDirection.socketType == Ci.nsMsgSocketType.SSL
      ) {
        // Port 587 and port 25 are for plain or STARTTLS. Not for Implicit TLS.
        this.#outgoingConnectionSecurity.value =
          Ci.nsMsgSocketType.alwaysSTARTTLS;
      }

      configDirection.socketType = this.#outgoingConnectionSecurity.value;
      config.outgoing = configDirection;
    }

    this.#currentConfig = config;
    this.#validateManualConfigForm();
  }

  /**
   * Updates the manual edit fields with the confirmed AccountConfig from
   * guessConfig.
   *
   * @param {AccountConfig} config - The config to present to the user.
   */
  #updateManualEmailFields(config) {
    assert(config instanceof AccountConfig);
    this.#currentConfig = config;

    const isExchange = config.incoming.type == "exchange";

    // Incoming server.
    this.querySelector("#incomingProtocolExchange").hidden = !isExchange;
    this.#incomingProtocol.value = Sanitizer.translate(
      config.incoming.type,
      { imap: 1, pop3: 2, exchange: 3 },
      1
    );
    this.#incomingHostname.value = config.incoming.hostname;
    this.#incomingConnectionSecurity.value = Sanitizer.enum(
      config.incoming.socketType,
      [0, 1, 2, 3],
      0
    );
    this.#incomingAuthenticationMethod.value = Sanitizer.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    this.#incomingUsername.value = config.incoming.username;

    // If a port number was specified other than "Auto"
    if (config.incoming.port) {
      this.#incomingPort.value = config.incoming.port;
    } else {
      this.#adjustPortToSSLAndProtocol(true, config);
    }

    // Outgoing server.

    this.#outgoingHostname.value = config.outgoing.hostname;
    this.#outgoingUsername.value = config.outgoing.username;

    this.#outgoingConnectionSecurity.value = Sanitizer.enum(
      config.outgoing.socketType,
      [0, 1, 2, 3],
      0
    );
    this.#outgoingAuthenticationMethod.value = Sanitizer.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );

    // If a port number was specified other than "Auto"
    if (config.outgoing.port) {
      this.#outgoingPort.value = config.outgoing.port;
    } else {
      this.#adjustPortToSSLAndProtocol(false, config);
    }

    this.#adjustOAuth2Visibility(config);

    return config;
  }

  /**
   * This enables the buttons which allow the user to proceed
   * once they have entered enough information on manual config.
   *
   * Once the user has entered (or we detected) all values, they may
   * do [Create Account] (tests login and if successful creates the account)
   * or [Advanced Setup] (goes to Account Manager). Esp. in the latter case,
   * we will not second-guess their setup and just to use their values,
   * so here we make sure that they at least have entered all values.
   */
  #validateManualConfigForm() {
    this.#retestButton.disabled =
      !this.#currentConfig.incoming.hostname ||
      !this.#currentConfig.outgoing.hostname;

    if (this.#currentConfig.isComplete()) {
      this.#continueButton.disabled = false;
      // TODO: Enable advanced config button
      return;
    }

    this.#continueButton.disabled = true;
  }

  /**
   * Click handler for re-test button. Guesses the email account config after
   * a user has inputted all manual config fields and pressed re-test.
   */
  async testManualConfig() {
    // Show loading view.
    this.initUI("lookup");

    // Clear error notifications.
    this.clearNotifications();

    this.#currentConfig = this.getManualUserConfig();

    this.#abortable = GuessConfig.guessConfig(
      this.#domain,
      (type, hostname, port) => {
        gAccountSetupLogger.debug(
          `progress callback host: ${hostname}, port: ${port}, type: ${type}`
        );
      },
      config => {
        // This will validate and fill all of the form fields, as well as
        // enable the continue button.
        this.#abortable = null;
        this.initUI("manualEmail");
        this.#currentConfig = this.#updateManualEmailFields(config);
        this.#validateManualConfigForm();
      },
      error => {
        this.#abortable = null;

        // guessConfig failed.
        if (error instanceof CancelledException) {
          return;
        }
        gAccountSetupLogger.warn(`guessConfig failed: ${error}`);
        // Load the manual config view again and show an error notification.
        this.initUI("manualEmail");
        this.showErrorNotification("account-hub-find-settings-failed", "");
      },
      this.#currentConfig,
      this.#currentConfig.outgoing.existingServerKey ? "incoming" : "both"
    );
  }

  /**
   * Returns an Account Config object with all the sanitized user-inputted
   * data for a manual config email guess attempt.
   *
   * @returns {AccountConfig}
   */
  getManualUserConfig() {
    const config = new AccountConfig();
    config.source = AccountConfig.kSourceUser;

    // Incoming server.
    try {
      const inHostnameValue = this.#incomingHostname.value;
      config.incoming.hostname = Sanitizer.hostname(inHostnameValue);
      this.#incomingHostname.value = config.incoming.hostname;
    } catch (error) {
      gAccountSetupLogger.warn(error);
    }

    try {
      config.incoming.port = Sanitizer.integerRange(
        this.#incomingPort.valueAsNumber,
        1,
        65535
      );
    } catch (error) {
      // Include default "Auto".
      config.incoming.port = undefined;
    }

    config.incoming.type = Sanitizer.translate(this.#incomingProtocol.value, {
      1: "imap",
      2: "pop3",
      3: "exchange",
      0: null,
    });
    config.incoming.socketType = Sanitizer.integer(
      this.#incomingConnectionSecurity.value
    );
    config.incoming.auth = Sanitizer.integer(
      this.#incomingAuthenticationMethod.value
    );
    config.incoming.username = this.#incomingUsername.value;

    // Outgoing server.

    config.outgoing.username = this.#outgoingUsername.value;

    // The user specified a custom SMTP server.
    config.outgoing.type = "smtp";
    config.outgoing.existingServerKey = null;
    config.outgoing.addThisServer = true;
    config.outgoing.useGlobalPreferredServer = false;

    try {
      const input = this.#outgoingHostname.value;
      config.outgoing.hostname = Sanitizer.hostname(input);
      this.#outgoingHostname.value = config.outgoing.hostname;
    } catch (error) {
      gAccountSetupLogger.warn(error);
    }

    try {
      config.outgoing.port = Sanitizer.integerRange(
        this.#outgoingPort.valueAsNumber,
        1,
        65535
      );
    } catch (error) {
      // Include default "Auto".
      config.outgoing.port = undefined;
    }

    config.outgoing.socketType = Sanitizer.integer(
      this.#outgoingConnectionSecurity.value
    );
    config.outgoing.auth = Sanitizer.integer(
      this.#outgoingAuthenticationMethod.value
    );

    return config;
  }

  /**
   * Returns an AccountConfig object with any missing fields that were not
   * not part of the manual config form, as well as additional fields required
   * by the backend account creator.
   *
   * @returns {AccountConfig}
   */
  getCompleteConfig() {
    const result = this.#currentConfig.copy();

    AccountConfig.replaceVariables(
      result,
      this.#realName.value,
      this.#email.value,
      this.#password.value
    );

    return result;
  }

  /**
   * Called when the "Continue" button is pressed after manual account form
   * fields are complete (or email password form is complete).
   */
  onContinue() {
    gAccountSetupLogger.debug("Create button clicked.");

    const completeConfig = this.getCompleteConfig();
    // TODO: Open security warning dialog before resuming account creation.

    try {
      this.validateAndFinish(completeConfig);
    } catch (error) {
      // TODO: Show custom error notification for account creation error.
    }
  }

  /**
   * Called from the "onContinue" function, does final validation on the
   * the complete config that is provided by the user and modified by helper.
   *
   * @param {AccountConfig} completeConfig - The completed config
   */
  async validateAndFinish(completeConfig) {
    if (
      completeConfig.incoming.type == "exchange" &&
      "addonAccountType" in completeConfig.incoming
    ) {
      completeConfig.incoming.type = completeConfig.incoming.addonAccountType;
    }

    if (CreateInBackend.checkIncomingServerAlreadyExists(completeConfig)) {
      // TODO: Return an error notification if the incoming server already exists.
      return;
    }

    if (completeConfig.outgoing.addThisServer) {
      const existingServer =
        CreateInBackend.checkOutgoingServerAlreadyExists(completeConfig);
      if (existingServer) {
        completeConfig.outgoing.addThisServer = false;
        completeConfig.outgoing.existingServerKey = existingServer.key;
      }
    }

    this.clearNotifications();
    this.initUI("loading");

    const telemetryKey =
      this.#currentConfig.source == AccountConfig.kSourceXML ||
      this.#currentConfig.source == AccountConfig.kSourceExchange
        ? this.#currentConfig.subSource
        : this.#currentConfig.source;

    // This verifies the the current config and, if needed, opens up an
    // additional window for authentication.
    this.#configVerifier = new ConfigVerifier(window.msgWindow);

    try {
      const successfulConfig = await this.#configVerifier.verifyConfig(
        completeConfig,
        completeConfig.source != AccountConfig.kSourceXML
      );
      // The auth might have changed, so we should update the current config.
      this.#currentConfig.incoming.auth = successfulConfig.incoming.auth;
      this.#currentConfig.outgoing.auth = successfulConfig.outgoing.auth;
      this.#currentConfig.incoming.username =
        successfulConfig.incoming.username;
      this.#currentConfig.outgoing.username =
        successfulConfig.outgoing.username;

      // We loaded dynamic client registration, fill this data back in to the
      // config set.
      if (successfulConfig.incoming.oauthSettings) {
        this.#currentConfig.incoming.oauthSettings =
          successfulConfig.incoming.oauthSettings;
      }
      if (successfulConfig.outgoing.oauthSettings) {
        this.#currentConfig.outgoing.oauthSettings =
          successfulConfig.outgoing.oauthSettings;
      }

      this.#currentConfig = completeConfig;
      this.finishEmailAccountAddition(completeConfig);
      Glean.tb.successfulEmailAccountSetup[telemetryKey].add(1);
    } catch (error) {
      // If we get no message, then something other than VerifyLogon failed.

      // For an Exchange server, some known configurations can
      // be disabled (per user or domain or server).
      // Warn the user if the open protocol we tried didn't work.
      if (
        ["imap", "pop3"].includes(completeConfig.incoming.type) &&
        completeConfig.incomingAlternatives.some(i => i.type == "exchange")
      ) {
        // TODO: Show exchange config not verifiable error notification.
      } else {
        // const msg = e.message || e.toString();
        // TODO: Show account not created error notification.
      }
      this.#configVerifier.cleanup();
      this.initUI("manualEmail");

      Glean.tb.failedEmailAccountSetup[telemetryKey].add(1);
    }
  }

  /**
   * Created the account in the backend and starts loading messages. This
   * method also leads to the account added view where the user can add more
   * accounts (calendar, address book, etc.)
   * @param {AccountConfig} completeConfig - The completed config
   */
  async finishEmailAccountAddition(completeConfig) {
    gAccountSetupLogger.debug("Creating account in backend.");
    const emailAccount = await CreateInBackend.createAccountInBackend(
      completeConfig
    );
    emailAccount.incomingServer.getNewMessages(
      emailAccount.incomingServer.rootFolder,
      window.msgWindow,
      null
    );

    // Add custom text on view header for current user.
    this.querySelector("#accountAddedSubheader").textContent = this
      .#currentConfig.identity.realName
      ? this.#currentConfig.identity.realName +
        " " +
        this.#currentConfig.incoming.username
      : this.#currentConfig.incoming.username;

    this.#configVerifier.cleanup();
    this.initUI("emailAdded");
  }
  /**
   * Show an error notification in-case something went wrong.
   *
   * @param {string} titleStringID - The ID of the fluent string that needs to
   *   be attached to the title of the notification.
   * @param {string} textStringID - The ID of the fluent string that needs to
   *   be attached to the text area of the notification.
   */
  async showErrorNotification(titleStringID, textStringID) {
    gAccountSetupLogger.debug(
      `Status error: ${titleStringID}. ${textStringID}`
    );

    // Hide the notification bar.
    this.clearNotifications();

    // Fetch the fluent string.
    document.l10n.setAttributes(
      this.querySelector("#emailFormNotificationTitle"),
      titleStringID
    );

    this.querySelector("#emailFormNotification").hidden = false;

    if (textStringID) {
      this.querySelector("#emailFormNotificationToggle").hidden = false;

      document.l10n.setAttributes(
        this.querySelector("#emailFormNotificationText"),
        textStringID
      );
    } else {
      this.querySelector("#emailFormNotification").setAttribute(
        "aria-disabled",
        true
      );
    }
  }

  /**
   * Set the notification bar for the subview
   *
   * @param {string} subview - Subview for which bar is initialized.
   */
  setNotificationBar(subview) {
    const notificationBar = this.querySelector("#emailFormNotification");

    switch (subview) {
      case "email":
        this.querySelector("#emailFormHeader").append(notificationBar);
        break;
      case "manualEmail":
        this.querySelector("#manualConfigureEmailFormHeader").append(
          notificationBar
        );
        break;
      default:
        break;
    }
  }

  clearNotifications() {
    const notificationTitle = this.querySelector("#emailFormNotificationTitle");
    const notificationText = this.querySelector("#emailFormNotificationText");
    delete notificationText.dataset.l10nId;
    delete notificationTitle.dataset.l10nId;

    this.querySelector("#emailFormNotification").removeAttribute(
      "aria-disabled"
    );
    this.querySelector("#emailFormNotification").hidden = true;
    this.querySelector("#emailFormNotificationToggle").hidden = true;
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

    // Reset the footer icons to base two column buttons. We remove
    // center-column ( and can remove any additional column lengths ).
    const footerElementClassList = this.querySelector(
      "#accountHubEmailFooterMenu"
    ).classList;
    footerElementClassList.remove("center-column");
    footerElementClassList.add("two-columns");

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
        footerElementClassList.replace("two-columns", "center-column");
        this.#finishButton.hidden = false;

        // Add the footer buttons to the end of email added subview.
        footerButtons = this.querySelector("#accountHubEmailFooter");
        this.#emailAddedSubview.append(footerButtons);
        break;
      default:
        this.querySelector("#footerButtonsLeftColumn").hidden = true;
        this.querySelector("#footerButtonsCenterColumn").hidden = true;
        this.querySelector("#footerButtonsRightColumn").hidden = true;
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
