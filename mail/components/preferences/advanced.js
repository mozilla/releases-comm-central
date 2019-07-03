/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

// Load DownloadUtils module for convertByteUnits
var {DownloadUtils} = ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {L10nRegistry} = ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm");
var {Localization} = ChromeUtils.import("resource://gre/modules/Localization.jsm");

Preferences.addAll([
  { id: "mail.preferences.advanced.selectedTabIndex", type: "int" },
  { id: "security.default_personal_cert", type: "string" },
  { id: "security.disable_button.openCertManager", type: "bool" },
  { id: "security.disable_button.openDeviceManager", type: "bool" },
  { id: "security.OCSP.enabled", type: "int" },
]);

if (AppConstants.MOZ_TELEMETRY_REPORTING) {
  Preferences.add({ id: "toolkit.telemetry.enabled", type: "bool" });
}

document.getElementById("paneAdvanced")
        .addEventListener("paneload", function() { gAdvancedPane.init(); });

var gAdvancedPane = {
  mPane: null,
  mInitialized: false,

  init() {
    this.mPane = document.getElementById("paneAdvanced");

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = Preferences.get("mail.preferences.advanced.selectedTabIndex");
      if (preference.value)
        document.getElementById("advancedPrefs").selectedIndex = preference.value;
    }

    if (AppConstants.MOZ_CRASHREPORTER)
      this.initSubmitCrashes();
    this.initTelemetry();

    element = document.getElementById("enableOCSP");
    Preferences.addSyncFromPrefListener(element, () => this.readEnableOCSP());
    Preferences.addSyncToPrefListener(element, () => this.writeEnableOCSP());

    this.mInitialized = true;
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      Preferences.get("mail.preferences.advanced.selectedTabIndex")
                 .valueFromPreferences = document.getElementById("advancedPrefs").selectedIndex;
    }
  },

  updateSubmitCrashReports(aChecked) {
    Cc["@mozilla.org/toolkit/crash-reporter;1"]
      .getService(Ci.nsICrashReporter)
      .submitReports = aChecked;
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

  // DATA CHOICES TAB

  /**
   * Open a text link.
   */
  openTextLink(evt) {
    // Opening links behind a modal dialog is poor form. Work around flawed
    // text-link handling by opening in browser if we'd instead get a content
    // tab behind the modal options dialog.
    if (Services.prefs.getBoolPref("browser.preferences.instantApply")) {
      return true; // Yes, open the link in a content tab.
    }
    var url = evt.target.getAttribute("href");
    var messenger = Cc["@mozilla.org/messenger;1"]
      .createInstance(Ci.nsIMessenger);
    messenger.launchExternalURL(url);
    evt.preventDefault();
    return false;
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
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].
               getService(Ci.nsICrashReporter);
      checkbox.checked = cr.submitReports;
    } catch (e) {
      checkbox.style.display = "none";
    }
    this._setupLearnMoreLink("toolkit.crashreporter.infoURL", "crashReporterLearnMore");
  },

  updateSubmitCrashes() {
    var checkbox = document.getElementById("submitCrashesBox");
    try {
      var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"].
               getService(Ci.nsICrashReporter);
      cr.submitReports = checkbox.checked;
    } catch (e) { }
  },


  /**
   * The preference/checkbox is configured in XUL.
   *
   * In all cases, set up the Learn More link sanely
   */
  initTelemetry() {
    if (AppConstants.MOZ_TELEMETRY_REPORTING)
      this._setupLearnMoreLink("toolkit.telemetry.infoURL", "telemetryLearnMore");
  },

};
