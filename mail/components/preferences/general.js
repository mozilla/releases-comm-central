/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../../base/content/aboutDialog-appUpdater.js */
/* import-globals-from ../../../../toolkit/mozapps/preferences/fontbuilder.js */
/* import-globals-from preferences.js */

// ------------------------------
// Constants & Enumeration Values

var { DownloadUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/DownloadUtils.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { UpdateUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/UpdateUtils.sys.mjs"
);
var { TagUtils } = ChromeUtils.import("resource:///modules/TagUtils.jsm");

XPCOMUtils.defineLazyServiceGetters(this, {
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    "nsIHandlerService",
  ],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

ChromeUtils.defineLazyGetter(this, "gIsPackagedApp", () => {
  return Services.sysinfo.getProperty("isPackagedApp");
});

const TYPE_PDF = "application/pdf";

const PREF_PDFJS_DISABLED = "pdfjs.disabled";

const AUTO_UPDATE_CHANGED_TOPIC = "auto-update-config-change";

Preferences.addAll([
  { id: "mail.pane_config.dynamic", type: "int" },
  { id: "mailnews.start_page.enabled", type: "bool" },
  { id: "mailnews.start_page.url", type: "string" },
  { id: "mail.biff.show_tray_icon", type: "bool" },
  { id: "mail.biff.play_sound", type: "bool" },
  { id: "mail.biff.play_sound.type", type: "int" },
  { id: "mail.biff.play_sound.url", type: "string" },
  { id: "mail.biff.use_system_alert", type: "bool" },
  { id: "general.autoScroll", type: "bool" },
  { id: "general.smoothScroll", type: "bool" },
  { id: "widget.gtk.overlay-scrollbars.enabled", type: "bool", inverted: true },
  { id: "mail.fixed_width_messages", type: "bool" },
  { id: "mail.inline_attachments", type: "bool" },
  { id: "mail.quoted_style", type: "int" },
  { id: "mail.quoted_size", type: "int" },
  { id: "mail.citation_color", type: "string" },
  { id: "mail.display_glyph", type: "bool" },
  { id: "font.language.group", type: "wstring" },
  { id: "intl.regional_prefs.use_os_locales", type: "bool" },
  { id: "mailnews.database.global.indexer.enabled", type: "bool" },
  { id: "mailnews.labels.description.1", type: "wstring" },
  { id: "mailnews.labels.color.1", type: "string" },
  { id: "mailnews.labels.description.2", type: "wstring" },
  { id: "mailnews.labels.color.2", type: "string" },
  { id: "mailnews.labels.description.3", type: "wstring" },
  { id: "mailnews.labels.color.3", type: "string" },
  { id: "mailnews.labels.description.4", type: "wstring" },
  { id: "mailnews.labels.color.4", type: "string" },
  { id: "mailnews.labels.description.5", type: "wstring" },
  { id: "mailnews.labels.color.5", type: "string" },
  { id: "mail.showCondensedAddresses", type: "bool" },
  { id: "mailnews.mark_message_read.auto", type: "bool" },
  { id: "mailnews.mark_message_read.delay", type: "bool" },
  { id: "mailnews.mark_message_read.delay.interval", type: "int" },
  { id: "mail.openMessageBehavior", type: "int" },
  { id: "mail.close_message_window.on_delete", type: "bool" },
  { id: "mail.prompt_purge_threshhold", type: "bool" },
  { id: "mail.purge.ask", type: "bool" },
  { id: "mail.purge_threshhold_mb", type: "int" },
  { id: "browser.cache.disk.capacity", type: "int" },
  { id: "browser.cache.disk.smart_size.enabled", inverted: true, type: "bool" },
  { id: "privacy.clearOnShutdown.cache", type: "bool" },
  { id: "layers.acceleration.disabled", type: "bool", inverted: true },
  { id: "searchintegration.enable", type: "bool" },
  { id: "mail.tabs.drawInTitlebar", type: "bool" },
  { id: "mail.tabs.autoHide", type: "bool" },
]);
if (AppConstants.platform == "win") {
  Preferences.add({ id: "mail.minimizeToTray", type: "bool" });
}
if (AppConstants.platform != "macosx") {
  Preferences.add({ id: "mail.biff.show_alert", type: "bool" });
}

var ICON_URL_APP = "";

if (AppConstants.MOZ_WIDGET_GTK) {
  ICON_URL_APP = "moz-icon://dummy.exe?size=16";
} else {
  ICON_URL_APP = "chrome://messenger/skin/preferences/application.png";
}

if (AppConstants.HAVE_SHELL_SERVICE) {
  Preferences.addAll([
    { id: "mail.shell.checkDefaultClient", type: "bool" },
    { id: "pref.general.disable_button.default_mail", type: "bool" },
  ]);
}

if (AppConstants.MOZ_UPDATER) {
  Preferences.add({
    id: "app.update.disable_button.showUpdateHistory",
    type: "bool",
  });
  if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
    Preferences.add({ id: "app.update.service.enabled", type: "bool" });
  }
}

var gGeneralPane = {
  // The set of types the app knows how to handle. A map of HandlerInfoWrapper
  // objects, indexed by type.
  _handledTypes: new Map(),
  // Map from a handlerInfoWrapper to the corresponding table HandlerRow.
  _handlerRows: new Map(),
  _handlerMenuId: 0,

  // The list of types we can show, sorted by the sort column/direction.
  // An array of HandlerInfoWrapper objects.  We build this list when we first
  // load the data and then rebuild it when users change a pref that affects
  // what types we can show or change the sort column/direction.
  // Note: this isn't necessarily the list of types we *will* show; if the user
  // provides a filter string, we'll only show the subset of types in this list
  // that match that string.
  _visibleTypes: [],

  // Map whose keys are string descriptions and values are references to the
  // first visible HandlerInfoWrapper that has this description. We use this
  // to determine whether or not to annotate descriptions with their types to
  // distinguish duplicate descriptions from each other.
  _visibleDescriptions: new Map(),

  // -----------------------------------
  // Convenience & Performance Shortcuts

  // These get defined by init().
  _brandShortName: null,
  _handlerTbody: null,
  _filter: null,
  _prefsBundle: null,
  mPane: null,
  mStartPageUrl: "",
  mShellServiceWorking: false,
  mTagListBox: null,
  requestingLocales: null,

  async init() {
    function setEventListener(aId, aEventType, aCallback) {
      document
        .getElementById(aId)
        .addEventListener(aEventType, aCallback.bind(gGeneralPane));
    }

    Preferences.addSyncFromPrefListener(
      document.getElementById("saveWhere"),
      () => gDownloadDirSection.onReadUseDownloadDir()
    );

    this.mPane = document.getElementById("paneGeneral");
    this._prefsBundle = document.getElementById("bundlePreferences");
    this._brandShortName = document
      .getElementById("bundleBrand")
      .getString("brandShortName");
    this._handlerTbody = document.querySelector("#handlersTable > tbody");
    this._filter = document.getElementById("filter");

    this._handlerSort = { type: "type", descending: false };
    this._handlerSortHeaders = document.querySelectorAll(
      "#handlersTable > thead th[sort-type]"
    );
    for (const header of this._handlerSortHeaders) {
      const button = header.querySelector("button");
      button.addEventListener(
        "click",
        this.sort.bind(this, header.getAttribute("sort-type"))
      );
    }

    this.updateStartPage();
    this.updatePlaySound(
      !Preferences.get("mail.biff.play_sound").value,
      Preferences.get("mail.biff.play_sound.url").value,
      Preferences.get("mail.biff.play_sound.type").value
    );
    if (AppConstants.platform != "macosx") {
      this.updateShowAlert();
    }
    this.updateWebSearch();

    // Search integration -- check whether we should hide or disable integration
    let hideSearchUI = false;
    let disableSearchUI = false;
    const { SearchIntegration } = ChromeUtils.import(
      "resource:///modules/SearchIntegration.jsm"
    );
    if (SearchIntegration) {
      if (SearchIntegration.osVersionTooLow) {
        hideSearchUI = true;
      } else if (SearchIntegration.osComponentsNotRunning) {
        disableSearchUI = true;
      }
    } else {
      hideSearchUI = true;
    }

    if (hideSearchUI) {
      document.getElementById("searchIntegrationContainer").hidden = true;
    } else if (disableSearchUI) {
      const searchCheckbox = document.getElementById("searchIntegration");
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
      if (document.getElementById("checkDefaultButton")) {
        document.getElementById("checkDefaultButton").disabled = true;
      }
      this.mShellServiceWorking = false;
    }
    this._rebuildFonts();

    var menulist = document.getElementById("defaultFont");
    if (menulist.selectedIndex == -1) {
      // Prepend menuitem with empty name and value.
      const item = document.createXULElement("menuitem");
      item.setAttribute("label", "");
      item.setAttribute("value", "");
      menulist.menupopup.insertBefore(
        item,
        menulist.menupopup.firstElementChild
      );
      menulist.selectedIndex = 0;
    }

    this.formatLocaleSetLabels();

    if (Services.prefs.getBoolPref("intl.multilingual.enabled")) {
      this.initPrimaryMessengerLanguageUI();
    }

    this.mTagListBox = document.getElementById("tagList");
    this.buildTagList();
    this.updateMarkAsReadOptions();

    document.getElementById("citationmenu").value = Preferences.get(
      "mail.citation_color"
    ).value;

    // By doing this in a timeout, we let the preferences dialog resize itself
    // to an appropriate size before we add a bunch of items to the list.
    // Otherwise, if there are many items, and the Applications prefpane
    // is the one that gets displayed when the user first opens the dialog,
    // the dialog might stretch too much in an attempt to fit them all in.
    // XXX Shouldn't we perhaps just set a max-height on the richlistbox?
    var _delayedPaneLoad = function (self) {
      self._loadAppHandlerData();
      self._rebuildVisibleTypes();
      self._sortVisibleTypes();
      self._rebuildView();

      // Notify observers that the UI is now ready
      Services.obs.notifyObservers(window, "app-handler-pane-loaded");
    };
    this.updateActualCacheSize();
    this.updateCompactOptions();

    // Default store type initialization.
    const storeTypeElement = document.getElementById("storeTypeMenulist");
    // set the menuitem to match the account
    const defaultStoreID = Services.prefs.getCharPref(
      "mail.serverDefaultStoreContractID"
    );
    const targetItem = storeTypeElement.getElementsByAttribute(
      "value",
      defaultStoreID
    );
    storeTypeElement.selectedItem = targetItem[0];
    setTimeout(_delayedPaneLoad, 0, this);

    if (AppConstants.MOZ_UPDATER) {
      this.updateReadPrefs();
      gAppUpdater = new appUpdater(); // eslint-disable-line no-global-assign
      const updateDisabled =
        Services.policies && !Services.policies.isAllowed("appUpdate");

      if (gIsPackagedApp) {
        // When we're running inside an app package, there's no point in
        // displaying any update content here, and it would get confusing if we
        // did, because our updater is not enabled.
        // We can't rely on the hidden attribute for the toplevel elements,
        // because of the pane hiding/showing code interfering.
        document
          .getElementById("updatesCategory")
          .setAttribute("style", "display: none !important");
        document
          .getElementById("updateApp")
          .setAttribute("style", "display: none !important");
      } else if (updateDisabled || UpdateUtils.appUpdateAutoSettingIsLocked()) {
        document.getElementById("updateAllowDescription").hidden = true;
        document.getElementById("updateSettingsContainer").hidden = true;
        if (updateDisabled && AppConstants.MOZ_MAINTENANCE_SERVICE) {
          document.getElementById("useService").hidden = true;
        }
      } else {
        // Start with no option selected since we are still reading the value
        document.getElementById("autoDesktop").removeAttribute("selected");
        document.getElementById("manualDesktop").removeAttribute("selected");
        // Start reading the correct value from the disk
        this.updateReadPrefs();
        setEventListener(
          "updateRadioGroup",
          "command",
          gGeneralPane.updateWritePrefs
        );
      }

      const defaults = Services.prefs.getDefaultBranch(null);
      const distroId = defaults.getCharPref("distribution.id", "");
      if (distroId) {
        const distroVersion = defaults.getCharPref("distribution.version", "");

        const distroIdField = document.getElementById("distributionId");
        distroIdField.value = distroId + " - " + distroVersion;
        distroIdField.style.display = "block";

        const distroAbout = defaults.getStringPref("distribution.about", "");
        if (distroAbout) {
          const distroField = document.getElementById("distribution");
          distroField.value = distroAbout;
          distroField.style.display = "block";
        }
      }

      if (AppConstants.platform == "win") {
        // On Windows, the Application Update setting is an installation-
        // specific preference, not a profile-specific one. Show a warning to
        // inform users of this.
        const updateContainer = document.getElementById(
          "updateSettingsContainer"
        );
        updateContainer.classList.add("updateSettingCrossUserWarningContainer");
        document.getElementById("updateSettingCrossUserWarning").hidden = false;
      }

      if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
        // Check to see if the maintenance service is installed.
        // If it isn't installed, don't show the preference at all.
        let installed;
        try {
          const wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
            Ci.nsIWindowsRegKey
          );
          wrk.open(
            wrk.ROOT_KEY_LOCAL_MACHINE,
            "SOFTWARE\\Mozilla\\MaintenanceService",
            wrk.ACCESS_READ | wrk.WOW64_64
          );
          installed = wrk.readIntValue("Installed");
          wrk.close();
        } catch (e) {}
        if (installed != 1) {
          document.getElementById("useService").hidden = true;
        }
      }

      let version = AppConstants.MOZ_APP_VERSION_DISPLAY;

      // Include the build ID and display warning if this is an "a#" (nightly) build
      if (/a\d+$/.test(version)) {
        const buildID = Services.appinfo.appBuildID;
        const year = buildID.slice(0, 4);
        const month = buildID.slice(4, 6);
        const day = buildID.slice(6, 8);
        version += ` (${year}-${month}-${day})`;
      }

      // Append "(32-bit)" or "(64-bit)" build architecture to the version number:
      const bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      const archResource = Services.appinfo.is64Bit
        ? "aboutDialog.architecture.sixtyFourBit"
        : "aboutDialog.architecture.thirtyTwoBit";
      const arch = bundle.GetStringFromName(archResource);
      version += ` (${arch})`;

      document.l10n.setAttributes(
        document.getElementById("version"),
        "update-app-version",
        { version }
      );

      if (!AppConstants.NIGHTLY_BUILD) {
        // Show a release notes link if we have a URL.
        const relNotesLink = document.getElementById("releasenotes");
        const relNotesPrefType = Services.prefs.getPrefType(
          "app.releaseNotesURL"
        );
        if (relNotesPrefType != Services.prefs.PREF_INVALID) {
          const relNotesURL = Services.urlFormatter.formatURLPref(
            "app.releaseNotesURL"
          );
          if (relNotesURL != "about:blank") {
            relNotesLink.href = relNotesURL;
            relNotesLink.hidden = false;
          }
        }
      }
      // Initialize Application section.

      Services.obs.addObserver(this, AUTO_UPDATE_CHANGED_TOPIC);
    }
    // Listen for window unload so we can remove our preference observers.
    window.addEventListener("unload", this);
    Services.prefs.addObserver("mailnews.tags.", this);

    Preferences.addSyncFromPrefListener(
      document.getElementById("allowSmartSize"),
      () => this.readSmartSizeEnabled()
    );

    const element = document.getElementById("cacheSize");
    Preferences.addSyncFromPrefListener(element, () => this.readCacheSize());
    Preferences.addSyncToPrefListener(element, () => this.writeCacheSize());
    Preferences.addSyncFromPrefListener(menulist, () =>
      this.readFontSelection()
    );
    Preferences.addSyncFromPrefListener(
      document.getElementById("soundUrlLocation"),
      () => this.readSoundLocation()
    );

    if (!Services.policies.isAllowed("about:config")) {
      document.getElementById("configEditor").disabled = true;
    }
  },

  /**
   * Restores the default start page as the user's start page
   */
  restoreDefaultStartPage() {
    var startPage = Preferences.get("mailnews.start_page.url");
    startPage.value = startPage.defaultValue;
  },

  /**
   * Returns a formatted url corresponding to the value of mailnews.start_page.url
   * Stores the original value of mailnews.start_page.url
   */
  readStartPageUrl() {
    var pref = Preferences.get("mailnews.start_page.url");
    this.mStartPageUrl = pref.value;
    return Services.urlFormatter.formatURL(this.mStartPageUrl);
  },

  /**
   * Returns the value of the mailnews start page url represented by the UI.
   * If the url matches the formatted version of our stored value, then
   * return the unformatted url.
   */
  writeStartPageUrl() {
    var startPage = document.getElementById("mailnewsStartPageUrl");
    return Services.urlFormatter.formatURL(this.mStartPageUrl) ==
      startPage.value
      ? this.mStartPageUrl
      : startPage.value;
  },

  customizeMailAlert() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/notifications.xhtml",
      { features: "resizable=no" }
    );
  },

  configureDockOptions() {
    gSubDialog.open(
      "chrome://messenger/content/preferences/dockoptions.xhtml",
      { features: "resizable=no" }
    );
  },

  convertURLToLocalFile(aFileURL) {
    // convert the file url into a nsIFile
    if (aFileURL) {
      return Services.io
        .getProtocolHandler("file")
        .QueryInterface(Ci.nsIFileProtocolHandler)
        .getFileFromURLSpec(aFileURL);
    }
    return null;
  },

  readSoundLocation() {
    var soundUrlLocation = document.getElementById("soundUrlLocation");
    soundUrlLocation.value = Preferences.get("mail.biff.play_sound.url").value;
    if (soundUrlLocation.value) {
      soundUrlLocation.label = this.convertURLToLocalFile(
        soundUrlLocation.value
      ).leafName;
      soundUrlLocation.style.backgroundImage =
        "url(moz-icon://" + soundUrlLocation.label + "?size=16)";
    }
  },

  previewSound() {
    const sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);
    // soundType radio-group isn't used for macOS so it is not in the XUL file
    // for the platform.
    const soundLocation =
      AppConstants.platform == "macosx" ||
      document.getElementById("soundType").value == 1
        ? document.getElementById("soundUrlLocation").value
        : "";

    if (!soundLocation.includes("file://")) {
      // User has not set any custom sound file to be played
      sound.playEventSound(Ci.nsISound.EVENT_NEW_MAIL_RECEIVED);
    } else {
      // User has set a custom audio file to be played along the alert.
      sound.play(Services.io.newURI(soundLocation));
    }
  },

  browseForSoundFile() {
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);

    // if we already have a sound file, then use the path for that sound file
    // as the initial path in the dialog.
    var localFile = this.convertURLToLocalFile(
      document.getElementById("soundUrlLocation").value
    );
    if (localFile) {
      fp.displayDirectory = localFile.parent;
    }

    // XXX todo, persist the last sound directory and pass it in
    fp.init(
      window,
      document
        .getElementById("bundlePreferences")
        .getString("soundFilePickerTitle"),
      Ci.nsIFilePicker.modeOpen
    );
    fp.appendFilters(Ci.nsIFilePicker.filterAudio);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      // convert the nsIFile into a nsIFile url
      Preferences.get("mail.biff.play_sound.url").value = fp.fileURL.spec;
      this.readSoundLocation(); // XXX We shouldn't have to be doing this by hand
      this.updatePlaySound();
    });
  },

  updatePlaySound(soundsDisabled, soundUrlLocation, soundType) {
    // Update the sound type radio buttons based on the state of the
    // play sound checkbox.
    if (soundsDisabled === undefined) {
      soundsDisabled = !document.getElementById("newMailNotification").checked;
      soundUrlLocation = document.getElementById("soundUrlLocation").value;
    }

    // The UI is different on OS X as the user can only choose between letting
    // the system play a default sound or setting a custom one. Therefore,
    // "soundTypeEl" does not exist on OS X.
    if (AppConstants.platform != "macosx") {
      var soundTypeEl = document.getElementById("soundType");
      if (soundType === undefined) {
        soundType = soundTypeEl.value;
      }

      soundTypeEl.disabled = soundsDisabled;
      document.getElementById("soundUrlLocation").disabled =
        soundsDisabled || soundType != 1;
      document.getElementById("browseForSound").disabled =
        soundsDisabled || soundType != 1;
      document.getElementById("playSound").disabled =
        soundsDisabled || (!soundUrlLocation && soundType != 0);
    } else {
      // On OS X, if there is no selected custom sound then default one will
      // be played. We keep consistency by disabling the "Play sound" checkbox
      // if the user hasn't selected a custom sound file yet.
      document.getElementById("newMailNotification").disabled =
        !soundUrlLocation;
      document.getElementById("playSound").disabled = !soundUrlLocation;
      // The sound type radiogroup is hidden, but we have to keep the
      // play_sound.type pref set appropriately.
      Preferences.get("mail.biff.play_sound.type").value =
        !soundsDisabled && soundUrlLocation ? 1 : 0;
    }
  },

  updateStartPage() {
    document.getElementById("mailnewsStartPageUrl").disabled = !Preferences.get(
      "mailnews.start_page.enabled"
    ).value;
    document.getElementById("browseForStartPageUrl").disabled =
      !Preferences.get("mailnews.start_page.enabled").value;
  },

  updateShowAlert() {
    // The button does not exist on all platforms.
    const customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled = !Preferences.get("mail.biff.show_alert")
        .value;
    }
    // The checkmark does not exist on all platforms.
    const systemNotification = document.getElementById(
      "useSystemNotificationAlert"
    );
    if (systemNotification) {
      systemNotification.disabled = !Preferences.get("mail.biff.show_alert")
        .value;
    }
  },

  updateWebSearch() {
    const self = this;
    Services.search.init().then(async () => {
      const defaultEngine = await Services.search.getDefault();
      const engineList = document.getElementById("defaultWebSearch");
      for (const engine of await Services.search.getVisibleEngines()) {
        const item = engineList.appendItem(engine.name);
        item.engine = engine;
        item.className = "menuitem-iconic";
        item.setAttribute(
          "image",
          engine.getIconURL() || "resource://gre-resources/broken-image.png"
        );
        if (engine == defaultEngine) {
          engineList.selectedItem = item;
        }
      }
      self.defaultEngines = await Services.search.getAppProvidedEngines();
      self.updateRemoveButton();

      engineList.addEventListener("command", async () => {
        await Services.search.setDefault(
          engineList.selectedItem.engine,
          Ci.nsISearchService.CHANGE_REASON_USER
        );
        self.updateRemoveButton();
      });
    });
  },

  // Caches the default engines so we only retrieve them once.
  defaultEngines: null,

  async updateRemoveButton() {
    const engineList = document.getElementById("defaultWebSearch");
    const removeButton = document.getElementById("removeSearchEngine");
    if (this.defaultEngines.includes(await Services.search.getDefault())) {
      // Don't allow deletion of a default engine (saves us having a 'restore' button).
      removeButton.disabled = true;
    } else {
      // Don't allow removal of last engine. This shouldn't happen since there should
      // always be default engines.
      removeButton.disabled = engineList.itemCount <= 1;
    }
  },

  /**
   * Look up OpenSearch Description URL.
   *
   * @param url - the url to use as basis for discovery
   */
  async lookupOpenSearch(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Bad response for url=${url}`);
    }
    const contentType = response.headers.get("Content-Type")?.toLowerCase();
    if (
      contentType == "application/opensearchdescription+xml" ||
      contentType == "application/xml" ||
      contentType == "text/xml"
    ) {
      return url;
    }
    const doc = new DOMParser().parseFromString(
      await response.text(),
      "text/html"
    );
    const auto = doc.querySelector(
      "link[rel='search'][type='application/opensearchdescription+xml']"
    );
    if (!auto) {
      throw new Error(`No provider discovered for url=${url}`);
    }
    return /^https?:/.test(auto.href)
      ? auto.href
      : new URL(url).origin + auto.href;
  },

  async addSearchEngine() {
    const input = { value: "https://" };
    const [title, text] = await document.l10n.formatValues([
      "add-opensearch-provider-title",
      "add-opensearch-provider-text",
    ]);
    const result = Services.prompt.prompt(window, title, text, input, null, {
      value: false,
    });
    input.value = input.value.trim();
    if (!result || !input.value || input.value == "https://") {
      return;
    }
    let url = input.value;
    let engine;
    try {
      url = await this.lookupOpenSearch(url);
      engine = await Services.search.addOpenSearchEngine(url, null);
    } catch (reason) {
      const [title, text] = await document.l10n.formatValues([
        { id: "adding-opensearch-provider-failed-title" },
        { id: "adding-opensearch-provider-failed-text", args: { url } },
      ]);
      Services.prompt.alert(window, title, text);
      return;
    }
    // Wait a bit, so the engine iconURI has time to be fetched.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 500));

    // Add new engine to the list, make the added engine the default.
    const engineList = document.getElementById("defaultWebSearch");
    const item = engineList.appendItem(engine.name);
    item.engine = engine;
    item.className = "menuitem-iconic";
    item.setAttribute(
      "image",
      engine.getIconURL() || "resource://gre-resources/broken-image.png"
    );
    engineList.selectedIndex =
      engineList.firstElementChild.childElementCount - 1;
    await Services.search.setDefault(
      engineList.selectedItem.engine,
      Ci.nsISearchService.CHANGE_REASON_USER
    );
    this.updateRemoveButton();
  },

  async removeSearchEngine() {
    // Deletes the current engine. Firefox does a better job since it
    // shows all the engines in the list. But better than nothing.
    const defaultEngine = await Services.search.getDefault();
    const engineList = document.getElementById("defaultWebSearch");
    for (let i = 0; i < engineList.itemCount; i++) {
      const item = engineList.getItemAtIndex(i);
      if (item.engine == defaultEngine) {
        await Services.search.removeEngine(item.engine);
        item.remove();
        engineList.selectedIndex = 0;
        await Services.search.setDefault(
          engineList.selectedItem.engine,
          Ci.nsISearchService.CHANGE_REASON_USER
        );
        this.updateRemoveButton();
        break;
      }
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
    if (!this.mShellServiceWorking) {
      return;
    }

    // otherwise, bring up the default client dialog
    gSubDialog.open(
      "chrome://messenger/content/systemIntegrationDialog.xhtml",
      { features: "resizable=no" },
      "calledFromPrefs"
    );
  },

  // FONTS

  /**
   * Populates the default font list in UI.
   */
  _rebuildFonts() {
    var langGroupPref = Preferences.get("font.language.group");
    var isSerif =
      gGeneralPane._readDefaultFontTypeForLanguage(langGroupPref.value) ==
      "serif";
    gGeneralPane._selectDefaultLanguageGroup(langGroupPref.value, isSerif);
  },

  /**
   * Select the default language group.
   */
  _selectDefaultLanguageGroupPromise: Promise.resolve(),

  _selectDefaultLanguageGroup(aLanguageGroup, aIsSerif) {
    this._selectDefaultLanguageGroupPromise = (async () => {
      // Avoid overlapping language group selections by awaiting the resolution
      // of the previous one.  We do this because this function is re-entrant,
      // as inserting <preference> elements into the DOM sometimes triggers a call
      // back into this function.  And since this function is also asynchronous,
      // that call can enter this function before the previous run has completed,
      // which would corrupt the font menulists.  Awaiting the previous call's
      // resolution avoids that fate.
      await this._selectDefaultLanguageGroupPromise;

      const kFontNameFmtSerif = "font.name.serif.%LANG%";
      const kFontNameFmtSansSerif = "font.name.sans-serif.%LANG%";
      const kFontNameListFmtSerif = "font.name-list.serif.%LANG%";
      const kFontNameListFmtSansSerif = "font.name-list.sans-serif.%LANG%";
      const kFontSizeFmtVariable = "font.size.variable.%LANG%";

      // Make sure font.name-list is created before font.name so that it's
      // available at the time readFontSelection below is called.
      var prefs = [
        {
          format: aIsSerif ? kFontNameListFmtSerif : kFontNameListFmtSansSerif,
          type: "unichar",
          element: null,
          fonttype: aIsSerif ? "serif" : "sans-serif",
        },
        {
          format: aIsSerif ? kFontNameFmtSerif : kFontNameFmtSansSerif,
          type: "fontname",
          element: "defaultFont",
          fonttype: aIsSerif ? "serif" : "sans-serif",
        },
        {
          format: kFontSizeFmtVariable,
          type: "int",
          element: "defaultFontSize",
          fonttype: null,
        },
      ];

      for (var i = 0; i < prefs.length; ++i) {
        var preference = Preferences.get(
          prefs[i].format.replace(/%LANG%/, aLanguageGroup)
        );
        if (!preference) {
          preference = Preferences.add({
            id: prefs[i].format.replace(/%LANG%/, aLanguageGroup),
            type: prefs[i].type,
          });
        }

        if (!prefs[i].element) {
          continue;
        }

        var element = document.getElementById(prefs[i].element);
        if (element) {
          if (prefs[i].fonttype) {
            await FontBuilder.buildFontList(
              aLanguageGroup,
              prefs[i].fonttype,
              element
            );
          }

          element.setAttribute("preference", preference.id);

          preference.setElementValue(element);
        }
      }
    })().catch(console.error);
  },

  /**
   * Displays the fonts dialog, where web page font names and sizes can be
   * configured.
   */
  configureFonts() {
    gSubDialog.open("chrome://messenger/content/preferences/fonts.xhtml", {
      features: "resizable=no",
    });
  },

  /**
   * Displays the colors dialog, where default web page/link/etc. colors can be
   * configured.
   */
  configureColors() {
    gSubDialog.open("chrome://messenger/content/preferences/colors.xhtml", {
      features: "resizable=no",
    });
  },

  /**
   * Returns the type of the current default font for the language denoted by
   * aLanguageGroup.
   */
  _readDefaultFontTypeForLanguage(aLanguageGroup) {
    const kDefaultFontType = "font.default.%LANG%";
    var defaultFontTypePref = kDefaultFontType.replace(
      /%LANG%/,
      aLanguageGroup
    );
    var preference = Preferences.get(defaultFontTypePref);
    if (!preference) {
      Preferences.add({
        id: defaultFontTypePref,
        type: "string",
        name: defaultFontTypePref,
      }).on("change", gGeneralPane._rebuildFonts);
    }

    // We should return preference.value here, but we can't wait for the binding to load,
    // or things get really messy. Fortunately this will give the same answer.
    return Services.prefs.getCharPref(defaultFontTypePref);
  },

  /**
   * Determine the appropriate value to select for defaultFont, for the
   * following cases:
   * - there is no setting
   * - the font selected by the user is no longer present (e.g. deleted from
   *   fonts folder)
   */
  readFontSelection() {
    const element = document.getElementById("defaultFont");
    const preference = Preferences.get(element.getAttribute("preference"));
    if (preference.value) {
      const fontItem = element.querySelector(
        '[value="' + preference.value + '"]'
      );

      // There is a setting that actually is in the list. Respect it.
      if (fontItem) {
        return undefined;
      }
    }

    const defaultValue =
      element.firstElementChild.firstElementChild.getAttribute("value");
    const languagePref = Preferences.get("font.language.group");
    const defaultType = this._readDefaultFontTypeForLanguage(
      languagePref.value
    );
    const listPref = Preferences.get(
      "font.name-list." + defaultType + "." + languagePref.value
    );
    if (!listPref) {
      return defaultValue;
    }

    const fontNames = listPref.value.split(",");

    for (const fontName of fontNames) {
      const fontItem = element.querySelector(
        '[value="' + fontName.trim() + '"]'
      );
      if (fontItem) {
        return fontItem.getAttribute("value");
      }
    }
    return defaultValue;
  },

  async formatLocaleSetLabels() {
    // HACK: calling getLocaleDisplayNames may fail the first time due to
    // synchronous loading of the .ftl files. If we load the files and wait
    // for a known value asynchronously, no such failure will happen.
    await new Localization([
      "toolkit/intl/languageNames.ftl",
      "toolkit/intl/regionNames.ftl",
    ]).formatValue("language-name-en");

    const osprefs = Cc["@mozilla.org/intl/ospreferences;1"].getService(
      Ci.mozIOSPreferences
    );
    const appLocale = Services.locale.appLocalesAsBCP47[0];
    const rsLocale = osprefs.regionalPrefsLocales[0];
    const names = Services.intl.getLocaleDisplayNames(undefined, [
      appLocale,
      rsLocale,
    ]);
    const appLocaleRadio = document.getElementById("appLocale");
    const rsLocaleRadio = document.getElementById("rsLocale");
    const appLocaleLabel = this._prefsBundle.getFormattedString(
      "appLocale.label",
      [names[0]]
    );
    const rsLocaleLabel = this._prefsBundle.getFormattedString(
      "rsLocale.label",
      [names[1]]
    );
    appLocaleRadio.setAttribute("label", appLocaleLabel);
    rsLocaleRadio.setAttribute("label", rsLocaleLabel);
    appLocaleRadio.accessKey = this._prefsBundle.getString(
      "appLocale.accesskey"
    );
    rsLocaleRadio.accessKey = this._prefsBundle.getString("rsLocale.accesskey");
  },

  // Load the preferences string bundle for other locales with fallbacks.
  getBundleForLocales(newLocales) {
    const locales = Array.from(
      new Set([
        ...newLocales,
        ...Services.locale.requestedLocales,
        Services.locale.lastFallbackLocale,
      ])
    );
    return new Localization(
      ["messenger/preferences/preferences.ftl", "branding/brand.ftl"],
      false,
      undefined,
      locales
    );
  },

  initPrimaryMessengerLanguageUI() {
    gGeneralPane.updatePrimaryMessengerLanguageUI(
      Services.locale.requestedLocale
    );
  },

  /**
   * Update the available list of locales and select the locale that the user
   * is "selecting". This could be the currently requested locale or a locale
   * that the user would like to switch to after confirmation.
   *
   * @param {string} selected - The selected BCP 47 locale.
   */
  async updatePrimaryMessengerLanguageUI(selected) {
    // HACK: calling getLocaleDisplayNames may fail the first time due to
    // synchronous loading of the .ftl files. If we load the files and wait
    // for a known value asynchronously, no such failure will happen.
    await new Localization([
      "toolkit/intl/languageNames.ftl",
      "toolkit/intl/regionNames.ftl",
    ]).formatValue("language-name-en");

    const available = await getAvailableLocales();
    const localeNames = Services.intl.getLocaleDisplayNames(
      undefined,
      available,
      { preferNative: true }
    );
    const locales = available.map((code, i) => ({
      code,
      name: localeNames[i],
    }));
    locales.sort((a, b) => a.name > b.name);

    const fragment = document.createDocumentFragment();
    for (const { code, name } of locales) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.setAttribute("value", code);
      menuitem.setAttribute("label", name);
      fragment.appendChild(menuitem);
    }

    // Add an option to search for more languages if downloading is supported.
    if (Services.prefs.getBoolPref("intl.multilingual.downloadEnabled")) {
      const menuitem = document.createXULElement("menuitem");
      menuitem.id = "primaryMessengerLocaleSearch";
      menuitem.setAttribute(
        "label",
        await document.l10n.formatValue("messenger-languages-search")
      );
      menuitem.setAttribute("value", "search");
      menuitem.addEventListener("command", () => {
        gGeneralPane.showMessengerLanguagesSubDialog({ search: true });
      });
      fragment.appendChild(menuitem);
    }

    const menulist = document.getElementById("primaryMessengerLocale");
    const menupopup = menulist.querySelector("menupopup");
    menupopup.textContent = "";
    menupopup.appendChild(fragment);
    menulist.value = selected;

    document.getElementById("messengerLanguagesBox").hidden = false;
  },

  /**
   * Open the messenger languages sub dialog in either the normal mode, or search mode.
   * The search mode is only available from the menu to change the primary browser
   * language.
   *
   * @param {{ search: boolean }}
   */
  showMessengerLanguagesSubDialog({ search }) {
    const opts = {
      selectedLocalesForRestart: gGeneralPane.selectedLocalesForRestart,
      search,
    };
    gSubDialog.open(
      "chrome://messenger/content/preferences/messengerLanguages.xhtml",
      { closingCallback: this.messengerLanguagesClosed },
      opts
    );
  },

  /**
   * Returns the assumed script directionality for known Firefox locales. This is
   * somewhat crude, but should work until Bug 1750781 lands.
   *
   * TODO (Bug 1750781) - This should use Intl.LocaleInfo once it is standardized (see
   * Bug 1693576), rather than maintaining a hardcoded list of RTL locales.
   *
   * @param {string} locale
   * @returns {"ltr" | "rtl"}
   */
  getLocaleDirection(locale) {
    if (
      locale == "ar" ||
      locale == "ckb" ||
      locale == "fa" ||
      locale == "he" ||
      locale == "ur"
    ) {
      return "rtl";
    }
    return "ltr";
  },

  /**
   * Determine the transition strategy for switching the locale based on prefs
   * and the switched locales.
   *
   * @param {Array<string>} newLocales - List of BCP 47 locale identifiers.
   * @returns {"locales-match" | "requires-restart" | "live-reload"}
   */
  getLanguageSwitchTransitionType(newLocales) {
    const { appLocalesAsBCP47 } = Services.locale;
    if (appLocalesAsBCP47.join(",") === newLocales.join(",")) {
      // The selected locales match, the order matters.
      return "locales-match";
    }

    if (Services.prefs.getBoolPref("intl.multilingual.liveReload")) {
      if (
        gGeneralPane.getLocaleDirection(newLocales[0]) !==
          gGeneralPane.getLocaleDirection(appLocalesAsBCP47[0]) &&
        !Services.prefs.getBoolPref("intl.multilingual.liveReloadBidirectional")
      ) {
        // Bug 1750852: The directionality of the text changed, which requires a restart
        // until the quality of the switch can be improved.
        return "requires-restart";
      }

      return "live-reload";
    }

    return "requires-restart";
  },

  /* Show or hide the confirm change message bar based on the updated ordering. */
  messengerLanguagesClosed() {
    // When the subdialog is closed, settings are stored on gMessengerLanguagesDialog.
    // The next time the dialog is opened, a new gMessengerLanguagesDialog is created.
    const { selected } = this.gMessengerLanguagesDialog;

    if (!selected) {
      // No locales were selected. Cancel the operation.
      return;
    }

    switch (gGeneralPane.getLanguageSwitchTransitionType(selected)) {
      case "requires-restart":
        gGeneralPane.showConfirmLanguageChangeMessageBar(selected);
        gGeneralPane.updatePrimaryMessengerLanguageUI(selected[0]);
        break;
      case "live-reload":
        Services.locale.requestedLocales = selected;

        gGeneralPane.updatePrimaryMessengerLanguageUI(
          Services.locale.appLocaleAsBCP47
        );
        gGeneralPane.hideConfirmLanguageChangeMessageBar();
        break;
      case "locales-match":
        // They matched, so we can reset the UI.
        gGeneralPane.updatePrimaryMessengerLanguageUI(
          Services.locale.appLocaleAsBCP47
        );
        gGeneralPane.hideConfirmLanguageChangeMessageBar();
        break;
      default:
        throw new Error("Unhandled transition type.");
    }
  },

  /* Show the confirmation message bar to allow a restart into the new locales. */
  async showConfirmLanguageChangeMessageBar(locales) {
    const messageBar = document.getElementById("confirmMessengerLanguage");

    // Get the bundle for the new locale.
    const newBundle = this.getBundleForLocales(locales);

    // Find the messages and labels.
    const messages = await Promise.all(
      [newBundle, document.l10n].map(async bundle =>
        bundle.formatValue("confirm-messenger-language-change-description")
      )
    );
    const buttonLabels = await Promise.all(
      [newBundle, document.l10n].map(async bundle =>
        bundle.formatValue("confirm-messenger-language-change-button")
      )
    );

    // If both the message and label are the same, just include one row.
    if (messages[0] == messages[1] && buttonLabels[0] == buttonLabels[1]) {
      messages.pop();
      buttonLabels.pop();
    }

    const contentContainer = messageBar.querySelector(
      ".message-bar-content-container"
    );
    contentContainer.textContent = "";

    for (let i = 0; i < messages.length; i++) {
      const messageContainer = document.createXULElement("hbox");
      messageContainer.classList.add("message-bar-content");
      messageContainer.setAttribute("flex", "1");
      messageContainer.setAttribute("align", "center");

      const description = document.createXULElement("description");
      description.classList.add("message-bar-description");

      if (i == 0 && gGeneralPane.getLocaleDirection(locales[0]) === "rtl") {
        description.classList.add("rtl-locale");
      }

      description.setAttribute("flex", "1");
      description.textContent = messages[i];
      messageContainer.appendChild(description);

      const button = document.createXULElement("button");
      button.addEventListener("command", gGeneralPane.confirmLanguageChange);
      button.classList.add("message-bar-button");
      button.setAttribute("locales", locales.join(","));
      button.setAttribute("label", buttonLabels[i]);
      messageContainer.appendChild(button);

      contentContainer.appendChild(messageContainer);
    }

    messageBar.hidden = false;
    this.selectedLocalesForRestart = locales;
  },

  hideConfirmLanguageChangeMessageBar() {
    const messageBar = document.getElementById("confirmMessengerLanguage");
    messageBar.hidden = true;
    const contentContainer = messageBar.querySelector(
      ".message-bar-content-container"
    );
    contentContainer.textContent = "";
    this.requestingLocales = null;
  },

  /* Confirm the locale change and restart the Thunderbird in the new locale. */
  confirmLanguageChange(event) {
    const localesString = (event.target.getAttribute("locales") || "").trim();
    if (!localesString || localesString.length == 0) {
      return;
    }
    const locales = localesString.split(",");
    Services.locale.requestedLocales = locales;

    // Restart with the new locale.
    const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
      Ci.nsISupportsPRBool
    );
    Services.obs.notifyObservers(
      cancelQuit,
      "quit-application-requested",
      "restart"
    );
    if (!cancelQuit.data) {
      Services.startup.quit(
        Services.startup.eAttemptQuit | Services.startup.eRestart
      );
    }
  },

  /* Show or hide the confirm change message bar based on the new locale. */
  onPrimaryMessengerLanguageMenuChange(event) {
    const locale = event.target.value;

    if (locale == "search") {
      return;
    } else if (locale == Services.locale.appLocaleAsBCP47) {
      this.hideConfirmLanguageChangeMessageBar();
      return;
    }

    const newLocales = Array.from(
      new Set([locale, ...Services.locale.requestedLocales]).values()
    );

    switch (gGeneralPane.getLanguageSwitchTransitionType(newLocales)) {
      case "requires-restart":
        // Prepare to change the locales, as they were different.
        gGeneralPane.showConfirmLanguageChangeMessageBar(newLocales);
        gGeneralPane.updatePrimaryMessengerLanguageUI(newLocales[0]);
        break;
      case "live-reload":
        Services.locale.requestedLocales = newLocales;
        gGeneralPane.updatePrimaryMessengerLanguageUI(
          Services.locale.appLocaleAsBCP47
        );
        gGeneralPane.hideConfirmLanguageChangeMessageBar();
        break;
      case "locales-match":
        // They matched, so we can reset the UI.
        gGeneralPane.updatePrimaryMessengerLanguageUI(
          Services.locale.appLocaleAsBCP47
        );
        gGeneralPane.hideConfirmLanguageChangeMessageBar();
        break;
      default:
        throw new Error("Unhandled transition type.");
    }
  },

  // appends the tag to the tag list box
  appendTagItem(aTagName, aKey, aColor) {
    const item = this.mTagListBox.appendItem(aTagName, aKey);
    item.style.color = aColor;
    return item;
  },

  buildTagList() {
    const tagArray = MailServices.tags.getAllTags();
    for (let i = 0; i < tagArray.length; ++i) {
      const taginfo = tagArray[i];
      this.appendTagItem(taginfo.tag, taginfo.key, taginfo.color);
    }
  },

  removeTag() {
    var index = this.mTagListBox.selectedIndex;
    if (index >= 0) {
      var itemToRemove = this.mTagListBox.getItemAtIndex(index);
      MailServices.tags.deleteKey(itemToRemove.getAttribute("value"));
    }
  },

  /**
   * Open the edit tag dialog
   */
  editTag() {
    var index = this.mTagListBox.selectedIndex;
    if (index >= 0) {
      var tagElToEdit = this.mTagListBox.getItemAtIndex(index);
      var args = {
        result: "",
        keyToEdit: tagElToEdit.getAttribute("value"),
      };
      gSubDialog.open(
        "chrome://messenger/content/newTagDialog.xhtml",
        { features: "resizable=no" },
        args
      );
    }
  },

  addTag() {
    var args = { result: "", okCallback: addTagCallback };
    gSubDialog.open(
      "chrome://messenger/content/newTagDialog.xhtml",
      { features: "resizable=no" },
      args
    );
  },

  onSelectTag() {
    const btnEdit = document.getElementById("editTagButton");
    const listBox = document.getElementById("tagList");

    if (listBox.selectedCount > 0) {
      btnEdit.disabled = false;
    } else {
      btnEdit.disabled = true;
    }

    document.getElementById("removeTagButton").disabled = btnEdit.disabled;
  },

  /**
   * Enable/disable the options of automatic marking as read depending on the
   * state of the automatic marking feature.
   */
  updateMarkAsReadOptions() {
    const enableRadioGroup = Preferences.get(
      "mailnews.mark_message_read.auto"
    ).value;
    const autoMarkAsPref = Preferences.get("mailnews.mark_message_read.delay");
    const autoMarkDisabled = !enableRadioGroup || autoMarkAsPref.locked;
    document.getElementById("markAsReadAutoPreferences").disabled =
      autoMarkDisabled;
    document.getElementById("secondsLabel").disabled = autoMarkDisabled;
    gGeneralPane.updateMarkAsReadTextbox();
  },

  /**
   * Automatically enable/disable delay textbox depending on state of the
   * Mark As Read On Delay feature.
   */
  updateMarkAsReadTextbox() {
    const radioGroupEnabled = Preferences.get(
      "mailnews.mark_message_read.auto"
    ).value;
    const textBoxEnabled = Preferences.get(
      "mailnews.mark_message_read.delay"
    ).value;
    const intervalPref = Preferences.get(
      "mailnews.mark_message_read.delay.interval"
    );

    const delayTextbox = document.getElementById("markAsReadDelay");
    delayTextbox.disabled =
      !radioGroupEnabled || !textBoxEnabled || intervalPref.locked;
    if (document.activeElement.id == "markAsReadAutoPreferences") {
      delayTextbox.focus();
    }
  },

  /**
   * Display the return receipts configuration dialog.
   */
  showReturnReceipts() {
    gSubDialog.open("chrome://messenger/content/preferences/receipts.xhtml", {
      features: "resizable=no",
    });
  },

  /**
   * Show the about:config page in a tab.
   */
  showConfigEdit() {
    // If the about:config tab is already open, switch to the tab.
    const mainWin = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = mainWin.document.getElementById("tabmail");
    for (const tabInfo of tabmail.tabInfo) {
      const tab = tabmail.getTabForBrowser(tabInfo.browser);
      if (tab?.urlbar?.value == "about:config") {
        tabmail.switchToTab(tabInfo);
        return;
      }
    }
    // Wasn't open already. Open in a new tab.
    tabmail.openTab("contentTab", { url: "about:config" });
  },

  /**
   * Display the the connection settings dialog.
   */
  showConnections() {
    gSubDialog.open("chrome://messenger/content/preferences/connection.xhtml");
  },

  /**
   * Display the the offline settings dialog.
   */
  showOffline() {
    gSubDialog.open("chrome://messenger/content/preferences/offline.xhtml", {
      features: "resizable=no",
    });
  },

  /*
   * browser.cache.disk.capacity
   * - the size of the browser cache in KB
   */

  // Retrieves the amount of space currently used by disk cache
  updateActualCacheSize() {
    const actualSizeLabel = document.getElementById("actualDiskCacheSize");
    const prefStrBundle = document.getElementById("bundlePreferences");

    // Needs to root the observer since cache service keeps only a weak reference.
    this.observer = {
      onNetworkCacheDiskConsumption(consumption) {
        const size = DownloadUtils.convertByteUnits(consumption);
        // The XBL binding for the string bundle may have been destroyed if
        // the page was closed before this callback was executed.
        if (!prefStrBundle.getFormattedString) {
          return;
        }
        actualSizeLabel.value = prefStrBundle.getFormattedString(
          "actualDiskCacheSize",
          size
        );
      },

      QueryInterface: ChromeUtils.generateQI([
        "nsICacheStorageConsumptionObserver",
        "nsISupportsWeakReference",
      ]),
    };

    actualSizeLabel.value = prefStrBundle.getString(
      "actualDiskCacheSizeCalculated"
    );

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
    var disabled = Preferences.get(
      "browser.cache.disk.smart_size.enabled"
    ).value;
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

  updateCompactOptions() {
    const disabled =
      !Preferences.get("mail.prompt_purge_threshhold").value ||
      Preferences.get("mail.purge_threshhold_mb").locked;

    document.getElementById("offlineCompactFolderMin").disabled = disabled;
    document.getElementById("offlineCompactFolderAutomatically").disabled =
      disabled;
  },

  /**
   * Set the default store contract ID.
   */
  updateDefaultStore(storeID) {
    Services.prefs.setCharPref("mail.serverDefaultStoreContractID", storeID);
  },

  /**
   * When the user toggles the layers.acceleration.disabled pref,
   * sync its new value to the gfx.direct2d.disabled pref too.
   * Note that layers.acceleration.disabled is inverted.
   */
  updateHardwareAcceleration() {
    if (AppConstants.platform == "win") {
      const preference = Preferences.get("layers.acceleration.disabled");
      Services.prefs.setBoolPref("gfx.direct2d.disabled", !preference.value);
    }
  },

  /**
   * Selects the correct item in the update radio group
   */
  async updateReadPrefs() {
    if (
      AppConstants.MOZ_UPDATER &&
      (!Services.policies || Services.policies.isAllowed("appUpdate")) &&
      !gIsPackagedApp
    ) {
      const radiogroup = document.getElementById("updateRadioGroup");
      radiogroup.disabled = true;
      try {
        const enabled = await UpdateUtils.getAppUpdateAutoEnabled();
        radiogroup.value = enabled;
        radiogroup.disabled = false;
      } catch (error) {
        console.error(error);
      }
    }
  },

  /**
   * Writes the value of the update radio group to the disk
   */
  async updateWritePrefs() {
    if (
      AppConstants.MOZ_UPDATER &&
      (!Services.policies || Services.policies.isAllowed("appUpdate")) &&
      !gIsPackagedApp
    ) {
      const radiogroup = document.getElementById("updateRadioGroup");
      const updateAutoValue = radiogroup.value == "true";
      radiogroup.disabled = true;
      try {
        await UpdateUtils.setAppUpdateAutoEnabled(updateAutoValue);
        radiogroup.disabled = false;
      } catch (error) {
        console.error(error);
        await this.updateReadPrefs();
        await this.reportUpdatePrefWriteError();
        return;
      }

      // If the value was changed to false the user should be given the option
      // to discard an update if there is one.
      if (!updateAutoValue) {
        await this.checkUpdateInProgress();
      }
    }
  },

  async reportUpdatePrefWriteError() {
    const [title, message] = await document.l10n.formatValues([
      { id: "update-setting-write-failure-title" },
      {
        id: "update-setting-write-failure-message",
        args: { path: UpdateUtils.configFilePath },
      },
    ]);

    // Set up the Ok Button
    const buttonFlags =
      Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_OK;
    Services.prompt.confirmEx(
      window,
      title,
      message,
      buttonFlags,
      null,
      null,
      null,
      null,
      {}
    );
  },

  async checkUpdateInProgress() {
    const um = Cc["@mozilla.org/updates/update-manager;1"].getService(
      Ci.nsIUpdateManager
    );
    if (!um.readyUpdate && !um.downloadingUpdate) {
      return;
    }

    const [title, message, okButton, cancelButton] =
      await document.l10n.formatValues([
        { id: "update-in-progress-title" },
        { id: "update-in-progress-message" },
        { id: "update-in-progress-ok-button" },
        { id: "update-in-progress-cancel-button" },
      ]);

    // Continue is the cancel button which is BUTTON_POS_1 and is set as the
    // default so pressing escape or using a platform standard method of closing
    // the UI will not discard the update.
    const buttonFlags =
      Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_0 +
      Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_1 +
      Ci.nsIPrompt.BUTTON_POS_1_DEFAULT;

    const rv = Services.prompt.confirmEx(
      window,
      title,
      message,
      buttonFlags,
      okButton,
      cancelButton,
      null,
      null,
      {}
    );
    if (rv != 1) {
      const aus = Cc["@mozilla.org/updates/update-service;1"].getService(
        Ci.nsIApplicationUpdateService
      );
      aus.stopDownload();
      um.cleanupReadyUpdate();
      um.cleanupDownloadingUpdate();
    }
  },

  showUpdates() {
    gSubDialog.open("chrome://mozapps/content/update/history.xhtml");
  },

  _loadAppHandlerData() {
    this._loadInternalHandlers();
    this._loadApplicationHandlers();
  },

  _loadInternalHandlers() {
    const internalHandlers = [new PDFHandlerInfoWrapper()];
    for (const internalHandler of internalHandlers) {
      if (internalHandler.enabled) {
        this._handledTypes.set(internalHandler.type, internalHandler);
      }
    }
  },

  /**
   * Load the set of handlers defined by the application datastore.
   */
  _loadApplicationHandlers() {
    for (const wrappedHandlerInfo of gHandlerService.enumerate()) {
      const type = wrappedHandlerInfo.type;

      let handlerInfoWrapper;
      if (this._handledTypes.has(type)) {
        handlerInfoWrapper = this._handledTypes.get(type);
      } else {
        handlerInfoWrapper = new HandlerInfoWrapper(type, wrappedHandlerInfo);
        this._handledTypes.set(type, handlerInfoWrapper);
      }
    }
  },

  // -----------------
  // View Construction

  _rebuildVisibleTypes() {
    // Reset the list of visible types and the visible type description.
    this._visibleTypes.length = 0;
    this._visibleDescriptions.clear();

    for (const handlerInfo of this._handledTypes.values()) {
      // We couldn't find any reason to exclude the type, so include it.
      this._visibleTypes.push(handlerInfo);

      const otherHandlerInfo = this._visibleDescriptions.get(
        handlerInfo.description
      );
      if (!otherHandlerInfo) {
        // This is the first type with this description that we encountered
        // while rebuilding the _visibleTypes array this time. Make sure the
        // flag is reset so we won't add the type to the description.
        handlerInfo.disambiguateDescription = false;
        this._visibleDescriptions.set(handlerInfo.description, handlerInfo);
      } else {
        // There is at least another type with this description. Make sure we
        // add the type to the description on both HandlerInfoWrapper objects.
        handlerInfo.disambiguateDescription = true;
        otherHandlerInfo.disambiguateDescription = true;
      }
    }
  },

  _rebuildView() {
    // Clear the list of entries.
    const tbody = this._handlerTbody;
    while (tbody.hasChildNodes()) {
      // Rows kept alive by the _handlerRows map.
      tbody.removeChild(tbody.lastChild);
    }

    const sort = this._handlerSort;
    for (const header of this._handlerSortHeaders) {
      const icon = header.querySelector("img");
      if (sort.type === header.getAttribute("sort-type")) {
        icon.setAttribute(
          "src",
          "chrome://messenger/skin/icons/new/nav-down-sm.svg"
        );
        if (sort.descending) {
          /* Rotates the src image to point up. */
          icon.setAttribute("descending", "");
          header.setAttribute("aria-sort", "descending");
        } else {
          icon.removeAttribute("descending");
          header.setAttribute("aria-sort", "ascending");
        }
      } else {
        icon.removeAttribute("src");
        header.setAttribute("aria-sort", "none");
      }
    }

    let visibleTypes = this._visibleTypes;

    // If the user is filtering the list, then only show matching types.
    if (this._filter.value) {
      visibleTypes = visibleTypes.filter(this._matchesFilter, this);
    }

    for (const handlerInfo of visibleTypes) {
      let row = this._handlerRows.get(handlerInfo);
      if (row) {
        tbody.appendChild(row.node);
      } else {
        row = new HandlerRow(handlerInfo, this.onDelete.bind(this));
        row.constructNodeAndAppend(tbody, this._handlerMenuId);
        this._handlerMenuId++;
        this._handlerRows.set(handlerInfo, row);
      }
    }
  },

  _matchesFilter(aType) {
    var filterValue = this._filter.value.toLowerCase();
    return (
      aType.typeDescription.toLowerCase().includes(filterValue) ||
      aType.actionDescription.toLowerCase().includes(filterValue)
    );
  },

  /**
   * Get the details for the type represented by the given handler info
   * object.
   *
   * @param aHandlerInfo {nsIHandlerInfo} the type to get the extensions for.
   * @returns {string} the extensions for the type
   */
  _typeDetails(aHandlerInfo) {
    let exts = [];
    if (aHandlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      for (const extName of aHandlerInfo.wrappedHandlerInfo.getFileExtensions()) {
        const ext = "." + extName;
        if (!exts.includes(ext)) {
          exts.push(ext);
        }
      }
    }
    exts.sort();
    exts = exts.join(", ");
    if (this._visibleDescriptions.has(aHandlerInfo.description)) {
      if (exts) {
        return this._prefsBundle.getFormattedString(
          "typeDetailsWithTypeAndExt",
          [aHandlerInfo.type, exts]
        );
      }
      return this._prefsBundle.getFormattedString("typeDetailsWithTypeOrExt", [
        aHandlerInfo.type,
      ]);
    }
    if (exts) {
      return this._prefsBundle.getFormattedString("typeDetailsWithTypeOrExt", [
        exts,
      ]);
    }
    return exts;
  },

  /**
   * Whether or not the given handler app is valid.
   *
   * @param aHandlerApp {nsIHandlerApp} the handler app in question
   * @returns {boolean} whether or not it's valid
   */
  isValidHandlerApp(aHandlerApp) {
    if (!aHandlerApp) {
      return false;
    }

    if (aHandlerApp instanceof Ci.nsILocalHandlerApp) {
      return this._isValidHandlerExecutable(aHandlerApp.executable);
    }

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp) {
      return aHandlerApp.uriTemplate;
    }

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo) {
      return aHandlerApp.uri;
    }

    return false;
  },

  _isValidHandlerExecutable(aExecutable) {
    const isExecutable =
      aExecutable && aExecutable.exists() && aExecutable.isExecutable();
    // XXXben - we need to compare this with the running instance executable
    //          just don't know how to do that via script...
    // XXXmano TBD: can probably add this to nsIShellService
    if (AppConstants.platform == "win") {
      return (
        isExecutable &&
        aExecutable.leafName != AppConstants.MOZ_APP_NAME + ".exe"
      );
    }

    if (AppConstants.platform == "macosx") {
      return (
        isExecutable && aExecutable.leafName != AppConstants.MOZ_MACBUNDLE_NAME
      );
    }

    return (
      isExecutable && aExecutable.leafName != AppConstants.MOZ_APP_NAME + "-bin"
    );
  },

  // -------------------
  // Sorting & Filtering

  /**
   * Sort the list when the user clicks on a column header. If sortType is
   * different than the last sort, the sort direction is toggled. Otherwise, the
   * sort is changed to the new sortType with ascending direction.
   *
   * @param {string} sortType - The sort type associated with the column header.
   */
  sort(sortType) {
    const sort = this._handlerSort;
    if (sort.type === sortType) {
      sort.descending = !sort.descending;
    } else {
      sort.type = sortType;
      sort.descending = false;
    }
    this._sortVisibleTypes();
    this._rebuildView();
  },

  /**
   * Sort the list of visible types by the current sort column/direction.
   */
  _sortVisibleTypes() {
    function sortByType(a, b) {
      return a.typeDescription
        .toLowerCase()
        .localeCompare(b.typeDescription.toLowerCase());
    }

    function sortByAction(a, b) {
      return a.actionDescription
        .toLowerCase()
        .localeCompare(b.actionDescription.toLowerCase());
    }

    const sort = this._handlerSort;
    if (sort.type === "action") {
      this._visibleTypes.sort(sortByAction);
    } else {
      this._visibleTypes.sort(sortByType);
    }
    if (sort.descending) {
      this._visibleTypes.reverse();
    }
  },

  focusFilterBox() {
    this._filter.focus();
    this._filter.select();
  },

  onDelete(handlerRow) {
    const handlerInfo = handlerRow.handlerInfoWrapper;
    const index = this._visibleTypes.indexOf(handlerInfo);
    if (index != -1) {
      this._visibleTypes.splice(index, 1);
    }

    const tbody = this._handlerTbody;
    if (handlerRow.node.parentNode === tbody) {
      tbody.removeChild(handlerRow.node);
    }

    this._handledTypes.delete(handlerInfo.type);
    this._handlerRows.delete(handlerInfo);

    handlerInfo.remove();
  },

  _getIconURLForHandlerApp(aHandlerApp) {
    if (aHandlerApp instanceof Ci.nsILocalHandlerApp) {
      return this._getIconURLForFile(aHandlerApp.executable);
    }

    if (aHandlerApp instanceof Ci.nsIWebHandlerApp) {
      return this._getIconURLForWebApp(aHandlerApp.uriTemplate);
    }

    if (aHandlerApp instanceof Ci.nsIWebContentHandlerInfo) {
      return this._getIconURLForWebApp(aHandlerApp.uri);
    }

    // We know nothing about other kinds of handler apps.
    return "";
  },

  _getIconURLForFile(aFile) {
    const urlSpec = Services.io
      .getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler)
      .getURLSpecFromActualFile(aFile);

    return "moz-icon://" + urlSpec + "?size=16";
  },

  _getIconURLForWebApp(aWebAppURITemplate) {
    var uri = Services.io.newURI(aWebAppURITemplate);

    // Unfortunately we can't use the favicon service to get the favicon,
    // because the service looks in the annotations table for a record with
    // the exact URL we give it, and users won't have such records for URLs
    // they don't visit, and users won't visit the web app's URL template,
    // they'll only visit URLs derived from that template (i.e. with %s
    // in the template replaced by the URL of the content being handled).

    if (/^https?/.test(uri.scheme)) {
      return uri.prePath + "/favicon.ico";
    }

    return /^https?/.test(uri.scheme) ? uri.resolve("/favicon.ico") : "";
  },

  destroy() {
    window.removeEventListener("unload", this);

    Services.obs.removeObserver(this, AUTO_UPDATE_CHANGED_TOPIC);
    Services.prefs.removeObserver("mailnews.tags.", this);
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

  // nsIObserver

  async observe(subject, topic, data) {
    if (topic == AUTO_UPDATE_CHANGED_TOPIC) {
      if (data != "true" && data != "false") {
        throw new Error(`Invalid value for app.update.auto ${data}`);
      }
      document.getElementById("updateRadioGroup").value = data;
    } else if (topic == "nsPref:changed" && data.startsWith("mailnews.tags.")) {
      const selIndex = this.mTagListBox.selectedIndex;
      this.mTagListBox.replaceChildren();
      this.buildTagList();
      const numItemsInListBox = this.mTagListBox.getRowCount();
      this.mTagListBox.selectedIndex =
        selIndex < numItemsInListBox ? selIndex : numItemsInListBox - 1;
      if (data.endsWith(".color") && Services.prefs.prefHasUserValue(data)) {
        const key = data
          .replace(/^mailnews\.tags\./, "")
          .replace(/\.color$/, "");
        const color = Services.prefs.getCharPref(`mailnews.tags.${key}.color`);
        // Add to style sheet. We simply add the new color, the rule is added
        // at the end and will overrule the previous rule.
        TagUtils.addTagToAllDocumentSheets(key, color);
      }
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

function getDisplayNameForFile(aFile) {
  if (AppConstants.platform == "win") {
    if (aFile instanceof Ci.nsILocalFileWin) {
      try {
        return aFile.getVersionInfoField("FileDescription");
      } catch (ex) {
        // fall through to the file name
      }
    }
  } else if (AppConstants.platform == "macosx") {
    if (aFile instanceof Ci.nsILocalFileMac) {
      try {
        return aFile.bundleDisplayName;
      } catch (ex) {
        // fall through to the file name
      }
    }
  }

  return aFile.leafName;
}

function getLocalHandlerApp(aFile) {
  var localHandlerApp = Cc[
    "@mozilla.org/uriloader/local-handler-app;1"
  ].createInstance(Ci.nsILocalHandlerApp);
  localHandlerApp.name = getDisplayNameForFile(aFile);
  localHandlerApp.executable = aFile;

  return localHandlerApp;
}

// eslint-disable-next-line no-undef
const gHandlerRowFragment = MozXULElement.parseXULToFragment(`
  <html:tr>
    <html:td class="typeCell">
      <html:div class="typeLabel">
        <html:img class="typeIcon" alt=""/>
        <label class="typeDescription" crop="end"/>
      </html:div>
    </html:td>
    <html:td class="actionCell">
      <menulist class="actionsMenu" crop="end" selectedIndex="1">
        <menupopup/>
      </menulist>
    </html:td>
  </html:tr>
`);

/**
 * This is associated to rows in the handlers table.
 */
class HandlerRow {
  constructor(handlerInfoWrapper, onDeleteCallback) {
    this.handlerInfoWrapper = handlerInfoWrapper;
    this.previousSelectedItem = null;
    this.deleteCallback = onDeleteCallback;
  }

  constructNodeAndAppend(tbody, id) {
    tbody.appendChild(document.importNode(gHandlerRowFragment, true));
    this.node = tbody.lastChild;

    this.menu = this.node.querySelector(".actionsMenu");
    id = `action-menu-${id}`;
    this.menu.setAttribute("id", id);
    this.menu.addEventListener("command", event =>
      this.onSelectAction(event.originalTarget)
    );

    const typeDescription = this.node.querySelector(".typeDescription");
    typeDescription.setAttribute(
      "value",
      this.handlerInfoWrapper.typeDescription
    );
    // NOTE: Control only works for a XUL <label>. Using a HTML <label> and the
    // corresponding "for" attribute would not currently work with the XUL
    // <menulist> because a XUL <menulist> is technically not a labelable
    // element, as required for the html:label "for" attribute.
    typeDescription.setAttribute("control", id);
    // Spoof the HTML label "for" attribute focus behaviour on the whole cell.
    this.node
      .querySelector(".typeCell")
      .addEventListener("click", () => this.menu.focus());

    this.node
      .querySelector(".typeIcon")
      .setAttribute("src", this.handlerInfoWrapper.smallIcon);

    this.rebuildActionsMenu();
  }

  rebuildActionsMenu() {
    const menu = this.menu;
    const menuPopup = menu.menupopup;
    const handlerInfo = this.handlerInfoWrapper;

    // Clear out existing items.
    while (menuPopup.hasChildNodes()) {
      menuPopup.removeChild(menuPopup.lastChild);
    }

    let internalMenuItem;
    // Add the "Preview in Thunderbird" option for optional internal handlers.
    if (handlerInfo instanceof InternalHandlerInfoWrapper) {
      internalMenuItem = document.createXULElement("menuitem");
      internalMenuItem.setAttribute(
        "action",
        Ci.nsIHandlerInfo.handleInternally
      );
      const label = gGeneralPane._prefsBundle.getFormattedString(
        "previewInApp",
        [gGeneralPane._brandShortName]
      );
      internalMenuItem.setAttribute("label", label);
      internalMenuItem.setAttribute("tooltiptext", label);
      internalMenuItem.setAttribute(
        "image",
        "chrome://messenger/skin/preferences/alwaysAsk.png"
      );
      menuPopup.appendChild(internalMenuItem);
    }

    const askMenuItem = document.createXULElement("menuitem");
    askMenuItem.setAttribute("alwaysAsk", "true");
    {
      const label = gGeneralPane._prefsBundle.getString("alwaysAsk");
      askMenuItem.setAttribute("label", label);
      askMenuItem.setAttribute("tooltiptext", label);
      askMenuItem.setAttribute(
        "image",
        "chrome://messenger/skin/preferences/alwaysAsk.png"
      );
      menuPopup.appendChild(askMenuItem);
    }

    // Create a menu item for saving to disk.
    // Note: this option isn't available to protocol types, since we don't know
    // what it means to save a URL having a certain scheme to disk.
    let saveMenuItem;
    if (handlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      saveMenuItem = document.createXULElement("menuitem");
      saveMenuItem.setAttribute("action", Ci.nsIHandlerInfo.saveToDisk);
      const label = gGeneralPane._prefsBundle.getString("saveFile");
      saveMenuItem.setAttribute("label", label);
      saveMenuItem.setAttribute("tooltiptext", label);
      saveMenuItem.setAttribute(
        "image",
        "chrome://messenger/skin/preferences/saveFile.png"
      );
      menuPopup.appendChild(saveMenuItem);
    }

    // Add a separator to distinguish these items from the helper app items
    // that follow them.
    let menuItem = document.createXULElement("menuseparator");
    menuPopup.appendChild(menuItem);

    // Create a menu item for the OS default application, if any.
    let defaultMenuItem;
    if (handlerInfo.hasDefaultHandler) {
      defaultMenuItem = document.createXULElement("menuitem");
      defaultMenuItem.setAttribute(
        "action",
        Ci.nsIHandlerInfo.useSystemDefault
      );
      const label = gGeneralPane._prefsBundle.getFormattedString("useDefault", [
        handlerInfo.defaultDescription,
      ]);
      defaultMenuItem.setAttribute("label", label);
      defaultMenuItem.setAttribute(
        "tooltiptext",
        handlerInfo.defaultDescription
      );
      defaultMenuItem.setAttribute(
        "image",
        handlerInfo.iconURLForSystemDefault
      );

      menuPopup.appendChild(defaultMenuItem);
    }

    // Create menu items for possible handlers.
    const preferredApp = handlerInfo.preferredApplicationHandler;
    const possibleAppMenuItems = [];
    for (const possibleApp of handlerInfo.possibleApplicationHandlers.enumerate()) {
      if (!gGeneralPane.isValidHandlerApp(possibleApp)) {
        continue;
      }

      const menuItem = document.createXULElement("menuitem");
      menuItem.setAttribute("action", Ci.nsIHandlerInfo.useHelperApp);
      let label;
      if (possibleApp instanceof Ci.nsILocalHandlerApp) {
        label = getDisplayNameForFile(possibleApp.executable);
      } else {
        label = possibleApp.name;
      }
      label = gGeneralPane._prefsBundle.getFormattedString("useApp", [label]);
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      menuItem.setAttribute(
        "image",
        gGeneralPane._getIconURLForHandlerApp(possibleApp)
      );

      // Attach the handler app object to the menu item so we can use it
      // to make changes to the datastore when the user selects the item.
      menuItem.handlerApp = possibleApp;

      menuPopup.appendChild(menuItem);
      possibleAppMenuItems.push(menuItem);
    }

    // Create a menu item for selecting a local application.
    let createItem = true;
    if (AppConstants.platform == "win") {
      // On Windows, selecting an application to open another application
      // would be meaningless so we special case executables.
      const executableType = Cc["@mozilla.org/mime;1"]
        .getService(Ci.nsIMIMEService)
        .getTypeFromExtension("exe");
      if (handlerInfo.type == executableType) {
        createItem = false;
      }
    }

    if (createItem) {
      const menuItem = document.createXULElement("menuitem");
      menuItem.addEventListener("command", this.chooseApp.bind(this));
      const label = gGeneralPane._prefsBundle.getString("useOtherApp");
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      menuPopup.appendChild(menuItem);
    }

    // Create a menu item for managing applications.
    if (possibleAppMenuItems.length) {
      let menuItem = document.createXULElement("menuseparator");
      menuPopup.appendChild(menuItem);
      menuItem = document.createXULElement("menuitem");
      menuItem.addEventListener("command", this.manageApp.bind(this));
      menuItem.setAttribute(
        "label",
        gGeneralPane._prefsBundle.getString("manageApp")
      );
      menuPopup.appendChild(menuItem);
    }

    menuItem = document.createXULElement("menuseparator");
    menuPopup.appendChild(menuItem);
    menuItem = document.createXULElement("menuitem");
    menuItem.addEventListener("command", this.confirmDelete.bind(this));
    menuItem.setAttribute(
      "label",
      gGeneralPane._prefsBundle.getString("delete")
    );
    menuPopup.appendChild(menuItem);

    // Select the item corresponding to the preferred action.  If the always
    // ask flag is set, it overrides the preferred action.  Otherwise we pick
    // the item identified by the preferred action (when the preferred action
    // is to use a helper app, we have to pick the specific helper app item).
    if (handlerInfo.alwaysAskBeforeHandling) {
      menu.selectedItem = askMenuItem;
    } else {
      switch (handlerInfo.preferredAction) {
        case Ci.nsIHandlerInfo.handleInternally:
          if (internalMenuItem) {
            menu.selectedItem = internalMenuItem;
          } else {
            console.error("No menu item defined to set!");
          }
          break;
        case Ci.nsIHandlerInfo.useSystemDefault:
          menu.selectedItem = defaultMenuItem;
          break;
        case Ci.nsIHandlerInfo.useHelperApp:
          if (preferredApp) {
            menu.selectedItem = possibleAppMenuItems.filter(v =>
              v.handlerApp.equals(preferredApp)
            )[0];
          }
          break;
        case Ci.nsIHandlerInfo.saveToDisk:
          menu.selectedItem = saveMenuItem;
          break;
      }
    }
    // menu.selectedItem may be null if the preferredAction is
    // useSystemDefault, but handlerInfo.hasDefaultHandler returns false.
    // For now, we'll just use the askMenuItem to avoid ugly exceptions.
    this.previousSelectedItem = this.menu.selectedItem || askMenuItem;
  }

  manageApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerInfo = this.handlerInfoWrapper;

    const onComplete = () => {
      // Rebuild the actions menu so that we revert to the previous selection,
      // or "Always ask" if the previous default application has been removed.
      this.rebuildActionsMenu();
    };

    gSubDialog.open(
      "chrome://messenger/content/preferences/applicationManager.xhtml",
      { features: "resizable=no", closingCallback: onComplete },
      handlerInfo
    );
  }

  chooseApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerApp;
    const onSelectionDone = function () {
      // Rebuild the actions menu whether the user picked an app or canceled.
      // If they picked an app, we want to add the app to the menu and select it.
      // If they canceled, we want to go back to their previous selection.
      this.rebuildActionsMenu();

      // If the user picked a new app from the menu, select it.
      if (handlerApp) {
        const menuItems = this.menu.menupopup.children;
        for (let i = 0; i < menuItems.length; i++) {
          const menuItem = menuItems[i];
          if (menuItem.handlerApp && menuItem.handlerApp.equals(handlerApp)) {
            this.menu.selectedIndex = i;
            this.onSelectAction(menuItem);
            break;
          }
        }
      }
    }.bind(this);

    if (AppConstants.platform == "win") {
      const params = {};
      const handlerInfo = this.handlerInfoWrapper;

      params.mimeInfo = handlerInfo.wrappedHandlerInfo;

      params.title = gGeneralPane._prefsBundle.getString("fpTitleChooseApp");
      params.description = handlerInfo.description;
      params.filename = null;
      params.handlerApp = null;

      const onAppSelected = () => {
        if (gGeneralPane.isValidHandlerApp(params.handlerApp)) {
          handlerApp = params.handlerApp;

          // Add the app to the type's list of possible handlers.
          handlerInfo.addPossibleApplicationHandler(handlerApp);
        }
        onSelectionDone();
      };

      gSubDialog.open(
        "chrome://global/content/appPicker.xhtml",
        { features: "resizable=no", closingCallback: onAppSelected },
        params
      );
    } else {
      const fp = Cc["@mozilla.org/filepicker;1"].createInstance(
        Ci.nsIFilePicker
      );
      const winTitle = gGeneralPane._prefsBundle.getString("fpTitleChooseApp");
      fp.init(window, winTitle, Ci.nsIFilePicker.modeOpen);
      fp.appendFilters(Ci.nsIFilePicker.filterApps);

      // Prompt the user to pick an app.  If they pick one, and it's a valid
      // selection, then add it to the list of possible handlers.

      fp.open(rv => {
        if (
          rv == Ci.nsIFilePicker.returnOK &&
          fp.file &&
          gGeneralPane._isValidHandlerExecutable(fp.file)
        ) {
          handlerApp = Cc[
            "@mozilla.org/uriloader/local-handler-app;1"
          ].createInstance(Ci.nsILocalHandlerApp);
          handlerApp.name = getDisplayNameForFile(fp.file);
          handlerApp.executable = fp.file;

          // Add the app to the type's list of possible handlers.
          const handlerInfo = this.handlerInfoWrapper;
          handlerInfo.addPossibleApplicationHandler(handlerApp);
        }
        onSelectionDone();
      });
    }
  }

  confirmDelete(aEvent) {
    aEvent.stopPropagation();
    if (
      Services.prompt.confirm(
        null,
        gGeneralPane._prefsBundle.getString("confirmDeleteTitle"),
        gGeneralPane._prefsBundle.getString("confirmDeleteText")
      )
    ) {
      // Deletes self.
      this.deleteCallback(this);
    } else {
      // They hit cancel, so return them to the previously selected item.
      this.menu.selectedItem = this.previousSelectedItem;
    }
  }

  onSelectAction(aActionItem) {
    this.previousSelectedItem = aActionItem;
    this._storeAction(aActionItem);
  }

  _storeAction(aActionItem) {
    var handlerInfo = this.handlerInfoWrapper;

    if (aActionItem.hasAttribute("alwaysAsk")) {
      handlerInfo.alwaysAskBeforeHandling = true;
    } else if (aActionItem.hasAttribute("action")) {
      const action = parseInt(aActionItem.getAttribute("action"));

      // Set the preferred application handler.
      // We leave the existing preferred app in the list when we set
      // the preferred action to something other than useHelperApp so that
      // legacy datastores that don't have the preferred app in the list
      // of possible apps still include the preferred app in the list of apps
      // the user can choose to handle the type.
      if (action == Ci.nsIHandlerInfo.useHelperApp) {
        handlerInfo.preferredApplicationHandler = aActionItem.handlerApp;
      }

      // Set the "always ask" flag.
      handlerInfo.alwaysAskBeforeHandling = false;

      // Set the preferred action.
      handlerInfo.preferredAction = action;
    }

    handlerInfo.store();
  }
}

/**
 * This object wraps nsIHandlerInfo with some additional functionality
 * the Applications prefpane needs to display and allow modification of
 * the list of handled types.
 *
 * We create an instance of this wrapper for each entry we might display
 * in the prefpane, and we compose the instances from various sources,
 * including the handler service.
 *
 * We don't implement all the original nsIHandlerInfo functionality,
 * just the stuff that the prefpane needs.
 */
class HandlerInfoWrapper {
  constructor(type, handlerInfo) {
    this.type = type;
    this.wrappedHandlerInfo = handlerInfo;
    this.disambiguateDescription = false;
  }

  get description() {
    if (this.wrappedHandlerInfo.description) {
      return this.wrappedHandlerInfo.description;
    }

    if (this.primaryExtension) {
      var extension = this.primaryExtension.toUpperCase();
      return document
        .getElementById("bundlePreferences")
        .getFormattedString("fileEnding", [extension]);
    }
    return this.type;
  }

  /**
   * Describe, in a human-readable fashion, the type represented by the given
   * handler info object.  Normally this is just the description, but if more
   * than one object presents the same description, "disambiguateDescription"
   * is set and we annotate the duplicate descriptions with the type itself
   * to help users distinguish between those types.
   */
  get typeDescription() {
    if (this.disambiguateDescription) {
      return gGeneralPane._prefsBundle.getFormattedString(
        "typeDetailsWithTypeAndExt",
        [this.description, this.type]
      );
    }

    return this.description;
  }

  /**
   * Describe, in a human-readable fashion, the preferred action to take on
   * the type represented by the given handler info object.
   */
  get actionDescription() {
    // alwaysAskBeforeHandling overrides the preferred action, so if that flag
    // is set, then describe that behavior instead.  For most types, this is
    // the "alwaysAsk" string, but for the feed type we show something special.
    if (this.alwaysAskBeforeHandling) {
      return gGeneralPane._prefsBundle.getString("alwaysAsk");
    }

    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return gGeneralPane._prefsBundle.getString("saveFile");

      case Ci.nsIHandlerInfo.useHelperApp:
        var preferredApp = this.preferredApplicationHandler;
        var name;
        if (preferredApp instanceof Ci.nsILocalHandlerApp) {
          name = getDisplayNameForFile(preferredApp.executable);
        } else {
          name = preferredApp.name;
        }
        return gGeneralPane._prefsBundle.getFormattedString("useApp", [name]);

      case Ci.nsIHandlerInfo.handleInternally:
        if (this instanceof InternalHandlerInfoWrapper) {
          return gGeneralPane._prefsBundle.getFormattedString("previewInApp", [
            gGeneralPane._brandShortName,
          ]);
        }

        // For other types, handleInternally looks like either useHelperApp
        // or useSystemDefault depending on whether or not there's a preferred
        // handler app.
        if (gGeneralPane.isValidHandlerApp(this.preferredApplicationHandler)) {
          return this.preferredApplicationHandler.name;
        }

        return this.defaultDescription;

      // XXX Why don't we say the app will handle the type internally?
      // Is it because the app can't actually do that?  But if that's true,
      // then why would a preferredAction ever get set to this value
      // in the first place?

      case Ci.nsIHandlerInfo.useSystemDefault:
        return gGeneralPane._prefsBundle.getFormattedString("useDefault", [
          this.defaultDescription,
        ]);

      default:
        throw new Error(`Unexpected preferredAction: ${this.preferredAction}`);
    }
  }

  get actionIconClass() {
    if (this.alwaysAskBeforeHandling) {
      return "ask";
    }

    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.saveToDisk:
        return "save";

      case Ci.nsIHandlerInfo.handleInternally:
        if (this instanceof InternalHandlerInfoWrapper) {
          return "ask";
        }
    }

    return "";
  }

  get actionIcon() {
    switch (this.preferredAction) {
      case Ci.nsIHandlerInfo.useSystemDefault:
        return this.iconURLForSystemDefault;

      case Ci.nsIHandlerInfo.useHelperApp:
        const preferredApp = this.preferredApplicationHandler;
        if (gGeneralPane.isValidHandlerApp(preferredApp)) {
          return gGeneralPane._getIconURLForHandlerApp(preferredApp);
        }
      // This should never happen, but if preferredAction is set to some weird
      // value, then fall back to the generic application icon.

      // Explicit fall-through
      default:
        return ICON_URL_APP;
    }
  }

  get iconURLForSystemDefault() {
    // Handler info objects for MIME types on some OSes implement a property bag
    // interface from which we can get an icon for the default app, so if we're
    // dealing with a MIME type on one of those OSes, then try to get the icon.
    if (
      this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
      this.wrappedHandlerInfo instanceof Ci.nsIPropertyBag
    ) {
      try {
        const url = this.wrappedHandlerInfo.getProperty(
          "defaultApplicationIconURL"
        );
        if (url) {
          return url + "?size=16";
        }
      } catch (ex) {}
    }

    // If this isn't a MIME type object on an OS that supports retrieving
    // the icon, or if we couldn't retrieve the icon for some other reason,
    // then use a generic icon.
    return ICON_URL_APP;
  }

  get preferredApplicationHandler() {
    return this.wrappedHandlerInfo.preferredApplicationHandler;
  }

  set preferredApplicationHandler(aNewValue) {
    this.wrappedHandlerInfo.preferredApplicationHandler = aNewValue;

    // Make sure the preferred handler is in the set of possible handlers.
    if (aNewValue) {
      this.addPossibleApplicationHandler(aNewValue);
    }
  }

  get possibleApplicationHandlers() {
    return this.wrappedHandlerInfo.possibleApplicationHandlers;
  }

  addPossibleApplicationHandler(aNewHandler) {
    for (const possibleApp of this.possibleApplicationHandlers.enumerate()) {
      if (possibleApp.equals(aNewHandler)) {
        return;
      }
    }
    this.possibleApplicationHandlers.appendElement(aNewHandler);
  }

  removePossibleApplicationHandler(aHandler) {
    var defaultApp = this.preferredApplicationHandler;
    if (defaultApp && aHandler.equals(defaultApp)) {
      // If the app we remove was the default app, we must make sure
      // it won't be used anymore
      this.alwaysAskBeforeHandling = true;
      this.preferredApplicationHandler = null;
    }

    var handlers = this.possibleApplicationHandlers;
    for (var i = 0; i < handlers.length; ++i) {
      var handler = handlers.queryElementAt(i, Ci.nsIHandlerApp);
      if (handler.equals(aHandler)) {
        handlers.removeElementAt(i);
        break;
      }
    }
  }

  get hasDefaultHandler() {
    return this.wrappedHandlerInfo.hasDefaultHandler;
  }

  get defaultDescription() {
    return this.wrappedHandlerInfo.defaultDescription;
  }

  // What to do with content of this type.
  get preferredAction() {
    // If the action is to use a helper app, but we don't have a preferred
    // handler app, then switch to using the system default, if any; otherwise
    // fall back to saving to disk, which is the default action in nsMIMEInfo.
    // Note: "save to disk" is an invalid value for protocol info objects,
    // but the alwaysAskBeforeHandling getter will detect that situation
    // and always return true in that case to override this invalid value.
    if (
      this.wrappedHandlerInfo.preferredAction ==
        Ci.nsIHandlerInfo.useHelperApp &&
      !gGeneralPane.isValidHandlerApp(this.preferredApplicationHandler)
    ) {
      if (this.wrappedHandlerInfo.hasDefaultHandler) {
        return Ci.nsIHandlerInfo.useSystemDefault;
      }
      return Ci.nsIHandlerInfo.saveToDisk;
    }

    return this.wrappedHandlerInfo.preferredAction;
  }

  set preferredAction(aNewValue) {
    this.wrappedHandlerInfo.preferredAction = aNewValue;
  }

  get alwaysAskBeforeHandling() {
    // If this is a protocol type and the preferred action is "save to disk",
    // which is invalid for such types, then return true here to override that
    // action.  This could happen when the preferred action is to use a helper
    // app, but the preferredApplicationHandler is invalid, and there isn't
    // a default handler, so the preferredAction getter returns save to disk
    // instead.
    if (
      !(this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) &&
      this.preferredAction == Ci.nsIHandlerInfo.saveToDisk
    ) {
      return true;
    }

    return this.wrappedHandlerInfo.alwaysAskBeforeHandling;
  }

  set alwaysAskBeforeHandling(aNewValue) {
    this.wrappedHandlerInfo.alwaysAskBeforeHandling = aNewValue;
  }

  // The primary file extension associated with this type, if any.
  get primaryExtension() {
    try {
      if (
        this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo &&
        this.wrappedHandlerInfo.primaryExtension
      ) {
        return this.wrappedHandlerInfo.primaryExtension;
      }
    } catch (ex) {}

    return null;
  }

  // -------
  // Storage

  store() {
    gHandlerService.store(this.wrappedHandlerInfo);
  }

  remove() {
    gHandlerService.remove(this.wrappedHandlerInfo);
  }

  // -----
  // Icons

  get smallIcon() {
    return this._getIcon(16);
  }

  get largeIcon() {
    return this._getIcon(32);
  }

  _getIcon(aSize) {
    if (this.primaryExtension) {
      return "moz-icon://goat." + this.primaryExtension + "?size=" + aSize;
    }

    if (this.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      return "moz-icon://goat?size=" + aSize + "&contentType=" + this.type;
    }

    // FIXME: consider returning some generic icon when we can't get a URL for
    // one (for example in the case of protocol schemes).  Filed as bug 395141.
    return null;
  }
}

/**
 * InternalHandlerInfoWrapper provides a basic mechanism to create an internal
 * mime type handler that can be enabled/disabled in the applications preference
 * menu.
 */
class InternalHandlerInfoWrapper extends HandlerInfoWrapper {
  constructor(mimeType) {
    super(mimeType, gMIMEService.getFromTypeAndExtension(mimeType, null));
  }

  // Override store so we so we can notify any code listening for registration
  // or unregistration of this handler.
  store() {
    super.store();
  }

  get enabled() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  }

  get description() {
    return gGeneralPane._prefsBundle.getString(this._appPrefLabel);
  }
}

class PDFHandlerInfoWrapper extends InternalHandlerInfoWrapper {
  constructor() {
    super(TYPE_PDF);
  }

  get _appPrefLabel() {
    return "applications-type-pdf";
  }

  get enabled() {
    return !Services.prefs.getBoolPref(PREF_PDFJS_DISABLED);
  }
}

function addTagCallback(aName, aColor) {
  MailServices.tags.addTag(aName, aColor, "");

  // Add to style sheet.
  const key = MailServices.tags.getKeyForTag(aName);
  const tagListBox = document.getElementById("tagList");
  const item = tagListBox.querySelector(`richlistitem[value=${key}]`);
  tagListBox.ensureElementIsVisible(item);
  tagListBox.selectItem(item);
  tagListBox.focus();
  return true;
}

Preferences.get("mailnews.start_page.enabled").on(
  "change",
  gGeneralPane.updateStartPage
);
Preferences.get("font.language.group").on("change", gGeneralPane._rebuildFonts);
Preferences.get("mailnews.mark_message_read.auto").on(
  "change",
  gGeneralPane.updateMarkAsReadOptions
);
Preferences.get("mailnews.mark_message_read.delay").on(
  "change",
  gGeneralPane.updateMarkAsReadTextbox
);
Preferences.get("mail.prompt_purge_threshhold").on(
  "change",
  gGeneralPane.updateCompactOptions
);
Preferences.get("layers.acceleration.disabled").on(
  "change",
  gGeneralPane.updateHardwareAcceleration
);
if (AppConstants.platform != "macosx") {
  Preferences.get("mail.biff.show_alert").on(
    "change",
    gGeneralPane.updateShowAlert
  );
}
