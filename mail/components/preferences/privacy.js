/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

ChromeUtils.defineModuleGetter(
  this,
  "LoginHelper",
  "resource://gre/modules/LoginHelper.jsm"
);

Preferences.addAll([
  { id: "mail.spam.manualMark", type: "bool" },
  { id: "mail.spam.manualMarkMode", type: "int" },
  { id: "mail.spam.markAsReadOnSpam", type: "bool" },
  { id: "mail.spam.logging.enabled", type: "bool" },
  { id: "mail.phishing.detection.enabled", type: "bool" },
  { id: "browser.safebrowsing.enabled", type: "bool" },
  { id: "mailnews.downloadToTempFile", type: "bool" },
  { id: "pref.privacy.disable_button.view_passwords", type: "bool" },
  { id: "pref.privacy.disable_button.cookie_exceptions", type: "bool" },
  { id: "pref.privacy.disable_button.view_cookies", type: "bool" },
  {
    id: "mailnews.message_display.disable_remote_image",
    type: "bool",
    inverted: "true",
  },
  { id: "places.history.enabled", type: "bool" },
  { id: "network.cookie.cookieBehavior", type: "int" },
  { id: "network.cookie.lifetimePolicy", type: "int" },
  { id: "network.cookie.blockFutureCookies", type: "bool" },
  { id: "privacy.donottrackheader.enabled", type: "bool" },
  { id: "security.default_personal_cert", type: "string" },
  { id: "security.disable_button.openCertManager", type: "bool" },
  { id: "security.disable_button.openDeviceManager", type: "bool" },
  { id: "security.OCSP.enabled", type: "int" },
]);

if (AppConstants.MOZ_TELEMETRY_REPORTING) {
  Preferences.add({ id: "toolkit.telemetry.enabled", type: "bool" });
}

document.getElementById("panePrivacy").addEventListener("paneload", function() {
  gPrivacyPane.init();
});

var gPrivacyPane = {
  init() {
    this.updateManualMarkMode(Preferences.get("mail.spam.manualMark").value);
    this.updateJunkLogButton(
      Preferences.get("mail.spam.logging.enabled").value
    );

    this._initMasterPasswordUI();

    if (AppConstants.MOZ_CRASHREPORTER) {
      this.initSubmitCrashes();
    }
    this.initTelemetry();

    let element = document.getElementById("acceptCookies");
    Preferences.addSyncFromPrefListener(element, () =>
      this.readAcceptCookies()
    );
    Preferences.addSyncToPrefListener(element, () => this.writeAcceptCookies());

    element = document.getElementById("acceptThirdPartyMenu");
    Preferences.addSyncFromPrefListener(element, () =>
      this.readAcceptThirdPartyCookies()
    );
    Preferences.addSyncToPrefListener(element, () =>
      this.writeAcceptThirdPartyCookies()
    );

    element = document.getElementById("enableOCSP");
    Preferences.addSyncFromPrefListener(element, () => this.readEnableOCSP());
    Preferences.addSyncToPrefListener(element, () => this.writeEnableOCSP());
  },

  /**
   * Reload the current message after a preference affecting the view
   * has been changed and we are in instantApply mode.
   */
  reloadMessageInOpener() {
    if (
      Services.prefs.getBoolPref("browser.preferences.instantApply") &&
      window.opener &&
      typeof window.opener.ReloadMessage == "function"
    ) {
      window.opener.ReloadMessage();
    }
  },

  /**
   * Reads the network.cookie.cookieBehavior preference value and
   * enables/disables the rest of the cookie UI accordingly, returning true
   * if cookies are enabled.
   */
  readAcceptCookies() {
    let pref = Preferences.get("network.cookie.cookieBehavior");
    let acceptThirdPartyLabel = document.getElementById(
      "acceptThirdPartyLabel"
    );
    let acceptThirdPartyMenu = document.getElementById("acceptThirdPartyMenu");
    let keepUntil = document.getElementById("keepUntil");
    let menu = document.getElementById("keepCookiesUntil");

    // enable the rest of the UI for anything other than "disable all cookies"
    let acceptCookies = pref.value != 2;

    acceptThirdPartyLabel.disabled = acceptThirdPartyMenu.disabled = !acceptCookies;
    keepUntil.disabled = menu.disabled = !acceptCookies;

    return acceptCookies;
  },

  /**
   * Enables/disables the "keep until" label and menulist in response to the
   * "accept cookies" checkbox being checked or unchecked.
   * @return 0 if cookies are accepted, 2 if they are not;
   *         the value network.cookie.cookieBehavior should get
   */
  writeAcceptCookies() {
    let accept = document.getElementById("acceptCookies");
    let acceptThirdPartyMenu = document.getElementById("acceptThirdPartyMenu");
    // if we're enabling cookies, automatically select 'accept third party always'
    if (accept.checked) {
      acceptThirdPartyMenu.selectedIndex = 0;
    }

    return accept.checked ? 0 : 2;
  },

  /**
   * Displays fine-grained, per-site preferences for cookies.
   */
  showCookieExceptions() {
    let bundle = document.getElementById("bundlePreferences");
    let params = {
      blockVisible: true,
      sessionVisible: true,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "cookie",
      windowTitle: bundle.getString("cookiepermissionstitle"),
      introText: bundle.getString("cookiepermissionstext"),
    };
    gSubDialog.open(
      "chrome://messenger/content/preferences/permissions.xul",
      null,
      params
    );
  },

  /**
   * Displays all the user's cookies in a dialog.
   */
  showCookies(aCategory) {
    gSubDialog.open("chrome://messenger/content/preferences/cookies.xul");
  },

  /**
   * Converts between network.cookie.cookieBehavior and the third-party cookie UI
   */
  readAcceptThirdPartyCookies() {
    let pref = Preferences.get("network.cookie.cookieBehavior");
    switch (pref.value) {
      case 0:
        return "always";
      case 1:
        return "never";
      case 2:
        return "never";
      case 3:
        return "visited";
      default:
        return undefined;
    }
  },

  writeAcceptThirdPartyCookies() {
    let accept = document.getElementById("acceptThirdPartyMenu").selectedItem;
    switch (accept.value) {
      case "always":
        return 0;
      case "visited":
        return 3;
      case "never":
        return 1;
      default:
        return undefined;
    }
  },

  /**
   * Displays fine-grained, per-site preferences for remote content.
   * We use the "image" type for that, but it can also be stylesheets or
   * iframes.
   */
  showRemoteContentExceptions() {
    let bundle = document.getElementById("bundlePreferences");
    let params = {
      blockVisible: true,
      sessionVisible: false,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "image",
      windowTitle: bundle.getString("imagepermissionstitle"),
      introText: bundle.getString("imagepermissionstext"),
    };
    gSubDialog.open(
      "chrome://messenger/content/preferences/permissions.xul",
      null,
      params
    );
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
    if (!Services.prompt.confirm(window, title, text)) {
      return;
    }

    // otherwise go ahead and remove the training data
    MailServices.junk.resetTrainingData();
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
    if (!checkbox.checked) {
      this._removeMasterPassword();
    } else {
      this.changeMasterPassword();
    }

    this._initMasterPasswordUI();
  },

  /**
   * Displays the "remove master password" dialog to allow the user to remove
   * the current master password.  When the dialog is dismissed, master password
   * UI is automatically updated.
   */
  _removeMasterPassword() {
    var secmodDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].getService(
      Ci.nsIPKCS11ModuleDB
    );
    if (secmodDB.isFIPSEnabled) {
      let bundle = document.getElementById("bundlePreferences");
      Services.prompt.alert(
        window,
        bundle.getString("pw_change_failed_title"),
        bundle.getString("pw_change2empty_in_fips_mode")
      );
    } else {
      gSubDialog.open(
        "chrome://mozapps/content/preferences/removemp.xul",
        null,
        null,
        this._initMasterPasswordUI.bind(this)
      );
    }
    this._initMasterPasswordUI();
  },

  /**
   * Displays a dialog in which the master password may be changed.
   */
  changeMasterPassword() {
    gSubDialog.open(
      "chrome://mozapps/content/preferences/changemp.xul",
      null,
      null,
      this._initMasterPasswordUI.bind(this)
    );
  },

  /**
   * Shows the sites where the user has saved passwords and the associated
   * login information.
   */
  showPasswords() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/passwordManager.xul"
    );
  },

  updateDownloadedPhishingListState() {
    document.getElementById(
      "useDownloadedList"
    ).disabled = !document.getElementById("enablePhishingDetector").checked;
  },

  /**
   * Set up or hide the Learn More links for various data collection options
   */
  _setupLearnMoreLink(pref, element) {
    // set up the Learn More link with the correct URL
    let url = Services.prefs.getCharPref(pref);
    let el = document.getElementById(element);

    if (url) {
      el.setAttribute("href", url);
    } else {
      el.setAttribute("hidden", "true");
    }
  },

  initSubmitCrashes() {
    var checkbox = document.getElementById("submitCrashesBox");
    try {
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].getService(
        Ci.nsICrashReporter
      );
      checkbox.checked = cr.submitReports;
    } catch (e) {
      checkbox.style.display = "none";
    }
    this._setupLearnMoreLink(
      "toolkit.crashreporter.infoURL",
      "crashReporterLearnMore"
    );
  },

  updateSubmitCrashReports(aChecked) {
    Cc["@mozilla.org/toolkit/crash-reporter;1"].getService(
      Ci.nsICrashReporter
    ).submitReports = aChecked;
  },

  updateSubmitCrashes() {
    var checkbox = document.getElementById("submitCrashesBox");
    try {
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].getService(
        Ci.nsICrashReporter
      );
      cr.submitReports = checkbox.checked;
    } catch (e) {}
  },

  /**
   * The preference/checkbox is configured in XUL.
   *
   * In all cases, set up the Learn More link sanely
   */
  initTelemetry() {
    if (AppConstants.MOZ_TELEMETRY_REPORTING) {
      this._setupLearnMoreLink(
        "toolkit.telemetry.infoURL",
        "telemetryLearnMore"
      );
    }
  },

  /**
   * Display the user's certificates and associated options.
   */
  showCertificates() {
    gSubDialog.open("chrome://pippki/content/certManager.xul");
  },

  /**
   * security.OCSP.enabled is an integer value for legacy reasons.
   * A value of 1 means OCSP is enabled. Any other value means it is disabled.
   */
  readEnableOCSP() {
    var preference = Preferences.get("security.OCSP.enabled");
    // This is the case if the preference is the default value.
    if (preference.value === undefined) {
      return true;
    }
    return preference.value == 1;
  },

  /**
   * See documentation for readEnableOCSP.
   */
  writeEnableOCSP() {
    var checkbox = document.getElementById("enableOCSP");
    return checkbox.checked ? 1 : 0;
  },

  /**
   * Display a dialog from which the user can manage his security devices.
   */
  showSecurityDevices() {
    gSubDialog.open("chrome://pippki/content/device_manager.xul");
  },
};

Preferences.get("mailnews.message_display.disable_remote_image").on(
  "change",
  gPrivacyPane.reloadMessageInOpener
);
Preferences.get("mail.phishing.detection.enabled").on(
  "change",
  gPrivacyPane.reloadMessageInOpener
);
