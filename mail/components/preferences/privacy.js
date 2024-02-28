/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  LoginHelper: "resource://gre/modules/LoginHelper.sys.mjs",
  OSKeyStore: "resource://gre/modules/OSKeyStore.sys.mjs",
});

const PREF_UPLOAD_ENABLED = "datareporting.healthreport.uploadEnabled";

Preferences.addAll([
  { id: "mail.spam.manualMark", type: "bool" },
  { id: "mail.spam.manualMarkMode", type: "int" },
  { id: "mailnews.ui.junk.manualMarkAsJunkMarksRead", type: "bool" },
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
  { id: "network.cookie.blockFutureCookies", type: "bool" },
  { id: "privacy.donottrackheader.enabled", type: "bool" },
  { id: "security.default_personal_cert", type: "string" },
  { id: "security.disable_button.openCertManager", type: "bool" },
  { id: "security.disable_button.openDeviceManager", type: "bool" },
  { id: "security.OCSP.enabled", type: "int" },
  { id: "mail.e2ee.auto_enable", type: "bool" },
  { id: "mail.e2ee.auto_disable", type: "bool" },
  { id: "mail.e2ee.notify_on_auto_disable", type: "bool" },
]);

if (AppConstants.MOZ_DATA_REPORTING) {
  Preferences.addAll([
    // Preference instances for prefs that we need to monitor while the page is open.
    { id: PREF_UPLOAD_ENABLED, type: "bool" },
  ]);
}

// Data Choices tab
if (AppConstants.MOZ_CRASHREPORTER) {
  Preferences.add({
    id: "browser.crashReports.unsubmittedCheck.autoSubmit2",
    type: "bool",
  });
}

function setEventListener(aId, aEventType, aCallback) {
  document
    .getElementById(aId)
    .addEventListener(aEventType, aCallback.bind(gPrivacyPane));
}

var gPrivacyPane = {
  init() {
    this.updateManualMarkMode(Preferences.get("mail.spam.manualMark").value);
    this.updateJunkLogButton(
      Preferences.get("mail.spam.logging.enabled").value
    );

    this._initMasterPasswordUI();

    if (AppConstants.MOZ_DATA_REPORTING) {
      this.initDataCollection();
      if (AppConstants.MOZ_CRASHREPORTER) {
        this.initSubmitCrashes();
      }
      this.initSubmitHealthReport();
      setEventListener(
        "submitHealthReportBox",
        "command",
        gPrivacyPane.updateSubmitHealthReport
      );
      setEventListener(
        "telemetryDataDeletionLearnMore",
        "command",
        gPrivacyPane.showDataDeletion
      );
    }

    this.readAcceptCookies();
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

    this.initE2eeCheckboxes();
  },

  /**
   * Reload the current message after a preference affecting the view
   * has been changed.
   */
  reloadMessageInOpener() {
    if (window.opener && typeof window.opener.ReloadMessage == "function") {
      window.opener.ReloadMessage();
    }
  },

  /**
   * Reads the network.cookie.cookieBehavior preference value and
   * enables/disables the rest of the cookie UI accordingly, returning true
   * if cookies are enabled.
   */
  readAcceptCookies() {
    const pref = Preferences.get("network.cookie.cookieBehavior");
    const exceptionsButton = document.getElementById("cookieExceptions");
    const acceptThirdPartyLabel = document.getElementById(
      "acceptThirdPartyLabel"
    );
    const acceptThirdPartyMenu = document.getElementById(
      "acceptThirdPartyMenu"
    );
    const showCookiesButton = document.getElementById("showCookiesButton");

    // enable the rest of the UI for anything other than "disable all cookies"
    const acceptCookies = pref.value != 2;
    const cookieBehaviorLocked = Services.prefs.prefIsLocked(
      "network.cookie.cookieBehavior"
    );

    exceptionsButton.disabled = cookieBehaviorLocked;
    acceptThirdPartyLabel.disabled = acceptThirdPartyMenu.disabled =
      !acceptCookies || cookieBehaviorLocked;
    showCookiesButton.disabled = cookieBehaviorLocked;

    return acceptCookies;
  },

  /**
   * Enables/disables the "keep until" label and menulist in response to the
   * "accept cookies" checkbox being checked or unchecked.
   *
   * @returns 0 if cookies are accepted, 2 if they are not;
   *         the value network.cookie.cookieBehavior should get
   */
  writeAcceptCookies() {
    const accept = document.getElementById("acceptCookies");
    const acceptThirdPartyMenu = document.getElementById(
      "acceptThirdPartyMenu"
    );
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
    const bundle = document.getElementById("bundlePreferences");
    const params = {
      blockVisible: true,
      sessionVisible: true,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "cookie",
      windowTitle: bundle.getString("cookiepermissionstitle"),
      introText: bundle.getString("cookiepermissionstext"),
    };
    gSubDialog.open(
      "chrome://messenger/content/preferences/permissions.xhtml",
      undefined,
      params
    );
  },

  /**
   * Displays all the user's cookies in a dialog.
   */
  showCookies(aCategory) {
    gSubDialog.open("chrome://messenger/content/preferences/cookies.xhtml");
  },

  /**
   * Converts between network.cookie.cookieBehavior and the third-party cookie UI
   */
  readAcceptThirdPartyCookies() {
    const pref = Preferences.get("network.cookie.cookieBehavior");
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
    const accept = document.getElementById("acceptThirdPartyMenu").selectedItem;
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
    const bundle = document.getElementById("bundlePreferences");
    const params = {
      blockVisible: true,
      sessionVisible: false,
      allowVisible: true,
      prefilledHost: "",
      permissionType: "image",
      windowTitle: bundle.getString("imagepermissionstitle"),
      introText: bundle.getString("imagepermissionstext"),
    };
    gSubDialog.open(
      "chrome://messenger/content/preferences/permissions.xhtml",
      undefined,
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
    // The junk log dialog can't work as a sub-dialog, because that means
    // loading it in a browser, and we can't load a chrome: page containing a
    // file: page in a browser. Open it as a real dialog instead.
    window.browsingContext.topChromeWindow.openDialog(
      "chrome://messenger/content/junkLog.xhtml"
    );
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
   * Initializes primary password UI: the "use primary password" checkbox, selects
   * the primary password button to show, and enables/disables it as necessary.
   * The primary password is controlled by various bits of NSS functionality,
   * so the UI for it can't be controlled by the normal preference bindings.
   */
  _initMasterPasswordUI() {
    var noMP = !LoginHelper.isPrimaryPasswordSet();

    var button = document.getElementById("changeMasterPassword");
    button.disabled = noMP;

    var checkbox = document.getElementById("useMasterPassword");
    checkbox.checked = !noMP;
    checkbox.disabled =
      (noMP && !Services.policies.isAllowed("createMasterPassword")) ||
      (!noMP && !Services.policies.isAllowed("removeMasterPassword"));
  },

  /**
   * Enables/disables the primary password button depending on the state of the
   * "use primary password" checkbox, and prompts for primary password removal
   * if one is set.
   */
  async updateMasterPasswordButton() {
    var checkbox = document.getElementById("useMasterPassword");
    var button = document.getElementById("changeMasterPassword");
    button.disabled = !checkbox.checked;

    // unchecking the checkbox should try to immediately remove the master
    // password, because it's impossible to non-destructively remove the master
    // password used to encrypt all the passwords without providing it (by
    // design), and it would be extremely odd to pop up that dialog when the
    // user closes the prefwindow and saves his settings
    if (!checkbox.checked) {
      await this._removeMasterPassword();
    } else {
      await this.changeMasterPassword();
    }

    this._initMasterPasswordUI();
  },

  /**
   * Displays the "remove primary password" dialog to allow the user to remove
   * the current primary password.  When the dialog is dismissed, primary password
   * UI is automatically updated.
   */
  async _removeMasterPassword() {
    var secmodDB = Cc["@mozilla.org/security/pkcs11moduledb;1"].getService(
      Ci.nsIPKCS11ModuleDB
    );
    if (secmodDB.isFIPSEnabled) {
      const title = document.getElementById("fips-title").textContent;
      const desc = document.getElementById("fips-desc").textContent;
      Services.prompt.alert(window, title, desc);
      this._initMasterPasswordUI();
    } else {
      gSubDialog.open("chrome://mozapps/content/preferences/removemp.xhtml", {
        closingCallback: this._initMasterPasswordUI.bind(this),
      });
    }
    this._initMasterPasswordUI();
  },

  /**
   * Displays a dialog in which the primary password may be changed.
   */
  async changeMasterPassword() {
    // OS reauthenticate functionality is not available on Linux yet (bug 1527745)
    if (
      !LoginHelper.isPrimaryPasswordSet() &&
      Services.prefs.getBoolPref("signon.management.page.os-auth.enabled") &&
      AppConstants.platform != "linux"
    ) {
      const messageId =
        "primary-password-os-auth-dialog-message-" + AppConstants.platform;
      const [messageText, captionText] = await document.l10n.formatMessages([
        {
          id: messageId,
        },
        {
          id: "master-password-os-auth-dialog-caption",
        },
      ]);
      const win = Services.wm.getMostRecentWindow("");
      const loggedIn = await OSKeyStore.ensureLoggedIn(
        messageText.value,
        captionText.value,
        win,
        false
      );
      if (!loggedIn.authenticated) {
        return;
      }
    }

    gSubDialog.open("chrome://mozapps/content/preferences/changemp.xhtml", {
      closingCallback: this._initMasterPasswordUI.bind(this),
    });
  },

  /**
   * Shows the sites where the user has saved passwords and the associated
   * login information.
   */
  showPasswords() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/passwordManager.xhtml"
    );
  },

  updateDownloadedPhishingListState() {
    document.getElementById("useDownloadedList").disabled =
      !document.getElementById("enablePhishingDetector").checked;
  },

  /**
   * Display the user's certificates and associated options.
   */
  showCertificates() {
    gSubDialog.open("chrome://pippki/content/certManager.xhtml");
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
    gSubDialog.open("chrome://pippki/content/device_manager.xhtml");
  },

  /**
   * Displays the learn more health report page when a user opts out of data collection.
   */
  showDataDeletion() {
    const url =
      Services.urlFormatter.formatURLPref("app.support.baseURL") +
      "telemetry-clientid";
    window.open(url, "_blank");
  },

  initDataCollection() {
    this._setupLearnMoreLink(
      "toolkit.datacollection.infoURL",
      "dataCollectionPrivacyNotice"
    );
  },

  initSubmitCrashes() {
    this._setupLearnMoreLink(
      "toolkit.crashreporter.infoURL",
      "crashReporterLearnMore"
    );
  },

  /**
   * Set up or hide the Learn More links for various data collection options
   */
  _setupLearnMoreLink(pref, element) {
    // set up the Learn More link with the correct URL
    const url = Services.urlFormatter.formatURLPref(pref);
    const el = document.getElementById(element);

    if (url) {
      el.setAttribute("href", url);
    } else {
      el.setAttribute("hidden", "true");
    }
  },

  /**
   * Initialize the health report service reference and checkbox.
   */
  initSubmitHealthReport() {
    this._setupLearnMoreLink(
      "datareporting.healthreport.infoURL",
      "FHRLearnMore"
    );

    const checkbox = document.getElementById("submitHealthReportBox");

    // Telemetry is only sending data if MOZ_TELEMETRY_REPORTING is defined.
    // We still want to display the preferences panel if that's not the case, but
    // we want it to be disabled and unchecked.
    if (
      Services.prefs.prefIsLocked(PREF_UPLOAD_ENABLED) ||
      !AppConstants.MOZ_TELEMETRY_REPORTING
    ) {
      checkbox.setAttribute("disabled", "true");
      return;
    }

    checkbox.checked =
      Services.prefs.getBoolPref(PREF_UPLOAD_ENABLED) &&
      AppConstants.MOZ_TELEMETRY_REPORTING;
  },

  /**
   * Update the health report preference with state from checkbox.
   */
  updateSubmitHealthReport() {
    const checkbox = document.getElementById("submitHealthReportBox");

    Services.prefs.setBoolPref(PREF_UPLOAD_ENABLED, checkbox.checked);

    // If allow telemetry is checked, hide the box saying you're no longer
    // allowing it.
    document.getElementById("telemetry-container").hidden = checkbox.checked;
  },

  initE2eeCheckboxes() {
    const on = document.getElementById("emailE2eeAutoEnable");
    const off = document.getElementById("emailE2eeAutoDisable");
    const notify = document.getElementById("emailE2eeAutoDisableNotify");

    on.checked = Preferences.get("mail.e2ee.auto_enable").value;
    off.checked = Preferences.get("mail.e2ee.auto_disable").value;
    notify.checked = Preferences.get("mail.e2ee.notify_on_auto_disable").value;

    if (!on.checked) {
      off.disabled = true;
      notify.disabled = true;
    } else {
      off.disabled = false;
      notify.disabled = !off.checked;
    }
  },

  updateE2eeCheckboxes() {
    const on = document.getElementById("emailE2eeAutoEnable");
    const off = document.getElementById("emailE2eeAutoDisable");
    const notify = document.getElementById("emailE2eeAutoDisableNotify");

    if (!on.checked) {
      off.disabled = true;
      notify.disabled = true;
    } else {
      off.disabled = false;
      notify.disabled = !off.checked;
    }
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
