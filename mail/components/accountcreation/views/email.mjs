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

const { CancelledException, gAccountSetupLogger } = AccountCreationUtils;

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-step.mjs"; // eslint-disable-line import/no-unassigned-import
import "chrome://messenger/content/accountcreation/content/widgets/account-hub-footer.mjs"; // eslint-disable-line import/no-unassigned-import

class AccountHubEmail extends HTMLElement {
  /**
   * Email config footer.
   *
   * @type {HTMLElement}
   */
  #emailFooter;

  /**
   * Email auto config subview.
   *
   * @type {HTMLElement}
   */
  #emailAutoConfigSubview;

  /**
   * Email incoming config subview.
   *
   * @type {HTMLElement}
   */
  #emailIncomingConfigSubview;

  /**
   * Email incoming config subview.
   *
   * @type {HTMLElement}
   */
  #emailOutgoingConfigSubview;

  /**
   * Email added subview.
   *
   * @type {HTMLElement}
   */
  #emailAddedSubview;

  /**
   * Email config found subview.
   *
   * @type {HTMLElement}
   */
  #emailConfigFoundSubview;

  /**
   * Email add password subview.
   *
   * @type {HTMLElement}
   */
  #emailPasswordSubview;

  /**
   * Email sync accounts subview.
   *
   * @type {HTMLElement}
   */
  #emailSyncAccountsSubview;

  // TODO: Clean up excess global variables and use IDs in state instead.

  /**
   * Store methods to interrupt abortable operations like testing
   * a server configuration or installing an add-on.
   *
   * @type {Abortable}
   */
  // eslint-disable-next-line no-unused-private-class-members
  #abortable;

  /**
   * The current Account Config object based on the users form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * A Config Verifier object that verfies the currentConfig.
   *
   * @type {ConfigVerifier}
   */
  #configVerifier;

  /**
   * String of ID of current step in email flow.
   *
   * @type {String}
   */
  #currentState;

  /**
   * States of the email setup flow, based on the ID's of the steps in the
   * flow.
   *
   * @type {String}
   */
  #states = {
    autoConfigSubview: {
      id: "emailAutoConfigSubview",
      nextStep: "emailConfigFoundSubview",
      previousStep: "",
      customActionFluentID: "",
      subview: {},
      templateId: "email-auto-form",
    },
    emailConfigFoundSubview: {
      id: "emailConfigFoundSubview",
      nextStep: "emailPasswordSubview",
      previousStep: "autoConfigSubview",
      customActionFluentID: "",
      subview: {},
      templateId: "email-config-found",
    },
    emailPasswordSubview: {
      id: "emailPasswordSubview",
      nextStep: "emailSyncAccountsSubview",
      previousStep: "emailConfigFoundSubview",
      customActionFluentID: "",
      subview: {},
      templateId: "",
    },
    emailSyncAccountsSubview: {
      id: "emailSyncAccountsSubview",
      nextStep: "emailAddedSubview",
      previousStep: "",
      customActionFluentID: "",
      subview: {},
      templateId: "",
    },
    incomingConfigSubview: {
      id: "emailIncomingConfigSubview",
      nextStep: "emailOutgoingConfigSubview",
      previousStep: "",
      customActionFluentID: "",
      subview: {},
      templateId: "account-hub-email-manual-incoming-form",
    },
    outgoingConfigSubview: {
      id: "emailOutgoingConfigSubview",
      nextStep: "emailAddedSubview",
      previousStep: "emailIncomingConfigSubview",
      customActionFluentID: "account-hub-test-configuration",
      subview: {},
      templateId: "email-manual-outgoing-form",
    },
    emailAddedSubview: {
      id: "emailAddedSubview",
      nextStep: "",
      previousStep: "",
      customActionFluentID: "account-hub-add-new-email",
      subview: {},
      templateId: "",
    },
  };

  async connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    this.classList.add("account-hub-view");

    const template = document.getElementById("accountHubEmailSetup");
    this.appendChild(template.content.cloneNode(true));

    this.#emailAutoConfigSubview = this.querySelector(
      "#emailAutoConfigSubview"
    );
    this.#states.autoConfigSubview.subview = this.#emailAutoConfigSubview;
    this.#emailIncomingConfigSubview = this.querySelector(
      "#emailIncomingConfigSubview"
    );
    this.#states.incomingConfigSubview.subview =
      this.#emailIncomingConfigSubview;
    this.#emailOutgoingConfigSubview = this.querySelector(
      "#emailOutgoingConfigSubview"
    );
    this.#states.outgoingConfigSubview.subview =
      this.#emailOutgoingConfigSubview;

    this.#emailAddedSubview = this.querySelector("#emailAddedSubview");
    this.#states.emailAddedSubview.subview = this.#emailAddedSubview;
    this.#emailConfigFoundSubview = this.querySelector(
      "#emailConfigFoundSubview"
    );
    this.#states.emailConfigFoundSubview.subview =
      this.#emailConfigFoundSubview;
    this.#emailPasswordSubview = this.querySelector("#emailPasswordSubview");
    this.#states.emailPasswordSubview.subview = this.#emailPasswordSubview;
    this.#emailSyncAccountsSubview = this.querySelector(
      "#emailSyncAccountsSubview"
    );
    this.#states.emailSyncAccountsSubview.subview =
      this.#emailSyncAccountsSubview;

    this.#emailFooter = this.querySelector("account-hub-footer");
    this.#emailFooter.addEventListener("back", this);
    this.#emailFooter.addEventListener("forward", this);
    this.#emailFooter.addEventListener("custom", this);

    await this.#initUI("autoConfigSubview");
  }

  /**
   * Initialize the UI of one of the email setup subviews.
   *
   * @param {string} subview - Subview for which the UI is being inititialized.
   */
  async #initUI(subview) {
    this.#hideSubviews();
    this.#clearNotifications();
    this.#currentState = subview;
    await this.#loadTemplateScript(this.#states[subview].templateId);
    this.#states[subview].subview.hidden = false;
    this.#setFooterButtons();
  }

  /**
   * Initialize the UI of one of the email setup subviews.
   *
   * @param {string} templateId - ID of the template that needs to be loaded.
   */
  async #loadTemplateScript(templateId) {
    if (customElements.get(templateId)) {
      return Promise.resolve();
    }

    // eslint-disable-next-line no-unsanitized/method
    return import(
      `chrome://messenger/content/accountcreation/content/widgets/${templateId}.mjs`
    );
  }

  /**
   * Hide all of the subviews in the account hub email flow to show
   * whichever subview needs to be shown.
   */
  #hideSubviews() {
    this.#emailConfigFoundSubview.hidden = true;
    this.#emailSyncAccountsSubview.hidden = true;
    this.#emailPasswordSubview.hidden = true;
    this.#emailAddedSubview.hidden = true;
    this.#emailAutoConfigSubview.hidden = true;
    this.#emailIncomingConfigSubview.hidden = true;
    this.#emailOutgoingConfigSubview.hidden = true;
  }

  /**
   * Calls the clear notification method in the current step.
   */
  #clearNotifications() {
    if (this.#currentState) {
      const stateDetails = this.#states[this.#currentState];
      stateDetails.subview.clearNotifications();
    }
  }

  /**
   * Sets the footer buttons in the footer template
   */
  #setFooterButtons() {
    const stateDetails = this.#states[this.#currentState];
    this.#emailFooter.canBack(stateDetails.previousStep);
    this.#emailFooter.canForward(stateDetails.nextStep);
    this.#emailFooter.canCustom(stateDetails.customActionFluentID);
  }

  handleEvent(event) {
    const stateDetails = this.#states[this.#currentState];
    switch (event.type) {
      case "back":
        try {
          this.#handleBackAction(this.#currentState);
          this.#initUI(stateDetails.previousStep);
        } catch (error) {
          stateDetails.subview.showErrorNotification(error.title, error.text);
        }
        break;
      case "forward":
        try {
          const stateData = stateDetails.subview.captureState();
          this.#handleForwardAction(this.#currentState, stateData);
          this.#initUI(stateDetails.nextStep);
        } catch (error) {
          stateDetails.subview.showErrorNotification(error.title, error.text);
        }
        break;
      case "custom":
        try {
          this.#handleCustomAction(this.#currentState);
        } catch (error) {
          stateDetails.subview.showErrorNotification(error.title, error.text);
        }
        break;
      default:
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state when the back button
   * is pressed.
   *
   * @param {String} currentState - The current state of the email flow.
   */
  #handleBackAction(currentState) {
    switch (currentState) {
      case "incomingConfigSubview":
        break;
      case "outgoingConfigSubview":
        break;
      case "emailPasswordSubview":
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state when the forward
   * button is pressed.
   *
   * @param {String} currentState - The current state of the email flow.
   * @param {String} stateData - The current state data of the email flow.
   */
  #handleForwardAction(currentState, stateData) {
    switch (currentState) {
      case "autoConfigSubview":
        this.#findConfig(stateData);
        break;
      case "incomingConfigSubview":
        break;
      case "outgoingConfigSubview":
        break;
      case "emailConfigFoundSubview":
        break;
      case "emailPasswordSubview":
        break;
      case "emailSyncAccountsSubview":
        break;
      case "emailAddedSubview":
        break;
      default:
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state when the custom action
   * button is pressed.
   *
   * @param {String} currentState - The current state of the email flow.
   */
  #handleCustomAction(currentState) {
    switch (currentState) {
      case "outgoingConfigSubview":
        break;
      case "emailAddedSubview":
        break;
      default:
        break;
    }
  }

  /**
   * Finds an account configuration from the provided data if available.
   *
   * @param {String} configData - The form config data from initial email form.
   */
  #findConfig(configData) {
    const accountConfig = new AccountConfig();
    const emailSplit = configData.email.split("@");
    const emailLocal = Sanitizer.nonemptystring(emailSplit[0]);
    accountConfig.incoming.username = emailLocal;
    accountConfig.outgoing.username = emailLocal;
    // eslint-disable-next-line no-unused-vars
    const domain = configData.incomingHostName;

    //TODO: Complete the findConfig/guessConfig logic.
  }

  /**
   * Click handler for re-test button. Guesses the email account config after
   * a user has inputted all manual config fields and pressed re-test.
   */
  async testManualConfig() {
    // Clear error notifications.
    this.#clearNotifications();

    this.#abortable = GuessConfig.guessConfig(
      this.#currentConfig.domain,
      (type, hostname, port) => {
        gAccountSetupLogger.debug(
          `progress callback host: ${hostname}, port: ${port}, type: ${type}`
        );
      },
      // eslint-disable-next-line no-unused-vars
      config => {
        // This will validate and fill all of the form fields, as well as
        // enable the continue button.
        this.#abortable = null;
        // TODO: Update form fields for both incoming and outgoing here with
        // the config object.
      },
      error => {
        this.#abortable = null;

        // guessConfig failed.
        if (error instanceof CancelledException) {
          return;
        }
        gAccountSetupLogger.warn(`guessConfig failed: ${error}`);
        // Load the manual config view again and show an error notification.
        this.showErrorNotification("account-hub-find-settings-failed", "");
      },
      this.#currentConfig,
      this.#currentConfig.outgoing.existingServerKey ? "incoming" : "both"
    );
  }

  /**
   * Called when the "Continue" button is pressed after manual account form
   * fields are complete (or email password form is complete).
   */
  onContinue() {
    gAccountSetupLogger.debug("Create button clicked.");

    const completeConfig = this.#currentConfig;
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
      Glean.mail.successfulEmailAccountSetup[telemetryKey].add(1);
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

      Glean.mail.failedEmailAccountSetup[telemetryKey].add(1);
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

    this.#configVerifier.cleanup();
  }

  /**
   * Check if any operation is currently in process and return true only if we
   * can leave this view.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  reset() {
    // Reset saved for when additional accounts can be added in Account Hub.
  }
}

customElements.define("account-hub-email", AccountHubEmail);
