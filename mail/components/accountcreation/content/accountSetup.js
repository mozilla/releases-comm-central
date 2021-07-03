/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

/* import-globals-from ../../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from exchangeAutoDiscover.js */

var { AccountCreationUtils } = ChromeUtils.import(
  "resource:///modules/accountcreation/AccountCreationUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.jsm",
  cal: "resource:///modules/calendar/calUtils.jsm",
  CardDAVUtils: "resource:///modules/CardDAVUtils.jsm",
  CreateInBackend: "resource:///modules/accountcreation/CreateInBackend.jsm",
  FetchConfig: "resource:///modules/accountcreation/FetchConfig.jsm",
  GuessConfig: "resource:///modules/accountcreation/GuessConfig.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  OAuth2Providers: "resource:///modules/OAuth2Providers.jsm",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.jsm",
  Services: "resource://gre/modules/Services.jsm",
  UserCancelledException: "resource:///modules/accountcreation/FetchHTTP.jsm",
  verifyConfig: "resource:///modules/accountcreation/verifyConfig.jsm",
});

var {
  Abortable,
  AddonInstaller,
  alertPrompt,
  assert,
  CancelledException,
  ddump,
  deepCopy,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  NotReached,
  PriorityOrderAbortable,
  SuccessiveAbortable,
  TimeoutAbortable,
} = AccountCreationUtils;

/**
 * This is the dialog opened by menu File | New account | Mail... .
 *
 * It gets the user's realname, email address and password,
 * and tries to automatically configure the account from that,
 * using various mechanisms. If all fails, the user can enter/edit
 * the config, then we create the account.
 *
 * Steps:
 * - User enters realname, email address and password
 * - check for config files on disk
 *   (shipping with Thunderbird, for enterprise deployments)
 * - (if fails) try to get the config file from the ISP via a
 *   fixed URL on the domain of the email address
 * - (if fails) try to get the config file from our own database
 *   at MoMo servers, maintained by the community
 * - (if fails) try to guess the config, by guessing hostnames,
 *    probing ports, checking config via server's CAPS line etc..
 * - verify the setup, by trying to login to the configured servers
 * - let user verify and maybe edit the server names and ports
 * - If user clicks OK, create the account
 */

/**
TODO for bug 549045:

- autodetect protocol
Bugs
- SSL cert errors
  - invalid cert (hostname mismatch) doesn't trigger warning dialog as it should
  - accept self-signed cert (e.g. imap.mail.ru) doesn't work
    (works without my patch),
    verifyConfig.js line 124 has no inServer, for whatever reason,
    although I didn't change verifyConfig.js at all
    (the change you see in that file is irrelevant: that was an attempt to fix
    the bug and clean up the code).
Things to test (works for me):
- state transitions, buttons enable, status msgs
  - stop button
    - showes up again after stopping detection and restarting it
    - when stopping [retest]: buttons proper?
  - enter nonsense domain. guess fails, (so automatically) manual,
    change domain to real one (not in DB), guess succeeds.
    former bug: goes to manual first shortly, then to result
*/

// Keep track of the prefers-reduce-motion media query for JS based animations.
var gReducedMotion;

// The main 3 Pane Window that we need to define on load in order to properly
// update the UI when a new account is created.
var gMainWindow;

// Define standard incoming port numbers.
var gStandardPorts = {
  imap: [143, 993],
  pop3: [110, 995],
  smtp: [587, 25, 465], // order matters
  exchange: [443],
};

// Store all ports into a flat array for greppability.
var gAllStandardPorts = gStandardPorts.smtp
  .concat(gStandardPorts.imap)
  .concat(gStandardPorts.pop3)
  .concat(gStandardPorts.exchange);

// Define window event listeners.
window.addEventListener("load", () => {
  gAccountSetup.onLoad();
});
window.addEventListener("unload", () => {
  gAccountSetup.onUnload();
});

function onSetupComplete() {
  // Post a message to the main window at the end of a successful account setup.
  gMainWindow.postMessage("account-created", "*");
}

/**
 * Prompt a native HTML confirmation dialog for the Exchange auto discover.
 *
 * @param {string} domain - Text with the question.
 * @param {function} okCallback - Called when the user clicks OK.
 * @param {function(ex)} cancelCallback - Called when the user clicks Cancel
 *   or if you call `Abortable.cancel()`.
 * @returns {Abortable} - If `Abortable.cancel()` is called,
 *   the dialog is closed and the `cancelCallback()` is called.
 */
function confirmExchange(domain, okCallback, cancelCallback) {
  let dialog = document.getElementById("exchangeDialog");

  document.l10n.setAttributes(
    document.getElementById("exchangeDialogQuestion"),
    "exchange-dialog-question",
    { domain }
  );

  document.getElementById("exchangeDialogConfirmButton").addEventListener(
    "click",
    () => {
      dialog.close();
      okCallback();
    },
    { once: true }
  );

  document.getElementById("exchangeDialogCancelButton").addEventListener(
    "click",
    () => {
      dialog.close();
      cancelCallback(new UserCancelledException());
    },
    { once: true }
  );

  // Show the dialog.
  dialog.showModal();

  let abortable = new Abortable();
  abortable.cancel = ex => {
    close();
    cancelCallback(ex);
  };
  return abortable;
}

/**
 * This is our controller for the entire account setup workflow.
 */
var gAccountSetup = {
  // Boolean attribute to keep track of the initialization status of the wizard.
  isInited: false,
  // Attribute to store methods to interrupt abortable operations like testing
  // a server configuration or installing an add-on.
  _abortable: null,

  /**
   * Initialize the main notification box for the account setup process.
   */
  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document.getElementById("accountSetupNotifications").append(element);
      });
    }
    return this._notificationBox;
  },

  /**
   * Initialize the notification box for the calendar and address book sync
   * process at the end of the account setup.
   */
  get syncingBox() {
    if (!this._syncingBox) {
      this._syncingBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document.getElementById("syncNotifications").append(element);
      });
    }
    return this._syncingBox;
  },

  clearNotifications() {
    this.notificationBox.removeAllNotifications();
  },

  onLoad() {
    // Bail out if it was already initialized.
    if (this.isInited) {
      return;
    }

    gAccountSetupLogger.debug("Initializing setup wizard");
    gReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    // Store the main window.
    gMainWindow = Services.wm.getMostRecentWindow("mail:3pane");

    // this._currentConfig is the config we got either from the XML file or from
    // guessing or from the user. Unless it's from the user, it contains
    // placeholders like %EMAILLOCALPART% in username and other fields.
    //
    // The config here must retain these placeholders, to be able to adapt when
    // the user enters a different realname, or password or email local part.
    // A change of the domain name will trigger a new detection anyways. That
    // means, before you actually use the config (e.g. to create an account or
    // to show it to the user), you need to run replaceVariables().
    this._currentConfig = null;
    this._domain = "";
    this._hostname = "";
    this._email = "";
    this._realname = "";
    if ("@mozilla.org/userinfo;1" in Cc) {
      let userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      // Assume that it's a genuine full name if it includes a space.
      if (userInfo.fullname.includes(" ")) {
        this._realname = userInfo.fullname;
        document.getElementById("realname").value = this._realname;
      }
    }

    this._password = "";
    this._showPassword = false;
    // This is used only for Exchange AutoDiscover and only if needed.
    this._exchangeUsername = "";
    // Store the successful callback in this attribute so we can send it around
    // the various validation methods.
    this._okCallback = onSetupComplete;
    this._msgWindow = gMainWindow.msgWindow;

    // If the account provisioner is preffed off, don't display the account
    // provisioner button.
    if (!Services.prefs.getBoolPref("mail.provider.enabled")) {
      document.getElementById("provisionerButton").hidden = true;
    }

    // Disable the remember password checkbox if the pref is false.
    if (!Services.prefs.getBoolPref("signon.rememberSignons")) {
      let passwordCheckbox = document.getElementById("rememberPassword");
      passwordCheckbox.checked = false;
      passwordCheckbox.disabled = true;
    }

    // Ensure the cursor is on the first input field.
    document.getElementById("realname").focus();

    // In a new profile, the first request to live.thunderbird.net is much
    // slower because of one-time overheads like DNS and OCSP. Let's create some
    // dummy requests to prime the connections.
    let autoconfigURL = Services.prefs.getCharPref("mailnews.auto_config_url");
    fetch(autoconfigURL, { method: "OPTIONS" });

    let addonsURL = Services.prefs.getCharPref(
      "mailnews.auto_config.addons_url"
    );
    if (new URL(autoconfigURL).origin != new URL(addonsURL).origin) {
      fetch(addonsURL, { method: "OPTIONS" });
    }

    // We did everything, now we can update the variable.
    this.isInited = true;
    gAccountSetupLogger.debug("Account setup tab loaded.");
  },

  /**
   * Changes the window configuration to the different modes we have.
   * Shows/hides various window parts and buttons.
   * @param {string} modename
   *    "start" : Just the realname, email address, password fields
   *    "find-config" : detection step, adds the loading notification
   *    "result" : We found a config and display it to the user.
   *       The user may create the account.
   *    "manual-edit" : The user wants (or needs) to manually enter their
   *       the server hostname and other settings. We'll use them as provided.
   * Additionally, there are the following sub-modes which can be entered after
   * you entered the main mode:
   *    "manual-edit-have-hostname" : user entered a hostname for both servers
   *        that we can use
   *    "manual-edit-testing" : User pressed the [Re-test] button and
   *         we're currently detecting the "Auto" values
   *    "manual-edit-complete" : user entered (or we tested) all necessary
   *         values, and we're ready to create to account
   * Currently, this doesn't cover the warning dialogs etc.. It may later.
   */
  switchToMode(modename) {
    // Bail out if we requested the same mode we're currently viewing.
    if (modename == this._currentModename) {
      return;
    }

    this._currentModename = modename;
    gAccountSetupLogger.debug(`switching to UI mode ${modename}`);

    let continueButton = document.getElementById("continueButton");
    let createButton = document.getElementById("createButton");
    let reTestButton = document.getElementById("reTestButton");
    let autoconfigDesc = document.getElementById("manualConfigDescription");
    let setupTitle = document.getElementById("accountSetupTitle");

    switch (modename) {
      case "start":
        this.clearNotifications();
        document.getElementById("setupView").hidden = false;
        document.getElementById("successView").hidden = true;

        document.l10n.setAttributes(setupTitle, "account-setup-title");
        setupTitle.classList.remove("success");
        document.l10n.setAttributes(
          document.getElementById("accountSetupDescription"),
          "account-setup-description"
        );

        document.getElementById("resultsArea").hidden = true;
        document.getElementById("manualConfigArea").hidden = true;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("stopButton").hidden = true;

        reTestButton.hidden = true;
        autoconfigDesc.hidden = true;
        createButton.hidden = true;
        continueButton.disabled = true;
        continueButton.hidden = false;
        break;
      case "find-config":
        document.getElementById("resultsArea").hidden = true;
        document.getElementById("manualConfigArea").hidden = true;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("stopButton").hidden = false;

        reTestButton.hidden = true;
        autoconfigDesc.hidden = true;
        createButton.hidden = true;
        continueButton.disabled = true;
        continueButton.hidden = false;
        this.onStop = this.onStopFindConfig;
        break;
      case "result":
        document.getElementById("manualConfigArea").hidden = true;
        document.getElementById("stopButton").hidden = true;
        document.getElementById("resultsArea").hidden = false;
        document.getElementById("manualConfigButton").hidden = false;

        reTestButton.hidden = true;
        autoconfigDesc.hidden = true;
        continueButton.hidden = true;
        createButton.hidden = false;
        createButton.disabled = false;
        break;
      case "manual-edit":
        document.getElementById("resultsArea").hidden = true;
        document.getElementById("stopButton").hidden = true;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("manualConfigArea").hidden = false;

        continueButton.hidden = true;
        reTestButton.hidden = false;
        autoconfigDesc.hidden = false;
        reTestButton.disabled = true;
        createButton.hidden = false;
        createButton.disabled = true;
        break;
      case "manual-edit-have-hostname":
        document.getElementById("resultsArea").hidden = true;
        document.getElementById("stopButton").hidden = true;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("manualConfigArea").hidden = false;

        reTestButton.hidden = false;
        autoconfigDesc.hidden = false;
        reTestButton.disabled = false;
        continueButton.hidden = true;
        createButton.hidden = false;
        createButton.disabled = true;
        break;
      case "manual-edit-testing":
        document.getElementById("resultsArea").hidden = true;
        document.getElementById("manualConfigArea").hidden = false;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("stopButton").hidden = false;

        reTestButton.hidden = false;
        autoconfigDesc.hidden = false;
        reTestButton.disabled = true;
        continueButton.hidden = true;
        createButton.hidden = false;
        createButton.disabled = true;

        this.onStop = this.onStopHalfManualTesting;
        break;
      case "manual-edit-complete":
        document.getElementById("resultsArea").hidden = true;
        document.getElementById("manualConfigArea").hidden = false;
        document.getElementById("manualConfigButton").hidden = true;
        document.getElementById("stopButton").hidden = true;

        reTestButton.hidden = false;
        autoconfigDesc.hidden = false;
        reTestButton.disabled = false;
        continueButton.hidden = true;
        createButton.disabled = false;
        createButton.hidden = false;

        document.getElementById("incomingProtocol").focus();
        break;
      case "success":
        document.getElementById("setupView").hidden = true;
        document.getElementById("successView").hidden = false;

        document.l10n.setAttributes(setupTitle, "account-setup-success-title");
        setupTitle.classList.add("success");
        document.l10n.setAttributes(
          document.getElementById("accountSetupDescription"),
          "account-setup-success-description"
        );
        document.l10n.setAttributes(
          document.getElementById("accountSetupDescriptionSecondary"),
          "account-setup-success-secondary-description"
        );
        break;
      default:
        throw new NotReached("Unknown mode requested");
    }

    // If we're offline, we're going to disable the create button, but enable
    // the advanced config button if we have a current config.
    if (Services.io.offline && !this._currentConfig) {
      document.getElementById("manualConfigButton").hidden = true;
      reTestButton.hidden = true;
      autoconfigDesc.hidden = true;
      createButton.hidden = true;
    }
  },

  /**
   * Start from beginning with possibly new email address.
   */
  onStartOver() {
    this._currentConfig = null;
    if (this._abortable) {
      this.onStop();
    }
    this.switchToMode("start");
    this.checkValidForm();
  },

  getConcreteConfig() {
    let result = this._currentConfig.copy();

    AccountConfig.replaceVariables(
      result,
      this._realname,
      this._email,
      this._password
    );
    result.rememberPassword =
      document.getElementById("rememberPassword").checked && !!this._password;

    if (result.incoming.addonAccountType) {
      result.incoming.type = result.incoming.addonAccountType;
    }

    return result;
  },

  /**
   * onInputEmail and onInputRealname are called on input = keypresses, and
   * enable/disable the next button based on whether there's a semi-proper
   * e-mail address and non-blank realname to start with.
   *
   * A change to the email address also automatically restarts the
   * whole process.
   */
  onInputEmail() {
    this._email = document.getElementById("email").value;
    this.onStartOver();
  },

  onInputRealname() {
    this._realname = document.getElementById("realname").value;
    this.checkValidForm();
  },

  onInputUsername() {
    this._exchangeUsername = document.getElementById("usernameEx").value;
    this.onStartOver();
  },

  onInputPassword() {
    this._password = document.getElementById("password").value;
    this.onStartOver();
  },

  /**
   * Toggle the type of the password field between password and text to allow
   * users reading their own password.
   */
  passwordToggle() {
    // Don't toggle anything if the user didn't write anything yet.
    if (!this._password) {
      return;
    }

    let passwordField = document.getElementById("password");
    let toggleImage = document.getElementById("passwordInfo");
    // If the type is password, change it to a plain text.
    if (passwordField.type == "password") {
      this._showPassword = true;
      passwordField.type = "text";
      toggleImage.src = "chrome://messenger/skin/icons/visible.svg";
      toggleImage.classList.add("password-toggled");
      return;
    }

    // Otherwise, change it back to a password field.
    this._showPassword = false;
    passwordField.type = "password";
    toggleImage.src = "chrome://messenger/skin/icons/hidden.svg";
    toggleImage.classList.remove("password-toggled");
  },

  /**
   * Check whether the user entered the minimum amount of information needed to
   * leave the "start" mode (name and email) and is allowed to proceed to the
   * detection step.
   */
  checkValidForm() {
    let isValidForm =
      document.getElementById("email").checkValidity() &&
      document.getElementById("realname").checkValidity();
    this._domain = isValidForm ? this._email.split("@")[1].toLowerCase() : "";

    document.getElementById("continueButton").disabled = !isValidForm;
    document.getElementById("manualConfigButton").hidden = !isValidForm;
    document.getElementById("provisionerButton").hidden = isValidForm;
  },

  /**
   * When the [Continue] button is clicked, we move from the initial account
   * information stage to using that information to configure account details.
   */
  onContinue() {
    this.findConfig(this._domain, this._email);
  },

  // --------------
  // Detection step

  /**
   * Try to find an account configuration for this email address.
   * This is the function which runs the autoconfig.
   */
  findConfig(domain, emailAddress) {
    gAccountSetupLogger.debug("findConfig()");
    if (this._abortable) {
      this.onStop();
    }
    this.switchToMode("find-config");
    this.startLoadingState("account-setup-looking-up-settings");

    let self = this;
    let call = null;
    let fetch = null;

    let priority = (this._abortable = new PriorityOrderAbortable(
      function(config, call) {
        // success
        self._abortable = null;
        self.stopLoadingState(call.foundMsg);
        self.foundConfig(config);
      },
      function(e, allErrors) {
        // all failed
        self._abortable = null;
        if (e instanceof CancelledException) {
          self.onStartOver();
          return;
        }

        // guess config
        let initialConfig = new AccountConfig();
        self._prefillConfig(initialConfig);
        self._guessConfig(domain, initialConfig);
      }
    ));

    try {
      call = priority.addCall();
      this.updateLoadingState("account-setup-looking-up-disk");
      call.foundMsg = "account-setup-success-settings-disk";
      fetch = FetchConfig.fromDisk(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.updateLoadingState("account-setup-looking-up-isp");
      call.foundMsg = "account-setup-success-settings-isp";
      fetch = FetchConfig.fromISP(
        domain,
        emailAddress,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.updateLoadingState("account-setup-looking-up-db");
      call.foundMsg = "account-setup-success-settings-db";
      fetch = FetchConfig.fromDB(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.updateLoadingState("account-setup-looking-up-mx");
      // "account-setup-success-settings-db" is correct.
      // We display the same message for both db and mx cases.
      call.foundMsg = "account-setup-success-settings-db";
      fetch = FetchConfig.forMX(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.updateLoadingState("account-setup-looking-up-exchange");
      call.foundMsg = "account-setup-success-settings-exchange";
      fetch = fetchConfigFromExchange(
        domain,
        emailAddress,
        this._exchangeUsername,
        this._password,
        call.successCallback(),
        (e, allErrors) => {
          // Must call error callback in any case to stop the discover mode.
          let errorCallback = call.errorCallback();
          if (e instanceof CancelledException) {
            errorCallback(e);
          } else if (allErrors && allErrors.some(e => e.code == 401)) {
            // Auth failed.
            // Ask user for username.
            this.onStartOver();
            this.stopLoadingState(); // clears status message
            document.getElementById("usernameRow").hidden = false;

            this.showErrorNotification(
              !this._exchangeUsername
                ? "account-setup-credentials-incomplete"
                : "account-setup-credentials-wrong"
            );
            document.getElementById("manualConfigButton").hidden = false;
            errorCallback(new CancelledException());
          } else {
            errorCallback(e);
          }
        }
      );
      call.setAbortable(fetch);
    } catch (e) {
      // e.g. when entering an invalid domain like "c@c.-com"
      this.showErrorNotification(e, true);
      this.onStop();
    }
  },

  /**
   * Just a continuation of findConfig()
   */
  _guessConfig(domain, initialConfig) {
    this.startLoadingState("account-setup-looking-up-settings-guess");
    let self = this;
    self._abortable = GuessConfig.guessConfig(
      domain,
      function(type, hostname, port, ssl, done, config) {
        // progress
        gAccountSetupLogger.debug(
          `${hostname}:${port} ssl=${ssl} ${type}: progress callback`
        );
      },
      function(config) {
        // success
        self._abortable = null;
        self.foundConfig(config);
        self.stopLoadingState(
          Services.io.offline
            ? "account-setup-success-guess-offline"
            : "account-setup-success-guess"
        );
      },
      function(e, config) {
        // guessconfig failed
        if (e instanceof CancelledException) {
          return;
        }
        self._abortable = null;
        gAccountSetupLogger.warn(`guessConfig failed: ${e}`);
        self.showErrorNotification("account-setup-find-settings-failed");
        self.editConfigDetails();
      },
      initialConfig,
      "both"
    );
  },

  /**
   * Called after findConfig() is successful and displays the data to the user.
   *
   * @param {AccountConfig} config - The config to present to the user.
   */
  foundConfig(config) {
    gAccountSetupLogger.debug("found config:\n" + config);
    assert(
      config instanceof AccountConfig,
      "BUG: Arg 'config' needs to be an AccountConfig object"
    );

    this._haveValidConfigForDomain = this._email.split("@")[1];

    // Bail out if the name and email fields are empty.
    if (!this._realname || !this._email) {
      return;
    }

    config.addons = [];
    let successCallback = () => {
      this._abortable = null;
      this.displayConfigResult(config);
      this.switchToMode("result");
      this.ensureVisibleButtons();
    };
    this._abortable = getAddonsList(config, successCallback, e => {
      successCallback();
      this.showErrorNotification(e, true);
    });
  },

  /**
   * [Stop] button click handler.
   * This allows the user to abort any longer operation, esp. network activity.
   * We currently have 3 such cases here:
   * 1. findConfig(), i.e. fetch config from DB, guessConfig etc.
   * 2. testManualConfig(), i.e. the [Retest] button in manual config.
   * 3. verifyConfig() - We can't stop this yet, so irrelevant here currently.
   * Given that these need slightly different actions, this function will be set
   * to a function (i.e. overwritten) by whoever enables the stop button.
   *
   * We also call this from the code when the user started a different action
   * without explicitly clicking [Stop] for the old one first.
   */
  onStop() {
    throw new NotReached("onStop should be overridden by now");
  },

  _onStopCommon() {
    if (!this._abortable) {
      throw new NotReached("onStop called although there's nothing to stop");
    }
    gAccountSetupLogger.debug("onStop cancelled _abortable");
    this._abortable.cancel(new UserCancelledException());
    this._abortable = null;
    this.stopLoadingState();
  },

  onStopFindConfig() {
    this._onStopCommon();
    this.switchToMode("start");
    this.checkValidForm();
  },

  onStopHalfManualTesting() {
    this._onStopCommon();
    this.validateManualEditComplete();
  },

  // ----------- Loading area -----------
  /**
   * Disable all the input fields of the main form to prevent editing and show
   * a notification while a loading or fetching state.
   *
   * @param {string} stringName - The name of the fluent string that needs to be
   *   attached to the notification.
   */
  async startLoadingState(stringName) {
    gAccountSetupLogger.debug(`Loading start: ${stringName}`);

    this.showHelperImage("step2");

    // Disable all input fields.
    for (let input of document.querySelectorAll("#form input")) {
      input.disabled = true;
    }

    let notificationMessage = await document.l10n.formatValue(stringName);

    gAccountSetupLogger.debug(`Status msg: ${notificationMessage}`);

    let notification = this.notificationBox.getNotificationWithValue(
      "accountSetupLoading"
    );

    // If a notification already exists, simply update the message.
    if (notification) {
      notification.label = notificationMessage;
      this.ensureVisibleNotification();
      return;
    }

    notification = this.notificationBox.appendNotification(
      notificationMessage,
      "accountSetupLoading",
      null,
      this.notificationBox.PRIORITY_INFO_LOW,
      null
    );
    notification.setAttribute("align", "center");

    // Hide the close button to prevent dismissing the notification.
    notification.removeAttribute("dismissable");

    this.ensureVisibleNotification();
  },

  /**
   * Update the text of a currently visible loading notification
   *
   * @param {string} stringName - The name of the fluent string that needs to be
   *   attached to the notification.
   */
  async updateLoadingState(stringName) {
    let notification = this.notificationBox.getNotificationWithValue(
      "accountSetupLoading"
    );
    // If a notification doesn't already exist, create one.
    if (!notification) {
      this.startLoadingState(stringName);
      return;
    }

    let notificationMessage = await document.l10n.formatValue(stringName);
    notification.label = notificationMessage;
    this.ensureVisibleNotification();

    gAccountSetupLogger.debug(`Status msg: ${notificationMessage}`);
  },

  /**
   * Clear the loading notification and show a successful notification if
   * needed.
   *
   * @param {?string} stringName - The name of the fluent string that needs to
   *   be attached to the notification, or null if nothing needs to be showed.
   */
  async stopLoadingState(stringName) {
    // Re-enable all form input fields.
    for (let input of document.querySelectorAll("#form input")) {
      input.removeAttribute("disabled");
    }

    // Always remove any leftover notification.
    this.clearNotifications();

    // Bail out if we don't need to show anything else.
    if (!stringName) {
      gAccountSetupLogger.debug("Loading stopped");
      this.showHelperImage("step1");
      return;
    }

    gAccountSetupLogger.debug(`Loading stopped: ${stringName}`);

    let notificationMessage = await document.l10n.formatValue(stringName);

    let notification = this.notificationBox.appendNotification(
      notificationMessage,
      "accountSetupSuccess",
      null,
      this.notificationBox.PRIORITY_INFO_HIGH,
      null
    );
    notification.setAttribute("type", "success");

    // Hide the close button to prevent dismissing the notification.
    notification.removeAttribute("dismissable");

    this.showHelperImage("step3");

    // Scroll down to the buttons only if we're not inside the manual config in
    // order to avoid scrolling past the notification for small screens.
    if (document.getElementById("manualConfigArea").hidden) {
      this.ensureVisibleButtons();
    }
  },

  /**
   * Show an error notification in case something went wrong.
   *
   * @param {string} stringName - The name of the fluent string that needs to
   *   be attached to the notification.
   * @param {boolean} isMsgError - True if the message comes from a server error
   * response or try/catch.
   */
  async showErrorNotification(stringName, isMsgError) {
    gAccountSetupLogger.debug(`Status error: ${stringName}`);

    this.showHelperImage("step4");

    // Re-enable all form input fields.
    for (let input of document.querySelectorAll("#form input")) {
      input.removeAttribute("disabled");
    }

    // Always remove any leftover notification before creating a new one.
    this.clearNotifications();

    // Fetch the fluent string only if this is not an error message coming from
    // a previous method.
    let notificationMessage = isMsgError
      ? stringName
      : await document.l10n.formatValue(stringName);

    let notification = this.notificationBox.appendNotification(
      notificationMessage,
      "accountSetupError",
      null,
      this.notificationBox.PRIORITY_WARNING_MEDIUM,
      null
    );

    // Hide the close button to prevent dismissing the notification.
    notification.removeAttribute("dismissable");

    this.ensureVisibleNotification();
  },

  /**
   * Hide all the helper images and show the requested one.
   *
   * @param {string} id - The string ID of the element to show.
   */
  showHelperImage(id) {
    // Hide all currently visible articles containing helper images in the
    // second column.
    for (let article of document.querySelectorAll(
      ".second-column article:not([hidden])"
    )) {
      article.hidden = true;
    }

    // Simply show the requested helper image if the user specified a reduced
    // motion preference.
    if (gReducedMotion) {
      document.getElementById(id).hidden = false;
      return;
    }

    // Handle a nice cross fade between steps.
    let stepToShow = document.getElementById(id);
    // Add the class to let the revealing element start from a proper state.
    stepToShow.classList.add("hide");
    stepToShow.hidden = false;
    // Timeout to animate after the hidden attribute has been removed.
    setTimeout(() => {
      stepToShow.classList.remove("hide");
    });
  },

  /**
   * Always ensure the primary button is visible by scrolling the page until the
   * button is above the fold.
   */
  ensureVisibleButtons() {
    document.getElementById("createButton").scrollIntoView({
      behavior: gReducedMotion ? "auto" : "smooth",
      block: "end",
      inline: "nearest",
    });
  },

  /**
   * Always ensure the notification area is visible when a new notification is
   * created.
   */
  ensureVisibleNotification() {
    document.getElementById("accountSetupNotifications").scrollIntoView({
      behavior: gReducedMotion ? "auto" : "smooth",
      block: "start",
      inline: "nearest",
    });
  },

  /**
   * Populate the results config details area.
   *
   * @param {AccountConfig} config - The config to present to user.
   */
  displayConfigResult(config) {
    assert(config instanceof AccountConfig);
    this._currentConfig = config;
    let configFilledIn = this.getConcreteConfig();

    // Filter out Protcols we don't currently support
    let protocols = config.incomingAlternatives.filter(protocol =>
      ["imap", "pop3", "exchange"].includes(protocol.type)
    );
    protocols.unshift(config.incoming);
    protocols = protocols.reduce((found, nextEl) => {
      if (!found.some(prevEl => prevEl.type == nextEl.type)) {
        found.push(nextEl);
      }
      return found;
    }, []);

    // Hide all the available options in order to start with a clean slate.
    for (let row of document.querySelectorAll(".content-blocking-category")) {
      row.classList.remove("selected");
      row.hidden = true;
    }

    // Reveal all the matching protocols.
    for (let protocol of protocols) {
      let row = document.getElementById(`resultsOption-${protocol.type}`);
      row.hidden = false;
      // Attach the protocol to the radio input for later usage.
      row.querySelector(`input[type="radio"]`).configIncoming = protocol;
    }

    // Preselect the default protocol type.
    let selected = document.getElementById(
      `resultSelect-${config.incoming.type}`
    );
    selected.closest(".content-blocking-category").classList.add("selected");
    selected.checked = true;

    // Update the results area title to match the protocols choice.
    document.l10n.setAttributes(
      document.getElementById("resultAreaTitle"),
      "account-setup-results-area-title",
      { count: protocols.length }
    );

    // Thunderbird can't handle Exchange server independentely, therefore we
    // need to prompt the user with the isntallation of the Owl add-on.
    if (config.incoming.type == "exchange") {
      let addonsInstallRows = document.getElementById("resultAddonInstallRows");

      // Remove any pre-existing child element.
      while (addonsInstallRows.hasChildNodes()) {
        addonsInstallRows.lastChild.remove();
      }

      let container = document.getElementById("resultExchangeHostname");
      _makeHostDisplayString(config.incoming, container);
      // It's always SSL, so just clutter.
      container.querySelector(".ssl").hidden = true;
      // Already have a nicer label.
      container.querySelector(".protocol-type").hidden = true;

      (async () => {
        for (let addon of config.addons) {
          let installer = new AddonInstaller(addon);
          addon.isInstalled = await installer.isInstalled();
        }

        let addonInfoArea = document.getElementById("installAddonInfo");
        let installedAddon = config.addons.find(addon => addon.isInstalled);

        // The needed add-on is already installed, no need to show anything.
        if (installedAddon) {
          config.incoming.addonAccountType =
            installedAddon.useType.addonAccountType;
          addonInfoArea.hidden = true;
          return;
        }

        addonInfoArea.hidden = false;

        document.l10n.setAttributes(
          document.getElementById("resultAddonIntro"),
          !config.incomingAlternatives.find(alt =>
            ["imap", "pop3"].includes(alt.type)
          )
            ? "account-setup-addon-install-intro"
            : "account-setup-addon-no-protocol"
        );

        for (let addon of config.addons) {
          // Creates and addon install section.
          // <div><img/><a></a><button></button></div>
          let container = document.createElement("div");
          container.classList.add("addon-container");

          let img = document.createElement("img");
          img.alt = "";
          img.classList.add("icon");
          if (addon.icon32) {
            img.setAttribute("src", addon.icon32);
          }

          let link = document.createElement("a");
          link.classList.add("link");
          link.setAttribute("href", addon.websiteURL);
          link.textContent = addon.description;

          let button = document.createElement("button");
          document.l10n.setAttributes(
            button,
            "account-setup-addon-install-title"
          );
          button.addEventListener("click", () => {
            gAccountSetup.addonInstall(addon);
          });

          container.appendChild(img);
          container.appendChild(link);
          container.appendChild(button);

          addonsInstallRows.appendChild(container);
        }
        document.getElementById("createButton").disabled = true;
      })();
      return;
    }

    function _makeHostDisplayString(server, container) {
      // Helper method to quickly create the same span element.
      function _addComponent(text, className) {
        let span = document.createElement("span");
        span.classList.add(className);
        document.l10n.setAttributes(span, text);
        container.appendChild(span);
      }

      // Clean up any existing element.
      while (container.hasChildNodes()) {
        container.lastChild.remove();
      }
      let cert = container.parentNode.querySelector(".cert-status");
      if (cert != null) {
        cert.remove();
      }

      let type = Sanitizer.translate(server.type, {
        imap: "imap",
        pop3: "pop",
        smtp: "smtp",
        exchange: "exchange",
      });
      _addComponent(`account-setup-result-${type}`, "protocol-type");

      let domain = server.hostname;
      try {
        domain = Services.eTLD.getBaseDomainFromHost(server.hostname);
      } catch (ex) {
        gAccountSetupLogger.warn(ex);
      }

      let hostSpan = document.createElement("span");
      hostSpan.classList.add("host-without-domain");
      hostSpan.textContent = server.hostname.substr(
        0,
        server.hostname.length - domain.length
      );
      container.appendChild(hostSpan);

      let domainSpan = document.createElement("span");
      domainSpan.classList.add("domain");
      domainSpan.textContent = domain;
      container.appendChild(domainSpan);

      if (!gAllStandardPorts.includes(server.port)) {
        let portSpan = document.createElement("span");
        portSpan.classList.add("port");
        portSpan.textContent = `:${server.port}`;
        container.appendChild(portSpan);
      }

      let ssl = Sanitizer.translate(server.socketType, {
        1: "no-encryption",
        2: "ssl",
        3: "starttls",
      });
      _addComponent(`account-setup-result-${ssl}`, "ssl");

      if (server.socketType != 2 && server.socketType != 3) {
        // not SSL/STARTTLS
        container.querySelector(".ssl").classList.add("insecure");
      }
      if (server.badCert) {
        container.parentNode
          .querySelector(".cert-status")
          .classList.add("insecure");
      }
    }

    if (configFilledIn.incoming.hostname) {
      _makeHostDisplayString(
        configFilledIn.incoming,
        document.getElementById(`incomingInfo-${config.incoming.type}`)
      );
    }

    let outgoingInfo = document.getElementById(
      `outgoingInfo-${config.incoming.type}`
    );
    if (!config.outgoing.existingServerKey) {
      if (configFilledIn.outgoing.hostname) {
        _makeHostDisplayString(configFilledIn.outgoing, outgoingInfo);
      }
    } else {
      let span = document.createElement("span");
      document.l10n.setAttributes(
        span,
        "account-setup-result-outgoing-existing"
      );
      outgoingInfo.appendChild(span);
    }

    let usernameInfo = document.getElementById(
      `usernameInfo-${config.incoming.type}`
    );
    if (configFilledIn.incoming.username == configFilledIn.outgoing.username) {
      usernameInfo.textContent = configFilledIn.incoming.username;
    } else {
      document.l10n.setAttributes(
        usernameInfo,
        "account-setup-result-username-different",
        {
          incoming: configFilledIn.incoming.username,
          outgoing: configFilledIn.outgoing.username,
        }
      );
    }
  },

  /**
   * Handle the user switching between IMAP and POP3 settings using the
   * radio buttons.
   */
  onResultServerTypeChanged() {
    let config = this._currentConfig;
    // Add current server as best alternative to start of array.
    config.incomingAlternatives.unshift(config.incoming);

    // Clear the visually selected radio container.
    document
      .querySelector(".content-blocking-category.selected")
      .classList.remove("selected");

    // Use selected server (stored as special property on the <input> node).
    let selected = document.querySelector(
      'input[name="resultsServerType"]:checked'
    );
    selected.closest(".content-blocking-category").classList.add("selected");
    config.incoming = selected.configIncoming;

    // Remove newly selected server from list of alternatives.
    config.incomingAlternatives = config.incomingAlternatives.filter(
      alt => alt != config.incoming
    );
    this.displayConfigResult(config);
  },

  /**
   * Install the addon
   * Called when user clicks [Install] button.
   *
   * @param {AddonInfo} addon - @see AccountConfig.addons
   */
  async addonInstall(addon) {
    let addonInfoArea = document.getElementById("installAddonInfo");
    let createButton = document.getElementById("createButton");
    addonInfoArea.hidden = true;
    createButton.disabled = true;

    this.clearNotifications();
    await this.startLoadingState("account-setup-installing-addon");

    try {
      let installer = (this._abortable = new AddonInstaller(addon));
      await installer.install();

      this._abortable = null;
      this.stopLoadingState("account-setup-success-addon");
      createButton.disabled = false;

      this._currentConfig.incoming.type = addon.useType.addonAccountType;
      await this.validateAndFinish();
    } catch (e) {
      this.showErrorNotification(e, true);
      addonInfoArea.hidden = false;
    }
  },

  // ----------------
  // Manual Edit area

  /**
   * Gets the values from the user in the manual edit area. Realname and
   * password are not part of that area and still placeholders, but hostname and
   * username are concrete and no placeholders anymore.
   */
  getUserConfig() {
    let config = this.getConcreteConfig() || new AccountConfig();
    config.source = AccountConfig.kSourceUser;

    // Incoming server
    try {
      let inHostnameField = document.getElementById("incomingHostname");
      config.incoming.hostname = Sanitizer.hostname(inHostnameField.value);
      inHostnameField.value = config.incoming.hostname;
    } catch (e) {
      gAccountSetupLogger.warn(e);
    }

    try {
      config.incoming.port = Sanitizer.integerRange(
        document.getElementById("incomingPort").value,
        1,
        65535
      );
    } catch (e) {
      config.incoming.port = undefined; // incl. default "Auto"
    }

    config.incoming.type = Sanitizer.translate(
      document.getElementById("incomingProtocol").value,
      {
        1: "imap",
        2: "pop3",
        3: "exchange",
        0: null,
      }
    );
    config.incoming.socketType = Sanitizer.integer(
      document.getElementById("incomingSsl").value
    );
    config.incoming.auth = Sanitizer.integer(
      document.getElementById("incomingAuthMethod").value
    );
    config.incoming.username = document.getElementById(
      "incomingUsername"
    ).value;

    // Outgoing server

    config.outgoing.username = document.getElementById(
      "outgoingUsername"
    ).value;

    let smtpValue = document.getElementById("outgoingHostname").value;
    let foundServer = MailServices.smtp.servers.find(
      s => s.hostname == smtpValue
    );
    // If the user is using a preconfigured SMTP server.
    if (foundServer) {
      config.outgoing.existingServerKey = foundServer.key;
      config.outgoing.existingServerLabel = foundServer.hostname;
      config.outgoing.addThisServer = false;
      config.outgoing.useGlobalPreferredServer = false;

      return config;
    }

    // The user specified a custom SMTP server.
    config.outgoing.existingServerKey = null;
    config.outgoing.addThisServer = true;
    config.outgoing.useGlobalPreferredServer = false;

    try {
      let input = document.getElementById("outgoingHostname");
      config.outgoing.hostname = Sanitizer.hostname(input.value);
      input.value = config.outgoing.hostname;
    } catch (e) {
      gAccountSetupLogger.warn(e);
    }

    try {
      config.outgoing.port = Sanitizer.integerRange(
        document.getElementById("outgoingPort").value,
        1,
        65535
      );
    } catch (e) {
      config.outgoing.port = undefined; // incl. default "Auto"
    }

    config.outgoing.socketType = Sanitizer.integer(
      document.getElementById("outgoingSsl").value
    );
    config.outgoing.auth = Sanitizer.integer(
      document.getElementById("outgoingAuthMethod").value
    );

    return config;
  },

  /**
   * [Manual Config] button click handler. This turns the config details area
   * into an editable form and makes the (Go) button appear. The edit button
   * should only be available after the config probing is completely finished,
   * replacing what was the (Stop) button.
   */
  onManualEdit() {
    if (this._abortable) {
      this.onStop();
    }
    this.editConfigDetails();
    this.showHelperImage("step3");
  },

  /**
   * Setting the config details form so it can be edited. We also disable
   * (and hide) the create button during this time because we don't know what
   * might have changed. The function called from the button that restarts
   * the config check should be enabling the config button as needed.
   */
  editConfigDetails() {
    gAccountSetupLogger.debug("manual edit");

    if (!this._currentConfig) {
      this._currentConfig = new AccountConfig();
      this._currentConfig.incoming.type = "imap";
      this._currentConfig.incoming.username = "%EMAILADDRESS%";
      this._currentConfig.outgoing.username = "%EMAILADDRESS%";
      this._currentConfig.incoming.hostname = ".%EMAILDOMAIN%";
      this._currentConfig.outgoing.hostname = ".%EMAILDOMAIN%";
    }
    // Although we go manual, and we need to display the concrete username,
    // however the realname and password is not part of manual config and
    // must stay a placeholder in _currentConfig. @see getUserConfig()

    this._fillManualEditFields(this.getConcreteConfig());

    // _fillManualEditFields() indirectly calls validateManualEditComplete(),
    // but it's important to not forget it in case the code is rewritten,
    // so calling it explicitly again. Doesn't do harm, speed is irrelevant.
    this.validateManualEditComplete();
  },

  /**
   * Fills the manual edit textfields with the provided config.
   *
   * @param {AccountConfig} config - The config to present to the user.
   */
  _fillManualEditFields(config) {
    assert(config instanceof AccountConfig);

    let isExchange = config.incoming.type == "exchange";

    // Incoming server.
    document.getElementById("incomingProtocolExchange").hidden = !isExchange;
    document.getElementById("incomingProtocol").value = Sanitizer.translate(
      config.incoming.type,
      { imap: 1, pop3: 2, exchange: 3 },
      1
    );
    document.getElementById("incomingHostname").value =
      config.incoming.hostname;
    document.getElementById("incomingSsl").value = Sanitizer.enum(
      config.incoming.socketType,
      [0, 1, 2, 3],
      0
    );
    document.getElementById("incomingAuthMethod").value = Sanitizer.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    document.getElementById("incomingUsername").value =
      config.incoming.username;

    // If a port number was specified other than "Auto"
    if (config.incoming.port) {
      document.getElementById("incomingPort").value = config.incoming.port;
    } else {
      this.adjustIncomingPortToSSLAndProtocol(config);
    }

    // If the incoming server hostname supports OAuth2, enable it.
    let iDetails = OAuth2Providers.getHostnameDetails(config.incoming.hostname);
    document.getElementById("in-authMethod-oauth2").hidden = !iDetails;
    if (iDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for incoming server ${config.incoming.hostname} is ${iDetails}`
      );
      config.incoming.oauthSettings = {};
      [
        config.incoming.oauthSettings.issuer,
        config.incoming.oauthSettings.scope,
      ] = iDetails;
      this._currentConfig.incoming.oauthSettings =
        config.incoming.oauthSettings;
    }

    // Outgoing server.

    document.getElementById("outgoingHostname").value =
      config.outgoing.hostname;
    document.getElementById("outgoingUsername").value =
      config.outgoing.username;

    // While sameInOutUsernames is true we synchronize values of incoming
    // and outgoing username.
    this.sameInOutUsernames = true;
    document.getElementById("outgoingSsl").value = Sanitizer.enum(
      config.outgoing.socketType,
      [0, 1, 2, 3],
      0
    );
    document.getElementById("outgoingAuthMethod").value = Sanitizer.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );

    // If a port number was specified other than "Auto"
    if (config.outgoing.port) {
      document.getElementById("outgoingPort").value = config.outgoing.port;
    } else {
      this.adjustOutgoingPortToSSLAndProtocol(config);
    }

    // If the smtp hostname supports OAuth2, enable it.
    let oDetails = OAuth2Providers.getHostnameDetails(config.outgoing.hostname);
    document.getElementById("out-authMethod-oauth2").hidden = !oDetails;
    if (oDetails) {
      gAccountSetupLogger.debug(
        `OAuth2 details for outgoing server ${config.outgoing.hostname} is ${oDetails}`
      );
      config.outgoing.oauthSettings = {};
      [
        config.outgoing.oauthSettings.issuer,
        config.outgoing.oauthSettings.scope,
      ] = oDetails;
      this._currentConfig.outgoing.oauthSettings =
        config.outgoing.oauthSettings;
    }
  },

  /**
   * Automatically fill port field in manual edit, unless the user entered a
   * non-standard port.
   *
   * @param {AccountConfig} config - The account configuration.
   */
  async adjustIncomingPortToSSLAndProtocol(config) {
    let incoming = config.incoming;

    // Bail out if a port number is already defined and it's not part of the
    // known ports array.
    if (incoming.port && !gAllStandardPorts.includes(incoming.port)) {
      return;
    }

    // Update the incoming auth method selection to Auto.
    document.getElementById("incomingAuthMethod").value = 0;

    let input = document.getElementById("incomingPort");

    // Bail out if the socketType doesn't match a known type and select the
    // "Auto" option.
    if (![1, 2, 3].includes(incoming.socketType)) {
      input.value = 0;
      return;
    }

    switch (incoming.type) {
      case "imap":
        input.value = incoming.socketType == 2 ? 993 : 143;
        break;

      case "pop":
        input.value = incoming.socketType == 2 ? 995 : 110;
        break;

      case "exchange":
        input.value = 443;
        break;
    }
  },

  /**
   * Automatically fill port field in manual edit, unless the user entered a
   * non-standard port.
   *
   * @param {AccountConfig} config - The account configuration.
   */
  async adjustOutgoingPortToSSLAndProtocol(config) {
    let outgoing = config.outgoing;

    // Bail out if a port number is already defined and it's not part of the
    // known ports array.
    if (outgoing.port && !gAllStandardPorts.includes(outgoing.port)) {
      return;
    }

    // Update the outgoing auth method selection to Auto.
    document.getElementById("outgoingAuthMethod").value = 0;

    let input = document.getElementById("outgoingPort");

    // Set the port with the SSL value if the socketType matches it.
    if (outgoing.socketType == 2) {
      input.value = 465;
      return;
    }

    // Otherwise, any other configuration will get the "Auto" value unless the
    // user specified a unique port number.
    input.value = 0;
  },

  /**
   * If the user changed the port manually, adjust the SSL value,
   * (only) if the new port is impossible with the old SSL value.
   * @param config {AccountConfig}
   */
  adjustIncomingSSLToPort(config) {
    let incoming = config.incoming;
    let newInSocketType = undefined;
    if (
      !incoming.port || // auto
      !gAllStandardPorts.includes(incoming.port)
    ) {
      return;
    }
    if (incoming.type == "imap") {
      // normal SSL impossible
      if (incoming.port == 143 && incoming.socketType == 2) {
        newInSocketType = 0; // auto
        // must be normal SSL
      } else if (incoming.port == 993 && incoming.socketType != 2) {
        newInSocketType = 2;
      }
    } else if (incoming.type == "pop3") {
      // normal SSL impossible
      if (incoming.port == 110 && incoming.socketType == 2) {
        newInSocketType = 0; // auto
        // must be normal SSL
      } else if (incoming.port == 995 && incoming.socketType != 2) {
        newInSocketType = 2;
      }
    }
    if (newInSocketType != undefined) {
      document.getElementById("incomingSsl").value = newInSocketType;
      document.getElementById("incomingAuthMethod").value = 0; // auto
    }
  },

  /**
   * @see adjustIncomingSSLToPort()
   */
  adjustOutgoingSSLToPort(config) {
    let outgoing = config.outgoing;
    let newOutSocketType = undefined;
    if (
      !outgoing.port || // auto
      !gAllStandardPorts.includes(outgoing.port)
    ) {
      return;
    }
    // normal SSL impossible
    if (
      (outgoing.port == 587 || outgoing.port == 25) &&
      outgoing.socketType == 2
    ) {
      newOutSocketType = 0; // auto
      // must be normal SSL
    } else if (outgoing.port == 465 && outgoing.socketType != 2) {
      newOutSocketType = 2;
    }
    if (newOutSocketType != undefined) {
      document.getElementById("outgoingSsl").value = newOutSocketType;
      document.getElementById("outgoingAuthMethod").value = 0; // auto
    }
  },

  onChangedProtocolIncoming() {
    let config = this.getUserConfig();
    this.adjustIncomingPortToSSLAndProtocol(config);
    this.onChangedManualEdit();
  },

  onChangedPortIncoming() {
    gAccountSetupLogger.debug("incoming port changed");
    this.adjustIncomingSSLToPort(this.getUserConfig());
    this.onChangedManualEdit();
  },

  onChangedPortOutgoing() {
    gAccountSetupLogger.debug("outgoing port changed");
    this.adjustOutgoingSSLToPort(this.getUserConfig());
    this.onChangedManualEdit();
  },

  onChangedSSLIncoming() {
    this.adjustIncomingPortToSSLAndProtocol(this.getUserConfig());
    this.onChangedManualEdit();
  },

  onChangedSSLOutgoing() {
    this.adjustOutgoingPortToSSLAndProtocol(this.getUserConfig());
    this.onChangedManualEdit();
  },

  onChangedInAuth() {
    this.onChangedManualEdit();
  },

  onChangedOutAuth(event) {
    let selected = event.target.selectedIndex;
    if (selected) {
      document.getElementById("outgoingUsername").disabled =
        event.target[selected].id == "out-authMethod-no";
    }
    this.onChangedManualEdit();
  },

  onInputInUsername() {
    if (this.sameInOutUsernames) {
      document.getElementById(
        "outgoingUsername"
      ).value = document.getElementById("incomingUsername").value;
    }
    this.onChangedManualEdit();
  },

  onInputOutUsername() {
    this.sameInOutUsernames = false;
    this.onChangedManualEdit();
  },

  onBlurHostname() {
    this.onChangedManualEdit();
  },

  /**
   * A value in the manual configuration area was changed.
   */
  onChangedManualEdit() {
    // If there's a current operation in progress and is abortable.
    if (this._abortable) {
      this.onStop();
    }
    this.validateManualEditComplete();
  },

  /**
   * The user interacted with an input field in the manual configuration area
   * therefore we need to clear previous notifications and disable the "Done"
   * button as the current config is not valid until we run again the
   * validateManualEditComplete() method, which happens on input blur.
   */
  manualConfigChanged() {
    this.clearNotifications();
    document.getElementById("createButton").disabled = true;
  },

  /**
   * This enables the buttons which allow the user to proceed
   * once he has entered enough information.
   *
   * We can easily and fairly surely autodetect everything apart from the
   * hostname (and username). So, once the user has entered
   * proper hostnames, change to "manual-edit-have-hostname" mode
   * which allows to press [Re-test], which starts the detection
   * of the other values.
   * Once the user has entered (or we detected) all values, he may
   * do [Create Account] (tests login and if successful creates the account)
   * or [Advanced Setup] (goes to Account Manager). Esp. in the latter case,
   * we will not second-guess his setup and just to as told, so here we make
   * sure that he at least entered all values.
   */
  validateManualEditComplete() {
    // getUserConfig() is expensive, but still OK, not a problem.
    let manualConfig = this.getUserConfig();
    this._currentConfig = manualConfig;

    if (manualConfig.isComplete()) {
      this.switchToMode("manual-edit-complete");
      return;
    }

    if (!!manualConfig.incoming.hostname && !!manualConfig.outgoing.hostname) {
      this.switchToMode("manual-edit-have-hostname");
      return;
    }

    this.switchToMode("manual-edit");
  },

  /**
   * [Advanced Setup...] button click handler
   * Only active in manual edit mode, and goes straight into
   * Account Settings (pref UI) dialog. Requires a backend account,
   * which requires proper hostname, port and protocol.
   */
  async onAdvancedSetup() {
    assert(this._currentConfig instanceof AccountConfig);
    let configFilledIn = this.getConcreteConfig();

    if (CreateInBackend.checkIncomingServerAlreadyExists(configFilledIn)) {
      let [title, description] = await document.l10n.formatValues([
        "account-setup-creation-error-title",
        "account-setup-error-server-exists",
      ]);
      Services.prompt.alert(null, title, description);
      return;
    }

    let [title, description] = await document.l10n.formatValues([
      "account-setup-confirm-advanced-title",
      "account-setup-confirm-advanced-description",
    ]);

    if (!Services.prompt.confirm(null, title, description)) {
      return;
    }

    gAccountSetupLogger.debug("creating account in backend");
    let newAccount = CreateInBackend.createAccountInBackend(configFilledIn);

    window.close();
    gMainWindow.postMessage("account-created-in-backend", "*");
    MsgAccountManager("am-server.xhtml", newAccount.incomingServer);
  },

  /**
   * [Re-test] button click handler.
   * Restarts the config guessing process after a person editing the server
   * fields.
   * It's called "half-manual", because we take the user-entered values
   * as given and will not second-guess them, to respect the user wishes.
   * (Yes, Sir! Will do as told!)
   * The values that the user left empty or on "Auto" will be guessed/probed
   * here. We will also check that the user-provided values work.
   */
  async testManualConfig() {
    this.clearNotifications();
    await this.startLoadingState(
      "account-setup-looking-up-settings-half-manual"
    );

    let newConfig = this.getUserConfig();
    gAccountSetupLogger.debug("manual config to test:\n" + newConfig);

    this.switchToMode("manual-edit-testing");
    // if (this._userPickedOutgoingServer) TODO
    let self = this;
    this._abortable = GuessConfig.guessConfig(
      this._domain,
      function(type, hostname, port, ssl, done, config) {
        // Progress.
        gAccountSetupLogger.debug(
          `progress callback host: ${hostname}, port: ${port}, type: ${type}`
        );
      },
      function(config) {
        // Success.
        self._abortable = null;
        self._fillManualEditFields(config);
        self.switchToMode("manual-edit-complete");
        self.stopLoadingState("account-setup-success-half-manual");
      },
      function(e, config) {
        // guessConfig failed.
        if (e instanceof CancelledException) {
          return;
        }
        self._abortable = null;
        gAccountSetupLogger.warn(`guessConfig failed: ${e}`);
        self.showErrorNotification("account-setup-find-settings-failed");
        self.switchToMode("manual-edit-have-hostname");
      },
      newConfig,
      newConfig.outgoing.existingServerKey ? "incoming" : "both"
    );
  },

  // -------------------
  // UI helper functions

  _prefillConfig(initialConfig) {
    let emailsplit = this._email.split("@");
    assert(emailsplit.length > 1);
    let emaillocal = Sanitizer.nonemptystring(emailsplit[0]);
    initialConfig.incoming.username = emaillocal;
    initialConfig.outgoing.username = emaillocal;
    return initialConfig;
  },

  clearError(which) {
    document.getElementById(`${which}Warning`).hidden = true;
    document.getElementById(`${which}Info`).hidden = false;
  },

  setError(which, msg_name) {
    try {
      document.getElementById(`${which}Info`).hidden = true;
      document.getElementById(`${which}Warning`).hidden = false;
    } catch (ex) {
      alertPrompt("Missing error string", msg_name);
    }
  },

  onFormSubmit(event) {
    // Prevent the actual form submission.
    event.preventDefault();

    // Select the only primary button that is visible and enabled.
    let currentButton = document.querySelector(
      ".buttons-container-last button.primary:not([disabled],[hidden])"
    );
    if (currentButton) {
      currentButton.click();
    }
  },

  // -------------------------------
  // Finish & dialog close functions

  onCancel() {
    window.close();
  },

  onUnload() {
    if (this._abortable) {
      this._abortable.cancel(new UserCancelledException());
    }

    // Some tests might close the account setup before it finishes loading,
    // therefore the gMainWindow might still be null. If that's the case, do an
    // early return since we don't need to post any message to the main window.
    if (!gMainWindow) {
      return;
    }

    // Trigger the startup process if the user didn't complete the setup.
    gMainWindow.postMessage("account-setup-cancelled", "*");
    gAccountSetupLogger.debug("Shutting down email config dialog");
  },

  async onCreate() {
    try {
      gAccountSetupLogger.debug("Create button clicked");

      let configFilledIn = this.getConcreteConfig();
      let self = this;
      // If the dialog is not needed, it will go straight to OK callback
      gSecurityWarningDialog.open(
        this._currentConfig,
        configFilledIn,
        true,
        async function() {
          // on OK
          await self.validateAndFinish(configFilledIn);
        },
        function() {
          // on cancel, do nothing
        }
      );
    } catch (ex) {
      let errorMessage = await document.l10n.formatValue(
        "account-setup-creation-error-title"
      );
      errorMessage += `. Ex=${ex}. Stack=${ex.stack}`;
      gAccountSetupLogger.error(errorMessage);

      this.clearNotifications();
      let notification = this.notificationBox.appendNotification(
        errorMessage,
        "accountSetupError",
        null,
        this.notificationBox.PRIORITY_CRITICAL_HIGH,
        null
      );

      // Hide the close button to prevent dismissing the notification.
      notification.removeAttribute("dismissable");
    }
  },

  // called by onCreate()
  async validateAndFinish(configFilled) {
    let configFilledIn = configFilled || this.getConcreteConfig();

    if (CreateInBackend.checkIncomingServerAlreadyExists(configFilledIn)) {
      let [title, description] = await document.l10n.formatValues([
        "account-setup-creation-error-title",
        "account-setup-error-server-exists",
      ]);
      Services.prompt.alert(null, title, description);
      return;
    }

    if (configFilledIn.outgoing.addThisServer) {
      let existingServer = CreateInBackend.checkOutgoingServerAlreadyExists(
        configFilledIn
      );
      if (existingServer) {
        configFilledIn.outgoing.addThisServer = false;
        configFilledIn.outgoing.existingServerKey = existingServer.key;
      }
    }

    let createButton = document.getElementById("createButton");
    let reTestButton = document.getElementById("reTestButton");
    createButton.disabled = true;
    reTestButton.disabled = true;

    this.clearNotifications();
    this.startLoadingState("account-setup-checking-password");
    let telemetryKey =
      this._currentConfig.source == AccountConfig.kSourceXML ||
      this._currentConfig.source == AccountConfig.kSourceExchange
        ? this._currentConfig.subSource
        : this._currentConfig.source;

    let self = this;
    // logic function defined in verifyConfig.js
    verifyConfig(
      configFilledIn,
      // guess login config?
      configFilledIn.source != AccountConfig.kSourceXML,
      // TODO Instead, the following line would be correct, but I cannot use it,
      // because some other code doesn't adhere to the expectations/specs.
      // Find out what it was and fix it.
      // concreteConfig.source == AccountConfig.kSourceGuess,
      this._msgWindow,
      function(successfulConfig) {
        // success
        self.stopLoadingState(
          successfulConfig.incoming.password
            ? "account-setup-success-password"
            : null
        );

        // the auth might have changed, so we
        // should back-port it to the current config.
        self._currentConfig.incoming.auth = successfulConfig.incoming.auth;
        self._currentConfig.outgoing.auth = successfulConfig.outgoing.auth;
        self._currentConfig.incoming.username =
          successfulConfig.incoming.username;
        self._currentConfig.outgoing.username =
          successfulConfig.outgoing.username;

        // We loaded dynamic client registration, fill this data back in to the
        // config set.
        if (successfulConfig.incoming.oauthSettings) {
          self._currentConfig.incoming.oauthSettings =
            successfulConfig.incoming.oauthSettings;
        }
        if (successfulConfig.outgoing.oauthSettings) {
          self._currentConfig.outgoing.oauthSettings =
            successfulConfig.outgoing.oauthSettings;
        }
        self.finish(configFilledIn);

        Services.telemetry.keyedScalarAdd(
          "tb.account.successful_email_account_setup",
          telemetryKey,
          1
        );
      },
      function(e) {
        // failed
        // Could be a wrong password, but there are 1000 other
        // reasons why this failed. Only the backend knows.
        // If we got no message, then something other than VerifyLogon failed.

        // For an Exchange server, some known configurations can
        // be disabled (per user or domain or server).
        // Warn the user if the open protocol we tried didn't work.
        if (
          ["imap", "pop3"].includes(configFilledIn.incoming.type) &&
          configFilledIn.incomingAlternatives.some(i => i.type == "exchange")
        ) {
          self.showErrorNotification(
            "account-setup-exchange-config-unverifiable"
          );
        } else {
          let msg = e.message || e.toString();
          self.showErrorNotification(msg, true);
        }

        // give user something to proceed after fixing
        createButton.disabled = false;
        // hidden in non-manual mode, so it's fine to enable
        reTestButton.disabled = false;

        Services.telemetry.keyedScalarAdd(
          "tb.account.failed_email_account_setup",
          telemetryKey,
          1
        );
      }
    );
  },

  finish(concreteConfig) {
    gAccountSetupLogger.debug("creating account in backend");
    let newAccount = CreateInBackend.createAccountInBackend(concreteConfig);

    // Trigger the first login to download the folder structure and messages.
    newAccount.incomingServer.getNewMessages(
      newAccount.incomingServer.rootFolder,
      this._msgWindow,
      null
    );

    if (this._okCallback) {
      this._okCallback();
    }

    this.showSuccessView(newAccount);
  },

  /**
   * Toggle the visibility of the list of available services to configure.
   */
  toggleSetupContainer(event) {
    let container = event.target.closest(".linked-services-section");
    container.classList.toggle("opened");
    container
      .querySelector(".linked-services-container")
      .toggleAttribute("hidden");
  },

  /**
   * Update the account setup tab to show a successful final view with quick
   * links and suggested next steps.
   *
   * @param {nsIMsgAccount} account - The newly created account.
   */
  async showSuccessView(account) {
    gAccountSetupLogger.debug("Account creation successful");

    // Populate the account recap info.
    document.getElementById("newAccountName").textContent = this._realname;
    document.getElementById("newAccountEmail").textContent = this._email;
    document.getElementById("newAccountProtocol").textContent =
      account.incomingServer.type;

    // Store the host domain that will be used to look for CardDAV and CalDAV
    // services. We do this because we can't safely rely on DNS SRV.
    this._hostname = account.incomingServer.hostName;
    try {
      this._hostname = Services.eTLD.getBaseDomainFromHost(
        account.incomingServer.hostName
      );
    } catch (ex) {
      gAccountSetupLogger.warn(ex);
    }

    // Set up even listeners for the quick links.
    document.getElementById("settingsButton").addEventListener(
      "click",
      () => {
        MsgAccountManager(null, account.incomingServer);
      },
      { once: true }
    );

    // Hide the e2ee button if the current server doesn't support it.
    let hasEncryption =
      account.incomingServer.type != "rss" &&
      account.incomingServer.type != "nntp" &&
      account.incomingServer.protocolInfo?.canGetMessages;
    document.getElementById("encryptionButton").hidden = !hasEncryption;
    if (hasEncryption) {
      document
        .getElementById("encryptionButton")
        .addEventListener("click", () => {
          MsgAccountManager("am-e2e.xhtml", account.incomingServer);
        });
    }

    document.getElementById("signatureButton").addEventListener("click", () => {
      MsgAccountManager(null, account.incomingServer);
    });

    // Finally, show the success view.
    this.switchToMode("success");

    // Initialize the fetching of possible linked services like address books
    // or calendars.
    gAccountSetupLogger.debug("Fetching linked address books and calendars");

    let notification = this.syncingBox.appendNotification(
      await document.l10n.formatValue("account-setup-looking-up-address-books"),
      "accountSetupLoading",
      null,
      this.syncingBox.PRIORITY_INFO_LOW,
      null
    );
    notification.setAttribute("align", "center");

    // Hide the close button to prevent dismissing the notification.
    notification.removeAttribute("dismissable");

    // Detect linked address books.
    await this.fetchAddressBooks();

    // Update the notification and start detecting linked calendars.
    document.l10n.setAttributes(
      notification.messageText,
      "account-setup-looking-up-calendars"
    );
    await this.fetchCalendars();

    // Update the connected services description if we have at least one address
    // book or one calendar we can connect to.
    document.l10n.setAttributes(
      document.getElementById("linkedServicesDescription"),
      !this.addressBooks.length && !this.calendars.size
        ? "account-setup-no-linked-description"
        : "account-setup-linked-services-description"
    );

    // Clear the loading notification.
    this.syncingBox.removeAllNotifications();
    this.showHelperImage("step5");
  },

  /**
   * Fetch any available CardDAV address books.
   */
  async fetchAddressBooks() {
    this.addressBooks = [];
    try {
      this.addressBooks = await CardDAVUtils.detectAddressBooks(
        this._email,
        this._password,
        `https://${this._hostname}`,
        false
      );
    } catch (ex) {
      gAccountSetupLogger.error(ex);
    }

    let hideAddressBookUI = !this.addressBooks.length;
    document.getElementById("linkedAddressBooks").hidden = hideAddressBookUI;

    // Clear the UI from any previous list.
    let abList = document.querySelector(
      "#addressBooksSetup .linked-services-list"
    );
    while (abList.hasChildNodes()) {
      abList.lastChild.remove();
    }

    // Interrupt if we don't have anything to show.
    if (hideAddressBookUI) {
      return;
    }

    document.l10n.setAttributes(
      document.getElementById("addressBooksCountDescription"),
      "account-setup-found-address-books-description",
      { count: this.addressBooks.length }
    );

    // Collect existing carddav address books to compare with the list of
    // recently fetched ones.
    let existing = MailServices.ab.directories.map(d =>
      d.getStringValue("carddav.url", "")
    );

    // Populate the list of available address books.
    for (let book of this.addressBooks) {
      let provider = document.createElement("span");
      provider.classList.add("protocol-type");
      provider.textContent = "CardDAV";

      let name = document.createElement("span");
      name.classList.add("list-item-name");
      name.textContent = book.name;

      let button = document.createElement("button");
      button.setAttribute("type", "button");

      if (existing.includes(book.url.href)) {
        // This address book aready exists for some reason, so disable the
        // button and mark it as existing.
        button.classList.add("existing", "small");
        document.l10n.setAttributes(
          button,
          "account-setup-existing-address-book"
        );
        button.disabled = true;
      } else {
        button.classList.add("small");
        document.l10n.setAttributes(button, "account-setup-connect-link");
        button.addEventListener("click", () => {
          this._setupAddressBook(button, book);
        });
      }

      let row = document.createElement("li");
      row.appendChild(provider);
      row.appendChild(name);
      row.appendChild(button);
      abList.appendChild(row);
    }

    // Show a "connect all" button if we have more than one address book.
    document.getElementById("addressBooksSetupAll").hidden =
      this.addressBooks.length <= 1;
  },

  /**
   * Connect to the selected address book.
   *
   * @param {HTMLElement} button - The clicked button in the list.
   * @param {foundBook} book - The address book to configure.
   */
  _setupAddressBook(button, book) {
    book.create();

    // Update the button to reflect the creation of the new address book.
    button.classList.add("existing");
    document.l10n.setAttributes(button, "account-setup-existing-address-book");
    button.disabled = true;

    // Check if we have any address book left to set up and hide the
    // "Connect all" button if not.
    document.getElementById(
      "addressBooksSetupAll"
    ).hidden = !document.querySelectorAll(
      "#addressBooksSetup .linked-services-list button:not(.existing)"
    ).length;
  },

  /**
   * Loop through all available address books found and click the connect
   * button to trigger the method attached to the onclick listener.
   */
  setupAllAddressBooks() {
    for (let button of document.querySelectorAll(
      "#addressBooksSetup .linked-services-list button"
    )) {
      button.click();
    }
  },

  /**
   * Fetch any available CalDAV calendars.
   */
  async fetchCalendars() {
    this.calendars = {};
    try {
      this.calendars = await cal.provider.detection.detect(
        this._email,
        this._password,
        `https://${this._hostname}`,
        document.getElementById("rememberPassword").checked,
        [],
        {}
      );
    } catch (ex) {
      gAccountSetupLogger.error(ex);
    }

    let hideCalendarUI = !this.calendars.size;
    document.getElementById("linkedCalendars").hidden = hideCalendarUI;

    // Clear the UI from any previous list.
    let calList = document.querySelector(
      "#calendarsSetup .linked-services-list"
    );
    while (calList.hasChildNodes()) {
      calList.lastChild.remove();
    }

    // Interrupt if we don't have anything to show.
    if (hideCalendarUI) {
      return;
    }

    // Collect existing calendars to compare with the list of recently fetched
    // ones.
    let existing = new Set(
      cal
        .getCalendarManager()
        .getCalendars({})
        .map(calendar => calendar.uri.spec)
    );

    let calendarsCount = 0;

    // Populate the list of available calendars.
    for (let [provider, calendars] of this.calendars.entries()) {
      for (let calendar of calendars) {
        let cal_provider = document.createElement("span");
        cal_provider.classList.add("protocol-type");
        cal_provider.textContent = provider;

        let cal_name = document.createElement("span");
        cal_name.classList.add("list-item-name");
        cal_name.textContent = calendar.name;

        let button = document.createElement("button");
        button.setAttribute("type", "button");

        if (existing.has(calendar.uri.spec)) {
          // This calendar aready exists for some reason, so disable the button
          // and mark it as existing.
          button.classList.add("existing", "small");
          document.l10n.setAttributes(
            button,
            "account-setup-existing-calendar"
          );
          button.disabled = true;
        } else {
          button.classList.add("small");
          document.l10n.setAttributes(button, "account-setup-connect-link");
          button.addEventListener("click", () => {
            // If the button has a specific data attribute it means we want to
            // set up the calendar directly without opening the dialog.
            if (button.hasAttribute("data-setup-calendar")) {
              this._setupCalendar(button, calendar);
              return;
            }

            this._showCalendarDialog(button, calendar);
          });
        }

        let row = document.createElement("li");
        row.appendChild(cal_provider);
        row.appendChild(cal_name);
        row.appendChild(button);
        calList.appendChild(row);

        calendarsCount++;
      }
    }

    document.l10n.setAttributes(
      document.getElementById("calendarsCountDescription"),
      "account-setup-found-calendars-description",
      { count: calendarsCount }
    );

    // Show a "connect all" button if we have more than one calendar.
    document.getElementById("calendarsSetupAll").hidden = calendarsCount <= 1;
  },

  /**
   * Show the dialog to connect the selected calendar. This native HTML dialog
   * is a streamlined version of the calendar-properties-dialog.xhtml. The two
   * dialogs should kept in sync if a property of the calendar changes that
   * requires updating any field.
   *
   * @param {HTMLElement} button - The clicked button in the list.
   * @param {calICalendar} calendar - The calendar to configure.
   */
  _showCalendarDialog(button, calendar) {
    let dialog = document.getElementById("calendarDialog");

    // Update the calendar info in the dialog.
    let nameInput = document.getElementById("calendarName");
    nameInput.value = calendar.name;

    // Some servers provide colors as an 8-character hex string, which the color
    // picker can't handle. Strip the alpha component.
    let color = calendar.getProperty("color");
    let alpha = color?.match(/^(#[0-9A-Fa-f]{6})[0-9A-Fa-f]{2}$/);
    if (alpha) {
      calendar.setProperty("color", alpha[1]);
      color = alpha[1];
    }
    let colorInput = document.getElementById("calendarColor");
    colorInput.value = color || "#A8C2E1";

    let readOnlyCheckbox = document.getElementById("calendarReadOnly");
    readOnlyCheckbox.checked = calendar.readOnly;

    // Hide the "Show reminders" checkbox if the calendar doesn't support it.
    document.getElementById("calendarShowRemindersRow").hidden =
      calendar.getProperty("capabilities.alarms.popup.supported") === false;
    let remindersCheckbox = document.getElementById("calendarShowReminders");
    remindersCheckbox.checked = !calendar.getProperty("suppressAlarms");

    // Hide the "Offline support" if the calendar doesn't support it.
    let offlineCheckbox = document.getElementById("calendarOfflineSupport");
    let canCache = calendar.getProperty("cache.supported") !== false;
    let alwaysCache = calendar.getProperty("cache.always");
    if (!canCache || alwaysCache) {
      offlineCheckbox.hidden = true;
      offlineCheckbox.disabled = true;
    }
    offlineCheckbox.checked =
      alwaysCache || (canCache && calendar.getProperty("cache.enabled"));

    // Set up the "Refresh calendar" menulist.
    let calendarRefresh = document.getElementById("calendaRefresh");
    calendarRefresh.disabled = !calendar.canRefresh;
    calendarRefresh.value = calendar.getProperty("refreshInterval") || 30;

    // Set up the dialog's action buttons.
    document.getElementById("calendarDialogConfirmButton").addEventListener(
      "click",
      () => {
        // Update the attributes of the calendar in case the user changed some
        // values.
        calendar.name = nameInput.value;
        calendar.setProperty("color", colorInput.value);
        if (calendar.canRefresh) {
          calendar.setProperty("refreshInterval", calendarRefresh.value);
        }

        calendar.readOnly = readOnlyCheckbox.checked;
        calendar.setProperty("suppressAlarms", !remindersCheckbox.checked);
        if (!alwaysCache) {
          calendar.setProperty("cache.enabled", offlineCheckbox.checked);
        }

        this._setupCalendar(button, calendar);
        dialog.close();
      },
      { once: true }
    );

    document.getElementById("calendarDialogCancelButton").addEventListener(
      "click",
      () => {
        dialog.close();
      },
      { once: true }
    );

    dialog.showModal();
  },

  /**
   * Connect to the selected calendar.
   *
   * @param {HTMLElement} button - The clicked button in the list.
   * @param {calICalendar} calendar - The calendar to configure.
   */
  _setupCalendar(button, calendar) {
    cal.getCalendarManager().registerCalendar(calendar);

    // Update the button to reflect the creation of the new calendar.
    button.classList.add("existing");
    document.l10n.setAttributes(button, "account-setup-existing-calendar");
    button.disabled = true;

    // Check if we have any calendar left to set up and hide the "Connect all"
    // button if not.
    document.getElementById(
      "calendarsSetupAll"
    ).hidden = !document.querySelectorAll(
      "#calendarsSetup .linked-services-list button:not(.existing)"
    ).length;
  },

  /**
   * Loop through all available calendars found and click the connect
   * button to trigger the method attached to the onclick listener.
   */
  setupAllCalendars() {
    for (let button of document.querySelectorAll(
      "#calendarsSetup .linked-services-list button:not(.existing)"
    )) {
      // Set the attribute to skip the opening of the properties dialog.
      button.setAttribute("data-setup-calendar", true);
      button.click();
    }
  },

  /**
   * Called from the very final view of the account setup, when the user decides
   * to close the wizard.
   */
  onFinish() {
    // Send the message to the mail tab in case the UI didn't load during the
    // previous setup callback.
    gMainWindow.postMessage("account-setup-closed", "*");
    // Close this tab.
    window.close();
  },
};

function serverMatches(a, b) {
  return (
    a.type == b.type &&
    a.hostname == b.hostname &&
    a.port == b.port &&
    a.socketType == b.socketType &&
    a.auth == b.auth
  );
}

/**
 * Warning dialog, warning user about lack of, or inappropriate, encryption.
 */
var gSecurityWarningDialog = {
  /**
   * {Array of {(incoming or outgoing) server part of {AccountConfig}}
   * A list of the servers for which we already showed this dialog and the
   * user approved the configs. For those, we won't show the warning again.
   * (Make sure to store a copy in case the underlying object is changed.)
   */
  _acknowledged: [],

  _inSecurityBad: 0x0001,
  _inCertBad: 0x0010,
  _outSecurityBad: 0x0100,
  _outCertBad: 0x1000,

  /**
   * Checks whether we need to warn about this config.
   *
   * We (currently) warn if
   * - the mail travels unsecured (no SSL/STARTTLS)
   * - (We don't warn about unencrypted passwords specifically,
   *   because they'd be encrypted with SSL and without SSL, we'd
   *   warn anyways.)
   *
   * We may not warn despite these conditions if we had shown the
   * warning for that server before and the user acknowledged it.
   * (Given that this dialog object is static/global and persistent,
   * we can store that approval state here in this object.)
   *
   * @param configSchema @see open()
   * @param configFilledIn @see open()
   * @returns {Boolean} - True when the dialog should be shown
   *   (call open()). if false, the dialog can and should be skipped.
   */
  needed(configSchema, configFilledIn) {
    assert(configSchema instanceof AccountConfig);
    assert(configFilledIn instanceof AccountConfig);
    assert(configSchema.isComplete());
    assert(configFilledIn.isComplete());

    let incomingBad =
      (configFilledIn.incoming.socketType > 1 ? 0 : this._inSecurityBad) |
      (configFilledIn.incoming.badCert ? this._inCertBad : 0);
    let outgoingBad = 0;
    if (configFilledIn.outgoing.addThisServer) {
      outgoingBad =
        (configFilledIn.outgoing.socketType > 1 ? 0 : this._outSecurityBad) |
        (configFilledIn.outgoing.badCert ? this._outCertBad : 0);
    }

    if (incomingBad > 0) {
      if (
        this._acknowledged.some(ackServer => {
          return serverMatches(ackServer, configFilledIn.incoming);
        })
      ) {
        incomingBad = 0;
      }
    }
    if (outgoingBad > 0) {
      if (
        this._acknowledged.some(ackServer => {
          return serverMatches(ackServer, configFilledIn.outgoing);
        })
      ) {
        outgoingBad = 0;
      }
    }

    return incomingBad | outgoingBad;
  },

  /**
   * Opens the dialog, fills it with values, and shows it to the user.
   *
   * The function is async: it returns immediately, and when the user clicks
   * OK or Cancel, the callbacks are called. There the callers proceed as
   * appropriate.
   *
   * @param configSchema   The config, with placeholders not replaced yet.
   *      This object may be modified to store the user's confirmations, but
   *      currently that's not the case.
   * @param configFilledIn   The concrete config with placeholders replaced.
   * @param onlyIfNeeded {Boolean}   If there is nothing to warn about,
   *     call okCallback() immediately (and sync).
   * @param okCallback {function(config {AccountConfig})}
   *      Called when the user clicked OK and approved the config including
   *      the warnings. |config| is without placeholders replaced.
   * @param cancalCallback {function()}
   *      Called when the user decided to heed the warnings and not approve.
   */
  open(configSchema, configFilledIn, onlyIfNeeded, okCallback, cancelCallback) {
    assert(typeof okCallback == "function");
    assert(typeof cancelCallback == "function");

    // needed() also checks the parameters
    let needed = this.needed(configSchema, configFilledIn);
    if (needed == 0 && onlyIfNeeded) {
      okCallback();
      return;
    }

    assert(needed > 0, "security dialog opened needlessly");

    let dialog = document.getElementById("insecureDialog");
    this._currentConfigFilledIn = configFilledIn;
    this._okCallback = okCallback;
    this._cancelCallback = cancelCallback;
    let incoming = configFilledIn.incoming;
    let outgoing = configFilledIn.outgoing;

    // Reset the dialog, in case we've shown it before.
    document.getElementById("acknowledgeWarning").checked = false;
    document.getElementById("insecureConfirmButton").disabled = true;

    // Incoming security is bad.
    let insecureIncoming = document.getElementById("insecureSectionIncoming");
    if (needed & this._inSecurityBad) {
      document.l10n.setAttributes(
        document.getElementById("warningIncoming"),
        "account-setup-warning-cleartext",
        {
          server: incoming.hostname,
        }
      );

      document.l10n.setAttributes(
        document.getElementById("detailsIncoming"),
        "account-setup-warning-cleartext-details"
      );

      insecureIncoming.hidden = false;
    } else {
      insecureIncoming.hidden = true;
    }

    // Outgoing security or certificate is bad.
    let insecureOutgoing = document.getElementById("insecureSectionOutgoing");
    if (needed & this._outSecurityBad) {
      document.l10n.setAttributes(
        document.getElementById("warningOutgoing"),
        "account-setup-warning-cleartext",
        {
          server: outgoing.hostname,
        }
      );

      document.l10n.setAttributes(
        document.getElementById("detailsOutgoing"),
        "account-setup-warning-cleartext-details"
      );

      insecureOutgoing.hidden = false;
    } else {
      insecureOutgoing.hidden = true;
    }

    assert(
      !insecureIncoming.hidden || !insecureOutgoing.hidden,
      "warning dialog shown for unknown reason"
    );

    // Show the dialog.
    dialog.showModal();
  },

  /**
   * User checked checkbox that he understood it and wishes to ignore the
   * warning.
   */
  toggleAcknowledge() {
    document.getElementById(
      "insecureConfirmButton"
    ).disabled = !document.getElementById("acknowledgeWarning").checked;
  },

  /**
   * [Cancel] button pressed. Get me out of here!
   */
  onCancel() {
    document.getElementById("insecureDialog").close();
    document.getElementById("incomingProtocol").focus();

    this._cancelCallback();
  },

  /**
   * [OK] button pressed.
   * Implies that the user toggled the acknowledge checkbox,
   * i.e. approved the config and ignored the warnings,
   * otherwise the button would have been disabled.
   */
  onOK() {
    assert(document.getElementById("acknowledgeWarning").checked);

    // Need filled in, in case the hostname is a placeholder.
    let storeConfig = this._currentConfigFilledIn.copy();
    this._acknowledged.push(storeConfig.incoming);
    this._acknowledged.push(storeConfig.outgoing);

    document.getElementById("insecureDialog").close();

    this._okCallback();
  },
};

/**
 * Helper method to open the dictionaries list in a new tab.
 */
function openDictionariesTab() {
  let mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  let tabmail = mailWindow.document.getElementById("tabmail");

  let url = Services.urlFormatter.formatURLPref(
    "spellchecker.dictionaries.download.url"
  );

  // Open the dictionaries URL.
  tabmail.openTab("contentTab", {
    url,
  });
}
