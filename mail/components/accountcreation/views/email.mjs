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

const { FindConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FindConfig.sys.mjs"
);

const { gAccountSetupLogger, SuccessiveAbortable, UserCancelledException } =
  AccountCreationUtils;

const l10n = new Localization(["messenger/accountcreation/accountSetup.ftl"]);

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
  abortable;

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
   * Boolean determining if the user has cancelled before the next step has
   * been completed. This is required in case the back button has been pressed
   * after abortable is able to cancel any network requests.
   *
   * @type {String}
   */
  #hasCancelled;

  /**
   * The email for the current user.
   *
   * @type {String}
   */
  #email;

  /**
   * The real name for the current user.
   *
   * @type {String}
   */
  #realName;

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
      forwardEnabled: false,
      customActionFluentID: "",
      subview: {},
      templateId: "email-auto-form",
    },
    emailConfigFoundSubview: {
      id: "emailConfigFoundSubview",
      nextStep: "emailPasswordSubview",
      previousStep: "autoConfigSubview",
      forwardEnabled: true,
      customActionFluentID: "",
      subview: {},
      templateId: "email-config-found",
    },
    emailPasswordSubview: {
      id: "emailPasswordSubview",
      nextStep: "emailSyncAccountsSubview",
      previousStep: "emailConfigFoundSubview",
      forwardEnabled: false,
      customActionFluentID: "",
      subview: {},
      templateId: "",
    },
    emailSyncAccountsSubview: {
      id: "emailSyncAccountsSubview",
      nextStep: "emailAddedSubview",
      previousStep: "",
      forwardEnabled: true,
      customActionFluentID: "",
      subview: {},
      templateId: "",
    },
    incomingConfigSubview: {
      id: "emailIncomingConfigSubview",
      nextStep: "outgoingConfigSubview",
      previousStep: "emailConfigFoundSubview",
      forwardEnabled: true,
      customActionFluentID: "",
      subview: {},
      templateId: "email-manual-incoming-form",
    },
    outgoingConfigSubview: {
      id: "emailOutgoingConfigSubview",
      nextStep: "emailAddedSubview",
      previousStep: "incomingConfigSubview",
      forwardEnabled: true,
      customActionFluentID: "account-hub-test-configuration",
      subview: {},
      templateId: "email-manual-outgoing-form",
    },
    emailAddedSubview: {
      id: "emailAddedSubview",
      nextStep: "",
      previousStep: "",
      forwardEnabled: true,
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
    this.#emailFooter.addEventListener("custom-footer-action", this);
    this.#emailAutoConfigSubview.addEventListener("config-updated", this);
    this.#emailIncomingConfigSubview.addEventListener("config-updated", this);
    this.#emailConfigFoundSubview.addEventListener("edit-configuration", this);
    this.#emailIncomingConfigSubview.addEventListener("advanced-config", this);
    this.#emailOutgoingConfigSubview.addEventListener("advanced-config", this);

    this.abortable = null;
    this.#hasCancelled = false;
    this.#currentConfig = {};
    this.#email = "";
    this.#realName = "";

    this.addEventListener("submit", this);

    this.ready = this.#initUI("autoConfigSubview");
    await this.ready;
  }

  /**
   * Initialize the UI of one of the email setup subviews.
   *
   * @param {string} subview - Subview for which the UI is being inititialized.
   */
  async #initUI(subview) {
    this.#stopLoading();
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

    // The footer forward button is disabled by default.
    if (stateDetails.forwardEnabled) {
      this.#emailFooter.toggleForwardDisabled(false);
    }
  }

  #loadingTimeout = null;

  /**
   * Show a loading notification and disable all inputs (except closing the
   * dialog). If the load takes too long, a spinner is overlaid.
   *
   * TODO: should be able to cancel some loads, if they're abortable.
   *
   * @param {string} loadingFluentId
   */
  #startLoading(loadingFluentId) {
    this.#states[this.#currentState].subview.showNotification({
      fluentTitleId: loadingFluentId,
      type: "info",
    });
    this.classList.add("busy");
    this.#states[this.#currentState].subview.disabled = true;
    this.#emailFooter.disabled = true;
    this.#loadingTimeout = setTimeout(() => {
      this.classList.add("spinner");
      this.#loadingTimeout = null;
    }, 3000);
  }

  /**
   * Stop loading, clearing the notification, restoring form controls and hiding
   * the spinner if it was visible.
   */
  #stopLoading() {
    if (!this.classList.contains("busy")) {
      return;
    }
    this.#clearNotifications();
    this.#states[this.#currentState].subview.disabled = false;
    this.#emailFooter.disabled = false;
    this.classList.remove("busy", "spinner");
    if (this.#loadingTimeout) {
      clearTimeout(this.#loadingTimeout);
      this.#loadingTimeout = null;
    }
  }

  /**
   * Handle the events from the subviews.
   *
   * @param {Event} event
   */
  async handleEvent(event) {
    const stateDetails = this.#states[this.#currentState];
    switch (event.type) {
      case "back":
        try {
          this.#handleBackAction(this.#currentState);
          this.#initUI(
            this.#hasCancelled ? this.#currentState : stateDetails.previousStep
          );
        } catch (error) {
          stateDetails.subview.showNotification({
            title: error.cause.code,
            description: error.cause.text,
            error,
            type: "error",
          });
        }
        break;
      case "submit":
        event.preventDefault();
        if (!event.target.checkValidity()) {
          return;
        }
      // Fall through to handle like forward event.
      case "forward":
        try {
          this.#hasCancelled = false;
          const stateData = stateDetails.subview.captureState();
          await this.#handleForwardAction(this.#currentState, stateData);
          // Apply the new state data to the new state by passing a deep copy.
          // We pass a deep copy because this controller's #currentConfig should
          // only be updated when appropriate.
          const config = this.#currentConfig.copy();
          this.#states[this.#currentState].subview.setState(config);
        } catch (error) {
          this.#handleAbortable();
          stateDetails.subview.showNotification({
            title: error.title || error.message,
            description: error.text,
            type: "error",
          });
        }
        break;
      case "custom-footer-action":
        try {
          await this.#handleCustomAction(this.#currentState, event);
        } catch (error) {
          stateDetails.subview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "edit-configuration":
        this.#currentConfig = this.#fillAccountConfig(
          stateDetails.subview.captureState()
        );
        // The edit configuration button was pressed.
        await this.#initUI("incomingConfigSubview");
        // Apply the current state data to the new state.
        this.#states[this.#currentState].subview.setState(this.#currentConfig);
        break;
      case "config-updated":
        try {
          this.#emailFooter.toggleForwardDisabled(!event.detail.completed);
        } catch (error) {
          stateDetails.subview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "advanced-config":
        try {
          let stateData =
            this.#states[this.#currentState].subview.captureState().config;
          if (this.#currentState === "outgoingConfigSubview") {
            stateData = this.#states[this.#currentState].subview.captureState();
            stateData.incoming =
              this.#states.incomingConfigSubview.subview.captureState().config.incoming;
          }
          stateData = this.#fillAccountConfig(stateData);
          await this.#advancedSetup(stateData);
        } catch (error) {
          stateDetails.subview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
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
      case "autoConfigSubview":
        this.#hasCancelled = true;
        this.#handleAbortable();
        break;
      case "incomingConfigSubview":
        break;
      case "outgoingConfigSubview":
        break;
      case "emailPasswordSubview":
        break;
      default:
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state when the forward
   * button is pressed.
   *
   * @param {String} currentState - The current state of the email flow.
   * @param {Object} stateData - The current state data of the email flow.
   */
  async #handleForwardAction(currentState, stateData) {
    switch (currentState) {
      case "autoConfigSubview":
        this.#startLoading("account-hub-lookup-email-configuration-title");
        try {
          this.#emailFooter.canBack(true);
          this.#email = stateData.email;
          this.#realName = stateData.realName;
          const config = await this.#findConfig();
          // The config is null if guessConfig couldn't find anything, or is
          // cancelled. At this point we determine if the user actually
          // cancelled, move to the manual config form to get them to fill in
          // details, or move forward to the next step.
          if (!config) {
            if (!this.#hasCancelled) {
              this.#currentConfig = this.#fillAccountConfig(
                this.#getEmptyAccountConfig()
              );
              this.#stopLoading();
              await this.#initUI("incomingConfigSubview");
              this.#states[this.#currentState].previousStep =
                "autoConfigSubview";
              this.#states[this.#currentState].subview.showNotification({
                fluentTitleId: "account-hub-find-settings-failed",
                type: "warning",
              });
              break;
            }
            this.#hasCancelled = false;
            this.#stopLoading();
            break;
          }
          this.#currentConfig = this.#fillAccountConfig(config);
          this.#stopLoading();
          await this.#initUI(this.#states[this.#currentState].nextStep);
          this.#states.incomingConfigSubview.previousStep =
            "emailConfigFoundSubview";
          this.#states[this.#currentState].subview.showNotification({
            fluentTitleId: "account-hub-config-success",
            type: "success",
          });
        } catch (error) {
          this.#emailFooter.canBack(false);
          this.#stopLoading();
          if (!(error instanceof UserCancelledException)) {
            // TODO: Throw proper error here;
            throw error;
          }
        }
        break;
      case "incomingConfigSubview":
        await this.#initUI(this.#states[this.#currentState].nextStep);
        // We disable the continue button as the user needs click test to
        // ensure that the config is correct and complete, unless they don't
        // edit the previous config.
        this.#emailFooter.toggleForwardDisabled(stateData.edited);
        // TODO: Validate incoming config details.
        break;
      case "outgoingConfigSubview":
        // Move to the password stage where validateAndFinish is run.

        await this.#initUI(this.#states[this.#currentState].nextStep);
        // TODO: Validate outgoing config details.
        this.#states[this.#currentState].subview.showNotification({
          fluentTitleId: "account-hub-password-info",
          type: "info",
        });
        break;
      case "emailConfigFoundSubview":
        this.#states[this.#currentState].subview.showNotification({
          fluentTitleId: "account-hub-password-info",
          type: "info",
        });
        break;
      case "emailPasswordSubview":
        this.#states[this.#currentState].subview.showNotification({
          fluentTitleId: "account-hub-sync-success",
          type: "success",
        });
        break;
      case "emailSyncAccountsSubview":
        this.#states[this.#currentState].subview.showNotification({
          fluentTitleId: "account-hub-email-added-success",
          type: "success",
        });
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
  async #handleCustomAction(currentState) {
    let stateData;
    switch (currentState) {
      case "incomingConfigSubview":
        break;
      case "outgoingConfigSubview":
        this.#startLoading("account-hub-adding-account-subheader");
        stateData = this.#states[this.#currentState].subview.captureState();
        stateData.incoming =
          this.#states.incomingConfigSubview.subview.captureState().config.incoming;
        stateData = this.#fillAccountConfig(stateData);
        try {
          const config = await this.#guessConfig(
            this.#email.split("@")[1],
            stateData
          );

          if (config.isComplete()) {
            this.#stopLoading();
            this.#states[this.#currentState].subview.showNotification({
              fluentTitleId: "account-hub-config-test-scucess",
              type: "success",
            });
            this.#emailFooter.toggleForwardDisabled(false);
          } else {
            this.#stopLoading();
            // The config is not complete, go back to the incoming view and
            // show an error.
            this.#initUI(this.#states[this.#currentState].previousStep);
            // TODO: Show error message here.
            this.#states[this.#currentState].subview.showNotification({
              fluentTitleId: "account-hub-find-settings-failed",
              type: "error",
            });
          }
        } catch (error) {
          this.#stopLoading();
          this.#initUI(this.#states[this.#currentState].previousStep);
          // TODO: Show error message here.
          this.#states[this.#currentState].subview.showNotification({
            fluentTitleId: "account-hub-find-settings-failed",
            error,
            type: "error",
          });
        }
        break;
      case "emailAddedSubview":
        break;
      default:
        break;
    }
  }

  /**
   * Handles aborting the current action that is loading.
   */
  #handleAbortable() {
    if (this.abortable) {
      this.abortable.cancel(new UserCancelledException());
      this.abortable = null;
    }
  }

  /**
   * Finds an account configuration from the provided data if available.
   *
   */
  async #findConfig() {
    if (this.abortable) {
      this.#handleAbortable();
    }

    const emailSplit = this.#email.split("@");
    const domain = emailSplit[1];
    const initialConfig = new AccountConfig();
    const emailLocal = Sanitizer.nonemptystring(emailSplit[0]);
    initialConfig.incoming.username = emailLocal;
    initialConfig.outgoing.username = emailLocal;

    gAccountSetupLogger.debug("findConfig()");
    this.abortable = new SuccessiveAbortable();
    let config = null;

    try {
      config = await FindConfig.parallelAutoDiscovery(
        this.abortable,
        domain,
        this.#email
      );
    } catch (error) {
      // Error would be thrown if autoDiscovery caused a 401 error.
      throw new Error(error, {
        cause: {
          code: "401 Error",
        },
      });
    }

    this.abortable = null;

    if (!config) {
      try {
        config = await this.#guessConfig(domain, initialConfig);
      } catch (error) {
        // We are returning the initial null config here, as guessConfig does
        // not discern errors and always moves to manual config if nothing is
        // found.
        return config;
      }
    }

    return config;
  }

  /**
   * Guess an account configuration with the provided domain.
   *
   * @param {String} domain - The domain from the email address.
   * @param {AccountConfig} initialConfig - Account Config object.
   */
  #guessConfig(domain, initialConfig) {
    let configType = "both";

    if (initialConfig.outgoing?.existingServerKey) {
      configType = "incoming";
    }

    const { promise, resolve, reject } = Promise.withResolvers();
    this.abortable = GuessConfig.guessConfig(
      domain,
      (type, hostname, port, socketType) => {
        // The guessConfig search progress is ongoing.
        gAccountSetupLogger.debug(
          `${hostname}:${port} socketType=${socketType} ${type}: progress callback`
        );
      },
      config => {
        // The guessConfig was successful.
        this.abortable = null;
        resolve(config);
      },
      e => {
        gAccountSetupLogger.warn(`guessConfig failed: ${e}`);
        reject(e);

        this.#states[this.#currentState].subview.showNotification({
          fluentTitleId: "account-hub-find-settings-failed",
          error: e,
          type: "error",
        });
        this.abortable = null;
      },
      initialConfig,
      configType
    );

    return promise;
  }

  /**
   * Only active in manual edit mode, and goes straight into
   * Account Settings tab. Requires a backend account,
   * which requires proper hostname, port and protocol.
   *
   * @param {AccountConfig} accountConfig - Account Config object.
   */
  async #advancedSetup(accountConfig) {
    if (CreateInBackend.checkIncomingServerAlreadyExists(accountConfig)) {
      throw new Error({
        title: "account-setup-creation-error-title",
        description: "account-setup-error-server-exists",
      });
    }

    const [title, description] = await l10n.formatValues([
      "account-setup-confirm-advanced-title",
      "account-setup-confirm-advanced-description",
    ]);

    // TODO: Create a custom styled dialog instead of using the old one.
    if (!Services.prompt.confirm(null, title, description)) {
      return;
    }

    gAccountSetupLogger.debug("Creating account in backend.");
    const newAccount = await CreateInBackend.createAccountInBackend(
      accountConfig
    );

    this.#moveToAccountManager(newAccount.incomingServer);
  }

  /**
   * Adds name and email address to AccountConfig object.
   *
   * @param {AccountConfig} accountConfig - AccountConfig from findConfig().
   * @param {String} password - The password for the account.
   *
   * @returns {AccountConfig} - The concrete AccountConfig object.
   */
  #fillAccountConfig(configData, password = "") {
    AccountConfig.replaceVariables(
      configData,
      this.#realName,
      this.#email,
      password
    );

    return configData;
  }

  /**
   * Called when guessConfig fails and we need to provide manual config a
   * default AccountConfig.
   */
  #getEmptyAccountConfig() {
    const config = new AccountConfig();
    config.incoming.type = "imap";
    config.incoming.username = "%EMAILADDRESS%";
    config.outgoing.username = "%EMAILADDRESS%";
    config.incoming.hostname = ".%EMAILDOMAIN%";
    config.outgoing.hostname = ".%EMAILDOMAIN%";

    return config;
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
   * Request the opening of the account manager after the creation of a new
   * account and reset any leftover data in the current setup flow.
   *
   * @param {Object} data - The data passed to the template.
   */
  #moveToAccountManager(data) {
    this.dispatchEvent(
      new CustomEvent("request-close", {
        bubbles: true,
      })
    );
    // eslint-disable-next-line no-undef
    MsgAccountManager("am-server.xhtml", data);
    this.reset();
  }

  /**
   * Check if any operation is currently in process and return true only if we
   * can leave this view.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  reset() {
    if (this.abortable) {
      return false;
    }

    this.#stopLoading();
    this.#currentState = "autoConfigSubview";
    this.#currentConfig = {};
    this.#hideSubviews();
    this.#clearNotifications();
    this.#states[this.#currentState].subview.hidden = false;
    this.#setFooterButtons();
    this.#states[this.#currentState].subview.resetState();
    this.#emailFooter.toggleForwardDisabled(true);
    return true;
  }
}

customElements.define("account-hub-email", AccountHubEmail);
