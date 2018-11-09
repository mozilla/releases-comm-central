/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/base/content/aboutDialog-appUpdater.js
/* globals appUpdater, gAppUpdater */

// Load DownloadUtils module for convertByteUnits
ChromeUtils.import("resource://gre/modules/DownloadUtils.jsm");
ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm");
ChromeUtils.import("resource://gre/modules/Localization.jsm");

XPCOMUtils.defineLazyServiceGetters(this, {
  gAUS: ["@mozilla.org/updates/update-service;1", "nsIApplicationUpdateService"],
});

const AUTO_UPDATE_CHANGED_TOPIC = "auto-update-config-change";

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
      let preference = document.getElementById("mail.preferences.advanced.selectedTabIndex");
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
    ChromeUtils.import("resource:///modules/SearchIntegration.jsm");
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
      document.getElementById("searchintegration.enable").disabled = true;
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
      document.getElementById("mail.preferences.advanced.selectedTabIndex")
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
    var disabled = document.getElementById("browser.cache.disk.smart_size.enabled").value;
    this.updateCacheSizeUI(!disabled);
  },

  /**
   * Converts the cache size from units of KB to units of MB and returns that
   * value.
   */
  readCacheSize() {
    var preference = document.getElementById("browser.cache.disk.capacity");
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
        let enabled = await gAUS.getAutoUpdateIsEnabled();
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
        await gAUS.setAutoUpdateIsEnabled(updateAutoValue);
        radiogroup.disabled = false;
      } catch (error) {
        Cu.reportError(error);
        await this.updateReadPrefs();
        await this.reportUpdatePrefWriteError(error);
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

  showUpdates() {
    gSubDialog.open("chrome://mozapps/content/update/history.xul");
  },

  updateCompactOptions(aCompactEnabled) {
    document.getElementById("offlineCompactFolderMin").disabled =
      !document.getElementById("offlineCompactFolder").checked ||
      document.getElementById("mail.purge_threshhold_mb").locked;
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
    gSubDialog.open("chrome://messenger/content/preferences/connection.xul",
                    "resizable=no");
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
    var preference = document.getElementById("security.OCSP.enabled");
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
   */
  updateHardwareAcceleration(aVal) {
    if (AppConstants.platforms == "win")
      Services.prefs.setBoolPref("gfx.direct2d.disabled", !aVal);
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
    let localeCodes = Services.locale.availableLocales;
    let localeNames = Services.intl.getLocaleDisplayNames(undefined, localeCodes);
    let locales = localeCodes.map((code, i) => ({code, name: localeNames[i]}));
    locales.sort((a, b) => a.name > b.name);

    let fragment = document.createDocumentFragment();
    for (let {code, name} of locales) {
      let menuitem = document.createElement("menuitem");
      menuitem.setAttribute("value", code);
      menuitem.setAttribute("label", name);
      fragment.appendChild(menuitem);
    }
    let menulist = document.getElementById("defaultMessengerLanguage");
    let menupopup = menulist.querySelector("menupopup");
    menupopup.appendChild(fragment);
    menulist.value = Services.locale.requestedLocale;

    document.getElementById("messengerLanguagesBox").hidden = false;
  },

  showMessengerLanguages() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/messengerLanguages.xul",
      null, this.requestingLocales, this.messengerLanguagesClosed);
  },

  /* Show or hide the confirm change message bar based on the updated ordering. */
  messengerLanguagesClosed() {
    let requesting = this.gMessengerLanguagesDialog.requestedLocales;
    let requested = Services.locale.requestedLocales;
    let defaultMessengerLanguage = document.getElementById("defaultMessengerLanguage");
    if (requesting && requesting.join(",") != requested.join(",")) {
      gAdvancedPane.showConfirmLanguageChangeMessageBar(requesting);
      defaultMessengerLanguage.value = requesting[0];
      return;
    }
    defaultMessengerLanguage.value = Services.locale.requestedLocale;
    gAdvancedPane.hideConfirmLanguageChangeMessageBar();
  },

  /* Show the confirmation message bar to allow a restart into the new locales. */
  async showConfirmLanguageChangeMessageBar(locales) {
    let messageBar = document.getElementById("confirmMessengerLanguage");
    // Set the text in the message bar for the new locale.
    let newBundle = this.getBundleForLocales(locales);
    let description = messageBar.querySelector(".message-bar-description");
    description.textContent = await newBundle.formatValue(
      "confirm-messenger-language-change-description");
    let button = messageBar.querySelector(".message-bar-button");
    button.setAttribute(
      "label", await newBundle.formatValue(
        "confirm-messenger-language-change-button"));
    button.setAttribute("locales", locales.join(","));
    messageBar.hidden = false;
    this.requestingLocales = locales;
  },

  hideConfirmLanguageChangeMessageBar() {
    let messageBar = document.getElementById("confirmMessengerLanguage");
    messageBar.hidden = true;
    messageBar.querySelector(".message-bar-button").removeAttribute("locales");
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
    if (locale == Services.locale.requestedLocale) {
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
    }
  },

};
