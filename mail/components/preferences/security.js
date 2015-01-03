/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gSecurityPane = {
  mPane: null,
  mInitialized: false,

  _loadInContent: Services.prefs.getBoolPref("mail.preferences.inContent"),

  init: function ()
  {
    this.mPane = document.getElementById("paneSecurity");

    this.updateManualMarkMode(document.getElementById('manualMark').checked);
    this.updateJunkLogButton(document.getElementById('enableJunkLogging').checked);

    this._initMasterPasswordUI();

    // update the checkbox for downloading phishing url tables
    // this.updateDownloadedPhishingListState();

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = document.getElementById("mail.preferences.security.selectedTabIndex");
      if (preference.value)
        document.getElementById("securityPrefs").selectedIndex = preference.value;
    }

    if (this._loadInContent) {
      gSubDialog.init();
    }

    this.mInitialized = true;
  },

  tabSelectionChanged: function ()
  {
    if (this.mInitialized)
      document.getElementById("mail.preferences.security.selectedTabIndex")
              .valueFromPreferences = document.getElementById("securityPrefs").selectedIndex;
  },

  updateManualMarkMode: function(aEnableRadioGroup)
  {
    document.getElementById('manualMarkMode').disabled = !aEnableRadioGroup;
  },

  updateJunkLogButton: function(aEnableButton)
  {
    document.getElementById('openJunkLogButton').disabled = !aEnableButton;
  },

  openJunkLog: function()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://messenger/content/junkLog.xul");
    } else {
      document.documentElement.openWindow("mailnews:junklog",
                                          "chrome://messenger/content/junkLog.xul",
                                          "", null);
    }
  },

  resetTrainingData: function()
  {
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
  reloadMessageInOpener: function()
  {
    if(Services.prefs.getBoolPref("browser.preferences.instantApply") &&
       window.opener && typeof(window.opener.ReloadMessage) == "function")
      window.opener.ReloadMessage();
  },

  /**
   * Initializes master password UI: the "use master password" checkbox, selects
   * the master password button to show, and enables/disables it as necessary.
   * The master password is controlled by various bits of NSS functionality,
   * so the UI for it can't be controlled by the normal preference bindings.
   */
  _initMasterPasswordUI: function ()
  {
    var noMP = !this._masterPasswordSet();

    document.getElementById("changeMasterPassword").disabled = noMP;

    document.getElementById("useMasterPassword").checked = !noMP;
  },


  /**
   * Returns true if the user has a master password set and false otherwise.
   */
  _masterPasswordSet: function ()
  {
    const Cc = Components.classes, Ci = Components.interfaces;
    var secmodDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].
                   getService(Ci.nsIPKCS11ModuleDB);
    var slot = secmodDB.findSlotByName("");
    if (slot) {
      var status = slot.status;
      var hasMP = status != Ci.nsIPKCS11Slot.SLOT_UNINITIALIZED &&
                  status != Ci.nsIPKCS11Slot.SLOT_READY;
      return hasMP;
    } else {
      // XXX I have no bloody idea what this means
      return false;
    }
  },


  /**
   * Enables/disables the master password button depending on the state of the
   * "use master password" checkbox, and prompts for master password removal
   * if one is set.
   */
  updateMasterPasswordButton: function ()
  {
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
  _removeMasterPassword: function ()
  {
    const Cc = Components.classes, Ci = Components.interfaces;
    var secmodDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].
                   getService(Ci.nsIPKCS11ModuleDB);
    if (secmodDB.isFIPSEnabled) {
      let bundle = document.getElementById("bundleMasterPwPreferences");
      Services.prompt.alert(window,
                            bundle.getString("pw_change_failed_title"),
                            bundle.getString("pw_change2empty_in_fips_mode"));
    }
    else {
      if (this._loadInContent) {
        gSubDialog.open("chrome://mozapps/content/preferences/removemp.xul",
                        null, null, this._initMasterPasswordUI.bind(this));
      } else {
        document.documentElement
                .openSubDialog("chrome://mozapps/content/preferences/removemp.xul",
                               "", null);
      }
    }
    this._initMasterPasswordUI();
  },

  /**
   * Displays a dialog in which the master password may be changed.
   */
  changeMasterPassword: function ()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://mozapps/content/preferences/changemp.xul",
                      null, null, this._initMasterPasswordUI.bind(this));
    } else {
      document.documentElement
              .openSubDialog("chrome://mozapps/content/preferences/changemp.xul",
                             "", null);
      this._initMasterPasswordUI();
    }
  },

  /**
   * Shows the sites where the user has saved passwords and the associated
   * login information.
   */
  showPasswords: function ()
  {
    if (this._loadInContent) {
      gSubDialog.open("chrome://passwordmgr/content/passwordManager.xul");
    } else {
      document.documentElement
              .openWindow("Toolkit:PasswordManager",
                          "chrome://passwordmgr/content/passwordManager.xul",
                          "", null);
    }
  },

  updateDownloadedPhishingListState: function()
  {
    document.getElementById('useDownloadedList').disabled = !document.getElementById('enablePhishingDetector').checked;
  },

};
