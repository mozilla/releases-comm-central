/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {
  AccountCreationUtils: {
    gAccountSetupLogger,
    UserCancelledException,
    AddonInstaller,
    abortableTimeout,
  },
} = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs"
);

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.sys.mjs",
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
  RemoteAddressBookUtils:
    "resource:///modules/accountcreation/RemoteAddressBookUtils.sys.mjs",
  CreateInBackend:
    "resource:///modules/accountcreation/CreateInBackend.sys.mjs",
  ConfigVerifier: "resource:///modules/accountcreation/ConfigVerifier.sys.mjs",
  FindConfig: "resource:///modules/accountcreation/FindConfig.sys.mjs",
  GuessConfig: "resource:///modules/accountcreation/GuessConfig.sys.mjs",
  OAuth2Module: "resource:///modules/OAuth2Module.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
  getAddonsList:
    "resource:///modules/accountcreation/ExchangeAutoDiscover.sys.mjs",
});

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/accountcreation/accountSetup.ftl"], true)
);

import "chrome://messenger/content/accountcreation/content/widgets/account-hub-step.mjs"; // eslint-disable-line import/no-unassigned-import
import "chrome://messenger/content/accountcreation/content/widgets/account-hub-footer.mjs"; // eslint-disable-line import/no-unassigned-import

class AuthenticationRequiredError extends Error {}

class UserSkippedError extends Error {}

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

  /**
   * Email added success subview.
   *
   * @type {HTMLElement}
   */
  #emailAddedSuccessSubview;

  /**
   * Email credentials confirmation subview.
   *
   * @type {HTMLElement}
   */
  #emailCredentialsConfirmationSubview;

  // TODO: Clean up excess global variables and use IDs in state instead.

  /**
   * Store methods to interrupt abortable operations like testing
   * a server configuration or installing an add-on.
   *
   * @type {AbortController}
   */
  #abortController;

  /**
   * The current Account Config object based on the users form inputs.
   *
   * @type {AccountConfig}
   */
  #currentConfig;

  /**
   * A Config Verifier object that verifies the currentConfig.
   *
   * @type {ConfigVerifier}
   */
  #configVerifier;

  /**
   * String of ID of current step in email flow.
   *
   * @type {string}
   */
  #currentState;

  /**
   * The email for the current user.
   *
   * @type {string}
   */
  #email;

  /**
   * The real name for the current user.
   *
   * @type {string}
   */
  #realName;

  /**
   * Username used for Exchange Autodiscover.
   *
   * @type {string}
   */
  #exchangeUsername = "";

  /**
   * Stores FindConfig.parallelAutoDiscovery generator function.
   *
   * @type {Function}
   */
  #discoveryStream = null;

  /**
   * Dictionary of confirmed 3rd party redirect domains, with the email
   * as the key, and target host as the value.
   *
   * @type {object}
   */
  #redirectAccepted = {};

  /**
   * States of the email setup flow, based on the ID's of the steps in the
   * flow.
   *
   * @type {object}
   */
  #states = {
    autoConfigSubview: {
      id: "emailAutoConfigSubview",
      nextStep: "emailConfigFoundSubview",
      previousStep: "",
      forwardEnabled: false,
      customActionFluentID: "",
      customBackFluentID: "account-hub-email-cancel-button",
      subview: {},
      templateId: "email-auto-form",
    },
    emailAutodiscoverAuthenticationSubview: {
      id: "emailAutodiscoverAuthenticationSubview",
      nextStep: "emailConfigFoundSubview",
      previousStep: "autoConfigSubview",
      forwardEnabled: false,
      customActionFluentID: "",
      subview: {},
      templateId: "email-authentication-form",
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
    emailCredentialsConfirmationSubview: {
      id: "emailCredentialsConfirmationSubview",
      nextStep: "emailConfigFoundSubview",
      previousStep: "autoConfigSubview",
      forwardEnabled: true,
      customActionFluentID: "",
      customBackFluentID: "account-hub-email-cancel-button",
      subview: {},
      templateId: "email-credentials-confirmation",
    },
    emailPasswordSubview: {
      id: "emailPasswordSubview",
      nextStep: "emailSyncAccountsSubview",
      previousStep: "emailConfigFoundSubview",
      forwardEnabled: false,
      customActionFluentID: "",
      subview: {},
      templateId: "email-password-form",
    },
    emailSyncAccountsSubview: {
      id: "emailSyncAccountsSubview",
      nextStep: "emailAddedSuccessSubview",
      previousStep: "emailAddedSuccessSubview",
      forwardEnabled: true,
      customActionFluentID: "",
      customBackFluentID: "account-hub-email-skip-button",
      subview: {},
      templateId: "email-sync-accounts-form",
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
      nextStep: "emailPasswordSubview",
      previousStep: "incomingConfigSubview",
      forwardEnabled: true,
      customActionFluentID: "account-hub-test-configuration",
      subview: {},
      templateId: "email-manual-outgoing-form",
    },
    emailAddedSuccessSubview: {
      id: "emailAddedSuccessSubview",
      nextStep: true,
      previousStep: "",
      forwardEnabled: true,
      customForwardFluentID: "account-hub-email-finish-button",
      customActionFluentID: "account-hub-add-new-email",
      subview: {},
      templateId: "email-added-success",
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

    this.#emailConfigFoundSubview = this.querySelector(
      "#emailConfigFoundSubview"
    );
    this.#states.emailConfigFoundSubview.subview =
      this.#emailConfigFoundSubview;
    this.#emailPasswordSubview = this.querySelector("#emailPasswordSubview");
    this.#states.emailPasswordSubview.subview = this.#emailPasswordSubview;
    this.#states.emailAutodiscoverAuthenticationSubview.subview =
      this.querySelector("#emailAutodiscoverAuthenticationSubview");
    this.#emailSyncAccountsSubview = this.querySelector(
      "#emailSyncAccountsSubview"
    );
    this.#states.emailSyncAccountsSubview.subview =
      this.#emailSyncAccountsSubview;

    this.#emailAddedSuccessSubview = this.querySelector(
      "#emailAddedSuccessSubview"
    );
    this.#states.emailAddedSuccessSubview.subview =
      this.#emailAddedSuccessSubview;

    this.#emailCredentialsConfirmationSubview = this.querySelector(
      "#emailCredentialsConfirmationSubview"
    );
    this.#states.emailCredentialsConfirmationSubview.subview =
      this.#emailCredentialsConfirmationSubview;

    this.#emailFooter = this.querySelector("account-hub-footer");
    this.#emailFooter.addEventListener("back", this);
    this.#emailFooter.addEventListener("forward", this);
    this.#emailFooter.addEventListener("custom-footer-action", this);
    this.#emailAutoConfigSubview.addEventListener("config-updated", this);
    this.#emailAutoConfigSubview.addEventListener("edit-configuration", this);
    this.#emailIncomingConfigSubview.addEventListener("config-updated", this);
    this.#emailOutgoingConfigSubview.addEventListener("config-updated", this);
    this.#emailPasswordSubview.addEventListener("config-updated", this);
    this.#emailConfigFoundSubview.addEventListener("edit-configuration", this);
    this.#emailConfigFoundSubview.addEventListener("config-updated", this);
    this.#emailConfigFoundSubview.addEventListener("install-addon", this);
    this.#emailIncomingConfigSubview.addEventListener("advanced-config", this);
    this.#emailOutgoingConfigSubview.addEventListener("advanced-config", this);
    this.#states.emailAutodiscoverAuthenticationSubview.subview.addEventListener(
      "config-updated",
      this
    );
    this.#emailCredentialsConfirmationSubview.addEventListener(
      "edit-configuration",
      this
    );

    this.#abortController = null;
    this.#currentConfig = null;
    this.#email = "";
    this.#realName = "";

    this.addEventListener("submit", this);

    this.ready = this.#initUI("autoConfigSubview");
    await this.ready;
    this.#emailAutoConfigSubview.setState();
  }

  /**
   * Returns the subview of the current state.
   *
   * @returns {HTMLElement} The current subview.
   */
  get #currentSubview() {
    return this.#states[this.#currentState].subview;
  }

  /**
   * Handle for async operation that's cancellable. Setting the abortable
   * property updates the hidden state of the cancel button.
   *
   * @type {?AbortController}
   */
  set abortable(abortController) {
    const stateDetails = this.#states[this.#currentState];
    this.#emailFooter.canBack(abortController || stateDetails.previousStep);
    this.#emailFooter.setDirectionalButtonText(
      "back",
      abortController
        ? "account-hub-email-cancel-button"
        : "account-hub-email-back-button"
    );
    this.#abortController = abortController;
  }

  get abortable() {
    return this.#abortController;
  }

  /**
   * Handles aborting the current action that is loading. If we are waiting
   * for a redirect confirmation, the redirect is rejected.
   */
  #handleAbortable() {
    if (AbortController.isInstance(this.abortable)) {
      // We don't clear the abortable here because we need to check if the
      // abortable has aborted when using an AbortController. It is cleared
      // after the check.
      this.abortable.abort(new UserSkippedError());
    }

    this.#stopLoading();

    // If the findConfig() async generator is waiting for a response, we reset
    // the disoveryStream. Because we've aborted the autodiscovery before this,
    // any network requests will have already been cancelled.
    if (this.#discoveryStream) {
      // Allow the discovery stream to handle the abort.
      this.#discoveryStream
        .next({ acceptRedirect: false })
        .catch(error => gAccountSetupLogger.debug(error));
      this.#discoveryStream = null;
    }
  }

  /**
   * Initialize the UI of one of the email setup subviews.
   *
   * @param {string} subview - Subview for which the UI is being initialized.
   */
  async #initUI(subview) {
    this.#hideSubviews();
    this.#clearNotifications();
    this.#currentState = subview;
    await this.#loadTemplateScript(this.#states[subview].templateId);
    // Always dispatch the maximized event to ensure that the account hub is
    // fully visible when we change subview.
    this.dispatchEvent(
      new CustomEvent("request-maximize", {
        bubbles: true,
      })
    );
    this.#currentSubview.hidden = false;
    this.#setFooterButtons();
  }

  /**
   * Load a template of a subview using the template ID.
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
    this.#emailAddedSuccessSubview.hidden = true;
    this.#emailAutoConfigSubview.hidden = true;
    this.#emailIncomingConfigSubview.hidden = true;
    this.#emailOutgoingConfigSubview.hidden = true;
    this.#emailCredentialsConfirmationSubview.hidden = true;
    this.#states.emailAutodiscoverAuthenticationSubview.subview.hidden = true;
  }

  /**
   * Calls the clear notification method in the current step.
   */
  #clearNotifications() {
    if (this.#currentState) {
      this.#currentSubview.clearNotifications?.();
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
    this.#emailFooter.setDirectionalButtonText(
      "forward",
      stateDetails.customForwardFluentID
    );
    this.#emailFooter.setDirectionalButtonText(
      "back",
      stateDetails.customBackFluentID
    );

    // The footer forward button is disabled by default.
    this.#emailFooter.toggleForwardDisabled(!stateDetails.forwardEnabled);
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
    this.#clearNotifications();
    this.#states[this.#currentState].subview.disabled = false;
    this.#emailFooter.disabled = false;
    if (this.#loadingTimeout) {
      clearTimeout(this.#loadingTimeout);
      this.#loadingTimeout = null;
    }
    this.classList.remove("busy", "spinner");
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
          // We handle the back action within the credentials confirmation
          // subview as continue with rejecting the redirect host, if we're not
          // loading (the user hasn't selected continue). If we're loading,
          // cancel all operations and go back to the autoConfigSubview.
          if (this.#currentState == "emailCredentialsConfirmationSubview") {
            if (this.classList.contains("busy")) {
              this.#handleAbortable();
              this.abortable = null;
              await this.#initUI(stateDetails.previousStep);
            }
            await this.#handleBackAction(this.#currentState);
            break;
          }

          // If there is an ongoing operation, we should just cancel the
          // abortable and stay in the current subview.
          if (this.abortable) {
            this.#handleAbortable();
            this.abortable = null;
            break;
          }

          // Show the previous step and handle any clean up required for that
          // step.
          await this.#initUI(stateDetails.previousStep);
          await this.#handleBackAction(this.#currentState);
        } catch (error) {
          this.#handleAbortable();
          this.abortable = null;
          this.#currentSubview.showNotification({
            title: error.title || error.message,
            description: error.text,
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
          const stateData = this.#currentSubview.captureState?.();
          await this.#handleForwardAction(this.#currentState, stateData);
        } catch (error) {
          this.#handleAbortable();
          this.abortable = null;
          this.#currentSubview.showNotification({
            title: error.title || error.message,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "custom-footer-action":
        try {
          await this.#handleCustomAction(this.#currentState, event);
        } catch (error) {
          this.#currentSubview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "edit-configuration": {
        if (this.#currentState == "autoConfigSubview") {
          const stateData = this.#currentSubview.captureState();
          this.#email = stateData.email;
          this.#realName = stateData.realName;
          this.#exchangeUsername = "";
        }

        // If we are in this step, we already have email and realName set.
        if (this.#currentState == "emailCredentialsConfirmationSubview") {
          this.#handleAbortable();
          this.abortable = null;
        }

        const configData =
          this.#currentState == "emailConfigFoundSubview"
            ? this.#currentSubview.captureState()
            : this.#getEmptyAccountConfig();
        this.#currentConfig = this.#fillAccountConfig(configData);

        const prevStep =
          this.#currentState == "emailConfigFoundSubview"
            ? "emailConfigFoundSubview"
            : "autoConfigSubview";

        await this.#initUI("incomingConfigSubview");

        this.#states[this.#currentState].previousStep = prevStep;
        // Apply the current state data to the new state.
        this.#currentSubview.setState(this.#currentConfig);
        break;
      }
      case "config-updated":
        try {
          this.#emailFooter.toggleForwardDisabled(!event.detail.completed);
        } catch (error) {
          this.#currentSubview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "advanced-config":
        try {
          let stateData = this.#currentSubview.captureState();

          if (this.#currentState === "incomingConfigSubview") {
            // captureState in incoming returns an object with the config prop.
            stateData = stateData.config;
          }

          // If we couldn't find a configuration when directed to manual
          // config, the default config doesn't have an outgoing type.
          if (!stateData.isExchangeConfig() && !stateData.outgoing.type) {
            stateData.outgoing.type = "smtp";
          }

          const config = this.#fillAccountConfig(stateData);
          await this.#advancedSetup(config);
        } catch (error) {
          this.#currentSubview.showNotification({
            title: error.title,
            description: error.text,
            error,
            type: "error",
          });
        }
        break;
      case "install-addon":
        try {
          this.#startLoading("account-setup-installing-addon");
          await this.#installAddon();
          // Update the add-on state in the found config list.
          this.#currentSubview.setAddon();
          this.#emailFooter.toggleForwardDisabled(false);
        } catch (error) {
          this.#currentSubview.showNotification({
            fluentTitleId: "account-hub-addon-error",
            error,
            type: "error",
          });
        }
        this.#stopLoading();
        this.#currentSubview.showNotification({
          fluentTitleId: "account-setup-success-addon",
          type: "success",
        });
        break;
      default:
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state after the back/cancel
   * button is pressed.
   *
   * @param {string} currentState - The current state of the email flow.
   */
  async #handleBackAction(currentState) {
    switch (currentState) {
      case "autoConfigSubview":
        this.#currentSubview.checkValidEmailForm();
        // Focus on the correct input in the auto config subview.
        this.#currentSubview.setState();
        break;
      case "emailCredentialsConfirmationSubview":
        try {
          this.#startLoading("account-hub-lookup-email-configuration-title");

          // If we're in the credentials confirmation step, a cancel action
          // should send a rejection for the redirect host confirmation.
          const config = await this.#findConfig({ acceptRedirect: false });
          this.#stopLoading();

          if (!config) {
            this.#currentConfig = null;
            await this.#initFallbackConfigView("autoConfigSubview");
            break;
          }

          await this.#initConfigView(config);
        } catch (error) {
          if (error instanceof AuthenticationRequiredError) {
            // We already have a password, so the provided password or username
            // was probably wrong. Stay at the current step.
            if (this.#currentConfig?.hasPassword()) {
              throw error;
            }
            this.#initAutodiscoverAuthenticationView();
            break;
          }

          throw error;
        }

        break;
      case "incomingConfigSubview":
        // Set the currentConfig outgoing to the updated fields in the
        // outgoing form.
        this.#currentConfig.outgoing =
          this.#states.outgoingConfigSubview.subview.captureState().outgoing;
        this.#setCurrentConfigForSubview();
        break;
      case "outgoingConfigSubview":
        break;
      case "emailAutoconfigPasswordSubview":
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
   * @param {string} currentState - The current state of the email flow.
   * @param {object} stateData - The current state data of the email flow.
   */
  async #handleForwardAction(currentState, stateData) {
    switch (currentState) {
      case "autoConfigSubview":
        this.#startLoading("account-hub-lookup-email-configuration-title");

        // Reset state so this always ends up doing the same from the same
        // form inputs in the initial subview.
        this.#currentConfig = null;
        this.#exchangeUsername = "";

        try {
          this.#email = stateData.email;
          this.#realName = stateData.realName;

          let config = await this.#findConfig();
          this.#stopLoading();

          // If the config is null, the guessConfig couldn't find anything so
          // move to the manual config form to get them to fill in details,
          // or move forward to the next step.
          if (!config) {
            this.#currentConfig = null;
            await this.#initFallbackConfigView(currentState);
            break;
          }

          // If the autodiscovery requires confirmation to submit credentials,
          // we show the subview to confirm credentials submission.
          if (config.isRedirect) {
            if (this.#redirectAccepted[this.#email] == config.host) {
              config = await this.#findConfig({ acceptRedirect: true });
            } else {
              await this.#initUI("emailCredentialsConfirmationSubview");
              this.#currentSubview.setState({
                host: config.host,
                username: stateData.email,
                scheme: config.scheme,
              });
              this.#states[this.#currentState].previousStep =
                "autoConfigSubview";
              this.#currentSubview.showNotification({
                fluentTitleId: "account-hub-notification-unknown-host",
                type: "info",
              });
              break;
            }
          }

          this.#abortController = null;
          await this.#initConfigView(config);
          break;
        } catch (error) {
          if (error instanceof AuthenticationRequiredError) {
            // We already have a password, so the provided password or username
            // was probably wrong. Stay at the current step.
            if (this.#currentConfig?.hasPassword()) {
              throw error;
            }
            this.#initAutodiscoverAuthenticationView();
            break;
          }

          if (
            !(
              error instanceof UserCancelledException ||
              error instanceof UserSkippedError
            )
          ) {
            throw error;
          }
          break;
        }
      case "emailCredentialsConfirmationSubview":
        try {
          this.#startLoading("account-hub-lookup-email-configuration-title");
          this.#redirectAccepted[this.#email] = stateData.host;

          // The findConfig() async generator will continue with autodiscovery
          // as the user has accepted submitting their credentials.
          const config = await this.#findConfig({ acceptRedirect: true });

          this.#stopLoading();

          // If the config is null, the guessConfig couldn't find anything so
          // move to the manual config form to get them to fill in details,
          // or move forward to the next step.
          if (!config) {
            this.#currentConfig = null;
            await this.#initFallbackConfigView("autoConfigSubview");
            break;
          }

          await this.#initConfigView(config);
          break;
        } catch (error) {
          if (error instanceof AuthenticationRequiredError) {
            // We already have a password, so the provided password or username
            // was probably wrong. Stay at the current step.
            if (this.#currentConfig?.hasPassword()) {
              throw error;
            }
            this.#initAutodiscoverAuthenticationView();
            break;
          }

          if (
            !(
              error instanceof UserCancelledException ||
              error instanceof UserSkippedError
            )
          ) {
            throw error;
          }

          break;
        }
      case "emailAutodiscoverAuthenticationSubview":
        this.#startLoading("account-hub-lookup-email-configuration-title");

        try {
          // Get password and remember from the state and apply it to the config.
          this.#currentConfig = this.#fillAccountConfig(
            this.#getEmptyAccountConfig(),
            stateData.password
          );
          this.#currentConfig.rememberPassword = stateData.rememberPassword;
          this.#exchangeUsername = stateData.username;
          gAccountSetupLogger.debug("Retrying config discovery with password.");

          let config = await this.#findConfig();

          if (!config) {
            // Use the #currentConfig from before, which will already be an
            // empty config.
            await this.#initFallbackConfigView(currentState);
            break;
          }

          // If the autodiscovery requires confirmation to submit credentials,
          // we show the subview to confirm credentials submission.
          if (config.isRedirect) {
            if (this.#redirectAccepted[this.#email] == config.host) {
              config = await this.#findConfig({ acceptRedirect: true });
            } else {
              await this.#initUI("emailCredentialsConfirmationSubview");
              this.#currentSubview.setState({
                host: config.host,
                username: this.#exchangeUsername || this.#email,
                scheme: config.scheme,
              });
              this.#states[this.#currentState].previousStep =
                "emailAutodiscoverAuthenticationSubview";
              this.#currentSubview.showNotification({
                fluentTitleId: "account-hub-password-info",
                type: "info",
              });
              break;
            }
          }

          // Check if we have found an Exchange config we should tweak to make it work
          // with our native EWS support (and do so if that's the case).
          lazy.FindConfig.ewsifyConfig(config);

          this.#currentConfig = this.#fillAccountConfig(
            config,
            stateData.password
          );

          this.#currentConfig.rememberPassword = stateData.rememberPassword;
        } catch (error) {
          // Reset footer back button state.
          this.#emailFooter.canBack(true);

          if (
            !(
              error instanceof UserCancelledException ||
              error instanceof UserSkippedError
            )
          ) {
            // Stay on the password view.
            throw error;
          }
          break;
        } finally {
          this.#stopLoading();
        }

        await this.#initUI(this.#states[this.#currentState].nextStep);

        this.#showConfigFoundNotification();
        this.#setCurrentConfigForSubview();
        break;
      case "incomingConfigSubview":
        if (stateData.config.isExchangeConfig()) {
          await this.#validateAccountConfig(stateData.config);

          // If we are not in the password subview, that means the account
          // has been created and we can fetch the sync accounts.
          if (this.#currentState != "emailPasswordSubview") {
            await this.#fetchSyncAccounts();
          }

          break;
        }
        await this.#initUI(this.#states[this.#currentState].nextStep);
        if (this.#currentConfig?.hasPassword()) {
          stateData.config.incoming.password =
            this.#currentConfig.incoming.password;
        }
        this.#currentConfig.incoming = stateData.config.incoming;
        this.#setCurrentConfigForSubview();

        // We disable the continue button as the user needs click test to
        // ensure that the config is correct and complete, unless they don't
        // edit the incoming config.
        this.#emailFooter.toggleForwardDisabled(stateData.edited);
        // TODO: Validate incoming config details.
        break;
      case "emailConfigFoundSubview":
      case "outgoingConfigSubview":
        await this.#validateAccountConfig(stateData);

        // If we are not in the password subview, that means the account
        // has been created and we can fetch the sync accounts.
        if (this.#currentState != "emailPasswordSubview") {
          await this.#fetchSyncAccounts();
        }

        break;
      case "emailPasswordSubview":
        // Get password and remember from the state and apply it to the config.
        this.#currentConfig = this.#fillAccountConfig(
          this.#currentConfig,
          stateData.password
        );
        this.#currentConfig.rememberPassword = stateData.rememberPassword;

        await this.#createAccount("account-hub-creating-account");
        await this.#fetchSyncAccounts();

        break;
      case "emailSyncAccountsSubview":
        try {
          // Add the selected sync address books and calendars.
          this.#addSyncAccounts(stateData);

          await this.#initUI(this.#states[this.#currentState].nextStep);
          this.#currentSubview.setState(this.#currentConfig);
          this.#currentSubview.showNotification({
            fluentTitleId: "account-hub-email-added-success",
            type: "success",
          });
        } catch (error) {
          this.#currentSubview.showNotification({
            fluentTitleId: "account-hub-sync-accounts-failure",
            type: "error",
            error,
          });
        }
        break;
      case "emailAddedSuccessSubview":
        this.dispatchEvent(
          new CustomEvent("request-close", {
            bubbles: true,
          })
        );
        await this.reset();
        break;
      default:
        break;
    }
  }

  /**
   * Calls the appropriate method for the current state when the custom action
   * button is pressed.
   *
   * @param {string} currentState - The current state of the email flow.
   */
  async #handleCustomAction(currentState) {
    let stateData;
    switch (currentState) {
      case "incomingConfigSubview":
        break;
      case "outgoingConfigSubview":
        this.#startLoading("account-hub-adding-account-subheader");
        stateData = this.#currentSubview.captureState();
        stateData.incoming =
          this.#states.incomingConfigSubview.subview.captureState().config.incoming;
        stateData = this.#fillAccountConfig(stateData);
        try {
          const config = await this.#guessConfig(
            this.#email.split("@")[1],
            stateData
          );
          config.validateSocketType();

          if (config.isComplete()) {
            this.#stopLoading();
            this.#currentSubview.showNotification({
              fluentTitleId: "account-setup-success-half-manual",
              type: "success",
            });
            this.#emailFooter.toggleForwardDisabled(false);
            if (this.#currentConfig?.hasPassword()) {
              config.incoming.password = this.#currentConfig.incoming.password;
              config.outgoing.password = this.#currentConfig.outgoing.password;
            }
            // The config is complete, therefore we can set the currentConfig
            // as the complete config, and update the outgoing config with any
            // changes the guess config made.
            this.#currentConfig = config;
            this.#currentSubview.setState(config);
          } else {
            this.#stopLoading();
            // The config is not complete, go back to the incoming view and
            // show an error.
            this.#initUI(this.#states[this.#currentState].previousStep);
            this.#currentSubview.showNotification({
              fluentTitleId: "account-hub-find-account-settings-failed",
              type: "warning",
            });
          }
        } catch (error) {
          if (
            error instanceof UserCancelledException ||
            error instanceof UserSkippedError
          ) {
            break;
          }

          this.#stopLoading();
          this.#initUI(
            this.#states[this.#currentState].previousStep || this.#currentState
          );
          this.#currentSubview.showNotification({
            fluentTitleId: "account-setup-find-settings-failed",
            error,
            type: "error",
          });
        }
        break;
      case "emailAddedSuccessSubview":
        await this.reset();
        break;
      default:
        break;
    }
  }

  /**
   * Apply the new state data to the new state by passing a deep copy.
   * We pass a deep copy because this controller's #currentConfig should
   * only be updated when appropriate. (Eg. Updating incoming config and
   * going back should not show the edited fields in config found view).
   */
  #setCurrentConfigForSubview() {
    const config = this.#currentConfig.copy();
    this.#currentSubview.setState(config);
  }

  /**
   * Initialize the incoming config subview when we failed to find a valid
   * config.
   *
   * @param {string} currentState - Step name that's initializing the manual
   *   config subview.
   */
  async #initFallbackConfigView(currentState) {
    if (!this.#currentConfig) {
      this.#currentConfig = this.#fillAccountConfig(
        this.#getEmptyAccountConfig()
      );
    }
    await this.#initUI("incomingConfigSubview");
    this.#states[this.#currentState].previousStep = currentState;
    this.#currentSubview.showNotification({
      fluentTitleId: "account-hub-find-account-settings-failed",
      type: "warning",
    });
    this.#setCurrentConfigForSubview();
  }

  /**
   * Initialize config select subview when we've succesfully found a config.
   *
   * @param {AccountConfig} config - The account config found.
   */
  async #initConfigView(config) {
    this.#currentConfig = config;

    await this.#initUI(this.#states[this.#currentState].nextStep);

    this.#showConfigFoundNotification();

    this.#setCurrentConfigForSubview();
  }

  /**
   * Initialize autodiscover authentication view when we need a username and/or
   * a password.
   */
  async #initAutodiscoverAuthenticationView() {
    this.#stopLoading();
    await this.#initUI("emailAutodiscoverAuthenticationSubview");
    this.#currentSubview.setState();

    this.#currentSubview.showNotification({
      fluentTitleId: "account-hub-password-info",
      type: "info",
    });
  }

  /**
   * Finds an account configuration from the provided data if available.
   *
   * @param {object} [userFeedback] - If the user had to give feedback to a
   *   redirect, provide the answer in this object.
   *
   * @returns {?AccountConfig} @see AccountConfig.sys.mjs
   */
  async #findConfig(userFeedback) {
    const emailSplit = this.#email.split("@");
    const domain = emailSplit[1];
    gAccountSetupLogger.debug("findConfig()");
    let config, discoveryDone;

    // This can throw an error which will be caught up the call stack
    // to show the correct notification.
    try {
      if (!this.#discoveryStream) {
        if (this.abortable) {
          this.#handleAbortable();
        }

        this.abortable = new AbortController();

        this.#discoveryStream = lazy.FindConfig.parallelAutoDiscovery(
          domain,
          this.#email,
          this.abortable.signal,
          this.#currentConfig?.incoming.password ||
            this.#currentConfig?.outgoing.password,
          this.#exchangeUsername
        );
      }

      ({ value: config, done: discoveryDone } =
        await this.#discoveryStream.next(userFeedback));
    } catch (error) {
      discoveryDone = true;
      this.#discoveryStream = null;

      if (error.cause?.fluentTitleId === "account-setup-credentials-wrong") {
        throw new AuthenticationRequiredError(error.message, {
          cause: error.cause,
        });
      }
      throw error;
    } finally {
      // If the user hit cancel, but the abortable shows a completed status,
      // the null abortable should tell us to throw a cancelled exception.
      if (!this.abortable || this.abortable.signal.aborted) {
        // eslint-disable-next-line no-unsafe-finally
        throw new UserCancelledException();
      }

      if (discoveryDone) {
        this.abortable = null;
      }
    }

    if (!config) {
      try {
        const initialConfig = new lazy.AccountConfig();
        const emailLocal = lazy.Sanitizer.nonemptystring(emailSplit[0]);
        initialConfig.incoming.username = emailLocal;
        initialConfig.outgoing.username = emailLocal;

        config = await this.#guessConfig(domain, initialConfig);
      } catch (error) {
        this.#discoveryStream = null;
        if (
          error instanceof UserCancelledException ||
          error instanceof UserSkippedError
        ) {
          throw error;
        }
      }
    }

    if (config && !config.isRedirect) {
      try {
        config = await this.#getExchangeAddons(config);
      } catch (error) {
        this.#discoveryStream = null;
        if (
          error instanceof UserCancelledException ||
          error instanceof UserSkippedError
        ) {
          throw error;
        }
      }

      // Check if we have found an Exchange config we should tweak to make it work
      // with our native EWS support (and do so if that's the case).
      lazy.FindConfig.ewsifyConfig(config);

      config = this.#fillAccountConfig(config);
    }

    // Check if parallelAutoDiscovery has finished running.
    if (discoveryDone) {
      this.#discoveryStream = null;
      this.abortable = null;
    }

    return config;
  }

  /**
   * Guess an account configuration with the provided domain.
   *
   * @param {string} domain - The domain from the email address.
   * @param {AccountConfig} initialConfig - Account Config object.
   *
   * @returns {Promise} - A promise waiting for guessConfig to complete.
   */
  async #guessConfig(domain, initialConfig) {
    let configType = "both";

    if (initialConfig.outgoing?.existingServerKey) {
      configType = "incoming";
    }

    this.abortable = new AbortController();
    try {
      const config = await lazy.GuessConfig.guessConfig(
        domain,
        (type, hostname, port, socketType) => {
          // The guessConfig search progress is ongoing.
          gAccountSetupLogger.debug(
            `${hostname}:${port} socketType=${socketType} ${type}: progress callback`
          );
        },
        initialConfig,
        configType,
        this.abortable.signal
      );
      return config;
    } catch (error) {
      gAccountSetupLogger.warn(`guessConfig failed: ${error}`);
      throw error;
    } finally {
      this.abortable = null;
    }
  }

  /**
   * Only active in manual edit mode, and goes straight into
   * Account Settings tab. Requires a backend account,
   * which requires proper hostname, port and protocol.
   *
   * @param {AccountConfig} accountConfig - Account Config object.
   */
  async #advancedSetup(accountConfig) {
    if (lazy.CreateInBackend.checkIncomingServerAlreadyExists(accountConfig)) {
      throw new Error("Account already exists.", {
        cause: {
          fluentTitleId: "account-setup-creation-error-title",
          fluentDescriptionId: "account-setup-error-server-exists",
        },
      });
    }

    const [title, description] = await lazy.l10n.formatValues([
      "account-setup-confirm-advanced-title",
      "account-setup-confirm-advanced-description",
    ]);

    // TODO: Create a custom styled dialog instead of using the old one.
    if (!Services.prompt.confirm(null, title, description)) {
      return;
    }

    gAccountSetupLogger.debug("Creating account in backend.");
    const newAccount =
      await lazy.CreateInBackend.createAccountInBackend(accountConfig);

    await this.#moveToAccountManager(newAccount.incomingServer);
  }

  /**
   * Finalize the account config, validate it and start authentication.
   *
   * @param {AccountConfig} accountConfig
   */
  async #validateAccountConfig(accountConfig) {
    this.#currentConfig = this.#fillAccountConfig(accountConfig);

    if (this.#currentConfig.isOauthOnly()) {
      await this.#createAccount("account-hub-oauth-pending");
      return;
    }

    let creationError;
    if (this.#currentConfig.incoming.password) {
      try {
        await this.#createAccount("account-hub-creating-account");
        return;
      } catch (error) {
        // Show error in password view.
        creationError = error;
      }
    }

    const currentState = this.#currentState;
    // Move to the password stage where validateAndFinish is run.
    await this.#initUI("emailPasswordSubview");
    // The password step should now have the step we're coming from as its
    // previous step.
    this.#states[this.#currentState].previousStep = currentState;
    this.#currentSubview.setState();

    if (creationError) {
      this.#currentSubview.showNotification({
        title: creationError.title || creationError.message,
        description: creationError.text,
        error: creationError,
        type: "error",
      });
    } else {
      this.#currentSubview.showNotification({
        fluentTitleId: "account-hub-password-info",
        type: "info",
      });
    }
  }

  /**
   * Create account and advance to sync accounts step if successful.
   *
   * @param {string} loadReason - Fluent string ID with the load reason.
   */
  async #createAccount(loadReason) {
    this.#startLoading(loadReason);
    gAccountSetupLogger.debug("Create button clicked.");
    try {
      // We don't want the user to be able to cancel account creation here,
      // as the back button is available in this step. The next state doesn't
      // have a back button, so we don't need to reset it after.
      this.#emailFooter.canBack(false);
      await this.#validateAndFinish(this.#currentConfig.copy());
    } catch (error) {
      // Show the back button again if account creation failed.
      this.#emailFooter.canBack(true);
      throw error;
    } finally {
      this.#configVerifier?.cleanup();
      this.#stopLoading();
    }
  }

  /**
   * Fetch and show calendars and address books for the account.
   */
  async #fetchSyncAccounts() {
    try {
      this.#startLoading("account-hub-finding-sync-accounts");

      this.abortable = new AbortController();
      this.#emailFooter.setDirectionalButtonText(
        "back",
        "account-hub-email-skip-button"
      );
      const syncAccounts = {};
      // TODO: fetch address books and calendars in parallel?
      syncAccounts.addressBooks = await this.#getAddressBooks(
        this.#currentConfig.incoming.password ?? ""
      );

      // If the user hit cancel while loading, we won't fetch
      // the calendars and a UserSkippedError will be thrown.
      this.abortable.signal.throwIfAborted();

      // Add a 1 second delay here to give the users a chance to skip this
      // altogether.
      await abortableTimeout(1000, this.abortable.signal);

      syncAccounts.calendars = await this.#getCalendars(
        this.#currentConfig.incoming.password ?? "",
        false
      );

      // If the user hit cancel while loading, a UserSkippedError will be
      // thrown.
      this.abortable?.signal?.throwIfAborted();
      this.abortable = null;

      // If there are no syncable accounts, we should go to the email added
      // success view.
      if (
        !(syncAccounts.addressBooks.length || syncAccounts.calendars.length)
      ) {
        await this.#initUI("emailAddedSuccessSubview");
        this.#currentSubview.setState(this.#currentConfig);
        this.#currentSubview.showNotification({
          fluentTitleId: "account-hub-email-added-success",
          type: "success",
        });
      } else {
        await this.#initUI("emailSyncAccountsSubview");
        this.#currentSubview.setState(syncAccounts);
        this.#currentSubview.showNotification({
          fluentTitleId: "account-hub-sync-accounts-found",
          type: "success",
        });
      }
    } catch (error) {
      // If there's an error, we should just move to the success subview.
      await this.#initUI("emailAddedSuccessSubview");
      this.#currentSubview.setState(this.#currentConfig);

      if (error instanceof UserSkippedError) {
        this.#currentSubview.showNotification({
          fluentTitleId: "account-hub-email-added-success",
          type: "success",
        });
      } else {
        // Let the user know of the error with fetching accounts on the succcess
        // subview.
        this.#currentSubview.showNotification({
          fluentTitleId: "account-hub-sync-accounts-not-found",
          type: "info",
          error,
        });
      }

      this.abortable = null;
    }

    this.#stopLoading();
  }

  /**
   * Adds name and email address to AccountConfig object.
   *
   * @param {AccountConfig} configData - AccountConfig from findConfig().
   * @param {string} [password=""] - The password for the account.
   * @returns {AccountConfig} - The concrete AccountConfig object.
   */
  #fillAccountConfig(configData, password) {
    lazy.AccountConfig.replaceVariables(
      configData,
      this.#realName,
      this.#email,
      password ||
        (configData.hasPassword()
          ? configData.incoming.password || configData.outgoing.password
          : "")
    );
    return configData;
  }

  /**
   * Called when guessConfig fails and we need to provide manual config a
   * default AccountConfig.
   *
   * @returns {AccountConfig} - An AccountConfig object.
   */
  #getEmptyAccountConfig() {
    const config = new lazy.AccountConfig();
    config.incoming.type = "imap";
    config.incoming.username = "%EMAILADDRESS%";
    config.outgoing.username = "%EMAILADDRESS%";
    config.incoming.hostname = ".%EMAILDOMAIN%";
    config.outgoing.hostname = ".%EMAILDOMAIN%";

    return config;
  }

  /**
   * Called from the "onContinue" function, does final validation on the
   * the complete config that is provided by the user and modified by helper.
   *
   * @param {AccountConfig} completeConfig - The completed config.
   */
  async #validateAndFinish(completeConfig) {
    if (
      completeConfig.incoming.type == "exchange" &&
      "addonAccountType" in completeConfig.incoming
    ) {
      completeConfig.incoming.type = completeConfig.incoming.addonAccountType;
    }

    if (lazy.CreateInBackend.checkIncomingServerAlreadyExists(completeConfig)) {
      throw new Error("Account already exists.", {
        cause: {
          fluentTitleId: "account-setup-creation-error-title",
          fluentDescriptionId: "account-setup-error-server-exists",
        },
      });
    }

    if (completeConfig.outgoing.addThisServer) {
      const existingServer =
        lazy.CreateInBackend.checkOutgoingServerAlreadyExists(completeConfig);
      if (existingServer) {
        completeConfig.outgoing.addThisServer = false;
        completeConfig.outgoing.existingServerKey = existingServer.key;
      }
    }

    const telemetryKey =
      this.#currentConfig.source == lazy.AccountConfig.kSourceXML ||
      this.#currentConfig.source == lazy.AccountConfig.kSourceExchange
        ? this.#currentConfig.subSource
        : this.#currentConfig.source;

    // This verifies the the current config and, if needed, opens up an
    // additional window for authentication.
    this.#configVerifier = new lazy.ConfigVerifier(window.msgWindow);
    try {
      const successfulConfig = await this.#configVerifier.verifyConfig(
        completeConfig,
        completeConfig.source != lazy.AccountConfig.kSourceXML
      );
      // The auth might have changed, so we should update the current config.
      completeConfig.incoming.auth = successfulConfig.incoming.auth;
      completeConfig.outgoing.auth = successfulConfig.outgoing.auth;
      completeConfig.incoming.username = successfulConfig.incoming.username;
      completeConfig.outgoing.username = successfulConfig.outgoing.username;

      this.#currentConfig = completeConfig;
      this.#finishEmailAccountAddition(completeConfig);
      Glean.mail.successfulEmailAccountSetup[telemetryKey].add(1);
    } catch (error) {
      // If we get no message, then something other than VerifyLogon failed.
      let errorTitle = "account-hub-account-authentication-error";
      // For an Exchange server, some known configurations can
      // be disabled (per user or domain or server).
      // Warn the user if the open protocol we tried didn't work.
      if (
        ["imap", "pop3"].includes(completeConfig.incoming.type) &&
        completeConfig.incomingAlternatives.some(i => i.type == "exchange")
      ) {
        errorTitle = "account-setup-exchange-config-unverifiable";
      }

      this.#configVerifier.cleanup();
      Glean.mail.failedEmailAccountSetup[telemetryKey].add(1);

      throw new Error(error.message, {
        cause: {
          fluentTitleId: errorTitle,
        },
      });
    }
  }

  /**
   * Created the account in the backend and starts loading messages. This
   * method also leads to the account added view where the user can add more
   * accounts (calendar, address book, etc.)
   *
   * @param {AccountConfig} completeConfig - The completed config
   */
  async #finishEmailAccountAddition(completeConfig) {
    gAccountSetupLogger.debug("Creating account in backend.");
    const emailAccount =
      await lazy.CreateInBackend.createAccountInBackend(completeConfig);
    emailAccount.incomingServer.getNewMessages(
      emailAccount.incomingServer.rootFolder,
      window.msgWindow,
      null
    );
  }

  /**
   * Get the address books associated with the current account.
   *
   * @param {string} password - The password for the current account.
   *
   * @returns {Array} - The address books associated with the account.
   */
  async #getAddressBooks(password) {
    let addressBooks = [];

    // Bail out if the CardDAV scope wasn't granted.
    if (this.#currentConfig.incoming.auth == Ci.nsMsgAuthMethod.OAuth2) {
      const oAuth2 = new lazy.OAuth2Module();
      if (
        !oAuth2.initFromHostname(
          this.#currentConfig.incoming.hostname,
          this.#currentConfig.incoming.username,
          "carddav"
        ) ||
        !oAuth2.getRefreshToken()
      ) {
        return addressBooks;
      }
    }

    const hostname = this.#email.split("@")[1];
    try {
      addressBooks =
        await lazy.RemoteAddressBookUtils.getAddressBooksForAccount(
          this.#email,
          password,
          `https://${hostname}`
        );
    } catch (error) {
      gAccountSetupLogger.debug(
        `Found no address books for ${this.#email} on ${hostname}.`,
        error
      );
    }

    return addressBooks;
  }

  /**
   * Get the calendars associated with the current account.
   *
   * @param {string} password - The password for the current account.
   * @param {boolean} rememberPassword - The remember password choice.
   *
   * @returns {Array} - The calendars associated with the account.
   */
  async #getCalendars(password, rememberPassword) {
    let calendarEntries = null;
    const cals = [];

    // Bail out if the CalDAV scope wasn't granted.
    if (this.#currentConfig.incoming.auth == Ci.nsMsgAuthMethod.OAuth2) {
      const oAuth2 = new lazy.OAuth2Module();
      if (
        !oAuth2.initFromHostname(
          this.#currentConfig.incoming.hostname,
          this.#currentConfig.incoming.username,
          "caldav"
        ) ||
        !oAuth2.getRefreshToken()
      ) {
        return cals;
      }
    }

    const hostname = this.#email.split("@")[1];

    try {
      calendarEntries = await lazy.cal.provider.detection.detect(
        this.#email,
        password,
        `https://${hostname}`,
        rememberPassword,
        [],
        {}
      );
    } catch (error) {
      gAccountSetupLogger.debug(
        `Found no calendars for ${this.#email} on ${hostname}.`,
        error
      );
      return cals;
    }

    // If no calendars return empty array.
    if (!calendarEntries.size) {
      return cals;
    }

    // Collect existing calendars to compare with the list of recently fetched
    // ones.
    const existing = new Set(
      lazy.cal.manager.getCalendars({}).map(calendar => calendar.uri.spec)
    );

    for (const calendars of calendarEntries.values()) {
      for (const calendar of calendars) {
        if (existing.has(calendar.uri.spec)) {
          cals.push({ name: calendar.name, existing: true });
          continue;
        }
        cals.push(calendar);
      }
    }
    return cals;
  }

  /**
   * @typedef {object} SyncAccounts
   * @property {Array} calendars - The selected calendars.
   * @property {Array} addressBooks - The selected address books.
   */

  /**
   * Adds selected calendars and address books to Thunderbird.
   *
   * @param {SyncAccounts[]} syncAccounts - The sync accounts for the user.
   */
  #addSyncAccounts(syncAccounts) {
    for (const calendar of syncAccounts.calendars) {
      lazy.cal.manager.registerCalendar(calendar);
    }

    for (const addressBook of syncAccounts.addressBooks) {
      addressBook.create();
    }
  }

  /**
   * Add the applicable exchange add-on options to the config object.
   *
   * @param {AccountConfig} config - Account Config object.
   * @returns {Promise} - A promise waiting for getAddonsList to complete.
   */
  async #getExchangeAddons(config) {
    this.abortable = new AbortController();
    try {
      config = await lazy.getAddonsList(config, this.abortable.signal);
      return config;
    } catch (error) {
      // We reject here, but this will silently fail as we don't need to
      // show the user if we were unable to find add-ons for the config.
      gAccountSetupLogger.error(`getExchangeAddons failed:`, error);
      throw error;
    } finally {
      this.abortable = null;
    }
  }

  /**
   * Installs the first available add-on in the config object for exchange.
   */
  async #installAddon() {
    const addon = this.#currentConfig.addons[0];
    this.abortable = new AbortController();
    const installer = new AddonInstaller(addon, this.abortable.signal);
    await installer.install();
    this.abortable = null;
  }

  /**
   * Request the opening of the account manager after the creation of a new
   * account and reset any leftover data in the current setup flow.
   *
   * @param {object} data - The data passed to the template.
   */
  async #moveToAccountManager(data) {
    this.dispatchEvent(
      new CustomEvent("request-close", {
        bubbles: true,
      })
    );
    // eslint-disable-next-line no-undef
    MsgAccountManager("am-server.xhtml", data);
    await this.reset();
  }

  #showConfigFoundNotification() {
    let configFoundString = "account-hub-config-success-unknown";

    const CONFIG_SOURCE = {
      [lazy.AccountConfig.kSourceExchange]:
        "account-hub-config-success-exchange",
      [lazy.AccountConfig.kSourceGuess]: "account-hub-config-success-guess",
    };

    if (Object.hasOwn(CONFIG_SOURCE, this.#currentConfig.source)) {
      configFoundString = CONFIG_SOURCE[this.#currentConfig.source];
    } else if (this.#currentConfig.source == lazy.AccountConfig.kSourceXML) {
      const CONFIG_SUBSOURCE = {
        "xml-from-disk": "account-hub-config-success-disk",
        "xml-from-isp-https": "account-hub-config-success-isp",
        "xml-from-isp-http": "account-hub-config-success-isp",
        "xml-from-db": "account-hub-config-success",
      };
      if (Object.hasOwn(CONFIG_SUBSOURCE, this.#currentConfig.subSource)) {
        configFoundString = CONFIG_SUBSOURCE[this.#currentConfig.subSource];
      }
    }

    this.#currentSubview.showNotification({
      fluentTitleId: configFoundString,
      type: "success",
    });
  }

  /**
   * Check if any operation is currently in process and return true only if we
   * can leave this view.
   *
   * @returns {boolean} - If the account hub can remove this view.
   */
  async reset() {
    if (this.abortable) {
      this.#handleAbortable();
      this.abortable = null;
    }

    this.#stopLoading();
    await this.#initUI("autoConfigSubview");
    this.#currentState = "autoConfigSubview";
    this.#currentConfig = null;
    this.#exchangeUsername = "";
    this.#hideSubviews();
    this.#clearNotifications();
    this.#currentSubview.hidden = false;
    this.#setFooterButtons();
    // Reset all subviews that require a reset.
    for (const subviewName of Object.keys(this.#states)) {
      this.#states[subviewName].subview?.resetState?.();
    }
    this.#emailFooter.toggleForwardDisabled(true);
    return true;
  }
}

customElements.define("account-hub-email", AccountHubEmail);
