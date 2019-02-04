/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

ChromeUtils.defineModuleGetter(this, "LoginHelper", "resource://gre/modules/LoginHelper.jsm");

document.getElementById("paneSecurity")
        .addEventListener("paneload", function() { gSecurityPane.init(); });

var gSecurityPane = {
  mPane: null,
  mInitialized: false,

  init() {
    this.mPane = document.getElementById("paneSecurity");

    this.updateManualMarkMode(document.getElementById("manualMark").checked);
    this.updateJunkLogButton(document.getElementById("enableJunkLogging").checked);

    this._initMasterPasswordUI();

    // update the checkbox for downloading phishing url tables
    // this.updateDownloadedPhishingListState();

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.security.selectedTabIndex");
      if (preference.value)
        document.getElementById("securityPrefs").selectedIndex = preference.value;
    }

    this.mInitialized = true;
  },

  tabSelectionChanged() {
    if (this.mInitialized)
      document.getElementById("mail.preferences.security.selectedTabIndex")
              .valueFromPreferences = document.getElementById("securityPrefs").selectedIndex;
  },

  updateManualMarkMode(aEnableRadioGroup) {
    document.getElementById("manualMarkMode").disabled = !aEnableRadioGroup;
  },

  updateJunkLogButton(aEnableButton) {
    document.getElementById("openJunkLogButton").disabled = !aEnableButton;
  },

  openJunkLog() {
    gSubDialog.open("chrome://messenger/content/junkLog.xul");
  },

  resetTrainingData() {
    // make sure the user really wants to do this
    var bundle = document.getElementById("bundlePreferences");
    var title = bundle.getString("confirmResetJunkTrainingTitle");
    var text = bundle.getString("confirmResetJunkTrainingText");

    // if the user says no, then just fall out
    if (!Services.prompt.confirm(window, title, text))
      return;

    // otherwise go ahead and remove the training data
    MailServices.junk.resetTrainingData();
  },


  /**
   * Reload the current message after a preference affecting the view
   * has been changed and we are in instantApply mode.
   */
  reloadMessageInOpener() {
    if (Services.prefs.getBoolPref("browser.preferences.instantApply") &&
        window.opener && typeof(window.opener.ReloadMessage) == "function") {
      window.opener.ReloadMessage();
    }
  },

  /**
   * Initializes master password UI: the "use master password" checkbox, selects
   * the master password button to show, and enables/disables it as necessary.
   * The master password is controlled by various bits of NSS functionality,
   * so the UI for it can't be controlled by the normal preference bindings.
   */
  _initMasterPasswordUI() {
    var noMP = !LoginHelper.isMasterPasswordSet();

    document.getElementById("changeMasterPassword").disabled = noMP;

    document.getElementById("useMasterPassword").checked = !noMP;
  },

  /**
   * Enables/disables the master password button depending on the state of the
   * "use master password" checkbox, and prompts for master password removal
   * if one is set.
   */
  updateMasterPasswordButton() {
    var checkbox = document.getElementById("useMasterPassword");
    var button = document.getElementById("changeMasterPassword");
    button.disabled = !checkbox.checked;

    // unchecking the checkbox should try to immediately remove the master
    // password, because it's impossible to non-destructively remove the master
    // password used to encrypt all the passwords without providing it (by
    // design), and it would be extremely odd to pop up that dialog when the
    // user closes the prefwindow and saves his settings
    if (!checkbox.checked)
      this._removeMasterPassword();
    else
      this.changeMasterPassword();

    this._initMasterPasswordUI();
  },

  /**
   * Displays the "remove master password" dialog to allow the user to remove
   * the current master password.  When the dialog is dismissed, master password
   * UI is automatically updated.
   */
  _removeMasterPassword() {
    var secmodDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].
                   getService(Ci.nsIPKCS11ModuleDB);
    if (secmodDB.isFIPSEnabled) {
      let bundle = document.getElementById("bundleMasterPwPreferences");
      Services.prompt.alert(window,
                            bundle.getString("pw_change_failed_title"),
                            bundle.getString("pw_change2empty_in_fips_mode"));
    } else {
      gSubDialog.open("chrome://mozapps/content/preferences/removemp.xul",
                      null, null, this._initMasterPasswordUI.bind(this));
    }
    this._initMasterPasswordUI();
  },

  /**
   * Displays a dialog in which the master password may be changed.
   */
  changeMasterPassword() {
    gSubDialog.open("chrome://mozapps/content/preferences/changemp.xul",
                    null, null, this._initMasterPasswordUI.bind(this));
  },

  /**
   * Shows the sites where the user has saved passwords and the associated
   * login information.
   */
  showPasswords() {
    gSubDialog.open("chrome://passwordmgr/content/passwordManager.xul");
  },

  updateDownloadedPhishingListState() {
    document.getElementById("useDownloadedList").disabled =
      !document.getElementById("enablePhishingDetector").checked;
  },

};
