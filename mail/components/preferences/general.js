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

// For CSS. Can be one of "ask", "save", or "feed". If absent, the icon URL
// was set by us to a custom handler icon and CSS should not try to override it.
var APP_ICON_ATTR_NAME = "appHandlerIcon";
var gNodeToObjectMap = new WeakMap();

var { DownloadUtils } = ChromeUtils.import(
  "resource://gre/modules/DownloadUtils.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { L10nRegistry } = ChromeUtils.import(
  "resource://gre/modules/L10nRegistry.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { UpdateUtils } = ChromeUtils.import(
  "resource://gre/modules/UpdateUtils.jsm"
);
var { TagUtils } = ChromeUtils.import("resource:///modules/TagUtils.jsm");

XPCOMUtils.defineLazyServiceGetters(this, {
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    "nsIHandlerService",
  ],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

const TYPE_PDF = "application/pdf";

const PREF_PDFJS_DISABLED = "pdfjs.disabled";

const AUTO_UPDATE_CHANGED_TOPIC = "auto-update-config-change";

Preferences.addAll([
  { id: "mail.pane_config.dynamic", type: "int" },
  { id: "mailnews.reuse_message_window", type: "bool" },
  { id: "mailnews.start_page.enabled", type: "bool" },
  { id: "mailnews.start_page.url", type: "string" },
  { id: "mail.biff.show_tray_icon", type: "bool" },
  { id: "mail.biff.play_sound", type: "bool" },
  { id: "mail.biff.play_sound.type", type: "int" },
  { id: "mail.biff.play_sound.url", type: "string" },
  { id: "general.autoScroll", type: "bool" },
  { id: "general.smoothScroll", type: "bool" },
  { id: "mail.fixed_width_messages", type: "bool" },
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
  { id: "mail.purge_threshhold_mb", type: "int" },
  { id: "browser.cache.disk.capacity", type: "int" },
  { id: "browser.cache.disk.smart_size.enabled", inverted: true, type: "bool" },
  { id: "layers.acceleration.disabled", type: "bool", inverted: true },
  { id: "searchintegration.enable", type: "bool" },
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
  // The set of types the app knows how to handle.  A hash of HandlerInfoWrapper
  // objects, indexed by type.
  _handledTypes: {},

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
  _list: null,
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
    this._list = document.getElementById("handlersView");
    this._filter = document.getElementById("filter");

    this.updateStartPage();
    this.updatePlaySound(
      !Preferences.get("mail.biff.play_sound").value,
      Preferences.get("mail.biff.play_sound.url").value,
      Preferences.get("mail.biff.play_sound.type").value
    );
    if (AppConstants.platform != "macosx") {
      this.updateCustomizeAlert();
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
      if (document.getElementById("checkDefaultButton")) {
        document.getElementById("checkDefaultButton").disabled = true;
      }
      this.mShellServiceWorking = false;
    }
    this._rebuildFonts();

    var menulist = document.getElementById("defaultFont");
    if (menulist.selectedIndex == -1) {
      // Prepend menuitem with empty name and value.
      let item = document.createXULElement("menuitem");
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
      this.initMessengerLocale();
    }

    this.mTagListBox = document.getElementById("tagList");
    this.buildTagList();
    this.updateMarkAsReadOptions();

    document.getElementById("citationmenu").value = Preferences.get(
      "mail.citation_color"
    ).value;

    // Figure out how we should be sorting the list.  We persist sort settings
    // across sessions, so we can't assume the default sort column/direction.
    // XXX should we be using the XUL sort service instead?
    this._sortColumn = document.getElementById("typeColumn");
    if (document.getElementById("actionColumn").hasAttribute("sortDirection")) {
      this._sortColumn = document.getElementById("actionColumn");
      // The typeColumn element always has a sortDirection attribute,
      // either because it was persisted or because the default value
      // from the xul file was used.  If we are sorting on the other
      // column, we should remove it.
      document.getElementById("typeColumn").removeAttribute("sortDirection");
    }

    // By doing this in a timeout, we let the preferences dialog resize itself
    // to an appropriate size before we add a bunch of items to the list.
    // Otherwise, if there are many items, and the Applications prefpane
    // is the one that gets displayed when the user first opens the dialog,
    // the dialog might stretch too much in an attempt to fit them all in.
    // XXX Shouldn't we perhaps just set a max-height on the richlistbox?
    var _delayedPaneLoad = function(self) {
      self._initListEventHandlers();
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
    let storeTypeElement = document.getElementById("storeTypeMenulist");
    // set the menuitem to match the account
    let defaultStoreID = Services.prefs.getCharPref(
      "mail.serverDefaultStoreContractID"
    );
    let targetItem = storeTypeElement.getElementsByAttribute(
      "value",
      defaultStoreID
    );
    storeTypeElement.selectedItem = targetItem[0];
    setTimeout(_delayedPaneLoad, 0, this);

    if (AppConstants.MOZ_UPDATER) {
      this.updateReadPrefs();
      gAppUpdater = new appUpdater(); // eslint-disable-line no-global-assign
      let updateDisabled =
        Services.policies && !Services.policies.isAllowed("appUpdate");
      if (updateDisabled || UpdateUtils.appUpdateAutoSettingIsLocked()) {
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

      let distroId = Services.prefs.getCharPref("distribution.id", "");
      if (distroId) {
        let distroVersion = Services.prefs.getCharPref("distribution.version");

        let distroIdField = document.getElementById("distributionId");
        distroIdField.value = distroId + " - " + distroVersion;
        distroIdField.style.display = "block";

        let distroAbout = Services.prefs.getStringPref(
          "distribution.about",
          ""
        );
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
        let updateContainer = document.getElementById(
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
          let wrk = Cc["@mozilla.org/windows-registry-key;1"].createInstance(
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
        let buildID = Services.appinfo.appBuildID;
        let year = buildID.slice(0, 4);
        let month = buildID.slice(4, 6);
        let day = buildID.slice(6, 8);
        version += ` (${year}-${month}-${day})`;
      }

      // Append "(32-bit)" or "(64-bit)" build architecture to the version number:
      let bundle = Services.strings.createBundle(
        "chrome://messenger/locale/messenger.properties"
      );
      let archResource = Services.appinfo.is64Bit
        ? "aboutDialog.architecture.sixtyFourBit"
        : "aboutDialog.architecture.thirtyTwoBit";
      let arch = bundle.GetStringFromName(archResource);
      version += ` (${arch})`;

      document.l10n.setAttributes(
        document.getElementById("version"),
        "update-app-version",
        { version }
      );

      if (!AppConstants.NIGHTLY_BUILD) {
        // Show a release notes link if we have a URL.
        let relNotesLink = document.getElementById("releasenotes");
        let relNotesPrefType = Services.prefs.getPrefType(
          "app.releaseNotesURL"
        );
        if (relNotesPrefType != Services.prefs.PREF_INVALID) {
          let relNotesURL = Services.urlFormatter.formatURLPref(
            "app.releaseNotesURL"
          );
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

    Preferences.addSyncFromPrefListener(
      document.getElementById("allowSmartSize"),
      () => this.readSmartSizeEnabled()
    );

    let element = document.getElementById("cacheSize");
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
    let sound = Cc["@mozilla.org/sound;1"].createInstance(Ci.nsISound);

    let soundLocation;
    // soundType radio-group isn't used for macOS so it is not in the XUL file
    // for the platform.
    soundLocation =
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
    const nsIFilePicker = Ci.nsIFilePicker;
    var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);

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
      nsIFilePicker.modeOpen
    );
    fp.appendFilters(Ci.nsIFilePicker.filterAudio);
    fp.appendFilters(Ci.nsIFilePicker.filterAll);

    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
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
      document.getElementById(
        "newMailNotification"
      ).disabled = !soundUrlLocation;
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
    document.getElementById(
      "browseForStartPageUrl"
    ).disabled = !Preferences.get("mailnews.start_page.enabled").value;
  },

  updateCustomizeAlert() {
    // The button does not exist on all platforms.
    let customizeAlertButton = document.getElementById("customizeMailAlert");
    if (customizeAlertButton) {
      customizeAlertButton.disabled = !Preferences.get("mail.biff.show_alert")
        .value;
    }
  },

  updateWebSearch() {
    let self = this;
    Services.search.init().then(async () => {
      let defaultEngine = await Services.search.getDefault();
      let engineList = document.getElementById("defaultWebSearch");
      for (let engine of await Services.search.getVisibleEngines()) {
        let item = engineList.appendItem(engine.name);
        item.engine = engine;
        item.className = "menuitem-iconic";
        item.setAttribute(
          "image",
          engine.iconURI
            ? engine.iconURI.spec
            : "resource://gre-resources/broken-image.png"
        );
        if (engine == defaultEngine) {
          engineList.selectedItem = item;
        }
      }
      self.defaultEngines = await Services.search.getAppProvidedEngines();
      self.updateRemoveButton();

      engineList.addEventListener("command", async () => {
        await Services.search.setDefault(engineList.selectedItem.engine);
        self.updateRemoveButton();
      });
    });
  },

  // Caches the default engines so we only retrieve them once.
  defaultEngines: null,

  async updateRemoveButton() {
    let engineList = document.getElementById("defaultWebSearch");
    let removeButton = document.getElementById("removeSearchEngine");
    if (this.defaultEngines.includes(await Services.search.getDefault())) {
      // Don't allow deletion of a default engine (saves us having a 'restore' button).
      removeButton.disabled = true;
    } else {
      // Don't allow removal of last engine. This shouldn't happen since there should
      // always be default engines.
      removeButton.disabled = engineList.itemCount <= 1;
    }
  },

  addSearchEngine() {
    let fp = Cc["@mozilla.org/filepicker;1"].createInstance(Ci.nsIFilePicker);
    fp.init(
      window,
      document
        .getElementById("bundlePreferences")
        .getString("searchEnginePickerTitle"),
      Ci.nsIFilePicker.modeOpen
    );

    // Filter on XML files only.
    fp.appendFilter(
      document
        .getElementById("bundlePreferences")
        .getString("searchEngineType2"),
      "*.xml"
    );

    fp.open(async rv => {
      if (rv != Ci.nsIFilePicker.returnOK || !fp.file) {
        return;
      }
      let uri = fp.fileURL.spec;
      let engine = await Services.search.addOpenSearchEngine(uri, null);

      // Add new engine to the list.
      let engineList = document.getElementById("defaultWebSearch");

      let item = engineList.appendItem(engine.name);
      item.engine = engine;
      item.className = "menuitem-iconic";
      item.setAttribute(
        "image",
        engine.iconURI
          ? engine.iconURI.spec
          : "resource://gre-resources/broken-image.png"
      );

      this.updateRemoveButton();
    });
  },

  async removeSearchEngine() {
    // Deletes the current engine. Firefox does a better job since it
    // shows all the engines in the list. But better than nothing.
    let defaultEngine = await Services.search.getDefault();
    let engineList = document.getElementById("defaultWebSearch");
    for (let i = 0; i < engineList.itemCount; i++) {
      let item = engineList.getItemAtIndex(i);
      if (item.engine == defaultEngine) {
        await Services.search.removeEngine(item.engine);
        item.remove();
        engineList.selectedIndex = 0;
        await Services.search.setDefault(engineList.selectedItem.engine);
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
    })().catch(Cu.reportError);
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
    let element = document.getElementById("defaultFont");
    let preference = Preferences.get(element.getAttribute("preference"));
    if (preference.value) {
      let fontItem = element.querySelector(
        '[value="' + preference.value + '"]'
      );

      // There is a setting that actually is in the list. Respect it.
      if (fontItem) {
        return undefined;
      }
    }

    let defaultValue = element.firstElementChild.firstElementChild.getAttribute(
      "value"
    );
    let languagePref = Preferences.get("font.language.group");
    let defaultType = this._readDefaultFontTypeForLanguage(languagePref.value);
    let listPref = Preferences.get(
      "font.name-list." + defaultType + "." + languagePref.value
    );
    if (!listPref) {
      return defaultValue;
    }

    let fontNames = listPref.value.split(",");

    for (let fontName of fontNames) {
      let fontItem = element.querySelector('[value="' + fontName.trim() + '"]');
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
    let appLocale = Services.locale.appLocalesAsBCP47[0];
    let rsLocale = osprefs.regionalPrefsLocales[0];
    let names = Services.intl.getLocaleDisplayNames(undefined, [
      appLocale,
      rsLocale,
    ]);
    let appLocaleRadio = document.getElementById("appLocale");
    let rsLocaleRadio = document.getElementById("rsLocale");
    let appLocaleLabel = this._prefsBundle.getFormattedString(
      "appLocale.label",
      [names[0]]
    );
    let rsLocaleLabel = this._prefsBundle.getFormattedString("rsLocale.label", [
      names[1],
    ]);
    appLocaleRadio.setAttribute("label", appLocaleLabel);
    rsLocaleRadio.setAttribute("label", rsLocaleLabel);
    appLocaleRadio.accessKey = this._prefsBundle.getString(
      "appLocale.accesskey"
    );
    rsLocaleRadio.accessKey = this._prefsBundle.getString("rsLocale.accesskey");
  },

  // Load the preferences string bundle for other locales with fallbacks.
  getBundleForLocales(newLocales) {
    let locales = Array.from(
      new Set([
        ...newLocales,
        ...Services.locale.requestedLocales,
        Services.locale.lastFallbackLocale,
      ])
    );
    function generateBundles(resourceIds) {
      return L10nRegistry.generateBundles(locales, resourceIds);
    }
    return new Localization(
      ["messenger/preferences/preferences.ftl", "branding/brand.ftl"],
      false,
      { generateBundles }
    );
  },

  initMessengerLocale() {
    gGeneralPane.setMessengerLocales(Services.locale.requestedLocale);
  },

  /**
   * Update the available list of locales and select the locale that the user
   * is "selecting". This could be the currently requested locale or a locale
   * that the user would like to switch to after confirmation.
   */
  async setMessengerLocales(selected) {
    // HACK: calling getLocaleDisplayNames may fail the first time due to
    // synchronous loading of the .ftl files. If we load the files and wait
    // for a known value asynchronously, no such failure will happen.
    await new Localization([
      "toolkit/intl/languageNames.ftl",
      "toolkit/intl/regionNames.ftl",
    ]).formatValue("language-name-en");

    let available = await getAvailableLocales();
    let localeNames = Services.intl.getLocaleDisplayNames(undefined, available);
    let locales = available.map((code, i) => ({ code, name: localeNames[i] }));
    locales.sort((a, b) => a.name > b.name);

    let fragment = document.createDocumentFragment();
    for (let { code, name } of locales) {
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
        "label",
        await document.l10n.formatValue("messenger-languages-search")
      );
      menuitem.setAttribute("value", "search");
      menuitem.addEventListener("command", () => {
        gGeneralPane.showMessengerLanguages({ search: true });
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

  showMessengerLanguages({ search }) {
    let opts = { selected: gGeneralPane.selectedLocales, search };
    gSubDialog.open(
      "chrome://messenger/content/preferences/messengerLanguages.xhtml",
      { closingCallback: this.messengerLanguagesClosed },
      opts
    );
  },

  /* Show or hide the confirm change message bar based on the updated ordering. */
  messengerLanguagesClosed() {
    let selected = this.gMessengerLanguagesDialog.selected;
    let active = Services.locale.appLocalesAsBCP47;

    // Prepare for changing the locales if they are different than the current locales.
    if (selected && selected.join(",") != active.join(",")) {
      gGeneralPane.showConfirmLanguageChangeMessageBar(selected);
      gGeneralPane.setMessengerLocales(selected[0]);
      return;
    }

    // They matched, so we can reset the UI.
    gGeneralPane.setMessengerLocales(Services.locale.appLocaleAsBCP47);
    gGeneralPane.hideConfirmLanguageChangeMessageBar();
  },

  /* Show the confirmation message bar to allow a restart into the new locales. */
  async showConfirmLanguageChangeMessageBar(locales) {
    let messageBar = document.getElementById("confirmMessengerLanguage");

    // Get the bundle for the new locale.
    let newBundle = this.getBundleForLocales(locales);

    // Find the messages and labels.
    let messages = await Promise.all(
      [newBundle, document.l10n].map(async bundle =>
        bundle.formatValue("confirm-messenger-language-change-description")
      )
    );
    let buttonLabels = await Promise.all(
      [newBundle, document.l10n].map(async bundle =>
        bundle.formatValue("confirm-messenger-language-change-button")
      )
    );

    // If both the message and label are the same, just include one row.
    if (messages[0] == messages[1] && buttonLabels[0] == buttonLabels[1]) {
      messages.pop();
      buttonLabels.pop();
    }

    let contentContainer = messageBar.querySelector(
      ".message-bar-content-container"
    );
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
      button.addEventListener("command", gGeneralPane.confirmLanguageChange);
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
    let contentContainer = messageBar.querySelector(
      ".message-bar-content-container"
    );
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
    let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
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
  onMessengerLanguageChange(event) {
    let locale = event.target.value;

    if (locale == "search") {
      return;
    } else if (locale == Services.locale.appLocaleAsBCP47) {
      this.hideConfirmLanguageChangeMessageBar();
      return;
    }

    let locales = Array.from(
      new Set([locale, ...Services.locale.requestedLocales]).values()
    );
    this.showConfirmLanguageChangeMessageBar(locales);
  },

  // appends the tag to the tag list box
  appendTagItem(aTagName, aKey, aColor) {
    let item = this.mTagListBox.appendItem(aTagName, aKey);
    item.style.color = aColor;
    return item;
  },

  buildTagList() {
    let tagArray = MailServices.tags.getAllTags();
    for (let i = 0; i < tagArray.length; ++i) {
      let taginfo = tagArray[i];
      this.appendTagItem(taginfo.tag, taginfo.key, taginfo.color);
    }
  },

  removeTag() {
    var index = this.mTagListBox.selectedIndex;
    if (index >= 0) {
      var itemToRemove = this.mTagListBox.getItemAtIndex(index);
      MailServices.tags.deleteKey(itemToRemove.getAttribute("value"));
      itemToRemove.remove();
      var numItemsInListBox = this.mTagListBox.getRowCount();
      this.mTagListBox.selectedIndex =
        index < numItemsInListBox ? index : numItemsInListBox - 1;
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
        okCallback: editTagCallback,
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
    let btnEdit = document.getElementById("editTagButton");
    let listBox = document.getElementById("tagList");

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
    let enableRadioGroup = Preferences.get("mailnews.mark_message_read.auto")
      .value;
    let autoMarkAsPref = Preferences.get("mailnews.mark_message_read.delay");
    let autoMarkDisabled = !enableRadioGroup || autoMarkAsPref.locked;
    document.getElementById(
      "markAsReadAutoPreferences"
    ).disabled = autoMarkDisabled;
    document.getElementById("secondsLabel").disabled = autoMarkDisabled;
    gGeneralPane.updateMarkAsReadTextbox();
  },

  /**
   * Automatically enable/disable delay textbox depending on state of the
   * Mark As Read On Delay feature.
   */
  updateMarkAsReadTextbox() {
    let radioGroupEnabled = Preferences.get("mailnews.mark_message_read.auto")
      .value;
    let textBoxEnabled = Preferences.get("mailnews.mark_message_read.delay")
      .value;
    let intervalPref = Preferences.get(
      "mailnews.mark_message_read.delay.interval"
    );

    let delayTextbox = document.getElementById("markAsReadDelay");
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
    let mainWin = Services.wm.getMostRecentWindow("mail:3pane");
    let tabmail = mainWin.document.getElementById("tabmail");
    for (let tabInfo of tabmail.tabInfo) {
      let tab = tabmail.getTabForBrowser(tabInfo.browser);
      if (tab && tab.urlbar && tab.urlbar.value == "about:config") {
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
    var disabled = Preferences.get("browser.cache.disk.smart_size.enabled")
      .value;
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
    document.getElementById("offlineCompactFolderMin").disabled =
      !Preferences.get("mail.prompt_purge_threshhold").value ||
      Preferences.get("mail.purge_threshhold_mb").locked;
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
      let preference = Preferences.get("layers.acceleration.disabled");
      Services.prefs.setBoolPref("gfx.direct2d.disabled", !preference.value);
    }
  },

  /**
   * Selects the correct item in the update radio group
   */
  async updateReadPrefs() {
    if (
      AppConstants.MOZ_UPDATER &&
      (!Services.policies || Services.policies.isAllowed("appUpdate"))
    ) {
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
    if (
      AppConstants.MOZ_UPDATER &&
      (!Services.policies || Services.policies.isAllowed("appUpdate"))
    ) {
      let radiogroup = document.getElementById("updateRadioGroup");
      let updateAutoValue = radiogroup.value == "true";
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
      { id: "update-setting-write-failure-title" },
      {
        id: "update-setting-write-failure-message",
        args: { path: error.path },
      },
    ]);

    // Set up the Ok Button
    let buttonFlags =
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
    let um = Cc["@mozilla.org/updates/update-manager;1"].getService(
      Ci.nsIUpdateManager
    );
    if (!um.readyUpdate && !um.downloadingUpdate) {
      return;
    }

    let [
      title,
      message,
      okButton,
      cancelButton,
    ] = await document.l10n.formatValues([
      { id: "update-in-progress-title" },
      { id: "update-in-progress-message" },
      { id: "update-in-progress-ok-button" },
      { id: "update-in-progress-cancel-button" },
    ]);

    // Continue is the cancel button which is BUTTON_POS_1 and is set as the
    // default so pressing escape or using a platform standard method of closing
    // the UI will not discard the update.
    let buttonFlags =
      Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_0 +
      Ci.nsIPrompt.BUTTON_TITLE_IS_STRING * Ci.nsIPrompt.BUTTON_POS_1 +
      Ci.nsIPrompt.BUTTON_POS_1_DEFAULT;

    let rv = Services.prompt.confirmEx(
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
      let aus = Cc["@mozilla.org/updates/update-service;1"].getService(
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
        this._handledTypes[internalHandler.type] = internalHandler;
      }
    }
  },

  /**
   * Load the set of handlers defined by the application datastore.
   */
  _loadApplicationHandlers() {
    for (let wrappedHandlerInfo of gHandlerService.enumerate()) {
      let type = wrappedHandlerInfo.type;

      let handlerInfoWrapper;
      if (type in this._handledTypes) {
        handlerInfoWrapper = this._handledTypes[type];
      } else {
        handlerInfoWrapper = new HandlerInfoWrapper(type, wrappedHandlerInfo);
        this._handledTypes[type] = handlerInfoWrapper;
      }
    }
  },

  // -----------------
  // View Construction

  selectedHandlerListItem: null,

  _initListEventHandlers() {
    this._list.addEventListener("select", event => {
      if (event.target != this._list) {
        return;
      }

      let handlerListItem =
        this._list.selectedItem &&
        HandlerListItem.forNode(this._list.selectedItem);
      if (this.selectedHandlerListItem == handlerListItem) {
        return;
      }

      if (this.selectedHandlerListItem) {
        this.selectedHandlerListItem.showActionsMenu = false;
      }
      this.selectedHandlerListItem = handlerListItem;
      if (handlerListItem) {
        this.rebuildActionsMenu();
        handlerListItem.showActionsMenu = true;
      }
    });
  },

  _rebuildVisibleTypes() {
    // Reset the list of visible types and the visible type description.
    this._visibleTypes.length = 0;
    this._visibleDescriptions.clear();

    for (let type in this._handledTypes) {
      let handlerInfo = this._handledTypes[type];

      // We couldn't find any reason to exclude the type, so include it.
      this._visibleTypes.push(handlerInfo);

      let otherHandlerInfo = this._visibleDescriptions.get(
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
    let lastSelectedType =
      this.selectedHandlerListItem &&
      this.selectedHandlerListItem.handlerInfoWrapper.type;
    this.selectedHandlerListItem = null;

    // Clear the list of entries.
    this._list.textContent = "";

    var visibleTypes = this._visibleTypes;

    // If the user is filtering the list, then only show matching types.
    if (this._filter.value) {
      visibleTypes = visibleTypes.filter(this._matchesFilter, this);
    }

    for (let visibleType of visibleTypes) {
      let item = new HandlerListItem(visibleType);
      item.connectAndAppendToList(this._list);

      if (visibleType.type === lastSelectedType) {
        this._list.selectedItem = item.node;
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
   * @return {string} the extensions for the type
   */
  _typeDetails(aHandlerInfo) {
    let exts = [];
    if (aHandlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      for (let extName of aHandlerInfo.wrappedHandlerInfo.getFileExtensions()) {
        let ext = "." + extName;
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
   * @param aHandlerApp {nsIHandlerApp} the handler app in question
   * @return {boolean} whether or not it's valid
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
    let isExecutable =
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

  /**
   * Rebuild the actions menu for the selected entry.  Gets called by
   * the richlistitem constructor when an entry in the list gets selected.
   */
  rebuildActionsMenu() {
    var typeItem = this._list.selectedItem;

    if (!typeItem) {
      return;
    }

    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;
    var menu = typeItem.querySelector(".actionsMenu");
    var menuPopup = menu.menupopup;

    // Clear out existing items.
    while (menuPopup.hasChildNodes()) {
      menuPopup.lastChild.remove();
    }

    let internalMenuItem;
    // Add the "Preview in Thunderbird" option for optional internal handlers.
    if (handlerInfo instanceof InternalHandlerInfoWrapper) {
      internalMenuItem = document.createXULElement("menuitem");
      internalMenuItem.setAttribute(
        "action",
        Ci.nsIHandlerInfo.handleInternally
      );
      let label = this._prefsBundle.getFormattedString("previewInApp", [
        this._brandShortName,
      ]);
      internalMenuItem.setAttribute("label", label);
      internalMenuItem.setAttribute("tooltiptext", label);
      internalMenuItem.setAttribute(APP_ICON_ATTR_NAME, "ask");
      menuPopup.appendChild(internalMenuItem);
    }

    var askMenuItem = document.createXULElement("menuitem");
    askMenuItem.setAttribute("alwaysAsk", "true");
    {
      let label = this._prefsBundle.getString("alwaysAsk");
      askMenuItem.setAttribute("label", label);
      askMenuItem.setAttribute("tooltiptext", label);
      askMenuItem.setAttribute(APP_ICON_ATTR_NAME, "ask");
      menuPopup.appendChild(askMenuItem);
    }

    // Create a menu item for saving to disk.
    // Note: this option isn't available to protocol types, since we don't know
    // what it means to save a URL having a certain scheme to disk.
    if (handlerInfo.wrappedHandlerInfo instanceof Ci.nsIMIMEInfo) {
      var saveMenuItem = document.createXULElement("menuitem");
      saveMenuItem.setAttribute("action", Ci.nsIHandlerInfo.saveToDisk);
      let label = this._prefsBundle.getString("saveFile");
      saveMenuItem.setAttribute("label", label);
      saveMenuItem.setAttribute("tooltiptext", label);
      saveMenuItem.setAttribute(APP_ICON_ATTR_NAME, "save");
      menuPopup.appendChild(saveMenuItem);
    }

    // Add a separator to distinguish these items from the helper app items
    // that follow them.
    let menuItem = document.createXULElement("menuseparator");
    menuPopup.appendChild(menuItem);

    // Create a menu item for the OS default application, if any.
    if (handlerInfo.hasDefaultHandler) {
      var defaultMenuItem = document.createXULElement("menuitem");
      defaultMenuItem.setAttribute(
        "action",
        Ci.nsIHandlerInfo.useSystemDefault
      );
      let label = this._prefsBundle.getFormattedString("useDefault", [
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
    let preferredApp = handlerInfo.preferredApplicationHandler;
    var possibleAppMenuItems = [];
    for (let possibleApp of handlerInfo.possibleApplicationHandlers.enumerate()) {
      if (!gGeneralPane.isValidHandlerApp(possibleApp)) {
        continue;
      }

      let menuItem = document.createXULElement("menuitem");
      menuItem.setAttribute("action", Ci.nsIHandlerInfo.useHelperApp);
      let label;
      if (possibleApp instanceof Ci.nsILocalHandlerApp) {
        label = getDisplayNameForFile(possibleApp.executable);
      } else {
        label = possibleApp.name;
      }
      label = this._prefsBundle.getFormattedString("useApp", [label]);
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
      var executableType = Cc["@mozilla.org/mime;1"]
        .getService(Ci.nsIMIMEService)
        .getTypeFromExtension("exe");
      if (handlerInfo.type == executableType) {
        createItem = false;
      }
    }

    if (createItem) {
      let menuItem = document.createXULElement("menuitem");
      menuItem.setAttribute("oncommand", "gGeneralPane.chooseApp(event)");
      let label = this._prefsBundle.getString("useOtherApp");
      menuItem.setAttribute("label", label);
      menuItem.setAttribute("tooltiptext", label);
      menuPopup.appendChild(menuItem);
    }

    // Create a menu item for managing applications.
    if (possibleAppMenuItems.length) {
      let menuItem = document.createXULElement("menuseparator");
      menuPopup.appendChild(menuItem);
      menuItem = document.createXULElement("menuitem");
      menuItem.setAttribute("oncommand", "gGeneralPane.manageApp(event)");
      menuItem.setAttribute("label", this._prefsBundle.getString("manageApp"));
      menuPopup.appendChild(menuItem);
    }

    menuItem = document.createXULElement("menuseparator");
    menuPopup.appendChild(menuItem);
    menuItem = document.createXULElement("menuitem");
    menuItem.setAttribute("oncommand", "gGeneralPane.confirmDelete(event)");
    menuItem.setAttribute("label", this._prefsBundle.getString("delete"));
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
            Cu.reportError("No menu item defined to set!");
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
    menu.previousSelectedItem = menu.selectedItem || askMenuItem;
  },

  // -------------------
  // Sorting & Filtering

  _sortColumn: null,

  /**
   * Sort the list when the user clicks on a column header.
   */
  sort(event) {
    var column = event.target;

    // If the user clicked on a new sort column, remove the direction indicator
    // from the old column.
    if (this._sortColumn && this._sortColumn != column) {
      this._sortColumn.removeAttribute("sortDirection");
    }

    this._sortColumn = column;

    // Set (or switch) the sort direction indicator.
    if (column.getAttribute("sortDirection") == "ascending") {
      column.setAttribute("sortDirection", "descending");
    } else {
      column.setAttribute("sortDirection", "ascending");
    }

    this._sortVisibleTypes();
    this._rebuildView();
  },

  /**
   * Sort the list of visible types by the current sort column/direction.
   */
  _sortVisibleTypes() {
    if (!this._sortColumn) {
      return;
    }

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

    switch (this._sortColumn.getAttribute("value")) {
      case "type":
        this._visibleTypes.sort(sortByType);
        break;
      case "action":
        this._visibleTypes.sort(sortByAction);
        break;
    }

    if (this._sortColumn.getAttribute("sortDirection") == "descending") {
      this._visibleTypes.reverse();
    }
  },

  focusFilterBox() {
    this._filter.focus();
    this._filter.select();
  },

  // -------
  // Changes

  // Whether or not we are currently storing the action selected by the user.
  // We use this to suppress notification-triggered updates to the list when
  // we make changes that may spawn such updates, specifically when we change
  // the action for the feed type, which results in feed preference updates,
  // which spawn "pref changed" notifications that would otherwise cause us
  // to rebuild the view unnecessarily.
  _storingAction: false,

  onSelectAction(aActionItem) {
    this._storingAction = true;

    let typeItem = this._list.selectedItem;
    let menu = typeItem.querySelector(".actionsMenu");
    menu.previousSelectedItem = aActionItem;
    try {
      this._storeAction(aActionItem);
    } finally {
      this._storingAction = false;
    }
  },

  _storeAction(aActionItem) {
    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

    if (aActionItem.hasAttribute("alwaysAsk")) {
      handlerInfo.alwaysAskBeforeHandling = true;
    } else if (aActionItem.hasAttribute("action")) {
      let action = parseInt(aActionItem.getAttribute("action"));

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

    // Update the action label and image to reflect the new preferred action.
    this.selectedHandlerListItem.refreshAction();
  },

  manageApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

    let onComplete = () => {
      // Rebuild the actions menu so that we revert to the previous selection,
      // or "Always ask" if the previous default application has been removed.
      this.rebuildActionsMenu();

      // Update the richlistitem too. Will be visible when selecting another row.
      this.selectedHandlerListItem.refreshAction();
    };

    gSubDialog.open(
      "chrome://messenger/content/preferences/applicationManager.xhtml",
      { features: "resizable=no", closingCallback: onComplete },
      handlerInfo
    );
  },

  chooseApp(aEvent) {
    // Don't let the normal "on select action" handler get this event,
    // as we handle it specially ourselves.
    aEvent.stopPropagation();

    var handlerApp;
    let onSelectionDone = function() {
      // Rebuild the actions menu whether the user picked an app or canceled.
      // If they picked an app, we want to add the app to the menu and select it.
      // If they canceled, we want to go back to their previous selection.
      this.rebuildActionsMenu();

      // If the user picked a new app from the menu, select it.
      if (handlerApp) {
        let typeItem = this._list.selectedItem;
        let actionsMenu = typeItem.querySelector(".actionsMenu");
        let menuItems = actionsMenu.menupopup.children;
        for (let i = 0; i < menuItems.length; i++) {
          let menuItem = menuItems[i];
          if (menuItem.handlerApp && menuItem.handlerApp.equals(handlerApp)) {
            actionsMenu.selectedIndex = i;
            this.onSelectAction(menuItem);
            break;
          }
        }
      }
    }.bind(this);

    if (AppConstants.platform == "win") {
      let params = {};
      let handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;

      params.mimeInfo = handlerInfo.wrappedHandlerInfo;

      params.title = this._prefsBundle.getString("fpTitleChooseApp");
      params.description = handlerInfo.description;
      params.filename = null;
      params.handlerApp = null;

      let onAppSelected = () => {
        if (this.isValidHandlerApp(params.handlerApp)) {
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
      const nsIFilePicker = Ci.nsIFilePicker;
      let fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
      let winTitle = this._prefsBundle.getString("fpTitleChooseApp");
      fp.init(window, winTitle, nsIFilePicker.modeOpen);
      fp.appendFilters(nsIFilePicker.filterApps);

      // Prompt the user to pick an app.  If they pick one, and it's a valid
      // selection, then add it to the list of possible handlers.

      fp.open(rv => {
        if (
          rv == nsIFilePicker.returnOK &&
          fp.file &&
          this._isValidHandlerExecutable(fp.file)
        ) {
          handlerApp = Cc[
            "@mozilla.org/uriloader/local-handler-app;1"
          ].createInstance(Ci.nsILocalHandlerApp);
          handlerApp.name = getDisplayNameForFile(fp.file);
          handlerApp.executable = fp.file;

          // Add the app to the type's list of possible handlers.
          let handlerInfo = this.selectedHandlerListItem.handlerInfoWrapper;
          handlerInfo.addPossibleApplicationHandler(handlerApp);
        }
        onSelectionDone();
      });
    }
  },

  confirmDelete(aEvent) {
    aEvent.stopPropagation();
    if (
      Services.prompt.confirm(
        null,
        this._prefsBundle.getString("confirmDeleteTitle"),
        this._prefsBundle.getString("confirmDeleteText")
      )
    ) {
      this.onDelete(aEvent);
    } else {
      // They hit cancel, so return them to the previously selected item.
      let typeItem = this._list.selectedItem;
      let menu = typeItem.querySelector(".actionsMenu");
      menu.selectedItem = menu.previousSelectedItem;
    }
  },

  onDelete(aEvent) {
    // We want to delete if either the request came from the confirmDelete
    // method (which is the only thing that populates the aEvent parameter),
    // or we've hit the delete/backspace key while the list has focus.
    if (
      (aEvent || document.commandDispatcher.focusedElement == this._list) &&
      this._list.selectedIndex != -1
    ) {
      let typeItem = this._list.getItemAtIndex(this._list.selectedIndex);
      let type = typeItem.getAttribute("type");
      let handlerInfo = this._handledTypes[type];
      let index = this._visibleTypes.indexOf(handlerInfo);
      if (index != -1) {
        this._visibleTypes.splice(index, 1);
      }
      handlerInfo.remove();
      delete this._handledTypes[type];
      typeItem.remove();
    }
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
    let urlSpec = Services.io
      .getProtocolHandler("file")
      .QueryInterface(Ci.nsIFileProtocolHandler)
      .getURLSpecFromFile(aFile);

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
  },

  // nsISupports

  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),

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
let gHandlerListItemFragment = MozXULElement.parseXULToFragment(`
  <richlistitem>
    <hbox flex="1" equalsize="always">
      <hbox class="typeContainer" flex="1" align="center">
        <image class="typeIcon" width="16" height="16"
               src="moz-icon://goat?size=16"/>
        <label class="typeDescription" flex="1" crop="end"/>
      </hbox>
      <hbox class="actionContainer" flex="1" align="center">
        <image class="actionIcon" width="16" height="16"/>
        <label class="actionDescription" flex="1" crop="end"/>
      </hbox>
      <hbox class="actionsMenuContainer" flex="1">
        <menulist class="actionsMenu" flex="1" crop="end" selectedIndex="1">
          <menupopup/>
        </menulist>
      </hbox>
    </hbox>
  </richlistitem>
`);

/**
 * This is associated to <richlistitem> elements in the handlers view.
 */
class HandlerListItem {
  static forNode(node) {
    return gNodeToObjectMap.get(node);
  }

  constructor(handlerInfoWrapper) {
    this.handlerInfoWrapper = handlerInfoWrapper;
  }

  setOrRemoveAttributes(iterable) {
    for (let [selector, name, value] of iterable) {
      let node = selector ? this.node.querySelector(selector) : this.node;
      if (value) {
        node.setAttribute(name, value);
      } else {
        node.removeAttribute(name);
      }
    }
  }

  connectAndAppendToList(list) {
    list.appendChild(document.importNode(gHandlerListItemFragment, true));
    this.node = list.lastElementChild;
    gNodeToObjectMap.set(this.node, this);

    this.node
      .querySelector(".actionsMenu")
      .addEventListener("command", event =>
        gGeneralPane.onSelectAction(event.originalTarget)
      );

    let typeDescription = this.handlerInfoWrapper.typeDescription;
    this.setOrRemoveAttributes([
      [null, "type", this.handlerInfoWrapper.type],
      [".typeContainer", "tooltiptext", typeDescription],
      [".typeDescription", "value", typeDescription],
      [".typeIcon", "src", this.handlerInfoWrapper.smallIcon],
    ]);
    this.refreshAction();
    this.showActionsMenu = false;
  }

  refreshAction() {
    let { actionIconClass, actionDescription } = this.handlerInfoWrapper;
    this.setOrRemoveAttributes([
      [null, APP_ICON_ATTR_NAME, actionIconClass],
      [".actionContainer", "tooltiptext", actionDescription],
      [".actionDescription", "value", actionDescription],
      [
        ".actionIcon",
        "src",
        actionIconClass ? null : this.handlerInfoWrapper.actionIcon,
      ],
    ]);
  }

  set showActionsMenu(value) {
    this.setOrRemoveAttributes([
      [".actionContainer", "hidden", value],
      [".actionsMenuContainer", "hidden", !value],
    ]);
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
        let preferredApp = this.preferredApplicationHandler;
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
        let url = this.wrappedHandlerInfo.getProperty(
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
    for (let possibleApp of this.possibleApplicationHandlers.enumerate()) {
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
  let key = MailServices.tags.getKeyForTag(aName);
  TagUtils.addTagToAllDocumentSheets(key, aColor);

  var item = gGeneralPane.appendTagItem(aName, key, aColor);
  var tagListBox = document.getElementById("tagList");
  tagListBox.ensureElementIsVisible(item);
  tagListBox.selectItem(item);
  tagListBox.focus();
  return true;
}

function editTagCallback() {
  // update the values of the selected item
  let tagListEl = document.getElementById("tagList");
  let index = tagListEl.selectedIndex;
  if (index < 0) {
    return false;
  }

  let tagElToEdit = tagListEl.getItemAtIndex(index);
  let key = tagElToEdit.getAttribute("value");
  let color = MailServices.tags.getColorForKey(key);
  // update the color and label elements
  tagElToEdit
    .querySelector("label")
    .setAttribute("value", MailServices.tags.getTagForKey(key));
  tagElToEdit.style.color = color;

  // Add to style sheet. We simply add the new color, the rule is added at the
  // end and will overrule the previous rule.
  TagUtils.addTagToAllDocumentSheets(key, color);
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
    gGeneralPane.updateCustomizeAlert
  );
}
