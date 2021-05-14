/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozElements */

/* import-globals-from ../../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from accountConfig.js */
/* import-globals-from createInBackend.js */
/* import-globals-from exchangeAutoDiscover.js */
/* import-globals-from fetchConfig.js */
/* import-globals-from fetchhttp.js */
/* import-globals-from guessConfig.js */
/* import-globals-from readFromXML.js */
/* import-globals-from sanitizeDatatypes.js */
/* import-globals-from util.js */
/* import-globals-from verifyConfig.js */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { OAuth2Providers } = ChromeUtils.import(
  "resource:///modules/OAuth2Providers.jsm"
);

var {
  cleanUpHostName,
  isLegalHostNameOrIP,
  kMaxPort,
  kMinPort,
} = ChromeUtils.import("resource:///modules/hostnameUtils.jsm");

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

// from http://xyfer.blogspot.com/2005/01/javascript-regexp-email-validator.html
var emailRE = /^[-_a-z0-9\'+*$^&%=~!?{}]+(?:\.[-_a-z0-9\'+*$^&%=~!?{}]+)*@(?:[-a-z0-9.]+\.[a-z]{2,20}|\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/i;

var gStringsBundle;
var gMessengerBundle;
var gBrandShortName;

/**
TODO for bug 549045:

- autodetect protocol
Polish
- reformat code style to match
<https://developer.mozilla.org/En/Mozilla_Coding_Style_Guide#Control_Structures>
- bold status
- remove status when user edited in manual edit
- add and adapt test from bug 534588
Bugs
- SSL cert errors
  - invalid cert (hostname mismatch) doesn't trigger warning dialog as it should
  - accept self-signed cert (e.g. imap.mail.ru) doesn't work
    (works without my patch),
    verifyConfig.js line 124 has no inServer, for whatever reason,
    although I didn't change verifyConfig.js at all
    (the change you see in that file is irrelevant: that was an attempt to fix
    the bug and clean up the code).
- Set radio IMAP vs. POP3, see TODO in code
Things to test (works for me):
- state transitions, buttons enable, status msgs
  - stop button
    - showes up again after stopping detection and restarting it
    - when stopping [retest]: buttons proper?
  - enter nonsense domain. guess fails, (so automatically) manual,
    change domain to real one (not in DB), guess succeeds.
    former bug: goes to manual first shortly, then to result
*/

// To debug, set mail.setup.loglevel="All" and kDebug = true.
const kDebug = false;

// The main 3 Pane Window that we need to define on load in order to properly
// update the UI when a new account is created.
var gMainWindow;

// Define window event listeners.
window.addEventListener("load", () => {
  gEmailConfigWizard.onLoad();
});
window.addEventListener("unload", () => {
  gEmailConfigWizard.onUnload();
});

function e(elementID) {
  return document.getElementById(elementID);
}

function _hide(id) {
  e(id).hidden = true;
}

function _show(id) {
  e(id).hidden = false;
}

function _enable(id) {
  e(id).disabled = false;
}

function _disable(id) {
  e(id).disabled = true;
}

function setText(id, value) {
  var element = e(id);
  assert(element, "setText() on non-existent element ID");

  if (element.localName == "input" || element.localName == "label") {
    element.value = value;
  } else if (
    element.localName == "description" ||
    element.localName == "hbox"
  ) {
    element.textContent = value;
  } else {
    throw new NotReached("XUL element type not supported");
  }
}

function setLabelFromStringBundle(elementID, stringName) {
  e(elementID).textContent = gMessengerBundle.getString(stringName);
}

function removeChildNodes(el) {
  while (el.hasChildNodes()) {
    el.lastChild.remove();
  }
}

function onSetupComplete() {
  // Post a message to the main window at the end of a successful account setup.
  gMainWindow.postMessage("account-created", "*");
}

/**
 * Prompt a native HTML confirmation dialog with a simple YES/NO option.
 *
 * @param {string} questionLabel - Text with the question.
 * @param {string} okLabel - Text for OK/Yes button.
 * @param {string} cancelLabel - Text for Cancel/No button.
 * @param {function} okCallback - Called when the user clicks OK.
 * @param {function(ex)} cancelCallback - Called when the user clicks Cancel
 *   or if you call `Abortable.cancel()`.
 * @returns {Abortable} - If `Abortable.cancel()` is called,
 *   the dialog is closed and the `cancelCallback()` is called.
 */
function confirmDialog(
  questionLabel,
  okLabel,
  cancelLabel,
  okCallback,
  cancelCallback
) {
  let dialog = document.getElementById("confirmationDialog");

  document.getElementById("confirmationQuestion").textContent = questionLabel;

  let okButton = document.getElementById("confirmationOKButton");
  okButton.textContent = okLabel;
  okButton.addEventListener(
    "click",
    () => {
      dialog.close();
      okCallback();
    },
    { once: true }
  );

  let cancelButton = document.getElementById("confirmationCancelButton");
  cancelButton.textContent = cancelLabel;
  cancelButton.addEventListener(
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

function EmailConfigWizard() {
  this._init();
}

EmailConfigWizard.prototype = {
  // Boolean attribute to keep track of the initialization status of the wizard.
  isInited: false,

  _init() {
    gEmailWizardLogger.info("Initializing setup wizard");
    this._abortable = null;
  },

  get notificationBox() {
    if (!this._notificationBox) {
      this._notificationBox = new MozElements.NotificationBox(element => {
        element.setAttribute("notificationside", "bottom");
        document.getElementById("accountSetupNotifications").append(element);
      });
    }
    return this._notificationBox;
  },

  clearNotifications() {
    this.notificationBox.removeAllNotifications();
  },

  onLoad() {
    // Bail out if it was already initialized.
    if (this.isInited) {
      return;
    }

    // Store the main window.
    gMainWindow = Services.wm.getMostRecentWindow("mail:3pane");
    /**
     * this._currentConfig is the config we got either from the XML file or
     * from guessing or from the user. Unless it's from the user, it contains
     * placeholders like %EMAILLOCALPART% in username and other fields.
     *
     * The config here must retain these placeholders, to be able to
     * adapt when the user enters a different realname, or password or
     * email local part. (A change of the domain name will trigger a new
     * detection anyways.)
     * That means, before you actually use the config (e.g. to create an
     * account or to show it to the user), you need to run replaceVariables().
     */
    this._currentConfig = null;

    this._domain = "";
    this._email = "";
    this._realname = "";
    if ("@mozilla.org/userinfo;1" in Cc) {
      let userInfo = Cc["@mozilla.org/userinfo;1"].getService(Ci.nsIUserInfo);
      // Assume that it's a genuine full name if it includes a space.
      if (userInfo.fullname.includes(" ")) {
        this._realname = userInfo.fullname;
      }
    }
    document.getElementById("realname").value = this._realname;
    this._password = "";
    this._showPassword = false;
    // This is used only for Exchange AutoDiscover and only if needed.
    this._exchangeUsername = "";
    // Store the successful callback in this attribute so we can send it around
    // the various validation methods.
    this._okCallback = onSetupComplete;
    this._msgWindow = gMainWindow.msgWindow;

    gEmailWizardLogger.info("Email account setup dialog loaded.");

    gStringsBundle = e("strings");
    gMessengerBundle = e("bundle_messenger");
    gBrandShortName = e("bundle_brand").getString("brandShortName");

    setLabelFromStringBundle(
      "in-authMethod-password-cleartext",
      "authPasswordCleartextViaSSL"
    ); // will warn about insecure later
    setLabelFromStringBundle(
      "in-authMethod-password-encrypted",
      "authPasswordEncrypted"
    );
    setLabelFromStringBundle("in-authMethod-kerberos", "authKerberos");
    setLabelFromStringBundle("in-authMethod-ntlm", "authNTLM");
    setLabelFromStringBundle("in-authMethod-oauth2", "authOAuth2");
    setLabelFromStringBundle("out-authMethod-no", "authNo");
    setLabelFromStringBundle(
      "out-authMethod-password-cleartext",
      "authPasswordCleartextViaSSL"
    ); // will warn about insecure later
    setLabelFromStringBundle(
      "out-authMethod-password-encrypted",
      "authPasswordEncrypted"
    );
    setLabelFromStringBundle("out-authMethod-kerberos", "authKerberos");
    setLabelFromStringBundle("out-authMethod-ntlm", "authNTLM");
    setLabelFromStringBundle("out-authMethod-oauth2", "authOAuth2");

    document.getElementById("incomingPort").value = gStringsBundle.getString(
      "port_auto"
    );
    this.fillPortDropdown("smtp");

    // If the account provisioner is preffed off, don't display
    // the account provisioner button.
    let provisionerButton = document.getElementById("provisionerButton");
    if (!Services.prefs.getBoolPref("mail.provider.enabled")) {
      provisionerButton.hidden = true;
    }

    let menulist = e("outgoingHostname");
    // Add the entry for the new host to the menulist
    let menuitem = menulist.appendItem("", "-new-"); // label,value
    menuitem.serverKey = null;

    // Populate SMTP server dropdown with already configured SMTP servers from
    // other accounts.
    for (let server of MailServices.smtp.servers) {
      let label = server.displayname;
      let key = server.key;
      if (
        MailServices.smtp.defaultServer &&
        MailServices.smtp.defaultServer.key == key
      ) {
        label += " " + gStringsBundle.getString("default_server_tag");
      }
      menuitem = menulist.appendItem(label, key, ""); // label,value,descr
      menuitem.serverKey = key;
    }

    // admin-locked prefs hurray
    if (!Services.prefs.getBoolPref("signon.rememberSignons")) {
      let rememberPasswordE = e("rememberPassword");
      rememberPasswordE.checked = false;
      rememberPasswordE.disabled = true;
    }

    // First, unhide the main window areas, and store the width,
    // so that we don't resize wildly when we unhide areas.
    // switchToMode() will then hide the unneeded parts again.
    // We will add some leeway of 10px, in case some of the <description>s wrap,
    // e.g. outgoing username != incoming username.
    _show("resultsArea");
    _hide("manualConfigArea");

    this.switchToMode("start");
    e("realname").select();

    // In a new profile, the first request to live.thunderbird.net
    // is much slower because of one-time overheads like DNS and OCSP.
    // Let's create some dummy requests to prime the connections.
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
  },

  /**
   * Changes the window configuration to the different modes we have.
   * Shows/hides various window parts and buttons.
   * @param modename {String-enum}
   *    "start" : Just the realname, email address, password fields
   *    "find-config" : detection step, adds the progress message/spinner
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
    if (modename == this._currentModename) {
      return;
    }
    this._currentModename = modename;
    gEmailWizardLogger.info("switching to UI mode " + modename);

    if (modename == "start") {
      this.clearNotifications();
      _hide("resultsArea");
      _hide("manualConfigArea");

      _show("continueButton");
      _disable("continueButton"); // will be enabled by code
      _hide("manualConfigButton");
      _hide("reTestButton");
      _hide("createButton");
      _hide("stopButton");
    } else if (modename == "find-config") {
      _hide("resultsArea");
      _hide("manualConfigArea");

      _show("continueButton");
      _disable("continueButton");
      _hide("reTestButton");
      _hide("createButton");
      _show("stopButton");
      this.onStop = this.onStopFindConfig;
      _hide("manualConfigButton");
    } else if (modename == "result") {
      _show("resultsArea");
      _hide("manualConfigArea");

      _hide("continueButton");
      _hide("reTestButton");
      _show("createButton");
      _enable("createButton");
      _hide("stopButton");
      _show("manualConfigButton");
    } else if (modename == "manual-edit") {
      _hide("resultsArea");
      _show("manualConfigArea");

      _hide("continueButton");
      _show("reTestButton");
      _disable("reTestButton");
      _show("createButton");
      _disable("createButton");
      _hide("stopButton");
      _hide("manualConfigButton");
    } else if (modename == "manual-edit-have-hostname") {
      _hide("resultsArea");
      _show("manualConfigArea");
      _hide("manualConfigButton");
      _hide("continueButton");
      _show("createButton");

      _show("reTestButton");
      _enable("reTestButton");
      _disable("createButton");
      _hide("stopButton");
    } else if (modename == "manual-edit-testing") {
      _hide("resultsArea");
      _show("manualConfigArea");
      _hide("manualConfigButton");
      _hide("continueButton");
      _show("createButton");

      _show("reTestButton");
      _disable("reTestButton");
      _disable("createButton");
      _show("stopButton");
      this.onStop = this.onStopHalfManualTesting;
    } else if (modename == "manual-edit-complete") {
      _hide("resultsArea");
      _show("manualConfigArea");
      _hide("manualConfigButton");
      _hide("continueButton");
      _show("createButton");

      _show("reTestButton");
      _enable("reTestButton");
      _enable("createButton");
      _hide("stopButton");
    } else {
      throw new NotReached("unknown mode");
    }
    // If we're offline, we're going to disable the create button, but enable
    // the advanced config button if we have a current config.
    if (Services.io.offline) {
      if (this._currentConfig != null) {
        _hide("reTestButton");
        _hide("createButton");
        _hide("manualConfigButton");
      }
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
    this.checkStartDone();
  },

  getConcreteConfig() {
    let result = this._currentConfig.copy();

    replaceVariables(result, this._realname, this._email, this._password);
    result.rememberPassword =
      document.getElementById("rememberPassword").checked && !!this._password;

    if (result.incoming.addonAccountType) {
      result.incoming.type = result.incoming.addonAccountType;
    }

    return result;
  },

  /*
   * This checks if the email address is at least possibly valid, meaning it
   * has an '@' before the last char.
   */
  validateEmailMinimally(emailAddr) {
    let atPos = emailAddr.lastIndexOf("@");
    return atPos > 0 && atPos + 1 < emailAddr.length;
  },

  /*
   * This checks if the email address is syntactically valid,
   * as far as we can determine. We try hard to make full checks.
   *
   * OTOH, we have a very small chance of false negatives,
   * because the RFC822 address spec is insanely complicated,
   * but rarely needed, so when this here fails, we show an error message,
   * but don't stop the user from continuing.
   * In contrast, if validateEmailMinimally() fails, we stop the user.
   */
  validateEmail(emailAddr) {
    return emailRE.test(emailAddr);
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
    this._email = e("email").value;
    this.onStartOver();
  },

  onInputRealname() {
    this._realname = e("realname").value;
    this.checkStartDone();
  },

  onInputUsername() {
    this._exchangeUsername = e("usernameEx").value;
    this.onStartOver();
  },

  onInputPassword() {
    this._password = e("password").value;
    this.onStartOver();
  },

  /**
   * Very simple validation to be sure the user adds an account name before
   * continuing with the account setup.
   */
  async onBlurRealname() {
    let input = document.getElementById("realname");

    // Remove the warning if we have any value.
    if (this._realname) {
      this.clearError("realname");
      input.setCustomValidity("");
      return;
    }

    // Show the warning only if the user did already enter an email address.
    if (this.validateEmailMinimally(this._email)) {
      this.setError("realname", "please_enter_name");
      let warning = await document.l10n.formatValue(
        "account-setup-name-warning"
      );
      input.setCustomValidity(warning);
    }
  },

  /**
   * Very simple validation of the email format against our regex. This warning
   * doesn't block the user from continuing to the next step, but it's just a
   * simple visual warning.
   */
  async onBlurEmail() {
    let input = document.getElementById("email");

    if (!this._email) {
      this.clearError("email");
      input.setCustomValidity("");
      return;
    }

    if (this.validateEmail(this._email)) {
      this.clearError("email");
      input.setCustomValidity("");
      this.onBlurRealname();
      return;
    }

    this.setError("email", "double_check_email");
    let warning = await document.l10n.formatValue(
      "account-setup-email-warning"
    );
    input.setCustomValidity(warning);
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
   * Check whether the user entered the minimum of information
   * needed to leave the "start" mode (entering of name, email, pw)
   * and is allowed to proceed to detection step.
   */
  checkStartDone() {
    if (this.validateEmailMinimally(this._email) && this._realname) {
      this._domain = this._email.split("@")[1].toLowerCase();
      _enable("continueButton");
      _show("manualConfigButton");
      _hide("provisionerButton");
    } else {
      _disable("continueButton");
      _hide("manualConfigButton");
      _show("provisionerButton");
    }
  },

  /**
   * When the [Continue] button is clicked, we move from the initial account
   * information stage to using that information to configure account details.
   */
  onContinue() {
    _hide("provisionerButton");
    this.findConfig(this._domain, this._email);
  },

  // --------------
  // Detection step

  /**
   * Try to find an account configuration for this email address.
   * This is the function which runs the autoconfig.
   */
  findConfig(domain, emailAddress) {
    gEmailWizardLogger.info("findConfig()");
    if (this._abortable) {
      this.onStop();
    }
    this.switchToMode("find-config");
    this.startLoadingState("account-setup-looking-up-settings");

    var self = this;
    var call = null;
    var fetch = null;

    var priority = (this._abortable = new PriorityOrderAbortable(
      function(config, call) {
        // success
        self._abortable = null;
        self.stopSpinner(call.foundMsg);
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
      this.startLoadingState("account-setup-looking-up-disk");
      call.foundMsg = "account-setup-success-settings-disk";
      fetch = fetchConfigFromDisk(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.startLoadingState("account-setup-looking-up-isp");
      call.foundMsg = "account-setup-success-settings-isp";
      fetch = fetchConfigFromISP(
        domain,
        emailAddress,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.startLoadingState("account-setup-looking-up-db");
      call.foundMsg = "account-setup-success-settings-db";
      fetch = fetchConfigFromDB(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.startLoadingState("account-setup-looking-up-mx");
      // "account-setup-success-settings-db" is correct.
      // We display the same message for both db and mx cases.
      call.foundMsg = "account-setup-success-settings-db";
      fetch = fetchConfigForMX(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.startLoadingState("account-setup-looking-up-exchange");
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
            this.stopSpinner(); // clears status message
            _show("usernameRow");
            if (!this._exchangeUsername) {
              this.showErrorNotification(
                "account-setup-credentials-incomplete"
              );
            } else {
              this.showErrorNotification("account-setup-credentials-wrong");
            }
            _show("manualConfigButton");
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
    var self = this;
    self._abortable = guessConfig(
      domain,
      function(type, hostname, port, ssl, done, config) {
        // progress
        var msg =
          hostname +
          ":" +
          port +
          " ssl=" +
          ssl +
          " " +
          type +
          ": progress callback";
        gEmailWizardLogger.info(msg);
      },
      function(config) {
        // success
        self._abortable = null;
        self.foundConfig(config);
        self.stopSpinner(
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
        gEmailWizardLogger.info("guessConfig failed: " + e);
        self.showErrorNotification("account-setup-find-settings-failed");
        self.editConfigDetails();
      },
      initialConfig,
      "both"
    );
  },

  /**
   * When findConfig() was successful, it calls this.
   * This displays the config to the user.
   */
  foundConfig(config) {
    gEmailWizardLogger.info("found config:\n" + config);
    assert(
      config instanceof AccountConfig,
      "BUG: Arg 'config' needs to be an AccountConfig object"
    );

    this._haveValidConfigForDomain = this._email.split("@")[1];

    if (!this._realname || !this._email) {
      return;
    }

    config.addons = [];
    let successCallback = () => {
      this._abortable = null;
      this.displayConfigResult(config);
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
    gEmailWizardLogger.info("onStop cancelled _abortable");
    this._abortable.cancel(new UserCancelledException());
    this._abortable = null;
    this.stopSpinner();
  },

  onStopFindConfig() {
    this._onStopCommon();
    this.switchToMode("start");
    this.checkStartDone();
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
    gEmailWizardLogger.warn(`Spinner start: ${stringName}`);

    this.showHelperImage("step2");

    // Disable all input fields.
    for (let input of document.querySelectorAll("#form input")) {
      input.disabled = true;
    }

    let notificationMessage = await document.l10n.formatValue(stringName);

    gEmailWizardLogger.info(`Status msg: ${notificationMessage}`);

    let notification = this.notificationBox.getNotificationWithValue(
      "accountSetupLoading"
    );

    // If a notification already exists, simply update the message.
    if (notification) {
      notification.label = notificationMessage;
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
    if (this.notificationBox.gProton) {
      notification.removeAttribute("dismissable");
    } else {
      let closeButton = notification.messageDetails.nextElementSibling;
      closeButton.hidden = true;
    }
  },

  /**
   * Clear the loading notification and show a successful notification if
   * needed.
   *
   * @param {?string} stringName - The name of the fluent string that needs to
   *   be attached to the notification, or null if nothing needs to be showed.
   */
  async stopSpinner(stringName) {
    // Re-enable all form input fields.
    for (let input of document.querySelectorAll("#form input")) {
      input.removeAttribute("disabled");
    }

    // Always remove any leftover notification.
    this.clearNotifications();

    // Bail out if we don't need to show anything else.
    if (!stringName) {
      gEmailWizardLogger.warn("Spinner stopped");
      this.showHelperImage("step1");
      return;
    }

    gEmailWizardLogger.warn(`Spinner stopped: ${stringName}`);

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
    if (this.notificationBox.gProton) {
      notification.removeAttribute("dismissable");
    } else {
      let closeButton = notification.messageDetails.nextElementSibling;
      closeButton.hidden = true;
    }

    this.showHelperImage("step3");
    this.ensureVisibleButtons();
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
    gEmailWizardLogger.warn(`Status error: ${stringName}`);

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
    if (this.notificationBox.gProton) {
      notification.removeAttribute("dismissable");
    } else {
      let closeButton = notification.messageDetails.nextElementSibling;
      closeButton.hidden = true;
    }

    this.ensureVisibleButtons();
  },

  /**
   * Hide all the helper images and show the requested one.
   *
   * @param {string} id - The string ID of the element to show.
   */
  showHelperImage(id) {
    // Loop through all the articles containig helper images and hide them all
    // except for the matching ID.
    for (let article of document.querySelectorAll(".second-column article")) {
      article.hidden = article.id != id;
    }
  },

  /**
   * Always ensure the primary button is visible by scrolling the page until the
   * button is above the fold.
   */
  ensureVisibleButtons() {
    document
      .getElementById("createButton")
      .scrollIntoView({ behavior: "smooth", block: "end", inline: "nearest" });
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
    protocols = protocols.unique(protocol => protocol.type);

    // Hide all the available options in order to start with a clean slate.
    for (let row of document.querySelectorAll(".content-blocking-category")) {
      row.classList.remove("selected");
      row.hidden = true;
    }

    // Show the matching radio inputs if we have more than one available
    // protocol for this configuration.
    if (protocols.length > 1) {
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
    }

    if (config.incoming.type == "exchange") {
      _disable("createButton");
      removeChildNodes(e("resultAddonInstallRows"));
      this.switchToMode("result");

      let hostnameE = e("result_exchange_hostname");
      _makeHostDisplayString(config.incoming, hostnameE);
      hostnameE.querySelector(".ssl").hidden = true; // it's always SSL, so just clutter
      hostnameE.querySelector(".protocolType").hidden = true; // already have a nicer label

      (async () => {
        for (let addon of config.addons) {
          let installer = new AddonInstaller(addon);
          addon.isInstalled = await installer.isInstalled();
        }
        let installedAddon = config.addons.find(addon => addon.isInstalled);
        if (installedAddon) {
          config.incoming.addonAccountType =
            installedAddon.useType.addonAccountType;
          _hide("installAddonInfo");
          _enable("createButton");
        } else {
          _show("installAddonInfo");
          var msg = gStringsBundle.getString("addon-intro");
          if (
            !config.incomingAlternatives.find(alt =>
              ["imap", "pop3"].includes(alt.type)
            )
          ) {
            msg = gStringsBundle.getString("no-open-protocols") + " " + msg;
          }
          document.getElementById("resultAddonIntro").textContent = msg;

          let containerE = e("resultAddonInstallRows");
          removeChildNodes(containerE);
          for (let addon of config.addons) {
            // Creates
            // <hbox flex="1">
            //   <image src="https://live.thunderbird.net/owl32.png" />
            //   <label is="text-link" href="https://live.thunderbird.net/owl">
            //     A third party addon that ...
            //   </label>
            //   <button class="larger-button"
            //           orient="vertical" crop="right"
            //           label="Install"
            //           oncommand="…" />
            // </hbox>
            let addonE = document.createXULElement("hbox");
            let iconE = document.createXULElement("image");
            let descrE = document.createXULElement("label", {
              is: "text-link",
            }); // must be <label> to be clickable
            descrE.classList.add("link");
            let buttonE = document.createXULElement("button");
            addonE.appendChild(iconE);
            addonE.appendChild(descrE);
            addonE.appendChild(buttonE);
            containerE.appendChild(addonE);
            addonE.setAttribute("flex", "1");
            addonE.setAttribute("align", "center");
            iconE.classList.add("icon");
            if (addon.icon32) {
              iconE.setAttribute("src", addon.icon32);
            }
            descrE.setAttribute("flex", "1");
            descrE.setAttribute("href", addon.websiteURL);
            descrE.textContent = addon.description;
            buttonE.classList.add("larger-button");
            buttonE.setAttribute("orient", "vertical");
            buttonE.setAttribute("crop", "right");
            buttonE.setAttribute(
              "label",
              gStringsBundle.getString("addonInstallShortLabel")
            );
            buttonE.setAttribute(
              "oncommand",
              "gEmailConfigWizard.addonInstall(this.addon);"
            );
            buttonE.addon = addon;
          }
          _disable("createButton");
        }
      })();
      return;
    }

    _enable("createButton");

    var unknownString = gStringsBundle.getString("resultUnknown");

    function _makeHostDisplayString(server, descrE) {
      let type = gStringsBundle.getString(
        sanitize.translate(server.type, {
          imap: "resultIMAP",
          pop3: "resultPOP3",
          smtp: "resultSMTP",
          exchange: "resultExchange",
        }),
        unknownString
      );
      let domain = Services.eTLD.getBaseDomainFromHost(server.hostname);
      let host = server.hostname.substr(
        0,
        server.hostname.length - domain.length
      );
      let port = isStandardPort(server.port) ? "" : ":" + server.port;
      let ssl = gStringsBundle.getString(
        sanitize.translate(server.socketType, {
          1: "resultNoEncryption",
          2: "resultSSL",
          3: "resultSTARTTLS",
        }),
        unknownString
      );
      let certStatus = gStringsBundle.getString(
        server.badCert ? "resultSSLCertWeak" : "resultSSLCertOK"
      );
      // TODO: we should really also display authentication method here.

      function _addComponent(text, className) {
        let textE = document.createXULElement("label");
        textE.classList.add(className);
        textE.textContent = text;
        descrE.appendChild(textE);
      }

      function _addCertStatus(text, className) {
        let textE = document.createXULElement("label");
        textE.classList.add(className);
        textE.textContent = text;
        descrE.appendChild(textE);
      }

      function _removeCertStatus() {
        let el = descrE.parentNode.querySelector(".certStatus");
        if (el != null) {
          el.remove();
        }
      }

      removeChildNodes(descrE);
      _removeCertStatus();
      _addComponent(type, "protocolType");
      _addComponent(host, "host-without-domain");
      _addComponent(domain, "domain");
      _addComponent(port, "port");
      _addComponent(ssl, "ssl");
      _addCertStatus(certStatus, "certStatus");

      if (server.socketType != 2 && server.socketType != 3) {
        // not SSL/STARTTLS
        descrE.querySelector(".ssl").classList.add("insecure");
      }
      if (server.badCert) {
        descrE.parentNode
          .querySelector(".certStatus")
          .classList.add("insecure");
      }
    }

    if (configFilledIn.incoming.hostname) {
      _makeHostDisplayString(
        configFilledIn.incoming,
        e(`incomingInfo-${config.incoming.type}`)
      );
    }

    if (!config.outgoing.existingServerKey) {
      if (configFilledIn.outgoing.hostname) {
        _makeHostDisplayString(
          configFilledIn.outgoing,
          e(`outgoingInfo-${config.incoming.type}`)
        );
      }
    } else {
      // setText() would confuse _makeHostDisplayString() when clearing the child nodes
      e(`outgoingInfo-${config.incoming.type}`).appendChild(
        document.createTextNode(
          gStringsBundle.getString("resultOutgoingExisting")
        )
      );
    }

    var usernameResult;
    if (configFilledIn.incoming.username == configFilledIn.outgoing.username) {
      usernameResult = gStringsBundle.getFormattedString("resultUsernameBoth", [
        configFilledIn.incoming.username || unknownString,
      ]);
    } else {
      usernameResult = gStringsBundle.getFormattedString(
        "resultUsernameDifferent",
        [
          configFilledIn.incoming.username || unknownString,
          configFilledIn.outgoing.username || unknownString,
        ]
      );
    }
    document.getElementById(
      `usernameInfo-${config.incoming.type}`
    ).textContent = usernameResult;

    this.switchToMode("result");
    this.ensureVisibleButtons();
  },

  /**
   * Handle the user switching between IMAP and POP3 settings using the
   * radio buttons.
   */
  onResultServerTypeChanged() {
    var config = this._currentConfig;
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
    _hide("installAddonInfo");
    _disable("createButton");
    this.clearNotifications();
    await this.startLoadingState("account-setup-installing-addon");

    try {
      var installer = (this._abortable = new AddonInstaller(addon));
      await installer.install();

      this._abortable = null;
      this.stopSpinner("account-setup-success-addon");
      _enable("createButton");

      this._currentConfig.incoming.type = addon.useType.addonAccountType;
      // this.validateAndFinish();
    } catch (e) {
      this.showErrorNotification(e, true);
      _show("installAddonInfo");
    }
  },

  // ----------------
  // Manual Edit area

  /**
   * Gets the values from the user in the manual edit area.
   *
   * Realname and password are not part of that area and still
   * placeholders, but hostname and username are concrete and
   * no placeholders anymore.
   */
  getUserConfig() {
    var config = this.getConcreteConfig();
    if (!config) {
      config = new AccountConfig();
    }
    config.source = AccountConfig.kSourceUser;

    // Incoming server
    try {
      var inHostnameField = e("incomingHostname");
      config.incoming.hostname = sanitize.hostname(inHostnameField.value);
      inHostnameField.value = config.incoming.hostname;
    } catch (e) {
      gEmailWizardLogger.warn(e);
    }
    try {
      config.incoming.port = sanitize.integerRange(
        e("incomingPort").value,
        kMinPort,
        kMaxPort
      );
    } catch (e) {
      config.incoming.port = undefined; // incl. default "Auto"
    }
    config.incoming.type = sanitize.translate(e("incomingProtocol").value, {
      1: "imap",
      2: "pop3",
      0: null,
    });
    config.incoming.socketType = sanitize.integer(e("incomingSsl").value);
    config.incoming.auth = sanitize.integer(e("incomingAuthMethod").value);
    config.incoming.username = e("incomingUsername").value;

    // Outgoing server

    // Did the user select one of the already configured SMTP servers from the
    // drop-down list? If so, use it.
    var outHostnameCombo = e("outgoingHostname");
    var outMenuitem = outHostnameCombo.selectedItem;
    if (outMenuitem && outMenuitem.serverKey) {
      config.outgoing.existingServerKey = outMenuitem.serverKey;
      config.outgoing.existingServerLabel = outMenuitem.label;
      config.outgoing.addThisServer = false;
      config.outgoing.useGlobalPreferredServer = false;
    } else {
      config.outgoing.existingServerKey = null;
      config.outgoing.addThisServer = true;
      config.outgoing.useGlobalPreferredServer = false;

      try {
        config.outgoing.hostname = sanitize.hostname(outHostnameCombo.value);
        outHostnameCombo.value = config.outgoing.hostname;
      } catch (e) {
        gEmailWizardLogger.warn(e);
      }
      try {
        config.outgoing.port = sanitize.integerRange(
          e("outgoingPort").value,
          kMinPort,
          kMaxPort
        );
      } catch (e) {
        config.outgoing.port = undefined; // incl. default "Auto"
      }
      config.outgoing.socketType = sanitize.integer(e("outgoingSsl").value);
      config.outgoing.auth = sanitize.integer(e("outgoingAuthMethod").value);
    }
    config.outgoing.username = e("outgoingUsername").value;

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
    gEmailWizardLogger.info("manual edit");

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
   * @param config {AccountConfig} The config to present to user
   */
  _fillManualEditFields(config) {
    assert(config instanceof AccountConfig);

    // incoming server
    e("incomingProtocol").value = sanitize.translate(
      config.incoming.type,
      { imap: 1, pop3: 2 },
      1
    );
    e("incomingHostname").value = config.incoming.hostname;
    e("incomingSsl").value = sanitize.enum(
      config.incoming.socketType,
      [0, 1, 2, 3],
      0
    );
    e("incomingAuthMethod").value = sanitize.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    e("incomingUsername").value = config.incoming.username;
    if (config.incoming.port) {
      e("incomingPort").value = config.incoming.port;
    } else {
      this.adjustIncomingPortToSSLAndProtocol(config);
    }
    this.fillPortDropdown(config.incoming.type);

    // If the incoming server hostname supports OAuth2, enable OAuth2 for it.
    let iDetails = OAuth2Providers.getHostnameDetails(config.incoming.hostname);
    e("in-authMethod-oauth2").hidden = !iDetails;
    if (iDetails) {
      gEmailWizardLogger.info(
        "OAuth2 details for incoming server " +
          config.incoming.hostname +
          " is " +
          iDetails
      );
      config.incoming.oauthSettings = {};
      [
        config.incoming.oauthSettings.issuer,
        config.incoming.oauthSettings.scope,
      ] = iDetails;
      this._currentConfig.incoming.oauthSettings =
        config.incoming.oauthSettings;
    }

    // outgoing server
    e("outgoingHostname").value = config.outgoing.hostname;
    e("outgoingUsername").value = config.outgoing.username;
    // While sameInOutUsernames is true we synchronize values of incoming
    // and outgoing username.
    this.sameInOutUsernames = true;
    e("outgoingSsl").value = sanitize.enum(
      config.outgoing.socketType,
      [0, 1, 2, 3],
      0
    );
    e("outgoingAuthMethod").value = sanitize.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );
    if (config.outgoing.port) {
      e("outgoingPort").value = config.outgoing.port;
    } else {
      this.adjustOutgoingPortToSSLAndProtocol(config);
    }

    // If the smtp hostname supports OAuth2, enable OAuth2 for it.
    let oDetails = OAuth2Providers.getHostnameDetails(config.outgoing.hostname);
    e("out-authMethod-oauth2").hidden = !oDetails;
    if (oDetails) {
      gEmailWizardLogger.info(
        "OAuth2 details for outgoing server " +
          config.outgoing.hostname +
          " is " +
          oDetails
      );
      config.outgoing.oauthSettings = {};
      [
        config.outgoing.oauthSettings.issuer,
        config.outgoing.oauthSettings.scope,
      ] = oDetails;
      this._currentConfig.outgoing.oauthSettings =
        config.outgoing.oauthSettings;
    }

    // populate fields even if existingServerKey, in case user changes back
    if (config.outgoing.existingServerKey) {
      let menulist = e("outgoingHostname");
      // We can't use menulist.value = config.outgoing.existingServerKey
      // because would overwrite the text field, so have to do it manually:
      let menuitems = menulist.menupopup.children;
      for (let menuitem of menuitems) {
        if (menuitem.serverKey == config.outgoing.existingServerKey) {
          menulist.selectedItem = menuitem;
          break;
        }
      }
    }
    this.onChangedOutgoingDropdown(); // show/hide outgoing port, SSL, ...
  },

  /**
   * Automatically fill port field in manual edit,
   * unless user entered a non-standard port.
   * @param config {AccountConfig}
   */
  adjustIncomingPortToSSLAndProtocol(config) {
    var autoPort = gStringsBundle.getString("port_auto");
    var incoming = config.incoming;
    // we could use getHostEntry() here, but that API is bad, so don't bother
    var newInPort = undefined;
    if (!incoming.port || isStandardPort(incoming.port)) {
      if (incoming.type == "imap") {
        if (incoming.socketType == 1 || incoming.socketType == 3) {
          newInPort = 143;
        } else if (incoming.socketType == 2) {
          // Normal SSL
          newInPort = 993;
        } else {
          // auto
          newInPort = autoPort;
        }
      } else if (incoming.type == "pop3") {
        if (incoming.socketType == 1 || incoming.socketType == 3) {
          newInPort = 110;
        } else if (incoming.socketType == 2) {
          // Normal SSLs
          newInPort = 995;
        } else {
          // auto
          newInPort = autoPort;
        }
      }
    }
    if (newInPort != undefined) {
      e("incomingPort").value = newInPort;
      e("incomingAuthMethod").value = 0; // auto
    }
  },

  /**
   * @see adjustIncomingPortToSSLAndProtocol()
   */
  adjustOutgoingPortToSSLAndProtocol(config) {
    var autoPort = gStringsBundle.getString("port_auto");
    var outgoing = config.outgoing;
    var newOutPort = undefined;
    if (!outgoing.port || isStandardPort(outgoing.port)) {
      if (outgoing.socketType == 1 || outgoing.socketType == 3) {
        // standard port is 587 *or* 25, so set to auto
        // unless user or config already entered one of these two ports.
        if (outgoing.port != 25 && outgoing.port != 587) {
          newOutPort = autoPort;
        }
      } else if (outgoing.socketType == 2) {
        // Normal SSL
        newOutPort = 465;
      } else {
        // auto
        newOutPort = autoPort;
      }
    }
    if (newOutPort != undefined) {
      e("outgoingPort").value = newOutPort;
      e("outgoingAuthMethod").value = 0; // auto
    }
  },

  /**
   * If the user changed the port manually, adjust the SSL value,
   * (only) if the new port is impossible with the old SSL value.
   * @param config {AccountConfig}
   */
  adjustIncomingSSLToPort(config) {
    var incoming = config.incoming;
    var newInSocketType = undefined;
    if (
      !incoming.port || // auto
      !isStandardPort(incoming.port)
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
      e("incomingSsl").value = newInSocketType;
      e("incomingAuthMethod").value = 0; // auto
    }
  },

  /**
   * @see adjustIncomingSSLToPort()
   */
  adjustOutgoingSSLToPort(config) {
    var outgoing = config.outgoing;
    var newOutSocketType = undefined;
    if (
      !outgoing.port || // auto
      !isStandardPort(outgoing.port)
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
      e("outgoingSsl").value = newOutSocketType;
      e("outgoingAuthMethod").value = 0; // auto
    }
  },

  /**
   * Sets the prefilled values of the port fields.
   * Filled statically with the standard ports for the given protocol,
   * plus "Auto".
   */
  fillPortDropdown(protocolType) {
    var menu = e(protocolType == "smtp" ? "outgoingPort" : "incomingPort");

    // menulist.removeAllItems() is nice, but "nicely" clears the user value, too
    removeChildNodes(menu.menupopup);

    // add standard ports
    var autoPort = gStringsBundle.getString("port_auto");
    menu.appendItem(autoPort, autoPort, ""); // label,value,descr
    for (let port of getStandardPorts(protocolType)) {
      menu.appendItem(port, port, ""); // label,value,descr
    }
  },

  onChangedProtocolIncoming() {
    var config = this.getUserConfig();
    this.adjustIncomingPortToSSLAndProtocol(config);
    this.fillPortDropdown(config.incoming.type);
    this.onChangedManualEdit();
  },
  onChangedPortIncoming() {
    gEmailWizardLogger.info("incoming port changed");
    this.adjustIncomingSSLToPort(this.getUserConfig());
    this.onChangedManualEdit();
  },
  onChangedPortOutgoing() {
    gEmailWizardLogger.info("outgoing port changed");
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
      e("outgoingUsername").disabled =
        event.target[selected].id == "out-authMethod-no";
    }
    this.onChangedManualEdit();
  },
  onInputInUsername() {
    if (this.sameInOutUsernames) {
      e("outgoingUsername").value = e("incomingUsername").value;
    }
    this.onChangedManualEdit();
  },
  onInputOutUsername() {
    this.sameInOutUsernames = false;
    this.onChangedManualEdit();
  },
  onInputHostname() {
    this.onChangedManualEdit();
  },

  /**
   * Sets the label of the first entry of the dropdown which represents
   * the new outgoing server.
   */
  onOpenOutgoingDropdown() {
    var menulist = e("outgoingHostname");
    var menuitem = menulist.getItemAtIndex(0);
    assert(!menuitem.serverKey, "I wanted the special item for the new host");
    menuitem.label = menulist._inputField.value;
  },

  /**
   * User selected an existing SMTP server (or deselected it).
   * This changes only the UI. The values are read in getUserConfig().
   */
  onChangedOutgoingDropdown() {
    var menulist = e("outgoingHostname");
    var menuitem = menulist.selectedItem;
    if (menuitem && menuitem.serverKey) {
      // an existing server has been selected from the dropdown
      menulist.editable = false;
      _disable("outgoingPort");
      _disable("outgoingSsl");
      _disable("outgoingAuthMethod");
      this.onChangedManualEdit();
    } else {
      // new server, with hostname, port etc.
      menulist.editable = true;
      _enable("outgoingPort");
      _enable("outgoingSsl");
      _enable("outgoingAuthMethod");
    }

    this.onChangedManualEdit();
  },

  onChangedManualEdit() {
    if (this._abortable) {
      this.onStop();
    }
    this.validateManualEditComplete();
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
    // getUserConfig() is expensive, but still OK, not a problem
    var manualConfig = this.getUserConfig();
    this._currentConfig = manualConfig;
    if (manualConfig.isComplete()) {
      this.switchToMode("manual-edit-complete");
    } else if (
      !!manualConfig.incoming.hostname &&
      !!manualConfig.outgoing.hostname
    ) {
      this.switchToMode("manual-edit-have-hostname");
    } else {
      this.switchToMode("manual-edit");
    }
  },

  /**
   * [Advanced Setup...] button click handler
   * Only active in manual edit mode, and goes straight into
   * Account Settings (pref UI) dialog. Requires a backend account,
   * which requires proper hostname, port and protocol.
   */
  onAdvancedSetup() {
    assert(this._currentConfig instanceof AccountConfig);
    let configFilledIn = this.getConcreteConfig();

    if (checkIncomingServerAlreadyExists(configFilledIn)) {
      alertPrompt(
        gStringsBundle.getString("error_creating_account"),
        gStringsBundle.getString("incoming_server_exists")
      );
      return;
    }

    if (
      !Services.prompt.confirm(
        null,
        gStringsBundle.getString("confirmAdvancedConfigTitle"),
        gStringsBundle.getString("confirmAdvancedConfigText")
      )
    ) {
      return;
    }

    gEmailWizardLogger.info("creating account in backend");
    let newAccount = createAccountInBackend(configFilledIn);

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
  testManualConfig() {
    var newConfig = this.getUserConfig();
    gEmailWizardLogger.info("manual config to test:\n" + newConfig);
    this.clearNotifications();
    this.startLoadingState("account-setup-looking-up-settings-half-manual");
    this.switchToMode("manual-edit-testing");
    // if (this._userPickedOutgoingServer) TODO
    var self = this;
    this._abortable = guessConfig(
      this._domain,
      function(type, hostname, port, ssl, done, config) {
        // progress
        gEmailWizardLogger.info(
          "progress callback host " +
            hostname +
            " port " +
            port +
            " type " +
            type
        );
      },
      function(config) {
        // success
        self._abortable = null;
        self._fillManualEditFields(config);
        self.switchToMode("manual-edit-complete");
        self.stopSpinner("account-setup-success-half-manual");
      },
      function(e, config) {
        // guessconfig failed
        if (e instanceof CancelledException) {
          return;
        }
        self._abortable = null;
        gEmailWizardLogger.info("guessConfig failed: " + e);
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
    var emailsplit = this._email.split("@");
    assert(emailsplit.length > 1);
    var emaillocal = sanitize.nonemptystring(emailsplit[0]);
    initialConfig.incoming.username = emaillocal;
    initialConfig.outgoing.username = emaillocal;
    return initialConfig;
  },

  clearError(which) {
    _hide(`${which}Warning`);
    _show(`${which}Info`);
  },

  setError(which, msg_name) {
    try {
      _hide(`${which}Info`);
      _show(`${which}Warning`);
    } catch (ex) {
      alertPrompt("missing error string", msg_name);
    }
  },

  onFormSubmit(event) {
    // Prevent the actual form submission.
    event.preventDefault();

    // Select the only primary button that is visible and enabled.
    let currentButton = document.querySelector(
      ".buttons-container-last button.primary:not(disabled,hidden)"
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

    gEmailWizardLogger.info("Shutting down email config dialog");
  },

  onCreate() {
    try {
      gEmailWizardLogger.info("Create button clicked");

      let configFilledIn = this.getConcreteConfig();
      var self = this;
      // If the dialog is not needed, it will go straight to OK callback
      gSecurityWarningDialog.open(
        this._currentConfig,
        configFilledIn,
        true,
        function() {
          // on OK
          self.validateAndFinish(configFilledIn);
        },
        function() {
          // on cancel, do nothing
        }
      );
    } catch (ex) {
      let errorMessage = `${gStringsBundle.getString(
        "error_creating_account"
      )}. Ex=${ex}. Stack=${ex.stack}`;
      gEmailWizardLogger.error(errorMessage);

      this.clearNotifications();
      let notification = this.notificationBox.appendNotification(
        errorMessage,
        "accountSetupError",
        null,
        this.notificationBox.PRIORITY_CRITICAL_HIGH,
        null
      );

      // Hide the close button to prevent dismissing the notification.
      if (this.notificationBox.gProton) {
        notification.removeAttribute("dismissable");
      } else {
        let closeButton = notification.messageDetails.nextElementSibling;
        closeButton.hidden = true;
      }
    }
  },

  // called by onCreate()
  validateAndFinish(configFilled) {
    let configFilledIn = configFilled || this.getConcreteConfig();

    if (checkIncomingServerAlreadyExists(configFilledIn)) {
      alertPrompt(
        gStringsBundle.getString("error_creating_account"),
        gStringsBundle.getString("incoming_server_exists")
      );
      return;
    }

    if (configFilledIn.outgoing.addThisServer) {
      let existingServer = checkOutgoingServerAlreadyExists(configFilledIn);
      if (existingServer) {
        configFilledIn.outgoing.addThisServer = false;
        configFilledIn.outgoing.existingServerKey = existingServer.key;
      }
    }

    // TODO use a UI mode (switchToMode()) for verification, too.
    // But we need to go back to the previous mode, because we might be in
    // "result" or "manual-edit-complete" mode.
    _disable("createButton");
    _disable("reTestButton");
    // no stop button: backend has no ability to stop :-(

    this.clearNotifications();
    this.startLoadingState("account-setup-checking-password");
    let telemetryKey =
      this._currentConfig.source == AccountConfig.kSourceXML ||
      this._currentConfig.source == AccountConfig.kSourceExchange
        ? this._currentConfig.subSource
        : this._currentConfig.source;

    var self = this;
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
        self.stopSpinner(
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

        // TODO use switchToMode(), see above
        // give user something to proceed after fixing
        _enable("createButton");
        // hidden in non-manual mode, so it's fine to enable
        _enable("reTestButton");

        Services.telemetry.keyedScalarAdd(
          "tb.account.failed_email_account_setup",
          telemetryKey,
          1
        );
      }
    );
  },

  finish(concreteConfig) {
    gEmailWizardLogger.info("creating account in backend");
    let newAccount = createAccountInBackend(concreteConfig);

    // Trigger the first login to download the folder structure and messages.
    newAccount.incomingServer.getNewMessages(
      newAccount.incomingServer.rootFolder,
      this._msgWindow,
      null
    );

    if (this._okCallback) {
      this._okCallback();
    }

    window.close();
  },
};

var gEmailConfigWizard = new EmailConfigWizard();

function serverMatches(a, b) {
  return (
    a.type == b.type &&
    a.hostname == b.hostname &&
    a.port == b.port &&
    a.socketType == b.socketType &&
    a.auth == b.auth
  );
}

var _gStandardPorts = {};
_gStandardPorts.imap = [143, 993];
_gStandardPorts.pop3 = [110, 995];
_gStandardPorts.smtp = [587, 25, 465]; // order matters
_gStandardPorts.exchange = [443];
var _gAllStandardPorts = _gStandardPorts.smtp
  .concat(_gStandardPorts.imap)
  .concat(_gStandardPorts.pop3)
  .concat(_gStandardPorts.exchange);

function isStandardPort(port) {
  return _gAllStandardPorts.includes(port);
}

function getStandardPorts(protocolType) {
  return _gStandardPorts[protocolType];
}

/**
 * Warning dialog, warning user about lack of, or inappropriate, encryption.
 *
 * This is effectively a separate dialog, but implemented as part of
 * this dialog. It works by hiding the main dialog part and unhiding
 * the this part, and vice versa, and resizing the dialog.
 */
function SecurityWarningDialog() {
  this._acknowledged = [];
}
SecurityWarningDialog.prototype = {
  /**
   * {Array of {(incoming or outgoing) server part of {AccountConfig}}
   * A list of the servers for which we already showed this dialog and the
   * user approved the configs. For those, we won't show the warning again.
   * (Make sure to store a copy in case the underlying object is changed.)
   */
  _acknowledged: null,

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
   * @returns {Boolean}   true when the dialog should be shown
   *      (call open()). if false, the dialog can and should be skipped.
   */
  needed(configSchema, configFilledIn) {
    assert(configSchema instanceof AccountConfig);
    assert(configFilledIn instanceof AccountConfig);
    assert(configSchema.isComplete());
    assert(configFilledIn.isComplete());

    var incomingBad =
      (configFilledIn.incoming.socketType > 1 ? 0 : this._inSecurityBad) |
      (configFilledIn.incoming.badCert ? this._inCertBad : 0);
    var outgoingBad = 0;
    if (configFilledIn.outgoing.addThisServer) {
      outgoingBad =
        (configFilledIn.outgoing.socketType > 1 ? 0 : this._outSecurityBad) |
        (configFilledIn.outgoing.badCert ? this._outCertBad : 0);
    }

    if (incomingBad > 0) {
      if (
        this._acknowledged.some(function(ackServer) {
          return serverMatches(ackServer, configFilledIn.incoming);
        })
      ) {
        incomingBad = 0;
      }
    }
    if (outgoingBad > 0) {
      if (
        this._acknowledged.some(function(ackServer) {
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
    var needed = this.needed(configSchema, configFilledIn);
    if (needed == 0 && onlyIfNeeded) {
      okCallback();
      return;
    }

    assert(needed > 0, "security dialog opened needlessly");
    this._currentConfigFilledIn = configFilledIn;
    this._okCallback = okCallback;
    this._cancelCallback = cancelCallback;
    var incoming = configFilledIn.incoming;
    var outgoing = configFilledIn.outgoing;

    _hide("mastervbox");
    _show("warningbox");
    // reset dialog, in case we've shown it before
    e("acknowledge_warning").checked = false;
    _disable("iknow");
    e("incoming_technical").removeAttribute("expanded");
    e("incoming_details").setAttribute("collapsed", true);
    e("outgoing_technical").removeAttribute("expanded");
    e("outgoing_details").setAttribute("collapsed", true);

    if (needed & this._inSecurityBad) {
      setText(
        "warning_incoming",
        gStringsBundle.getFormattedString("cleartext_warning", [
          incoming.hostname,
        ])
      );
      setText(
        "incoming_details",
        gStringsBundle.getString("cleartext_details")
      );
      _show("incoming_box");
    } else if (needed & this._inCertBad) {
      setText(
        "warning_incoming",
        gStringsBundle.getFormattedString("selfsigned_warning", [
          incoming.hostname,
        ])
      );
      setText(
        "incoming_details",
        gStringsBundle.getString("selfsigned_details")
      );
      _show("incoming_box");
    } else {
      _hide("incoming_box");
    }

    if (needed & this._outSecurityBad) {
      setText(
        "warning_outgoing",
        gStringsBundle.getFormattedString("cleartext_warning", [
          outgoing.hostname,
        ])
      );
      setText(
        "outgoing_details",
        gStringsBundle.getString("cleartext_details")
      );
      _show("outgoing_box");
    } else if (needed & this._outCertBad) {
      setText(
        "warning_outgoing",
        gStringsBundle.getFormattedString("selfsigned_warning", [
          outgoing.hostname,
        ])
      );
      setText(
        "outgoing_details",
        gStringsBundle.getString("selfsigned_details")
      );
      _show("outgoing_box");
    } else {
      _hide("outgoing_box");
    }
    _show("acknowledge_warning");
    assert(
      !e("incoming_box").hidden || !e("outgoing_box").hidden,
      "warning dialog shown for unknown reason"
    );
  },

  toggleDetails(id) {
    let details = e(id + "_details");
    let tech = e(id + "_technical");
    if (details.getAttribute("collapsed")) {
      details.removeAttribute("collapsed");
      tech.setAttribute("expanded", true);
    } else {
      details.setAttribute("collapsed", true);
      tech.removeAttribute("expanded");
    }
  },

  /**
   * user checked checkbox that he understood it and wishes
   * to ignore the warning.
   */
  toggleAcknowledge() {
    if (e("acknowledge_warning").checked) {
      _enable("iknow");
    } else {
      _disable("iknow");
    }
  },

  /**
   * [Cancel] button pressed. Get me out of here!
   */
  onCancel() {
    _hide("warningbox");
    _show("mastervbox");

    this._cancelCallback();
  },

  /**
   * [OK] button pressed.
   * Implies that the user toggled the acknowledge checkbox,
   * i.e. approved the config and ignored the warnings,
   * otherwise the button would have been disabled.
   */
  onOK() {
    assert(e("acknowledge_warning").checked);

    // need filled in, in case hostname is placeholder
    var storeConfig = this._currentConfigFilledIn.copy();
    this._acknowledged.push(storeConfig.incoming);
    this._acknowledged.push(storeConfig.outgoing);

    _show("mastervbox");
    _hide("warningbox");

    this._okCallback();
  },
};
var gSecurityWarningDialog = new SecurityWarningDialog();
