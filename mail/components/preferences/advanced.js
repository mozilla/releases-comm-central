/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../base/content/aboutDialog-appUpdater.js */
/* import-globals-from preferences.js */
/* import-globals-from subdialogs.js */

// Load DownloadUtils module for convertByteUnits
var {DownloadUtils} = ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var {L10nRegistry} = ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm");
var {Localization} = ChromeUtils.import("resource://gre/modules/Localization.jsm");
var {UpdateUtils} = ChromeUtils.import("resource://gre/modules/UpdateUtils.jsm");

const AUTO_UPDATE_CHANGED_TOPIC = "auto-update-config-change";

Preferences.addAll([
  { id: "mail.preferences.advanced.selectedTabIndex", type: "int" },
  { id: "general.autoScroll", type: "bool" },
  { id: "general.smoothScroll", type: "bool" },
  { id: "intl.regional_prefs.use_os_locales", type: "bool" },
  { id: "mailnews.database.global.indexer.enabled", type: "bool" },
  { id: "layers.acceleration.disabled", type: "bool", inverted: true },
  { id: "searchintegration.enable", type: "bool" },
  { id: "mail.prompt_purge_threshhold", type: "bool" },
  { id: "mail.purge_threshhold_mb", type: "int" },
  { id: "browser.cache.disk.capacity", type: "int" },
  { id: "browser.cache.disk.smart_size.enabled", inverted: true, type: "bool" },
  { id: "security.default_personal_cert", type: "string" },
  { id: "security.disable_button.openCertManager", type: "bool" },
  { id: "security.disable_button.openDeviceManager", type: "bool" },
  { id: "security.OCSP.enabled", type: "int" },
]);

if (AppConstants.HAVE_SHELL_SERVICE) {
  Preferences.addAll([
    { id: "mail.shell.checkDefaultClient", type: "bool" },
    { id: "pref.general.disable_button.default_mail", type: "bool" },
  ]);
}

if (AppConstants.MOZ_TELEMETRY_REPORTING) {
  Preferences.add({ id: "toolkit.telemetry.enabled", type: "bool" });
}

if (AppConstants.MOZ_UPDATER) {
  Preferences.add({ id: "app.update.disable_button.showUpdateHistory", type: "bool" });
  if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
    Preferences.add({ id: "app.update.service.enabled", type: "bool" });
  }
}

document.getElementById("paneAdvanced")
        .addEventListener("paneload", function() { gAdvancedPane.init(); });

var gAdvancedPane = {
  mPane: null,
  mInitialized: false,
  mShellServiceWorking: false,
  mBundle: null,
  requestingLocales: null,

  init() {
    function setEventListener(aId, aEventType, aCallback) {
      document.getElementById(aId)
        .addEventListener(aEventType, aCallback.bind(gAdvancedPane));
    }

    this.mPane = document.getElementById("paneAdvanced");
    this.updateCompactOptions();
    this.mBundle = document.getElementById("bundlePreferences");
    this.formatLocaleSetLabels();

    if (Services.prefs.getBoolPref("intl.multilingual.enabled")) {
      this.initMessengerLocale();
    }

    if (!(("arguments" in window) && window.arguments[1])) {
      // If no tab was specified, select the last used tab.
      let preference = Preferences.get("mail.preferences.advanced.selectedTabIndex");
      if (preference.value)
        document.getElementById("advancedPrefs").selectedIndex = preference.value;
    }
    if (AppConstants.MOZ_UPDATER)
      this.updateReadPrefs();

    // Default store type initialization.
    let storeTypeElement = document.getElementById("storeTypeMenulist");
    // set the menuitem to match the account
    let defaultStoreID = Services.prefs.getCharPref("mail.serverDefaultStoreContractID");
    let targetItem = storeTypeElement.getElementsByAttribute("value", defaultStoreID);
    storeTypeElement.selectedItem = targetItem[0];

    if (AppConstants.MOZ_CRASHREPORTER)
      this.initSubmitCrashes();
    this.initTelemetry();
    this.updateActualCacheSize();

    // Search integration -- check whether we should hide or disable integration
    let hideSearchUI = false;
    let disableSearchUI = false;
    const {SearchIntegration} = ChromeUtils.import("resource:///modules/SearchIntegration.jsm");
    if (SearchIntegration) {
      if (SearchIntegration.osVersionTooLow)
        hideSearchUI = true;
      else if (SearchIntegration.osComponentsNotRunning)
        disableSearchUI = true;
    } else {
      hideSearchUI = true;
    }

    if (hideSearchUI) {
      document.getElementById("searchIntegrationContainer").hidden = true;
    } else if (disableSearchUI) {
      let searchCheckbox = document.getElementById("searchIntegration");
      searchCheckbox.checked = false;
      Preferences.get("searchintegration.enable").disabled = true;
    }

    // If the shell service is not working, disable the "Check now" button
    // and "perform check at startup" checkbox.
    try {
      Cc["@mozilla.org/mail/shell-service;1"].getService(Ci.nsIShellService);
      this.mShellServiceWorking = true;
    } catch (ex) {
      // The elements may not exist if HAVE_SHELL_SERVICE is off.
      if (document.getElementById("alwaysCheckDefault")) {
        document.getElementById("alwaysCheckDefault").disabled = true;
        document.getElementById("alwaysCheckDefault").checked = false;
      }
      if (document.getElementById("checkDefaultButton"))
        document.getElementById("checkDefaultButton").disabled = true;
      this.mShellServiceWorking = false;
    }

    if (AppConstants.MOZ_UPDATER) {
      gAppUpdater = new appUpdater(); // eslint-disable-line no-global-assign
      if (Services.policies && !Services.policies.isAllowed("appUpdate")) {
          document.getElementById("updateAllowDescription").hidden = true;
          document.getElementById("updateRadioGroup").hidden = true;
        if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
          document.getElementById("useService").hidden = true;
        }
      } else {
        // Start with no option selected since we are still reading the value
        document.getElementById("autoDesktop").removeAttribute("selected");
        document.getElementById("manualDesktop").removeAttribute("selected");
        // Start reading the correct value from the disk
        this.updateReadPrefs();
        setEventListener("updateRadioGroup", "command",
                         gAdvancedPane.updateWritePrefs);
      }

      let distroId = Services.prefs.getCharPref("distribution.id", "");
      if (distroId) {
        let distroVersion = Services.prefs.getCharPref("distribution.version");

        let distroIdField = document.getElementById("distributionId");
        distroIdField.value = distroId + " - " + distroVersion;
        distroIdField.style.display = "block";

        let distroAbout = Services.prefs.getStringPref("distribution.about", "");
        if (distroAbout) {
          let distroField = document.getElementById("distribution");
          distroField.value = distroAbout;
          distroField.style.display = "block";
        }
      }

      if (AppConstants.platform == "win") {
        // On Windows, the Application Update setting is an installation-
        // specific preference, not a profile-specific one. Show a warning to
        // inform users of this.
        let updateContainer = document.getElementById("updateSettingsContainer");
        updateContainer.classList.add("updateSettingCrossUserWarningContainer");
        document.getElementById("updateSettingCrossUserWarning").hidden = false;
      }

      if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
        // Check to see if the maintenance service is installed.
        // If it isn't installed, don't show the preference at all.
        let installed;
        try {
          let wrk = Cc["@mozilla.org/windows-registry-key;1"]
                    .createInstance(Ci.nsIWindowsRegKey);
          wrk.open(wrk.ROOT_KEY_LOCAL_MACHINE,
                   "SOFTWARE\\Mozilla\\MaintenanceService",
                   wrk.ACCESS_READ | wrk.WOW64_64);
          installed = wrk.readIntValue("Installed");
          wrk.close();
        } catch (e) {
        }
        if (installed != 1) {
          document.getElementById("useService").hidden = true;
        }
      }

      let version = AppConstants.MOZ_APP_VERSION_DISPLAY;

      // Include the build ID and display warning if this is an "a#" (nightly) build
      if (/a\d+$/.test(version)) {
        let buildID = Services.appinfo.appBuildID;
        let year = buildID.slice(0, 4);
        let month = buildID.slice(4, 6);
        let day = buildID.slice(6, 8);
        version += ` (${year}-${month}-${day})`;
      }

      // Append "(32-bit)" or "(64-bit)" build architecture to the version number:
      let bundle = Services.strings.createBundle("chrome://messenger/locale/messenger.properties");
      let archResource = Services.appinfo.is64Bit
                         ? "aboutDialog.architecture.sixtyFourBit"
                         : "aboutDialog.architecture.thirtyTwoBit";
      let arch = bundle.GetStringFromName(archResource);
      version += ` (${arch})`;

      document.getElementById("version").textContent = version;

      if (!AppConstants.NIGHTLY_BUILD) {
        // Show a release notes link if we have a URL.
        let relNotesLink = document.getElementById("releasenotes");
        let relNotesPrefType = Services.prefs.getPrefType("app.releaseNotesURL");
        if (relNotesPrefType != Services.prefs.PREF_INVALID) {
          let relNotesURL = Services.urlFormatter.formatURLPref("app.releaseNotesURL");
          if (relNotesURL != "about:blank") {
            relNotesLink.href = relNotesURL;
            relNotesLink.hidden = false;
          }
        }
      }
      // Initialize Application section.

      // Listen for window unload so we can remove our preference observers.
      window.addEventListener("unload", this);

      Services.obs.addObserver(this, AUTO_UPDATE_CHANGED_TOPIC);
    }

    this.mInitialized = true;
  },

  tabSelectionChanged() {
    if (this.mInitialized) {
      Preferences.get("mail.preferences.advanced.selectedTabIndex")
                 .valueFromPreferences = document.getElementById("advancedPrefs").selectedIndex;
    }
  },

  /**
   * Checks whether Thunderbird is currently registered with the operating
   * system as the default app for mail, rss and news.  If Thunderbird is not
   * currently the default app, the user is given the option of making it the
   * default for each type; otherwise, the user is informed that Thunderbird is
   * already the default.
   */
  checkDefaultNow(aAppType) {
    if (!this.mShellServiceWorking)
      return;

    // otherwise, bring up the default client dialog
    gSubDialog.open("chrome://messenger/content/systemIntegrationDialog.xul",
                    "resizable=no", "calledFromPrefs");
  },

  showConfigEdit() {
    gSubDialog.open("chrome://global/content/config.xul");
  },

  /**
   * Set the default store contract ID.
   */
  updateDefaultStore(storeID) {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);
  },

  // NETWORK TAB

  /*
   * Preferences:
   *
   * browser.cache.disk.capacity
   * - the size of the browser cache in KB
   */

  // Retrieves the amount of space currently used by disk cache
  updateActualCacheSize() {
    let actualSizeLabel = document.getElementById("actualDiskCacheSize");
    let prefStrBundle = document.getElementById("bundlePreferences");

    // Needs to root the observer since cache service keeps only a weak reference.
    this.observer = {
      onNetworkCacheDiskConsumption(consumption) {
        let size = DownloadUtils.convertByteUnits(consumption);
        // The XBL binding for the string bundle may have been destroyed if
        // the page was closed before this callback was executed.
        if (!prefStrBundle.getFormattedString) {
          return;
        }
        actualSizeLabel.value = prefStrBundle.getFormattedString("actualDiskCacheSize", size);
      },

      QueryInterface: ChromeUtils.generateQI([
        Ci.nsICacheStorageConsumptionObserver,
        Ci.nsISupportsWeakReference,
      ]),
    };

    actualSizeLabel.value = prefStrBundle.getString("actualDiskCacheSizeCalculated");

    try {
      Services.cache2.asyncGetDiskConsumption(this.observer);
    } catch (e) {}
  },

  updateCacheSizeUI(smartSizeEnabled) {
    document.getElementById("useCacheBefore").disabled = smartSizeEnabled;
    document.getElementById("cacheSize").disabled = smartSizeEnabled;
    document.getElementById("useCacheAfter").disabled = smartSizeEnabled;
  },

  readSmartSizeEnabled() {
    // The smart_size.enabled preference element is inverted="true", so its
    // value is the opposite of the actual pref value
    var disabled = Preferences.get("browser.cache.disk.smart_size.enabled").value;
    this.updateCacheSizeUI(!disabled);
  },

  /**
   * Converts the cache size from units of KB to units of MB and returns that
   * value.
   */
  readCacheSize() {
    var preference = Preferences.get("browser.cache.disk.capacity");
    return preference.value / 1024;
  },

  /**
   * Converts the cache size as specified in UI (in MB) to KB and returns that
   * value.
   */
  writeCacheSize() {
    var cacheSize = document.getElementById("cacheSize");
    var intValue = parseInt(cacheSize.value, 10);
    return isNaN(intValue) ? 0 : intValue * 1024;
  },

  /**
   * Clears the cache.
   */
  clearCache() {
    try {
      Services.cache2.clear();
    } catch (ex) {}
    this.updateActualCacheSize();
  },

  /**
   * Selects the correct item in the update radio group
   */
  async updateReadPrefs() {
    if (AppConstants.MOZ_UPDATER &&
        (!Services.policies || Services.policies.isAllowed("appUpdate"))) {
      let radiogroup = document.getElementById("updateRadioGroup");
      radiogroup.disabled = true;
      try {
        let enabled = await UpdateUtils.getAppUpdateAutoEnabled();
        radiogroup.value = enabled;
        radiogroup.disabled = false;
      } catch (error) {
        Cu.reportError(error);
      }
    }
  },

  /**
   * Writes the value of the update radio group to the disk
   */
  async updateWritePrefs() {
    if (AppConstants.MOZ_UPDATER &&
        (!Services.policies || Services.policies.isAllowed("appUpdate"))) {
      let radiogroup = document.getElementById("updateRadioGroup");
      let updateAutoValue = (radiogroup.value == "true");
      radiogroup.disabled = true;
      try {
        await UpdateUtils.setAppUpdateAutoEnabled(updateAutoValue);
        radiogroup.disabled = false;
      } catch (error) {
        Cu.reportError(error);
        await this.updateReadPrefs();
        await this.reportUpdatePrefWriteError(error);
        return;
      }

      // If the value was changed to false the user should be given the option
      // to discard an update if there is one.
      if (!updateAutoValue) {
        await this.checkUpdateInProgress();
      }
    }
  },

  async reportUpdatePrefWriteError(error) {
    let [title, message] = await document.l10n.formatValues([
      {id: "update-pref-write-failure-title"},
      {id: "update-pref-write-failure-message", args: {path: error.path}},
    ]);

    // Set up the Ok Button
    let buttonFlags = (Services.prompt.BUTTON_POS_0 *
                       Services.prompt.BUTTON_TITLE_OK);
    Services.prompt.confirmEx(window, title, message, buttonFlags,
                              null, null, null, null, {});
  },

  async checkUpdateInProgress() {
    let um = Cc["@mozilla.org/updates/update-manager;1"].
             getService(Ci.nsIUpdateManager);
    if (!um.activeUpdate) {
      return;
    }

    let [
      title, message, okButton, cancelButton,
    ] = await document.l10n.formatValues([
      {id: "update-in-progress-title"},
      {id: "update-in-progress-message"},
      {id: "update-in-progress-ok-button"},
      {id: "update-in-progress-cancel-button"},
    ]);

    // Continue is the cancel button which is BUTTON_POS_1 and is set as the
    // default so pressing escape or using a platform standard method of closing
    // the UI will not discard the update.
    let buttonFlags =
      (Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_0) +
      (Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_1) +
      Ci.nsIPrompt.BUTTON_POS_1_DEFAULT;

    let rv = Services.prompt.confirmEx(window, title, message, buttonFlags,
      okButton, cancelButton, null, null, {});
    if (rv != 1) {
      let aus = Cc["@mozilla.org/updates/update-service;1"].
                getService(Ci.nsIApplicationUpdateService);
      aus.stopDownload();
      um.cleanupActiveUpdate();
    }
  },

  showUpdates() {
    gSubDialog.open("chrome://mozapps/content/update/history.xul");
  },

  updateCompactOptions() {
    document.getElementById("offlineCompactFolderMin").disabled =
      !Preferences.get("mail.prompt_purge_threshhold").value ||
      Preferences.get("mail.purge_threshhold_mb").locked;
  },

  updateSubmitCrashReports(aChecked) {
    Cc["@mozilla.org/toolkit/crash-reporter;1"]
      .getService(Ci.nsICrashReporter)
      .submitReports = aChecked;
  },
  /**
   * Display the return receipts configuration dialog.
   */
  showReturnReceipts() {
    gSubDialog.open("chrome://messenger/content/preferences/receipts.xul",
                    "resizable=no");
  },

  /**
   * Display the the connection settings dialog.
   */
  showConnections() {
    gSubDialog.open("chrome://messenger/content/preferences/connection.xul");
  },

  /**
   * Display the the offline settings dialog.
   */
  showOffline() {
    gSubDialog.open("chrome://messenger/content/preferences/offline.xul",
                    "resizable=no");
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

  /**
   * When the user toggles the layers.acceleration.disabled pref,
   * sync its new value to the gfx.direct2d.disabled pref too.
   * Note that layers.acceleration.disabled is inverted.
   */
  updateHardwareAcceleration() {
    if (AppConstants.platform == "win") {
      let preference = Preferences.get("layers.acceleration.disabled");
      Services.prefs.setBoolPref("gfx.direct2d.disabled", !preference.value);
    }
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

  formatLocaleSetLabels() {
    const osprefs =
      Cc["@mozilla.org/intl/ospreferences;1"]
        .getService(Ci.mozIOSPreferences);
    let appLocale = Services.locale.appLocalesAsBCP47[0];
    let rsLocale = osprefs.regionalPrefsLocales[0];
    let names = Services.intl.getLocaleDisplayNames(undefined, [appLocale, rsLocale]);
    let appLocaleRadio = document.getElementById("appLocale");
    let rsLocaleRadio = document.getElementById("rsLocale");
    let appLocaleLabel = this.mBundle.getFormattedString("appLocale.label",
                                                         [names[0]]);
    let rsLocaleLabel = this.mBundle.getFormattedString("rsLocale.label",
                                                        [names[1]]);
    appLocaleRadio.setAttribute("label", appLocaleLabel);
    rsLocaleRadio.setAttribute("label", rsLocaleLabel);
    appLocaleRadio.accessKey = this.mBundle.getString("appLocale.accesskey");
    rsLocaleRadio.accessKey = this.mBundle.getString("rsLocale.accesskey");
  },

  // Load the preferences string bundle for other locales with fallbacks.
  getBundleForLocales(newLocales) {
    let locales = Array.from(new Set([
      ...newLocales,
      ...Services.locale.requestedLocales,
      Services.locale.lastFallbackLocale,
    ]));
    function generateBundles(resourceIds) {
      return L10nRegistry.generateBundles(locales, resourceIds);
    }
    return new Localization([
      "messenger/preferences/preferences.ftl",
      "branding/brand.ftl",
    ], generateBundles);
  },

  initMessengerLocale() {
    gAdvancedPane.setMessengerLocales(Services.locale.requestedLocale);
  },

  /**
   * Update the available list of locales and select the locale that the user
   * is "selecting". This could be the currently requested locale or a locale
   * that the user would like to switch to after confirmation.
   */
  async setMessengerLocales(selected) {
    let available = await getAvailableLocales();
    let localeNames = Services.intl.getLocaleDisplayNames(undefined, available);
    let locales = available.map((code, i) => ({code, name: localeNames[i]}));
    locales.sort((a, b) => a.name > b.name);

    let fragment = document.createDocumentFragment();
    for (let {code, name} of locales) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("value", code);
      menuitem.setAttribute("label", name);
      fragment.appendChild(menuitem);
    }

    // Add an option to search for more languages if downloading is supported.
    if (Services.prefs.getBoolPref("intl.multilingual.downloadEnabled")) {
      let menuitem = document.createXULElement("menuitem");
      menuitem.id = "defaultMessengerLanguageSearch";
      menuitem.setAttribute(
        "label", await document.l10n.formatValue("messenger-languages-search"));
      menuitem.setAttribute("value", "search");
      menuitem.addEventListener("command", () => {
        gAdvancedPane.showMessengerLanguages({search: true});
      });
      fragment.appendChild(menuitem);
    }

    let menulist = document.getElementById("defaultMessengerLanguage");
    let menupopup = menulist.querySelector("menupopup");
    menupopup.textContent = "";
    menupopup.appendChild(fragment);
    menulist.value = selected;

    document.getElementById("messengerLanguagesBox").hidden = false;
  },

  showMessengerLanguages({search}) {
    let opts = {selected: gAdvancedPane.selectedLocales, search};
    gSubDialog.open(
      "chrome://messenger/content/preferences/messengerLanguages.xul",
      null, opts, this.messengerLanguagesClosed);
  },

  /* Show or hide the confirm change message bar based on the updated ordering. */
  messengerLanguagesClosed() {
    let selected = this.gMessengerLanguagesDialog.selected;
    let active = Services.locale.appLocalesAsBCP47;

    // Prepare for changing the locales if they are different than the current locales.
    if (selected && selected.join(",") != active.join(",")) {
      gAdvancedPane.showConfirmLanguageChangeMessageBar(selected);
      gAdvancedPane.setMessengerLocales(selected[0]);
      return;
    }

    // They matched, so we can reset the UI.
    gAdvancedPane.setMessengerLocales(Services.locale.appLocaleAsBCP47);
    gAdvancedPane.hideConfirmLanguageChangeMessageBar();
  },

  /* Show the confirmation message bar to allow a restart into the new locales. */
  async showConfirmLanguageChangeMessageBar(locales) {
    let messageBar = document.getElementById("confirmMessengerLanguage");

    // Get the bundle for the new locale.
    let newBundle = this.getBundleForLocales(locales);

    // Find the messages and labels.
    let messages = await Promise.all([newBundle, document.l10n].map(
      async (bundle) => bundle.formatValue("confirm-messenger-language-change-description")));
    let buttonLabels = await Promise.all([newBundle, document.l10n].map(
      async (bundle) => bundle.formatValue("confirm-messenger-language-change-button")));

    // If both the message and label are the same, just include one row.
    if (messages[0] == messages[1] && buttonLabels[0] == buttonLabels[1]) {
      messages.pop();
      buttonLabels.pop();
    }

    let contentContainer = messageBar.querySelector(".message-bar-content-container");
    contentContainer.textContent = "";

    for (let i = 0; i < messages.length; i++) {
      let messageContainer = document.createXULElement("hbox");
      messageContainer.classList.add("message-bar-content");
      messageContainer.setAttribute("flex", "1");
      messageContainer.setAttribute("align", "center");

      let description = document.createXULElement("description");
      description.classList.add("message-bar-description");
      description.setAttribute("flex", "1");
      description.textContent = messages[i];
      messageContainer.appendChild(description);

      let button = document.createXULElement("button");
      button.addEventListener("command", () => gAdvancedPane.confirmLanguageChange());
      button.classList.add("message-bar-button");
      button.setAttribute("locales", locales.join(","));
      button.setAttribute("label", buttonLabels[i]);
      messageContainer.appendChild(button);

      contentContainer.appendChild(messageContainer);
    }

    messageBar.hidden = false;
    this.selectedLocales = locales;
  },

  hideConfirmLanguageChangeMessageBar() {
    let messageBar = document.getElementById("confirmMessengerLanguage");
    messageBar.hidden = true;
    let contentContainer = messageBar.querySelector(".message-bar-content-container");
    contentContainer.textContent = "";
    this.requestingLocales = null;
  },

  /* Confirm the locale change and restart the Thunderbird in the new locale. */
  confirmLanguageChange(event) {
    let localesString = (event.target.getAttribute("locales") || "").trim();
    if (!localesString || localesString.length == 0) {
      return;
    }
    let locales = localesString.split(",");
    Services.locale.requestedLocales = locales;

    // Restart with the new locale.
    let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
    Services.obs.notifyObservers(cancelQuit, "quit-application-requested", "restart");
    if (!cancelQuit.data) {
      Services.startup.quit(Services.startup.eAttemptQuit | Services.startup.eRestart);
    }
  },

  /* Show or hide the confirm change message bar based on the new locale. */
  onMessengerLanguageChange(event) {
    let locale = event.target.value;

    if (locale == "search") {
      return;
    } else if (locale == Services.locale.appLocaleAsBCP47) {
      this.hideConfirmLanguageChangeMessageBar();
      return;
    }

    let locales = Array.from(new Set([
      locale,
      ...Services.locale.requestedLocales,
    ]).values());
    this.showConfirmLanguageChangeMessageBar(locales);
  },

  destroy() {
    window.removeEventListener("unload", this);

    Services.obs.removeObserver(this, AUTO_UPDATE_CHANGED_TOPIC);
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver]),

  // nsIObserver

  async observe(aSubject, aTopic, aData) {
    if (aTopic == AUTO_UPDATE_CHANGED_TOPIC) {
      if (aData != "true" && aData != "false") {
        throw new Error("Invalid preference value for app.update.auto");
      }
      document.getElementById("updateRadioGroup").value = aData;
    }
  },

  // EventListener

  handleEvent(aEvent) {
    if (aEvent.type == "unload") {
      this.destroy();
      if (AppConstants.MOZ_UPDATER) {
        onUnload();
      }
    }
  },

};

Preferences.get("layers.acceleration.disabled").on("change", gAdvancedPane.updateHardwareAcceleration);
Preferences.get("mail.prompt_purge_threshhold").on("change", gAdvancedPane.updateCompactOptions);
