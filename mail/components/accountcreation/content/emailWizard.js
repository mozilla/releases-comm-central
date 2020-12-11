/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../mailnews/base/prefs/content/accountUtils.js */
/* import-globals-from accountConfig.js */
/* import-globals-from createInBackend.js */
/* import-globals-from emailWizard.js */
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

// To debug, set mail.wizard.logging.dump (or .console)="All" and kDebug = true
const kDebug = false;

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
  e(elementID).label = gMessengerBundle.getString(stringName);
}

function removeChildNodes(el) {
  while (el.hasChildNodes()) {
    el.lastChild.remove();
  }
}

/**
 * Resize the window based on the content height and width.
 * Since the sizeToContent() method doesn't account for the height of
 * wrapped text, we're checking if the width and height of the "mastervbox"
 * or "warningbox" is taller than the window width and height. This is necessary
 * to account for l10n strings or the user manually resizing the window.
 */
function resizeDialog() {
  // We have two main elements here: mastervbox and warningbox. Resize the
  // window according to which one is visible.
  let mastervbox = document.getElementById("mastervbox");
  let box = mastervbox.hidden
    ? document.getElementById("warningbox")
    : mastervbox;

  if (box.clientHeight > window.innerHeight) {
    window.innerHeight = box.clientHeight;
  }

  if (box.clientWidth > window.innerWidth) {
    window.innerWidth = box.clientWidth;
  }
}

/**
 * Inline confirmation dialog
 * Shows, below status area:
 *
 * Your question here
 *  [ Cancel ] [ OK ]
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
  e("confirmationQuestion").textContent = questionLabel;
  let okButton = e("confirmationOKButton");
  let cancelButton = e("confirmationCancelButton");
  okButton.label = okLabel;
  cancelButton.label = cancelLabel;

  // Disable UI we don't want in this state.
  let statusAreaWasHidden = e("status-area").hidden;
  let statusLineWasHidden = e("status-lines").hidden;
  let cancelWasDisabled = e("cancel_button").disabled;
  let stopWasDisabled = e("stop_button").disabled;
  let manualConfigWasDisabled = e("manual-edit_button").disabled;
  let nextWasDisabled = e("next_button").disabled;

  _hide("status-area");
  _hide("status-lines");
  _disable("cancel_button");
  _disable("stop_button");
  _disable("manual-edit_button");
  _disable("next_button");

  _show("confirmationDialog");
  resizeDialog();

  function close() {
    _hide("confirmationDialog");
    e("status-area").hidden = statusAreaWasHidden;
    e("status-lines").hidden = statusLineWasHidden;
    e("cancel_button").disabled = cancelWasDisabled;
    e("stop_button").disabled = stopWasDisabled;
    e("manual-edit_button").disabled = manualConfigWasDisabled;
    e("next_button").disabled = nextWasDisabled;
    resizeDialog();
  }
  okButton.addEventListener(
    "command",
    event => {
      close();
      okCallback();
    },
    { once: true }
  );
  cancelButton.addEventListener(
    "command",
    event => {
      close();
      cancelCallback(new UserCancelledException());
    },
    { once: true }
  );
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
  _init() {
    gEmailWizardLogger.info("Initializing setup wizard");
    this._abortable = null;
  },

  onLoad() {
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
    e("realname").value = this._realname;
    this._password = "";
    this._showPassword = false;
    this._exchangeUsername = ""; // only for Exchange AutoDiscover and only if needed
    this._okCallback = null;

    if (window.arguments && window.arguments[0]) {
      if (window.arguments[0].msgWindow) {
        this._parentMsgWindow = window.arguments[0].msgWindow;
      }
      if (window.arguments[0].okCallback) {
        this._okCallback = window.arguments[0].okCallback;
      }
    }

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

    e("incoming_port").value = gStringsBundle.getString("port_auto");
    this.fillPortDropdown("smtp");

    // If the account provisioner is preffed off, don't display
    // the account provisioner button.
    if (!Services.prefs.getBoolPref("mail.provider.enabled")) {
      _hide("provisioner_button");
    }

    let menulist = e("outgoing_hostname");
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
      let rememberPasswordE = e("remember_password");
      rememberPasswordE.checked = false;
      rememberPasswordE.disabled = true;
    }

    // First, unhide the main window areas, and store the width,
    // so that we don't resize wildly when we unhide areas.
    // switchToMode() will then hide the unneeded parts again.
    // We will add some leeway of 10px, in case some of the <description>s wrap,
    // e.g. outgoing username != incoming username.
    _show("status-area");
    _show("result_area");
    _hide("manual-edit_area");

    this.switchToMode("start");
    e("realname").select();
    window.sizeToContent();

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

    // _show("initialSettings"); always visible
    // _show("cancel_button"); always visible
    if (modename == "start") {
      _hide("status-area");
      _hide("result_area");
      _hide("manual-edit_area");

      _show("next_button");
      _disable("next_button"); // will be enabled by code
      _show("manual-edit_button");
      _disable("manual-edit_button");
      _hide("half-manual-test_button");
      _hide("create_button");
      _hide("stop_button");
    } else if (modename == "find-config") {
      _show("status-area");
      _hide("result_area");
      _hide("manual-edit_area");

      _show("next_button");
      _disable("next_button");
      _hide("half-manual-test_button");
      _hide("create_button");
      _show("stop_button");
      this.onStop = this.onStopFindConfig;
      _hide("manual-edit_button");
    } else if (modename == "result") {
      _show("status-area");
      _show("result_area");
      _hide("manual-edit_area");

      _hide("next_button");
      _hide("half-manual-test_button");
      _show("create_button");
      _enable("create_button");
      _hide("stop_button");
      _show("manual-edit_button");
    } else if (modename == "manual-edit") {
      _show("status-area");
      _hide("result_area");
      _show("manual-edit_area");

      _hide("next_button");
      _show("half-manual-test_button");
      _disable("half-manual-test_button");
      _show("create_button");
      _disable("create_button");
      _hide("stop_button");
      _hide("manual-edit_button");
    } else if (modename == "manual-edit-have-hostname") {
      _show("status-area");
      _hide("result_area");
      _show("manual-edit_area");
      _hide("manual-edit_button");
      _hide("next_button");
      _show("create_button");

      _show("half-manual-test_button");
      _enable("half-manual-test_button");
      _disable("create_button");
      _hide("stop_button");
    } else if (modename == "manual-edit-testing") {
      _show("status-area");
      _hide("result_area");
      _show("manual-edit_area");
      _hide("manual-edit_button");
      _hide("next_button");
      _show("create_button");

      _show("half-manual-test_button");
      _disable("half-manual-test_button");
      _disable("create_button");
      _show("stop_button");
      this.onStop = this.onStopHalfManualTesting;
    } else if (modename == "manual-edit-complete") {
      _show("status-area");
      _hide("result_area");
      _show("manual-edit_area");
      _hide("manual-edit_button");
      _hide("next_button");
      _show("create_button");

      _show("half-manual-test_button");
      _enable("half-manual-test_button");
      _enable("create_button");
      _hide("stop_button");
    } else {
      throw new NotReached("unknown mode");
    }
    // If we're offline, we're going to disable the create button, but enable
    // the advanced config button if we have a current config.
    if (Services.io.offline) {
      if (this._currentConfig != null) {
        _hide("half-manual-test_button");
        _hide("create_button");
        _hide("manual-edit_button");
      }
    }
    resizeDialog();
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
    var result = this._currentConfig.copy();
    replaceVariables(result, this._realname, this._email, this._password);
    result.rememberPassword =
      e("remember_password").checked && !!this._password;
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
   * This does very little other than to check that a name was entered at all
   * Since this is such an insignificant test we should be using a very light
   * or even jovial warning.
   */
  onBlurRealname() {
    let realnameEl = e("realname");
    if (this._realname) {
      this.clearError("realname");
      realnameEl.removeAttribute("error");
      // bug 638790: don't show realname error until user enter an email address
    } else if (this.validateEmailMinimally(this._email)) {
      this.setError("realname", "please_enter_name");
      realnameEl.setAttribute("error", "true");
    }
  },

  /**
   * This check is only done as an informative warning.
   * We don't want to block the person, if they've entered an email address
   * that doesn't conform to our regex.
   */
  onBlurEmail() {
    if (!this._email) {
      this.clearError("email");
      e("email").removeAttribute("error");
      return;
    }

    let emailEl = e("email");
    if (this.validateEmail(this._email)) {
      this.clearError("email");
      emailEl.removeAttribute("error");
      this.onBlurRealname();
    } else {
      this.setError("email", "double_check_email");
      emailEl.setAttribute("error", "true");
    }
  },

  passwordToggle() {
    if (!this._password) {
      return;
    }

    if (e("password").type == "password") {
      this._showPassword = true;
      e("password").type = "text";
      e("passwordInfo").classList.add("icon-visible");
    } else {
      this._showPassword = false;
      e("password").type = "password";
      e("passwordInfo").classList.remove("icon-visible");
    }
  },

  /**
   * Check whether the user entered the minimum of information
   * needed to leave the "start" mode (entering of name, email, pw)
   * and is allowed to proceed to detection step.
   */
  checkStartDone() {
    if (this.validateEmailMinimally(this._email) && this._realname) {
      this._domain = this._email.split("@")[1].toLowerCase();
      _enable("next_button");
      _enable("manual-edit_button");
      _hide("provisioner_button");
    } else {
      _disable("next_button");
      _disable("manual-edit_button");
      _show("provisioner_button");
    }
  },

  /**
   * When the [Continue] button is clicked, we move from the initial account
   * information stage to using that information to configure account details.
   */
  onNext() {
    _hide("provisioner_button");
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
    this.startSpinner("looking_up_settings");

    var self = this;
    var call = null;
    var fetch = null;

    var priority = (this._abortable = new PriorityOrderAbortable(
      function(config, call) {
        // success
        self._abortable = null;
        self.removeStatusLines();
        self.stopSpinner(call.foundMsg);
        self.foundConfig(config);
      },
      function(e, allErrors) {
        // all failed
        self._abortable = null;
        self.removeStatusLines();
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
    priority.addOneFinishedObserver(call => this.updateStatusLine(call));

    try {
      call = priority.addCall();
      this.addStatusLine("looking_up_settings_disk", call);
      call.foundMsg = "found_settings_disk";
      fetch = fetchConfigFromDisk(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.addStatusLine("looking_up_settings_isp", call);
      call.foundMsg = "found_settings_isp";
      fetch = fetchConfigFromISP(
        domain,
        emailAddress,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.addStatusLine("looking_up_settings_db", call);
      call.foundMsg = "found_settings_db";
      fetch = fetchConfigFromDB(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.addStatusLine("looking_up_settings_mx", call);
      // "found_settings_db" is correct. We display the same message for both db and mx cases.
      call.foundMsg = "found_settings_db";
      fetch = fetchConfigForMX(
        domain,
        call.successCallback(),
        call.errorCallback()
      );
      call.setAbortable(fetch);

      call = priority.addCall();
      this.addStatusLine("looking_up_settings_exchange", call);
      call.foundMsg = "found_settings_exchange";
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
            _show("status-area");
            if (!this._exchangeUsername) {
              this.showErrorStatus("credentials_incomplete");
            } else {
              this.showErrorStatus("credentials_wrong");
            }
            _enable("manual-edit_button");
            errorCallback(new CancelledException());
          } else {
            errorCallback(e);
          }
        }
      );
      call.setAbortable(fetch);
    } catch (e) {
      // e.g. when entering an invalid domain like "c@c.-com"
      this.showErrorMsg(e);
      this.removeStatusLines();
      this.onStop();
    }
  },

  /**
   * Just a continuation of findConfig()
   */
  _guessConfig(domain, initialConfig) {
    this.startSpinner("looking_up_settings_guess");
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
            ? "guessed_settings_offline"
            : "found_settings_guess"
        );
        resizeDialog();
      },
      function(e, config) {
        // guessconfig failed
        if (e instanceof CancelledException) {
          return;
        }
        self._abortable = null;
        gEmailWizardLogger.info("guessConfig failed: " + e);
        self.showErrorStatus("failed_to_find_settings");
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

    e("status-area").setAttribute("status", "loading");
    config.addons = [];
    let successCallback = () => {
      this._abortable = null;
      e("status-area").setAttribute("status", "result");
      this.displayConfigResult(config);
    };
    this._abortable = getAddonsList(config, successCallback, e => {
      successCallback();
      this.showErrorMsg(e);
    });
  },

  /**
   * [Stop] button click handler.
   * This allows the user to abort any longer operation, esp. network activity.
   * We currently have 3 such cases here:
   * 1. findConfig(), i.e. fetch config from DB, guessConfig etc.
   * 2. onHalfManualTest(), i.e. the [Retest] button in manual config.
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

  // -----------
  // Status area

  startSpinner(actionStrName) {
    e("status-area").setAttribute("status", "loading");
    gEmailWizardLogger.warn("spinner start " + actionStrName);
    this._showStatusTitle(actionStrName);
  },

  stopSpinner(actionStrName) {
    if (!actionStrName) {
      e("status-area").removeAttribute("status");
      this._showStatusTitle("");
      _hide("stop_button");
      gEmailWizardLogger.warn("all spinner stop");
      resizeDialog();
      return;
    }

    e("status-area").setAttribute("status", "result");

    this._showStatusTitle(actionStrName);
    _hide("stop_button");
    gEmailWizardLogger.warn("all spinner stop " + actionStrName);
    resizeDialog();
  },

  showErrorStatus(actionStrName) {
    e("status-area").setAttribute("status", "error");
    gEmailWizardLogger.warn("status error " + actionStrName);
    this._showStatusTitle(actionStrName);
  },

  showErrorMsg(errorMsg) {
    gEmailWizardLogger.warn("error " + errorMsg);
    e("status-area").setAttribute("status", "error");
    e("status_msg").textContent = errorMsg;
  },

  _showStatusTitle(msgName) {
    let msg = " "; // assure height. Do via min-height in CSS, for 2 lines?
    try {
      if (msgName) {
        msg = gStringsBundle.getFormattedString(msgName, [gBrandShortName]);
      }
    } catch (ex) {
      gEmailWizardLogger.error("missing string for " + msgName);
      msg = msgName + " (missing string in translation!)";
    }

    e("status_msg").textContent = msg;
    gEmailWizardLogger.info("status msg: " + msg);
  },

  // UI to show status updates in parallel

  addStatusLine(msgID, call) {
    _show("status-lines");
    let statusLine = document.createXULElement("hbox");
    statusLine.setAttribute("align", "center");
    e("status-lines").appendChild(statusLine);
    statusLine.classList.add("status-line");
    var statusDescr = document.createXULElement("description");
    statusDescr.classList.add("status-msg");
    statusLine.appendChild(statusDescr);
    var statusImg = document.createXULElement("image");
    statusImg.classList.add("status-img");
    statusLine.appendChild(statusImg);
    let msg = msgID;
    try {
      msg = gStringsBundle.getFormattedString(msgID, [gBrandShortName]);
    } catch (e) {
      console.error(e);
    }
    statusDescr.textContent = msg;
    call.statusLine = statusLine;
    statusLine.setAttribute("status", "loading");
  },

  updateStatusLine(call) {
    let line = [
      ...document.querySelectorAll("#status-lines > .status-line"),
    ].find(line => line == call.statusLine);
    if (!line) {
      return;
    }
    if (!call.finished) {
      line.setAttribute("status", "loading");
    } else if (!call.succeeded) {
      line.setAttribute("status", "failed");
    } else {
      line.setAttribute("status", "succeeded");
    }
  },

  removeStatusLines() {
    removeChildNodes(e("status-lines"));
    _hide("status-lines");
  },

  // -----------
  // Result area

  /**
   * Displays a (probed) config to the user,
   * in the result config details area.
   *
   * @param config {AccountConfig} The config to present to user
   */
  displayConfigResult(config) {
    assert(config instanceof AccountConfig);
    this._currentConfig = config;
    var configFilledIn = this.getConcreteConfig();

    // IMAP / POP3 server type radio buttons
    let alternatives = config.incomingAlternatives.filter(
      alt => alt.type == "imap" || alt.type == "pop3" || alt.type == "exchange"
    );
    alternatives.unshift(config.incoming);
    alternatives = alternatives.unique(alt => alt.type);
    if (alternatives.length > 1) {
      _show("result_servertype");
      _hide("result_select_imap");
      _hide("result_select_pop3");
      _hide("result_select_exchange");
      for (let alt of alternatives) {
        _show("result_select_" + alt.type);
        e("result_select_" + alt.type).configIncoming = alt;
      }
      e("result_servertype").value = config.incoming.type;
    } else {
      _hide("result_servertype");
    }

    if (config.incoming.type == "exchange") {
      _hide("result_hostnames");
      _show("result_exchange");
      _disable("create_button");
      removeChildNodes(e("result_addon_install_rows"));
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
          _hide("result_addon_intro");
          _hide("result_addon_install");
          _enable("create_button");
        } else {
          _show("result_addon_intro");
          var msg = gStringsBundle.getString("addon-intro");
          if (
            !config.incomingAlternatives.find(
              alt => alt.type == "imap" || alt.type == "pop3"
            )
          ) {
            msg = gStringsBundle.getString("no-open-protocols") + " " + msg;
          }
          setText("result_addon_intro", msg);

          let containerE = e("result_addon_install_rows");
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
          _show("result_addon_install");
          _disable("create_button");
        }

        resizeDialog();
      })();
      return;
    }

    _show("result_hostnames");
    _hide("result_exchange");
    _enable("create_button");
    resizeDialog();

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
        descrE.parentNode.appendChild(textE);
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
      _makeHostDisplayString(configFilledIn.incoming, e("result-incoming"));
    }

    if (!config.outgoing.existingServerKey) {
      if (configFilledIn.outgoing.hostname) {
        _makeHostDisplayString(configFilledIn.outgoing, e("result-outgoing"));
      }
    } else {
      // setText() would confuse _makeHostDisplayString() when clearing the child nodes
      e("result-outgoing").appendChild(
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
    setText("result-username", usernameResult);

    this.switchToMode("result");
  },

  /**
   * Handle the user switching between IMAP and POP3 settings using the
   * radio buttons.
   *
   * Note: This function must only be called by user action, not by setting
   *       the value or selectedItem or selectedIndex of the radiogroup!
   *       This is why we use the oncommand attribute of the radio elements
   *       instead of the onselect attribute of the radiogroup.
   */
  onResultServerTypeChanged() {
    var config = this._currentConfig;
    // add current server as best alternative to start of array
    config.incomingAlternatives.unshift(config.incoming);
    // use selected server (stored as special property on the <radio> node)
    config.incoming = e("result_servertype").selectedItem.configIncoming;
    // remove newly selected server from list of alternatives
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
    _hide("result_addon_install");
    _hide("result_addon_intro");
    _disable("create_button");
    _show("status-area");
    this.startSpinner("addonInstallStarted");

    try {
      var installer = (this._abortable = new AddonInstaller(addon));
      await installer.install();

      this._abortable = null;
      this.stopSpinner("addonInstallSuccess");
      _enable("create_button");

      this._currentConfig.incoming.type = addon.useType.addonAccountType;
      this.validateAndFinish();
    } catch (e) {
      this.showErrorMsg(e + "");
      _show("result_addon_install");
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
      var inHostnameField = e("incoming_hostname");
      config.incoming.hostname = sanitize.hostname(inHostnameField.value);
      inHostnameField.value = config.incoming.hostname;
    } catch (e) {
      gEmailWizardLogger.warn(e);
    }
    try {
      config.incoming.port = sanitize.integerRange(
        e("incoming_port").value,
        kMinPort,
        kMaxPort
      );
    } catch (e) {
      config.incoming.port = undefined; // incl. default "Auto"
    }
    config.incoming.type = sanitize.translate(e("incoming_protocol").value, {
      1: "imap",
      2: "pop3",
      0: null,
    });
    config.incoming.socketType = sanitize.integer(e("incoming_ssl").value);
    config.incoming.auth = sanitize.integer(e("incoming_authMethod").value);
    config.incoming.username = e("incoming_username").value;

    // Outgoing server

    // Did the user select one of the already configured SMTP servers from the
    // drop-down list? If so, use it.
    var outHostnameCombo = e("outgoing_hostname");
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
          e("outgoing_port").value,
          kMinPort,
          kMaxPort
        );
      } catch (e) {
        config.outgoing.port = undefined; // incl. default "Auto"
      }
      config.outgoing.socketType = sanitize.integer(e("outgoing_ssl").value);
      config.outgoing.auth = sanitize.integer(e("outgoing_authMethod").value);
    }
    config.outgoing.username = e("outgoing_username").value;

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
    e("incoming_protocol").value = sanitize.translate(
      config.incoming.type,
      { imap: 1, pop3: 2 },
      1
    );
    e("incoming_hostname").value = config.incoming.hostname;
    e("incoming_ssl").value = sanitize.enum(
      config.incoming.socketType,
      [0, 1, 2, 3],
      0
    );
    e("incoming_authMethod").value = sanitize.enum(
      config.incoming.auth,
      [0, 3, 4, 5, 6, 10],
      0
    );
    e("incoming_username").value = config.incoming.username;
    if (config.incoming.port) {
      e("incoming_port").value = config.incoming.port;
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
    e("outgoing_hostname").value = config.outgoing.hostname;
    e("outgoing_username").value = config.outgoing.username;
    // While sameInOutUsernames is true we synchronize values of incoming
    // and outgoing username.
    this.sameInOutUsernames = true;
    e("outgoing_ssl").value = sanitize.enum(
      config.outgoing.socketType,
      [0, 1, 2, 3],
      0
    );
    e("outgoing_authMethod").value = sanitize.enum(
      config.outgoing.auth,
      [0, 1, 3, 4, 5, 6, 10],
      0
    );
    if (config.outgoing.port) {
      e("outgoing_port").value = config.outgoing.port;
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
      let menulist = e("outgoing_hostname");
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
      e("incoming_port").value = newInPort;
      e("incoming_authMethod").value = 0; // auto
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
      e("outgoing_port").value = newOutPort;
      e("outgoing_authMethod").value = 0; // auto
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
      e("incoming_ssl").value = newInSocketType;
      e("incoming_authMethod").value = 0; // auto
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
      e("outgoing_ssl").value = newOutSocketType;
      e("outgoing_authMethod").value = 0; // auto
    }
  },

  /**
   * Sets the prefilled values of the port fields.
   * Filled statically with the standard ports for the given protocol,
   * plus "Auto".
   */
  fillPortDropdown(protocolType) {
    var menu = e(protocolType == "smtp" ? "outgoing_port" : "incoming_port");

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
  onChangedOutAuth(aSelectedAuth) {
    if (aSelectedAuth) {
      e("outgoing_username").disabled = aSelectedAuth.id == "out-authMethod-no";
    }
    this.onChangedManualEdit();
  },
  onInputInUsername() {
    if (this.sameInOutUsernames) {
      e("outgoing_username").value = e("incoming_username").value;
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
    var menulist = e("outgoing_hostname");
    var menuitem = menulist.getItemAtIndex(0);
    assert(!menuitem.serverKey, "I wanted the special item for the new host");
    menuitem.label = menulist._inputField.value;
  },

  /**
   * User selected an existing SMTP server (or deselected it).
   * This changes only the UI. The values are read in getUserConfig().
   */
  onChangedOutgoingDropdown() {
    var menulist = e("outgoing_hostname");
    var menuitem = menulist.selectedItem;
    if (menuitem && menuitem.serverKey) {
      // an existing server has been selected from the dropdown
      menulist.editable = false;
      _disable("outgoing_port");
      _disable("outgoing_ssl");
      _disable("outgoing_authMethod");
      this.onChangedManualEdit();
    } else {
      // new server, with hostname, port etc.
      menulist.editable = true;
      _enable("outgoing_port");
      _enable("outgoing_ssl");
      _enable("outgoing_authMethod");
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
   * [Switch to provisioner] button click handler. Always active, allows
   * one to switch to the account provisioner screen.
   */
  onSwitchToProvisioner() {
    // We have to close this window first, otherwise msgNewMailAccount
    // in accountUtils.js will think that this window still
    // exists when it's called from the account provisioner window.
    // This is because the account provisioner window is modal,
    // and therefore blocks.  Therefore, we override the _okCallback
    // with a function that spawns the account provisioner, and then
    // close the window.
    this._okCallback = function() {
      NewMailAccountProvisioner(
        window.arguments[0].msgWindow,
        window.arguments[0].extraData
      );
    };
    window.close();
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
    updateMailPaneUI();
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
  onHalfManualTest() {
    var newConfig = this.getUserConfig();
    gEmailWizardLogger.info("manual config to test:\n" + newConfig);
    this.startSpinner("looking_up_settings_halfmanual");
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
        self.stopSpinner("found_settings_halfmanual");
      },
      function(e, config) {
        // guessconfig failed
        if (e instanceof CancelledException) {
          return;
        }
        self._abortable = null;
        gEmailWizardLogger.info("guessConfig failed: " + e);
        self.showErrorStatus("failed_to_find_settings");
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

  // -------------------------------
  // Finish & dialog close functions

  onKeyDown(event) {
    let key = event.keyCode;
    if (key == 27) {
      // Escape key
      this.onCancel();
      return true;
    }
    if (key == 13) {
      // OK key
      let buttons = [
        { id: "next_button", action: makeCallback(this, this.onNext) },
        { id: "create_button", action: makeCallback(this, this.onCreate) },
        {
          id: "half-manual-test_button",
          action: makeCallback(this, this.onHalfManualTest),
        },
      ];
      for (let button of buttons) {
        button.e = e(button.id);
        if (button.e.hidden || button.e.disabled) {
          continue;
        }
        button.action();
        return true;
      }
    }
    return false;
  },

  onCancel() {
    window.close();
    // The window onclose handler will call onWizardShutdown for us.
  },

  onWizardShutdown() {
    if (this._abortable) {
      this._abortable.cancel(new UserCancelledException());
    }

    if (this._okCallback) {
      this._okCallback();
    }
    gEmailWizardLogger.info("Shutting down email config dialog");
  },

  onCreate() {
    try {
      gEmailWizardLogger.info("Create button clicked");

      var configFilledIn = this.getConcreteConfig();
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
      gEmailWizardLogger.error(
        "Error creating account.  ex=" + ex + ", stack=" + ex.stack
      );
      alertPrompt(gStringsBundle.getString("error_creating_account"), ex);
    }
  },

  // called by onCreate()
  validateAndFinish() {
    var configFilledIn = this.getConcreteConfig();

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
    _disable("create_button");
    _disable("half-manual-test_button");
    // no stop button: backend has no ability to stop :-(
    var self = this;
    this.startSpinner("checking_password");
    let telemetryKey =
      this._currentConfig.source == AccountConfig.kSourceXML ||
      this._currentConfig.source == AccountConfig.kSourceExchange
        ? this._currentConfig.subSource
        : this._currentConfig.source;
    // logic function defined in verifyConfig.js
    verifyConfig(
      configFilledIn,
      // guess login config?
      configFilledIn.source != AccountConfig.kSourceXML,
      // TODO Instead, the following line would be correct, but I cannot use it,
      // because some other code doesn't adhere to the expectations/specs.
      // Find out what it was and fix it.
      // concreteConfig.source == AccountConfig.kSourceGuess,
      this._parentMsgWindow,
      function(successfulConfig) {
        // success
        self.stopSpinner(
          successfulConfig.incoming.password ? "password_ok" : null
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

        let msg = e.message || e.toString();
        // For an Exchange server, some known configurations can
        // be disabled (per user or domain or server).
        // Warn the user if the open protocol we tried didn't work.
        if (
          ["imap", "pop3"].includes(configFilledIn.incoming.type) &&
          configFilledIn.incomingAlternatives.some(i => i.type == "exchange")
        ) {
          msg = gStringsBundle.getString("exchange_config_unverifiable");
        }
        self.showErrorMsg(msg);

        // TODO use switchToMode(), see above
        // give user something to proceed after fixing
        _enable("create_button");
        // hidden in non-manual mode, so it's fine to enable
        _enable("half-manual-test_button");
        resizeDialog();

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
    var account = createAccountInBackend(concreteConfig);

    // Trigger first login, to get folder structure, show account, etc..
    account.incomingServer.rootFolder.getNewMessages(null, null);

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
   * - the SSL certificate is not proper
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

    resizeDialog();
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

    resizeDialog();
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
    resizeDialog();

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

    var overrideOK = this.showCertOverrideDialog(this._currentConfigFilledIn);
    if (!overrideOK) {
      this.onCancel();
      return;
    }

    // need filled in, in case hostname is placeholder
    var storeConfig = this._currentConfigFilledIn.copy();
    this._acknowledged.push(storeConfig.incoming);
    this._acknowledged.push(storeConfig.outgoing);

    _show("mastervbox");
    _hide("warningbox");
    resizeDialog();

    this._okCallback();
  },

  /**
   * Shows a(nother) dialog which allows the user to see and override
   * (manually accept) a bad certificate. It also optionally adds it
   * permanently to the "good certs" store of NSS in the profile.
   * Only shows the dialog, if there are bad certs. Otherwise, it's a no-op.
   *
   * The dialog is the standard PSM cert override dialog.
   *
   * @param config {AccountConfig} concrete
   * @returns true, if all certs are fine or the user accepted them.
   *     false, if the user cancelled.
   *
   * static function
   * sync function: blocks until the dialog is closed.
   */
  showCertOverrideDialog(config) {
    if (
      config.incoming.socketType > 1 && // SSL or STARTTLS
      config.incoming.badCert
    ) {
      let params = {
        exceptionAdded: false,
        prefetchCert: true,
        location: config.incoming.targetSite,
      };
      window.openDialog(
        "chrome://pippki/content/exceptionDialog.xhtml",
        "",
        "chrome,centerscreen,modal",
        params
      );
      if (params.exceptionAdded) {
        // set by dialog
        config.incoming.badCert = false;
      } else {
        return false;
      }
    }
    if (!config.outgoing.existingServerKey) {
      if (
        config.outgoing.socketType > 1 && // SSL or STARTTLS
        config.outgoing.badCert
      ) {
        let params = {
          exceptionAdded: false,
          prefetchCert: true,
          location: config.outgoing.targetSite,
        };
        window.openDialog(
          "chrome://pippki/content/exceptionDialog.xhtml",
          "",
          "chrome,centerscreen,modal",
          params
        );
        if (params.exceptionAdded) {
          // set by dialog
          config.outgoing.badCert = false;
        } else {
          return false;
        }
      }
    }
    return true;
  },
};
var gSecurityWarningDialog = new SecurityWarningDialog();
