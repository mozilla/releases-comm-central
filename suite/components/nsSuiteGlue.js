/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const XULNS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { migrateMailnews } = ChromeUtils.import(
  "resource:///modules/mailnewsMigrator.js"
);
var { LightweightThemeConsumer } = ChromeUtils.import(
  "resource://gre/modules/LightweightThemeConsumer.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  LoginManagerParent: "resource://gre/modules/LoginManagerParent.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  FileUtils: "resource://gre/modules/FileUtils.jsm",
  OS: "resource://gre/modules/osfile.jsm",
  PlacesUtils: "resource://gre/modules/PlacesUtils.jsm",
  PlacesBackups: "resource://gre/modules/PlacesBackups.jsm",
  AsyncShutdown: "resource://gre/modules/AsyncShutdown.jsm",
  AutoCompletePopup: "resource://gre/modules/AutoCompletePopup.jsm",
  DateTimePickerHelper: "resource://gre/modules/DateTimePickerHelper.jsm",
  BookmarkHTMLUtils: "resource://gre/modules/BookmarkHTMLUtils.jsm",
  BookmarkJSONUtils: "resource://gre/modules/BookmarkJSONUtils.jsm",
  RecentWindow: "resource:///modules/RecentWindow.jsm",
  Sanitizer: "resource:///modules/Sanitizer.jsm",
  ShellService: "resource:///modules/ShellService.jsm",
  DownloadsCommon: "resource:///modules/DownloadsCommon.jsm",
  PrivateBrowsingUtils: "resource://gre/modules/PrivateBrowsingUtils.jsm",
  Integration: "resource://gre/modules/Integration.jsm",
  PermissionUI: "resource:///modules/PermissionUI.jsm",
  AppConstants: "resource://gre/modules/AppConstants.jsm",
});

XPCOMUtils.defineLazyGetter(this, "DebuggerServer", () => {
  var tmp = {};
  ChromeUtils.import("resource://devtools/shared/Loader.jsm", tmp);
  return tmp.require("devtools/server/main").DebuggerServer;
});

var global = this;

var listeners = {
  mm: {
    // PLEASE KEEP THIS LIST IN SYNC WITH THE MOBILE LISTENERS IN nsBrowserGlue.js
    "RemoteLogins:findLogins": ["LoginManagerParent"],
    "RemoteLogins:findRecipes": ["LoginManagerParent"],
    "RemoteLogins:onFormSubmit": ["LoginManagerParent"],
    "RemoteLogins:autoCompleteLogins": ["LoginManagerParent"],
    "RemoteLogins:removeLogin": ["LoginManagerParent"],
    "RemoteLogins:insecureLoginFormPresent": ["LoginManagerParent"],
    // PLEASE KEEP THIS LIST IN SYNC WITH THE MOBILE LISTENERS IN nsBrowserGlue.js
  },

  receiveMessage(modules, data) {
    let val;
    for (let module of modules[data.name]) {
      try {
        val = global[module].receiveMessage(data) || val;
      } catch (e) {
        Cu.reportError(e);
      }
    }
    return val;
  },

  init() {
    let receiveMessageMM = this.receiveMessage.bind(this, this.mm);
    for (let message of Object.keys(this.mm)) {
      Services.mm.addMessageListener(message, receiveMessageMM);
    }
  }
};

// We try to backup bookmarks at idle times, to avoid doing that at shutdown.
// Number of idle seconds before trying to backup bookmarks 8 minutes.
const BOOKMARKS_BACKUP_IDLE_TIME_SEC = 15 * 60;
// Minimum interval between backups. We try to not create more than one backup
// per interval.
const BOOKMARKS_BACKUP_MIN_INTERVAL_DAYS = 1;

// Devtools Preferences
const DEBUGGER_REMOTE_ENABLED = "devtools.debugger.remote-enabled";
const DEBUGGER_REMOTE_PORT = "devtools.debugger.remote-port";
const DEBUGGER_FORCE_LOCAL = "devtools.debugger.force-local";
const DEBUGGER_WIFI_VISIBLE = "devtools.remote.wifi.visible";
const DOWNLOAD_MANAGER_URL = "chrome://communicator/content/downloads/downloadmanager.xul";
const PREF_FOCUS_WHEN_STARTING = "browser.download.manager.focusWhenStarting";
const PREF_FLASH_COUNT = "browser.download.manager.flashCount";

var gDownloadManager;

// Constructor
function SuiteGlue() {
  XPCOMUtils.defineLazyServiceGetter(this, "_idleService",
                                     "@mozilla.org/widget/idleservice;1",
                                     "nsIIdleService");

  this._init();
  extensionDefaults(); // ExtensionSupport.sys.mjs
}

SuiteGlue.prototype = {
  _saveSession: false,
  _isIdleObserver: false,
  _isPlacesDatabaseLocked: false,
  _migrationImportsDefaultBookmarks: false,

  _setPrefToSaveSession: function()
  {
    Services.prefs.setBoolPref("browser.sessionstore.resume_session_once", true);
  },

  _logConsoleAPI: function(aEvent)
  {
    const nsIScriptError = Ci.nsIScriptError;
    var flg = nsIScriptError.errorFlag;
    switch (aEvent.level) {
      case "warn":
        flg = nsIScriptError.warningFlag;
      case "error":
        var scriptError = Cc["@mozilla.org/scripterror;1"]
                            .createInstance(nsIScriptError);
        scriptError.initWithWindowID(Array.from(aEvent.arguments),
                                     aEvent.filename, "", aEvent.lineNumber, 0,
                                     flg, "content javascript", aEvent.innerID);
        Services.console.logMessage(scriptError);
        break;
      case "log":
      case "info":
        Services.console.logStringMessage(Array.from(aEvent.arguments));
        break;
    }
  },

  _setSyncAutoconnectDelay: function BG__setSyncAutoconnectDelay() {
    // Assume that a non-zero value for services.sync.autoconnectDelay should override
    if (Services.prefs.prefHasUserValue("services.sync.autoconnectDelay")) {
      let prefDelay = Services.prefs.getIntPref("services.sync.autoconnectDelay");

      if (prefDelay > 0)
        return;
    }

    // delays are in seconds
    const MAX_DELAY = 300;
    let delay = 3;
    let browserEnum = Services.wm.getEnumerator("navigator:browser");
    while (browserEnum.hasMoreElements()) {
      delay += browserEnum.getNext().gBrowser.tabs.length;
    }
    delay = delay <= MAX_DELAY ? delay : MAX_DELAY;

    const {Weave} = ChromeUtils.import("resource://services-sync/main.js");
    Weave.Service.scheduler.delayedAutoConnect(delay);
  },

  // nsIObserver implementation
  observe: function(subject, topic, data)
  {
    switch(topic) {
      case "nsPref:changed":
        switch (data) {
          case DEBUGGER_REMOTE_ENABLED:
            if (this.dbgIsEnabled)
              this.dbgStart();
            else
              this.dbgStop();
            break;
          case DEBUGGER_REMOTE_PORT:
          case DEBUGGER_FORCE_LOCAL:
            /**
             * If the server is not on, port changes have nothing to affect.
             * The new value will be picked up if the server is started.
             */
            if (this.dbgIsEnabled)
              this.dbgRestart();
            break;
          case DEBUGGER_WIFI_VISIBLE:
            // Wifi visibility has changed, we need to restart the debugger
            // server.
            if (this.dbgIsEnabled && !Services.prefs.getBoolPref(DEBUGGER_FORCE_LOCAL))
              this.dbgRestart();
            break;
        }
        break;
      case "profile-before-change":
         // Any component depending on Places should be finalized in
         // _onPlacesShutdown.  Any component that doesn't need to act after
         // the UI has gone should be finalized in _onQuitApplicationGranted.
        this._dispose();
        break;
      case "profile-after-change":
        this._onProfileAfterChange();
        break;
      case "chrome-document-global-created":
        // Set up lwt, but only if the "lightweightthemes" attr is set on the root
        // (i.e. in messenger.xul).
        subject.addEventListener("DOMContentLoaded", () => {
          if (subject.document.documentElement.hasAttribute("lightweightthemes")) {
            new LightweightThemeConsumer(subject.document);
          }
        }, {once: true});
        break;
      case "final-ui-startup":
        this._onProfileStartup();
        this._promptForMasterPassword();
        this._checkForNewAddons();
        Services.search.init();
        listeners.init();

        Services.mm.loadFrameScript("chrome://navigator/content/content.js",
                                    true);
        ChromeUtils.import("resource://gre/modules/NotificationDB.jsm");
        break;
      case "browser-delayed-startup-finished":
         // Intended fallthrough.
      case "mail-startup-done":
        Services.obs.removeObserver(this, "browser-delayed-startup-finished");
        Services.obs.removeObserver(this, "mail-startup-done");
        this._onFirstWindowLoaded(subject);
        break;
      case "sessionstore-windows-restored":
        this._onBrowserStartup(subject);
        break;
      case "browser:purge-session-history":
        // reset the console service's error buffer
        Services.console.logStringMessage(null); // clear the console (in case it's open)
        Services.console.reset();
        break;
      case "quit-application-requested":
        this._onQuitRequest(subject, data);
        break;
      case "quit-application-granted":
        this._onQuitApplicationGranted();
        break;
      case "browser-lastwindow-close-requested":
        // The application is not actually quitting, but the last full browser
        // window is about to be closed.
        this._onQuitRequest(subject, "lastwindow");
        break;
      case "browser-lastwindow-close-granted":
        if (this._saveSession)
          this._setPrefToSaveSession();
        break;
      case "console-api-log-event":
        if (Services.prefs.getBoolPref("browser.dom.window.console.enabled"))
          this._logConsoleAPI(subject.wrappedJSObject);
        break;
//      case "weave:service:ready":
//        this._setSyncAutoconnectDelay();
//        break;
//      case "weave:engine:clients:display-uri":
//        this._onDisplaySyncURI(subject);
//        break;
      case "session-save":
        this._setPrefToSaveSession();
        subject.QueryInterface(Ci.nsISupportsPRBool);
        subject.data = true;
        break;
      case "places-init-complete":
        if (!this._migrationImportsDefaultBookmarks)
          this._initPlaces(false);

        Services.obs.removeObserver(this, "places-init-complete");
        break;
      case "idle":
        this._backupBookmarks();
        break;
      case "initial-migration":
        this._initialMigrationPerformed = true;
        break;
      case "browser-search-engine-modified":
        break;
      case "notifications-open-settings":
        // Since this is a web notification, there's probably a browser window.
        var mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
        if (mostRecentBrowserWindow)
          mostRecentBrowserWindow.toDataManager("|permissions");
        break;
      case "timer-callback":
        // Load the Login Manager data from disk off the main thread, some time
        // after startup.  If the data is required before the timeout, for example
        // because a restored page contains a password field, it will be loaded on
        // the main thread, and this initialization request will be ignored.
        Services.logins;
        break;
      case "handle-xul-text-link":
        let linkHandled = subject.QueryInterface(Ci.nsISupportsPRBool);
        if (!linkHandled.data) {
          let mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
          if (mostRecentBrowserWindow) {
            let dataObj = JSON.parse(data);
            let where = mostRecentBrowserWindow.whereToOpenLink(dataObj, false, true, true);
            // Preserve legacy behavior of non-modifier left-clicks
            // opening in a new selected tab.
            if (where == "current") {
              where = "tabfocused";
            }
            mostRecentBrowserWindow.openUILinkIn(dataObj.href, where);
            linkHandled.data = true;
          }
        }
        break;
    }
  },

  // nsIWebProgressListener partial implementation
  onLocationChange: function(aWebProgress, aRequest, aLocation, aFlags)
  {
    if (aWebProgress.isTopLevel &&
        aWebProgress instanceof Ci.nsIDocShell &&
        aWebProgress.loadType & Ci.nsIDocShell.LOAD_CMD_NORMAL &&
        aWebProgress.useGlobalHistory &&
        aWebProgress instanceof Ci.nsILoadContext &&
        !aWebProgress.usePrivateBrowsing) {
      switch (aLocation.scheme) {
        case "about":
        case "imap":
        case "news":
        case "mailbox":
        case "moz-anno":
        case "view-source":
        case "chrome":
        case "resource":
        case "data":
        case "wyciwyg":
        case "javascript":
          break;
        default:
          Services.prefs.setStringPref("browser.history.last_page_visited",
                                       aLocation.spec);
          break;
      }
    }
  },

  // initialization (called on application startup)
  _init: function()
  {
    // observer registration
    Services.obs.addObserver(this, "profile-before-change", true);
    Services.obs.addObserver(this, "profile-after-change", true);
    Services.obs.addObserver(this, "final-ui-startup", true);
    Services.obs.addObserver(this, "browser-delayed-startup-finished", true);
    Services.obs.addObserver(this, "mail-startup-done", true);
    Services.obs.addObserver(this, "sessionstore-windows-restored", true);
    Services.obs.addObserver(this, "browser:purge-session-history", true);
    Services.obs.addObserver(this, "quit-application-requested", true);
    Services.obs.addObserver(this, "quit-application-granted", true);
    Services.obs.addObserver(this, "browser-lastwindow-close-requested", true);
    Services.obs.addObserver(this, "browser-lastwindow-close-granted", true);
    Services.obs.addObserver(this, "console-api-log-event", true);
    Services.obs.addObserver(this, "weave:service:ready", true);
    Services.obs.addObserver(this, "weave:engine:clients:display-uri", true);
    Services.obs.addObserver(this, "session-save", true);
    Services.obs.addObserver(this, "places-init-complete", true);
    Services.obs.addObserver(this, "browser-search-engine-modified", true);
    Services.obs.addObserver(this, "notifications-open-settings", true);
    Services.obs.addObserver(this, "chrome-document-global-created", true);
    Services.prefs.addObserver("devtools.debugger.", this, true);
    Services.obs.addObserver(this, "handle-xul-text-link", true);
    Cc['@mozilla.org/docloaderservice;1']
      .getService(Ci.nsIWebProgress)
      .addProgressListener(this, Ci.nsIWebProgress.NOTIFY_LOCATION);
  },

  // cleanup (called on application shutdown)
  _dispose: function BG__dispose() {
    try {
      Services.obs.removeObserver(this, "chrome-document-global-created");
    }
    catch (ex) {}
    if (this._isIdleObserver) {
      this._idleService.removeIdleObserver(this, BOOKMARKS_BACKUP_IDLE_TIME_SEC);
      delete this._isIdleObserver;
    }
  },

  // profile is available
  _onProfileAfterChange: function()
  {
    // check if we're in safe mode
    if (Services.appinfo.inSafeMode) {
      Services.ww.openWindow(null, "chrome://communicator/content/safeMode.xul",
                             "_blank", "chrome,centerscreen,modal,resizable=no", null);
    }
    this._copyDefaultProfileFiles();
  },

  // profile startup handler (contains profile initialization routines)
  _onProfileStartup: function()
  {
    this._migrateUI();
    this._migrateUI2();
    migrateMailnews(); // mailnewsMigrator.js

    Sanitizer.onStartup();

    var timer = Cc["@mozilla.org/timer;1"]
                  .createInstance(Ci.nsITimer);
    timer.init(this, 3000, timer.TYPE_ONE_SHOT);
  },

  /**
   * Determine if the UI has been upgraded for this release. If not
   * reset or migrate some user configurations depending on the migration
   * level.
   */
  _migrateUI() {
    const UI_VERSION = 10;

    // If the pref is not set this is a new or pre SeaMonkey 2.49 profile.
    // We can't tell so we just run migration with version 0.
    let currentUIVersion =
      Services.prefs.getIntPref("suite.migration.version", 0);

    if (currentUIVersion >= UI_VERSION)
      return;

    if (currentUIVersion < 1) {
      // Run any migrations due prior to 2.49.
      this._updatePrefs();
      this._migrateDownloadPrefs();

      // Migrate remote content exceptions for email addresses which are
      // encoded as chrome URIs.
      let permissionsDB =
        Services.dirsvc.get("ProfD", Ci.nsIFile);
      permissionsDB.append("permissions.sqlite");
      let db = Services.storage.openDatabase(permissionsDB);

      try {
        let statement = db.createStatement(
          "select origin, permission from moz_perms where " +
          // Avoid 'like' here which needs to be escaped.
          "  substr(origin, 1, 28) = 'chrome://messenger/content/?';");

        try {
          while (statement.executeStep()) {
            let origin = statement.getUTF8String(0);
            let permission = statement.getInt32(1);
            Services.console.logStringMessage("Mail-Image-Perm Mig: " + origin);
            Services.perms.remove(
              Services.io.newURI(origin), "image");
            origin = origin.replace("chrome://messenger/content/?",
                                    "chrome://messenger/content/");
            Services.perms.add(
              Services.io.newURI(origin), "image", permission);
          }
        } finally {
          statement.finalize();
        }

        // Sadly we still need to clear the database manually. Experiments
        // showed that the permissions manager deletes only one record.
        db.defaultTransactionType = Ci.mozIStorageConnection.TRANSACTION_EXCLUSIVE;
        db.beginTransaction();

        try {
          db.executeSimpleSQL("delete from moz_perms where " +
               "  substr(origin, 1, 28) = 'chrome://messenger/content/?';");
          db.commitTransaction();
        } catch (ex) {
          db.rollbackTransaction();
          throw ex;
        }
      } finally {
        db.close();
      }
    }

    // Migration of disabled safebrowsing-phishing setting after pref renaming.
    if (currentUIVersion < 2) {
      try {
        if (!Services.prefs.getBoolPref("browser.safebrowsing.enabled")) {
          Services.prefs.setBoolPref("browser.safebrowsing.phishing.enabled", false);
          Services.prefs.clearUserPref("browser.safebrowsing.enabled");
        }
      } catch (ex) {}
    }

    // Pretend currentUIVersion 3 never happened (used in 2.57 for a time).

    // Remove obsolete download preferences set by user.
    if (currentUIVersion < 4) {
      try {
        if (Services.prefs.prefHasUserValue("browser.download.manager.showAlertOnComplete")) {
          Services.prefs.clearUserPref("browser.download.manager.showAlertOnComplete");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.showAlertInterval")) {
          Services.prefs.clearUserPref("browser.download.manager.showAlertInterval");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.retention")) {
          Services.prefs.clearUserPref("browser.download.manager.retention");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.quitBehavior")) {
          Services.prefs.clearUserPref("browser.download.manager.quitBehavior");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.scanWhenDone")) {
          Services.prefs.clearUserPref("browser.download.manager.scanWhenDone");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.showWhenStarting")) {
          Services.prefs.clearUserPref("browser.download.manager.showWhenStarting");
        }
        if (Services.prefs.prefHasUserValue("browser.download.manager.closeWhenDone")) {
          Services.prefs.clearUserPref("browser.download.manager.closeWhenDone");
        }
      } catch (ex) {}
    }

    if (currentUIVersion < 5) {
      // Delete obsolete ssl and strict transport security permissions.
      let perms = Services.perms.enumerator;
      while (perms.hasMoreElements()) {
        let perm = perms.getNext();
        if (perm.type == "falsestart-rc4" ||
            perm.type == "falsestart-rsa" ||
            perm.type == "sts/use" ||
            perm.type == "sts/subd") {
          Services.perms.removePermission(perm);
        }
      }
    }

    // Pretend currentUIVersion 6 and 7 never happened (used in 2.57 for a
    // time).

    // Migrate sanitizer options.
    if (currentUIVersion < 8) {
      const prefs = [ "history", "urlbar", "formdata", "passwords",
                      "downloads", "cookies", "cache", "sessions",
                      "offlineApps" ];

      for (let pref of prefs) {
        try {
          let prefOld = "privacy.item." + pref;

          // Migrate user value otherwise use default.
          // Only the names have changed but not the default values.
          if (Services.prefs.prefHasUserValue(prefOld)) {
            let prefCpd = "privacy.cpd." + pref;
            let prefShutdown = "privacy.clearOnShutdown." + pref;

            // If it has a value this should never fail.
            let oldValue = Services.prefs.getBoolPref(prefOld);
            Services.prefs.setBoolPref(prefCpd, oldValue);
            Services.prefs.setBoolPref(prefShutdown, oldValue);
            Services.prefs.clearUserPref(prefOld);
          }
        } catch (ex) {
          // Better safe than sorry.
          Cu.reportError(ex);
        }
      }

      // We might bring this back later but currently set to default.
      Services.prefs.clearUserPref("privacy.sanitize.promptOnSanitize");

      // As a precaution set to default if the user has enabled
      // clearing data on shutdown because there will no longer be
      // a possible prompt.
      Services.prefs.clearUserPref("privacy.sanitize.sanitizeOnShutdown");
    }

    // Migrate mail tab options.
    if (currentUIVersion < 9) {
      const tabPrefs = [ "autoHide", "opentabfor.doubleclick",
                         "opentabfor.middleclick" ];
      for (let pref of tabPrefs) {
        try {
          let prefBT = "browser.tabs." + pref;

          // Copy user value otherwise use default.
          if (Services.prefs.prefHasUserValue(prefBT)) {
            let prefMT = "mail.tabs." + pref;

            // If it has a value this should never fail.
            let valueBT = Services.prefs.getBoolPref(prefBT);
            Services.prefs.setBoolPref(prefMT, valueBT);
          }
        } catch (ex) {
          // Better safe than sorry.
          Cu.reportError(ex);
        }
      }

      // We might bring this back later but currently set to default.
      Services.prefs.clearUserPref("browser.tabs.opentabfor.doubleclick");
    }

    // Migrate the old requested locales prefs to use the new model
    if (currentUIVersion < 10) {
      const SELECTED_LOCALE_PREF = "general.useragent.locale";
      const MATCHOS_LOCALE_PREF = "intl.locale.matchOS";

      if (Services.prefs.prefHasUserValue(MATCHOS_LOCALE_PREF) ||
          Services.prefs.prefHasUserValue(SELECTED_LOCALE_PREF)) {
        if (Services.prefs.getBoolPref(MATCHOS_LOCALE_PREF, false)) {
          Services.locale.setRequestedLocales([]);
        } else {
          let locale = Services.prefs.getComplexValue(SELECTED_LOCALE_PREF,
            Ci.nsIPrefLocalizedString);
          if (locale) {
            try {
              Services.locale.setRequestedLocales([locale.data]);
            } catch (e) {
              /* Don't panic if the value is not a valid locale code. */
            }
          }
        }
        Services.prefs.clearUserPref(SELECTED_LOCALE_PREF);
        Services.prefs.clearUserPref(MATCHOS_LOCALE_PREF);
      }
    }

    // Update the migration version.
    Services.prefs.setIntPref("suite.migration.version", UI_VERSION);
  },

  /**
   * Determine if the UI has been upgraded for this 2.57 or later release.
   * If not reset or migrate some user configurations depending on the
   * migration level.
   * Only migration steps for 2.57 and higher are included in this function.
   * When the 2.53 branch is retired this function can be merged with
   * _migrateUI again.
   */
  _migrateUI2() {
    const UI_VERSION2 = 1;

    // If the pref is not set this is a new or pre SeaMonkey 2.57 profile.
    // We can't tell so we just run migration with version 0.
    let currentUIVersion2 =
      Services.prefs.getIntPref("suite.migration.version2", 0);

    if (currentUIVersion2 >= UI_VERSION2)
      return;

    // Run any migrations due prior to 2.57.
    if (currentUIVersion2 < 1) {
      // The XUL directory viewer is no longer provided.
      try {
        if (Services.prefs.getIntPref("network.dir.format") == 3) {
          Services.prefs.setIntPref("network.dir.format", 2);
        }
      } catch (ex) {}
    }

    // Update the migration version.
    Services.prefs.setIntPref("suite.migration.version2", UI_VERSION2);
  },

  // Copies additional profile files from the default profile tho the current profile.
  // Only files not covered by the regular profile creation process.
  // Currently only the userchrome examples.
  _copyDefaultProfileFiles: function()
  {
    // Copy default chrome example files if they do not exist in the current profile.
    var profileDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
    profileDir.append("chrome");

    // The chrome directory in the current/new profile already exists so no copying.
    if (profileDir.exists())
      return;

    let defaultProfileDir = Services.dirsvc.get("DefRt",
                                                Ci.nsIFile);
    defaultProfileDir.append("profile");
    defaultProfileDir.append("chrome");

    if (defaultProfileDir.exists() && defaultProfileDir.isDirectory()) {
      try {
        this._copyDir(defaultProfileDir, profileDir);
      } catch (e) {
        Cu.reportError(e);
      }
    }
  },

  // Simple copy function for copying complete aSource Directory to aDestiniation.
  _copyDir: function(aSource, aDestination)
  {
    let enumerator = aSource.directoryEntries;

    while (enumerator.hasMoreElements()) {
      let file = enumerator.nextFile;

      if (file.isDirectory()) {
        let subdir = aDestination.clone();
        subdir.append(file.leafName);

        // Create the target directory. If it already exists continue copying files.
        try {
          subdir.create(Ci.nsIFile.DIRECTORY_TYPE,
                        FileUtils.PERMS_DIRECTORY);
        } catch (ex) {
           if (ex.result != Cr.NS_ERROR_FILE_ALREADY_EXISTS)
            throw ex;
        }
        // Directory created. Now copy the files.
        this._copyDir(file, subdir);
      } else {
        try {
          file.copyTo(aDestination, null);
        } catch (e) {
          Cu.reportError(e);
        }
      }
    }
  },

  // Browser startup complete. All initial windows have opened.
  _onBrowserStartup: function(aWindow) {
    // For any add-ons that were installed disabled and can be enabled offer
    // them to the user.
    var browser = aWindow.getBrowser();
    var changedIDs = AddonManager.getStartupChanges(AddonManager.STARTUP_CHANGE_INSTALLED);
    if (changedIDs.length) {
      AddonManager.getAddonsByIDs(changedIDs, function(aAddons) {
        aAddons.forEach(function(aAddon) {
          // If the add-on isn't user disabled or can't be enabled then skip it.
          if (!aAddon.userDisabled || !(aAddon.permissions & AddonManager.PERM_CAN_ENABLE))
            return;

          browser.selectedTab = browser.addTab("about:newaddon?id=" + aAddon.id);
        })
      });
    }

    var notifyBox = browser.getNotificationBox();

    // Show about:rights notification, if needed.
    if (this._shouldShowRights())
      this._showRightsNotification(notifyBox);

    // Load the "more info" page for a locked places.sqlite
    // This property is set earlier by places-database-locked topic.
    if (this._isPlacesDatabaseLocked) {
      notifyBox.showPlacesLockedWarning();
    }

    // Detect if updates are off and warn for outdated builds.
    if (this._shouldShowUpdateWarning())
      notifyBox.showUpdateWarning();

    this._checkForDefaultClient(aWindow);
  },

  // First mail or browser window loaded.
  _onFirstWindowLoaded: function(aWindow) {
    AutoCompletePopup.init();
    DateTimePickerHelper.init();

    if ("@mozilla.org/windows-taskbar;1" in Cc &&
        Cc["@mozilla.org/windows-taskbar;1"]
          .getService(Ci.nsIWinTaskbar).available) {
      let temp = {};
      ChromeUtils.import("resource:///modules/WindowsJumpLists.jsm", temp);
      temp.WinTaskbarJumpList.startup();
    }

    // Initialize the download manager after the app starts so that
    // auto-resume downloads begin (such as after crashing or quitting with
    // active downloads) and speeds up the first-load of the download manager.
    // If the user manually opens the download manager before the init is
    // done, the downloads will start right away, and initializing again
    // won't hurt.
    // Afterwards init the taskbar and eventuall show the download progress if
    // on a supported platform.
    (async () => {
      DownloadsCommon.init();
    })().catch(ex => {
      Cu.reportError(ex);
    }).then(() => {
      ChromeUtils.import("resource:///modules/DownloadsTaskbar.jsm", {})
        .DownloadsTaskbar.registerIndicator(aWindow);
    });
  },

  /**
   * Application shutdown handler.
   */
  _onQuitApplicationGranted: function()
  {
    if (this._saveSession) {
      this._setPrefToSaveSession();
    }
    AutoCompletePopup.uninit();
    DateTimePickerHelper.uninit();
  },

  _promptForMasterPassword: function()
  {
    if (!Services.prefs.getBoolPref("signon.startup.prompt"))
      return;

    // Try to avoid the multiple master password prompts on startup scenario
    // by prompting for the master password upfront.
    let token = Cc["@mozilla.org/security/pk11tokendb;1"]
                  .getService(Ci.nsIPK11TokenDB)
                  .getInternalKeyToken();

    // Only log in to the internal token if it is already initialized,
    // otherwise we get a "Change Master Password" dialog.
    try {
      if (!token.needsUserInit)
        token.login(false);
    } catch (ex) {
      // If user cancels an exception is expected.
    }
  },

  // If new add-ons were installed during startup, open the add-ons manager.
  _checkForNewAddons: function()
  {
    const PREF_EM_NEW_ADDONS_LIST = "extensions.newAddons";

    if (!Services.prefs.prefHasUserValue(PREF_EM_NEW_ADDONS_LIST))
      return;

    const args = Cc["@mozilla.org/array;1"]
                   .createInstance(Ci.nsIMutableArray);
    let str = Cc["@mozilla.org/supports-string;1"]
                .createInstance(Ci.nsISupportsString);
    args.appendElement(str);
    str = Cc["@mozilla.org/supports-string;1"]
            .createInstance(Ci.nsISupportsString);
    str.data = Services.prefs.getCharPref(PREF_EM_NEW_ADDONS_LIST);
    args.appendElement(str);
    const EMURL = "chrome://mozapps/content/extensions/extensions.xul";
    // This window is the "first" to open.
    // 'alwaysRaised' makes sure it stays in the foreground (though unfocused)
    //   so it is noticed.
    const EMFEATURES = "all,dialog=no,alwaysRaised";
    Services.ww.openWindow(null, EMURL, "_blank", EMFEATURES, args);

    Services.prefs.clearUserPref(PREF_EM_NEW_ADDONS_LIST);
  },

  _onQuitRequest: function(aCancelQuit, aQuitType)
  {
    // If user has already dismissed quit request, then do nothing
    if ((aCancelQuit instanceof Ci.nsISupportsPRBool) && aCancelQuit.data)
      return;

    var windowcount = 0;
    var pagecount = 0;
    var browserEnum = Services.wm.getEnumerator("navigator:browser");
    while (browserEnum.hasMoreElements()) {
      // XXXbz should we skip closed windows here?
      windowcount++;

      var browser = browserEnum.getNext();
      var tabbrowser = browser.document.getElementById("content");
      if (tabbrowser)
        pagecount += tabbrowser.browsers.length;
    }

    this._saveSession = false;
    if (pagecount < 2)
      return;

    if (aQuitType != "restart" && aQuitType != "lastwindow")
      aQuitType = "quit";

    var showPrompt = true;
    try {
      // browser.warnOnQuit is a hidden global boolean to override all quit prompts
      // browser.warnOnRestart specifically covers app-initiated restarts where we restart the app
      // browser.tabs.warnOnClose is the global "warn when closing multiple tabs" pref
      if (Services.prefs.getIntPref("browser.startup.page") == 3 ||
          Services.prefs.getBoolPref("browser.sessionstore.resume_session_once") ||
          !Services.prefs.getBoolPref("browser.warnOnQuit"))
        showPrompt = false;
      else if (aQuitType == "restart")
        showPrompt = Services.prefs.getBoolPref("browser.warnOnRestart");
      else
        showPrompt = Services.prefs.getBoolPref("browser.tabs.warnOnClose");
    } catch (ex) {}

    if (showPrompt) {
      var quitBundle = Services.strings.createBundle("chrome://communicator/locale/quitDialog.properties");
      var brandBundle = Services.strings.createBundle("chrome://branding/locale/brand.properties");

      var appName = brandBundle.GetStringFromName("brandShortName");
      var quitDialogTitle = quitBundle.formatStringFromName(aQuitType + "DialogTitle",
                                                              [appName], 1);

      var message;
      if (aQuitType == "restart")
        message = quitBundle.formatStringFromName("messageRestart",
                                                  [appName], 1);
      else if (windowcount == 1)    /* close browser only, or quit application with only 1 browser window */
        message = quitBundle.formatStringFromName("messageNoWindows",
                                                  [appName], 1);
      else                          /* quit application with 2 or more windows */
        message = quitBundle.formatStringFromName("message",
                                                  [appName], 1);

      var flags = Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_0 +
                  Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_1 +
                  Services.prompt.BUTTON_POS_0_DEFAULT;

      var neverAsk = {value:false};
      var button0Title, button1Title, button2Title;
      var neverAskText = quitBundle.GetStringFromName("neverAsk");

      if (aQuitType == "restart") {
        button0Title = quitBundle.GetStringFromName("restartNowTitle");
        button1Title = quitBundle.GetStringFromName("restartLaterTitle");
      } else {
        flags += Services.prompt.BUTTON_TITLE_IS_STRING * Services.prompt.BUTTON_POS_2;
        button0Title = quitBundle.GetStringFromName(
                        (aQuitType == "quit" ? "saveTitle" : "savelastwindowTitle"));
        button1Title = quitBundle.GetStringFromName("cancelTitle");
        button2Title = quitBundle.GetStringFromName(aQuitType + "Title"); /* "quitTitle" or "lastwindowTitle" */
      }

      var mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      var buttonChoice = Services.prompt.confirmEx(mostRecentBrowserWindow, quitDialogTitle, message,
                                                   flags, button0Title, button1Title, button2Title,
                                                   neverAskText, neverAsk);

      switch (buttonChoice) {
      case 2:
        if (neverAsk.value)
          Services.prefs.setBoolPref("browser.tabs.warnOnClose", false);
        break;
      case 1:
        aCancelQuit.QueryInterface(Ci.nsISupportsPRBool);
        aCancelQuit.data = true;
        break;
      case 0:
        this._saveSession = true;
        if (neverAsk.value) {
          if (aQuitType == "restart")
            Services.prefs.setBoolPref("browser.warnOnRestart", false);
          else {
            // always save state when shutting down
            Services.prefs.setIntPref("browser.startup.page", 3);
          }
        }
        break;
      }
    }
  },

  /*
   * _shouldShowRights - Determines if the user should be shown the
   * about:rights notification. The notification should *not* be shown if
   * we've already shown the current version, or if the override pref says to
   * never show it. The notification *should* be shown if it's never been seen
   * before, if a newer version is available, or if the override pref says to
   * always show it.
   */
  _shouldShowRights: function () {
    // Look for an unconditional override pref. If set, do what it says.
    // (true --> never show, false --> always show)
    try {
      return !Services.prefs.getBoolPref("browser.rights.override");
    } catch (e) { }
    // Ditto, for the legacy EULA pref (tinderbox testing profile sets this).
    try {
      return !Services.prefs.getBoolPref("browser.EULA.override");
    } catch (e) { }

    // Look to see if the user has seen the current version or not.
    var currentVersion = Services.prefs.getIntPref("browser.rights.version");
    try {
      return !Services.prefs.getBoolPref("browser.rights." + currentVersion + ".shown");
    } catch (e) { }

    // We haven't shown the notification before, so do so now.
    return true;
  },

  _showRightsNotification: function(aNotifyBox) {
    // Stick the notification onto the selected tab of the active browser window.
    aNotifyBox.showRightsNotification();

    // Set pref to indicate we've shown the notficiation.
    var currentVersion = Services.prefs.getIntPref("browser.rights.version");
    Services.prefs.setBoolPref("browser.rights." + currentVersion + ".shown", true);
  },

  /*
   * _shouldShowUpdateWarning - Determines if the user should be warned about
   * having updates off and an old build that likely should be updated.
   */
  _shouldShowUpdateWarning: function () {
    // If the Updater is not available we don't show the warning.
    if (!AppConstants.MOZ_UPDATER) {
      return false;  
    }
    // Look for an unconditional override pref. If set, do what it says.
    // (true --> never show, false --> always show)
    try {
      return !Services.prefs.getBoolPref("app.updatecheck.override");
    } catch (e) { }
    // If updates are enabled, we don't need to worry.
    if (Services.prefs.getBoolPref("app.update.enabled"))
      return false;
    var maxAge = 90 * 86400; // 90 days
    var now = Math.round(Date.now() / 1000);
    // If there was an automated update tried in the interval, don't worry.
    const PREF_APP_UPDATE_LASTUPDATETIME = "app.update.lastUpdateTime.background-update-timer";
    var lastUpdateTime = Services.prefs.prefHasUserValue(PREF_APP_UPDATE_LASTUPDATETIME) ?
                         Services.prefs.getIntPref(PREF_APP_UPDATE_LASTUPDATETIME) : 0;
    if (lastUpdateTime + maxAge > now)
      return false;

    var buildID = Services.appinfo.appBuildID;
    // construct build date from ID
    var buildDate = new Date(buildID.substr(0, 4),
                             buildID.substr(4, 2) - 1,
                             buildID.substr(6, 2));
    var buildTime = Math.round(buildDate / 1000);
    // We should warn if the build is older than the max age.
    return (buildTime + maxAge <= now);
  },

  // This method gets the shell service and has it check its settings.
  // This will do nothing on platforms without a shell service.
  _checkForDefaultClient: function checkForDefaultClient(aWindow)
  {
    if (ShellService) try {
      var appTypes = ShellService.shouldBeDefaultClientFor;

      // Show the default client dialog only if we should check for the default
      // client and we aren't already the default for the stored app types in
      // shell.checkDefaultApps.
      if (appTypes && ShellService.shouldCheckDefaultClient &&
          !ShellService.isDefaultClient(true, appTypes)) {
        aWindow.openDialog("chrome://communicator/content/defaultClientDialog.xul",
                           "DefaultClient",
                           "modal,centerscreen,chrome,resizable=no");
      }
    } catch (e) {}
  },

  /**
   * Initialize Places
   * - imports the bookmarks html file if bookmarks database is empty, try to
   *   restore bookmarks from a JSON backup if the backend indicates that the
   *   database was corrupt.
   *
   * These prefs can be set up by the frontend:
   *
   * WARNING: setting these preferences to true will overwite existing bookmarks
   *
   * - browser.places.importBookmarksHTML
   *   Set to true will import the bookmarks.html file from the profile folder.
   * - browser.places.smartBookmarksVersion
   *   Set during HTML import to indicate that Smart Bookmarks were created.
   *   Set to -1 to disable Smart Bookmarks creation.
   *   Set to 0 to restore current Smart Bookmarks.
   * - browser.bookmarks.restore_default_bookmarks
   *   Set to true by safe-mode dialog to indicate we must restore default
   *   bookmarks.
   */
  _initPlaces: function BG__initPlaces(aInitialMigrationPerformed) {
    // We must instantiate the history service since it will tell us if we
    // need to import or restore bookmarks due to first-run, corruption or
    // forced migration (due to a major schema change).
    // If the database is corrupt or has been newly created we should
    // import bookmarks.
    let dbStatus = PlacesUtils.history.databaseStatus;

    // The places.sqlite database is locked. We show a notification box for
    // it in _onBrowserStartup.
    if (dbStatus == PlacesUtils.history.DATABASE_STATUS_LOCKED) {
      this._isPlacesDatabaseLocked = true;
      Services.console.logStringMessage("places.sqlite is locked");
      // Note: initPlaces should always happen when the first window is ready,
      // in any case, better safe than sorry.
      Services.obs.notifyObservers(null, "places-browser-init-complete");
      return;
    }

    let importBookmarks = !aInitialMigrationPerformed &&
                          (dbStatus == PlacesUtils.history.DATABASE_STATUS_CREATE ||
                           dbStatus == PlacesUtils.history.DATABASE_STATUS_CORRUPT);

    // Check if user or an extension has required to import bookmarks.html.
    let importBookmarksHTML = false;
    try {
      importBookmarksHTML =
        Services.prefs.getBoolPref("browser.places.importBookmarksHTML");
      if (importBookmarksHTML)
        importBookmarks = true;
    } catch (ex) {}

    // Support legacy bookmarks.html format for apps that depend on that format.
    // Default if the pref does not exists is 'Do not export'.
    let autoExportHTML = Services.prefs.getBoolPref("browser.bookmarks.autoExportHTML", false);

    if (autoExportHTML) {
      // Sqlite.jsm and Places shutdown happen at profile-before-change, thus,
      // to be on the safe side, this should run earlier.
      AsyncShutdown.profileChangeTeardown.addBlocker(
        "Places: export bookmarks.html",
        () => BookmarkHTMLUtils.exportToFile(Services.dirsvc.get("BMarks",
                                                                 Ci.nsIFile).path));
    }

    (async () => {
      // Check if Safe Mode or the user has required to restore bookmarks from
      // default profile's bookmarks.html.
      let restoreDefaultBookmarks = false;
      try {
        restoreDefaultBookmarks =
          Services.prefs.getBoolPref("browser.bookmarks.restore_default_bookmarks");
        if (restoreDefaultBookmarks) {
          // Ensure that we already have a bookmarks backup for today.
          await this._backupBookmarks();
          importBookmarks = true;
        }
      } catch (ex) {}

      // This may be reused later, check for "=== undefined" to see if it has
      // been populated already.
      let lastBackupFile;

      // If the user did not require to restore default bookmarks, or import
      // from bookmarks.html, we will try to restore from JSON.
      if (importBookmarks && !restoreDefaultBookmarks && !importBookmarksHTML) {
        // Get latest JSON backup.
        lastBackupFile = await PlacesBackups.getMostRecentBackup();
        if (lastBackupFile) {
          // Restore from JSON backup.
          await BookmarkJSONUtils.importFromFile(lastBackupFile, true);
          importBookmarks = false;
        } else {
          // We have created a new database but we don't have any backup available.
          importBookmarks = true;
          let bookmarksHTMLFile = Services.dirsvc.get("BMarks", Ci.nsIFile);
          if (bookmarksHTMLFile.exists(bookmarksHTMLFile)) {
            // If bookmarks.html is available in current profile import it...
            importBookmarksHTML = true;
          } else {
            // ...otherwise we will restore defaults.
            restoreDefaultBookmarks = true;
          }
        }
      }

      // If bookmarks are not imported, then initialize smart bookmarks.  This
      // happens during a common startup.
      // Otherwise, if any kind of import runs, smart bookmarks creation should
      // be delayed till the import operations has finished. Not doing so would
      // cause them to be overwritten by the newly imported bookmarks.
      if (!importBookmarks) {
        try {
          await this.ensurePlacesDefaultQueriesInitialized();
        } catch (e) {
          Cu.reportError(e);
        }
      } else {
        // An import operation is about to run.
        // Don't try to recreate smart bookmarks if autoExportHTML is true or
        // smart bookmarks are disabled.
        let smartBookmarksVersion = Services.prefs.getIntPref("browser.places.smartBookmarksVersion", 0);
        if (!autoExportHTML && smartBookmarksVersion != -1)
          Services.prefs.setIntPref("browser.places.smartBookmarksVersion", 0);

        let bookmarksURI = null;
        if (restoreDefaultBookmarks) {
          // User wants to restore bookmarks.html file from default profile folder
          bookmarksURI = Services.io.newURI("resource:///defaults/profile/bookmarks.html");
        } else {
          let bookmarksFile = Services.dirsvc.get("BMarks", Ci.nsIFile);
          if (bookmarksFile.exists(bookmarksFile)) {
            bookmarksURI = Services.io.newFileURI(bookmarksFile);
          }
        }

        if (bookmarksURI) {
          // Import from bookmarks.html file.
          try {
            await BookmarkHTMLUtils.importFromURL(bookmarksURI.spec, true);
          } catch (e) {
            Cu.reportError("Bookmarks.html file could be corrupt. " + e);
          }
          try {
            // Ensure that smart bookmarks are created once the operation is
            // complete.
            await this.ensurePlacesDefaultQueriesInitialized();
          } catch (e) {
            Cu.reportError(e);
          }
        } else {
          Cu.reportError(new Error("Unable to find bookmarks.html file."));
        }

        // Reset preferences, so we won't try to import again at next run
        if (importBookmarksHTML)
          Services.prefs.setBoolPref("browser.places.importBookmarksHTML", false);
        if (restoreDefaultBookmarks)
          Services.prefs.setBoolPref("browser.bookmarks.restore_default_bookmarks",
                                     false);
      }

      AsyncShutdown.quitApplicationGranted.addBlocker(
        "Places: export bookmarks at dawn",
        () => this._backupBookmarks());

      // Initialize bookmark archiving on idle.
      if (!this._isIdleObserver) {
        this._idleService.addIdleObserver(this, BOOKMARKS_BACKUP_IDLE_TIME_SEC);
        this._isIdleObserver = true;
      }

    })().catch(ex => {
      Cu.reportError(ex);
    }).then(() => {
      // NB: deliberately after the catch so that we always do this, even if
      // we threw halfway through initializing in the Task above.
      Services.obs.notifyObservers(null, "places-browser-init-complete");
    });
  },

  /**
   * If a backup for today doesn't exist, this creates one.
   */
  _backupBookmarks: function BG__backupBookmarks() {
    return (async function() {
      let lastBackupFile = await PlacesBackups.getMostRecentBackup();
      // Should backup bookmarks if there are no backups or the maximum
      // interval between backups elapsed.
      if (!lastBackupFile ||
          new Date() - PlacesBackups.getDateForFile(lastBackupFile) > BOOKMARKS_BACKUP_MIN_INTERVAL_DAYS * 86400000) {
        let maxBackups = Services.prefs.getIntPref("browser.bookmarks.max_backups");
        await PlacesBackups.create(maxBackups);
      }
    })();
  },

  _updatePrefs: function()
  {
    // Make sure that the doNotTrack value conforms to the conversion from
    // three-state to two-state. (This reverts a setting of "please track me"
    // to the default "don't say anything").
    try {
      if (Services.prefs.getIntPref("privacy.donottrackheader.value") != 1) {
        Services.prefs.clearUserPref("privacy.donottrackheader.enabled");
        Services.prefs.clearUserPref("privacy.donottrackheader.value");
      }
    } catch (ex) {}

    // Migration of document-color preference which changed from boolean to
    // tri-state; 0=always but not accessibility themes, 1=always, 2=never
    try {
      if (!Services.prefs.getBoolPref("browser.display.use_document_colors")) {
        Services.prefs.setIntPref("browser.display.document_color_use", 2);
        Services.prefs.clearUserPref("browser.display.use_document_colors");
      }
    } catch (ex) {}

    // Try to get dictionary preference and adjust if not valid.
    var prefName = "spellchecker.dictionary";
    var prefValue = Services.prefs.getCharPref(prefName);

    // replace underscore with dash if found in language
    if (/_/.test(prefValue)) {
      prefValue = prefValue.replace(/_/g, "-");
      Services.prefs.setCharPref(prefName, prefValue);
    }

    var spellChecker = Cc["@mozilla.org/spellchecker/engine;1"]
                         .getService(Ci.mozISpellCheckingEngine);
    var dictList = spellChecker.getDictionaryList();
    // If the preference contains an invalid dictionary, set it to a valid
    // dictionary, any dictionary will do.
    if (dictList.length && !dictList.includes(prefValue))
      Services.prefs.setCharPref(prefName, dictList[0]);
  },

  _migrateDownloadPrefs: function()
  {
    // Migration of download-manager preferences
    if (Services.prefs.getPrefType("browser.download.dir") == Services.prefs.PREF_INVALID ||
        Services.prefs.getPrefType("browser.download.lastDir") != Services.prefs.PREF_INVALID)
      return; //Do nothing if .dir does not exist, or if it exists and lastDir does not

    try {
      Services.prefs.setComplexValue("browser.download.lastDir",
                                     Ci.nsIFile,
                                     Services.prefs.getComplexValue("browser.download.dir",
                                                                    Ci.nsIFile));
    } catch (ex) {
      // Ensure that even if we don't end up migrating to a lastDir that we
      // don't attempt another update. This will throw when QI'ed to
      // nsIFile, but it does fallback gracefully.
      Services.prefs.setCharPref("browser.download.lastDir", "");
    }

    try {
      Services.prefs.setBoolPref("browser.download.useDownloadDir",
                                 Services.prefs.getBoolPref("browser.download.autoDownload"));
    } catch (ex) {}

    try {
      Services.prefs.setIntPref("browser.download.manager.behavior",
                                Services.prefs.getIntPref("browser.downloadmanager.behavior"));
    } catch (ex) {}

    try {
      Services.prefs.setBoolPref("browser.download.progress.closeWhenDone",
                                 !Services.prefs.getBoolPref("browser.download.progressDnldDialog.keepAlive"));
    } catch (ex) {}
  },

  /**
   * Devtools Debugger
   */
  get dbgIsEnabled()
  {
    return Services.prefs.getBoolPref(DEBUGGER_REMOTE_ENABLED);
  },

  dbgStart: function()
  {
    var port = Services.prefs.getIntPref(DEBUGGER_REMOTE_PORT);

    // Make sure chrome debugging is enabled, no sense in starting otherwise.
    DebuggerServer.allowChromeProcess = true;

    if (!DebuggerServer.initialized) {
      DebuggerServer.init();
      DebuggerServer.addBrowserActors();
    }
    try {
      let listener = DebuggerServer.createListener();
      listener.portOrPath = port;

      // Expose this listener via wifi discovery, if enabled.
      if (Services.prefs.getBoolPref(DEBUGGER_WIFI_VISIBLE) &&
          !Services.prefs.getBoolPref(DEBUGGER_FORCE_LOCAL)) {
        listener.discoverable = true;
      }

      listener.open();
    } catch(e) {}
  },

  dbgStop: function()
  {
    if (DebuggerServer.initialized)
      DebuggerServer.closeAllListeners();
  },

  dbgRestart: function()
  {
    this.dbgStop();
    this.dbgStart();
  },

  // ------------------------------
  // public nsISuiteGlue members
  // ------------------------------

  showDownloadManager: function(newDownload)
  {
    if (!gDownloadManager) {
      // Use an empty arguments string or the download manager window
      // will miss the toolbar and other features.
      var argString = Cc["@mozilla.org/supports-string;1"]
                        .createInstance(Ci.nsISupportsString);
      argString.data = "";
      gDownloadManager = Services.ww.openWindow(null, DOWNLOAD_MANAGER_URL,
                                                null,
                                                "all,dialog=no,non-private",
                                                argString);
      gDownloadManager.addEventListener("load", function() {
        gDownloadManager.addEventListener("unload", function() {
          gDownloadManager = null;
        });
        // Attach the taskbar progress meter to the download manager window.
        ChromeUtils.import("resource:///modules/DownloadsTaskbar.jsm", {})
                   .DownloadsTaskbar.attachIndicator(gDownloadManager);
      });
    } else if (!newDownload ||
               Services.prefs.getBoolPref(PREF_FOCUS_WHEN_STARTING)) {
        gDownloadManager.focus();
    } else {
      // This preference may not be set, so defaulting to two.
      var flashCount = 2;
      try {
        flashCount = Services.prefs.getIntPref(PREF_FLASH_COUNT);
      } catch (e) { }
      gDownloadManager.getAttentionWithCycleCount(flashCount);
    }
  },

  sanitize(aParentWindow) {
    Sanitizer.showUI(aParentWindow);
  },

  async ensurePlacesDefaultQueriesInitialized() {
    // This is the current smart bookmarks version, it must be increased every
    // time they change.
    // When adding a new smart bookmark below, its newInVersion property must
    // be set to the version it has been added in.  We will compare its value
    // to users' smartBookmarksVersion and add new smart bookmarks without
    // recreating old deleted ones.
    const SMART_BOOKMARKS_VERSION = 7;
    const SMART_BOOKMARKS_ANNO = "Places/SmartBookmark";
    const SMART_BOOKMARKS_PREF = "browser.places.smartBookmarksVersion";

    // TODO bug 399268: should this be a pref?
    const MAX_RESULTS = 10;

    // Get current smart bookmarks version.  If not set, create them.
    let smartBookmarksCurrentVersion = Services.prefs.getIntPref(SMART_BOOKMARKS_PREF, 0);

    // If version is current, or smart bookmarks are disabled, bail out.
    if (smartBookmarksCurrentVersion == -1 ||
        smartBookmarksCurrentVersion >= SMART_BOOKMARKS_VERSION) {
      return;
    }

    try {
      let menuIndex = 0;
      let toolbarIndex = 0;
      let bundle = Services.strings.createBundle("chrome://communicator/locale/places/places.properties");
      let queryOptions = Ci.nsINavHistoryQueryOptions;

      let smartBookmarks = {
        MostVisited: {
          title: bundle.GetStringFromName("mostVisitedTitle"),
          url: "place:sort=" + queryOptions.SORT_BY_VISITCOUNT_DESCENDING +
               "&maxResults=" + MAX_RESULTS,
          parentGuid: PlacesUtils.bookmarks.toolbarGuid,
          newInVersion: 1
        },
        RecentlyBookmarked: {
          title: bundle.GetStringFromName("recentlyBookmarkedTitle"),
          url: "place:folder=BOOKMARKS_MENU" + "&folder=UNFILED_BOOKMARKS" +
               "&folder=TOOLBAR" +
               "&queryType=" + queryOptions.QUERY_TYPE_BOOKMARKS +
               "&sort=" + queryOptions.SORT_BY_DATEADDED_DESCENDING +
               "&maxResults=" + MAX_RESULTS +
               "&excludeQueries=1",
          parentGuid: PlacesUtils.bookmarks.menuGuid,
          newInVersion: 1
        },
        RecentTags: {
          title: bundle.GetStringFromName("recentTagsTitle"),
          url: "place:type=" + queryOptions.RESULTS_AS_TAG_QUERY +
               "&sort=" + queryOptions.SORT_BY_LASTMODIFIED_DESCENDING +
               "&maxResults=" + MAX_RESULTS,
          parentGuid: PlacesUtils.bookmarks.menuGuid,
          newInVersion: 1
        },
      };

      // Set current guid, parentGuid and index of existing Smart Bookmarks.
      // We will use those to create a new version of the bookmark at the same
      // position.
      let smartBookmarkItemIds = PlacesUtils.annotations.getItemsWithAnnotation(SMART_BOOKMARKS_ANNO);
      for (let itemId of smartBookmarkItemIds) {
        let queryId = PlacesUtils.annotations.getItemAnnotation(itemId, SMART_BOOKMARKS_ANNO);
        if (queryId in smartBookmarks) {
          // Known smart bookmark.
          let smartBookmark = smartBookmarks[queryId];
          smartBookmark.guid = await PlacesUtils.promiseItemGuid(itemId);

          if (!smartBookmark.url) {
            await PlacesUtils.bookmarks.remove(smartBookmark.guid);
            continue;
          }

          let bm = await PlacesUtils.bookmarks.fetch(smartBookmark.guid);
          smartBookmark.parentGuid = bm.parentGuid;
          smartBookmark.index = bm.index;
        } else {
          // We don't remove old Smart Bookmarks because user could still
          // find them useful, or could have personalized them.
          // Instead we remove the Smart Bookmark annotation.
          PlacesUtils.annotations.removeItemAnnotation(itemId, SMART_BOOKMARKS_ANNO);
        }
      }

      for (let queryId of Object.keys(smartBookmarks)) {
        let smartBookmark = smartBookmarks[queryId];

        // We update or create only changed or new smart bookmarks.
        // Also we respect user choices, so we won't try to create a smart
        // bookmark if it has been removed.
        if (smartBookmarksCurrentVersion > 0 &&
            smartBookmark.newInVersion <= smartBookmarksCurrentVersion &&
            !smartBookmark.guid || !smartBookmark.url)
          continue;

        // Remove old version of the smart bookmark if it exists, since it
        // will be replaced in place.
        if (smartBookmark.guid) {
          await PlacesUtils.bookmarks.remove(smartBookmark.guid);
        }

        // Create the new smart bookmark and store its updated guid.
        if (!("index" in smartBookmark)) {
          if (smartBookmark.parentGuid == PlacesUtils.bookmarks.toolbarGuid)
            smartBookmark.index = toolbarIndex++;
          else if (smartBookmark.parentGuid == PlacesUtils.bookmarks.menuGuid)
            smartBookmark.index = menuIndex++;
        }
        smartBookmark = await PlacesUtils.bookmarks.insert(smartBookmark);
        let itemId = await PlacesUtils.promiseItemId(smartBookmark.guid);
        PlacesUtils.annotations.setItemAnnotation(itemId,
                                                  SMART_BOOKMARKS_ANNO,
                                                  queryId, 0,
                                                  PlacesUtils.annotations.EXPIRE_NEVER);
      }

      // If we are creating all Smart Bookmarks from ground up, add a
      // separator below them in the bookmarks menu.
      if (smartBookmarksCurrentVersion == 0 &&
          smartBookmarkItemIds.length == 0) {
        let bm = await PlacesUtils.bookmarks.fetch({ parentGuid: PlacesUtils.bookmarks.menuGuid,
                                                     index: menuIndex });
        // Don't add a separator if the menu was empty or there is one already.
        if (bm && bm.type != PlacesUtils.bookmarks.TYPE_SEPARATOR) {
          await PlacesUtils.bookmarks.insert({ type: PlacesUtils.bookmarks.TYPE_SEPARATOR,
                                               parentGuid: PlacesUtils.bookmarks.menuGuid,
                                               index: menuIndex });
        }
      }
    } catch (ex) {
      Cu.reportError(ex);
    } finally {
      Services.prefs.setIntPref(SMART_BOOKMARKS_PREF, SMART_BOOKMARKS_VERSION);
      Services.prefs.savePrefFile(null);
    }
  },

  /**
   * Called as an observer when Sync's "display URI" notification is fired.
   */
  _onDisplaySyncURI: function _onDisplaySyncURI(data) {
    try {
      var url = data.wrappedJSObject.object.uri;
      var mostRecentBrowserWindow = Services.wm.getMostRecentWindow("navigator:browser");
      if (mostRecentBrowserWindow) {
        mostRecentBrowserWindow.getBrowser().addTab(url, { focusNewTab: true });
        mostRecentBrowserWindow.content.focus();
      } else {
        var args = Cc["@mozilla.org/supports-string;1"]
                     .createInstance(Ci.nsISupportsString);
        args.data = url;
        var chromeURL = Services.prefs.getCharPref("browser.chromeURL");
        Services.ww.openWindow(null, chromeURL, "_blank", "chrome,all,dialog=no", args);
      }
    } catch (e) {
      Cu.reportError("Error displaying tab received by Sync: " + e);
    }
  },

  // for XPCOM
  classID: Components.ID("{bbbbe845-5a1b-40ee-813c-f84b8faaa07c}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                         Ci.nsIWebProgressListener,
                                         Ci.nsISupportsWeakReference,
                                         Ci.nsISuiteGlue])

}

/**
 * ContentPermissionIntegration is responsible for showing the user
 * simple permission prompts when content requests additional
 * capabilities.
 *
 * While there are some built-in permission prompts, createPermissionPrompt
 * can also be overridden by system add-ons or tests to provide new ones.
 *
 * This override ability is provided by Integration.jsm. See
 * PermissionUI.jsm for an example of how to provide a new prompt
 * from an add-on.
 */
var ContentPermissionIntegration = {
  /**
   * Creates a PermissionPrompt for a given permission type and
   * nsIContentPermissionRequest.
   *
   * @param {string} type
   *        The type of the permission request from content. This normally
   *        matches the "type" field of an nsIContentPermissionType, but it
   *        can be something else if the permission does not use the
   *        nsIContentPermissionRequest model. Note that this type might also
   *        be different from the permission key used in the permissions
   *        database.
   *        Example: "geolocation"
   * @param {nsIContentPermissionRequest} request
   *        The request for a permission from content.
   * @return {PermissionPrompt} (see PermissionUI.jsm),
   *         or undefined if the type cannot be handled.
   */
  createPermissionPrompt(type, request) {
    switch (type) {
      case "geolocation": {
        return new PermissionUI.GeolocationPermissionPrompt(request);
      }
      case "desktop-notification": {
        return new PermissionUI.DesktopNotificationPermissionPrompt(request);
      }
      case "persistent-storage": {
        return new PermissionUI.PersistentStoragePermissionPrompt(request);
      }
    }
    return undefined;
  },
};

function ContentPermissionPrompt() {}

ContentPermissionPrompt.prototype = {
  classID: Components.ID("{9d4c845d-3f09-402a-b66d-50f291d7d50f}"),

  QueryInterface: XPCOMUtils.generateQI([Ci.nsIContentPermissionPrompt]),

  /**
   * This implementation of nsIContentPermissionPrompt.prompt ensures
   * that there's only one nsIContentPermissionType in the request,
   * and that it's of type nsIContentPermissionType. Failing to
   * satisfy either of these conditions will result in this method
   * throwing NS_ERRORs. If the combined ContentPermissionIntegration
   * cannot construct a prompt for this particular request, an
   * NS_ERROR_FAILURE will be thrown.
   *
   * Any time an error is thrown, the nsIContentPermissionRequest is
   * cancelled automatically.
   *
   * @param {nsIContentPermissionRequest} request
   *        The request that we're to show a prompt for.
   */
  prompt(request) {
    try {
      // Only allow exactly one permission request here.
      let types = request.types.QueryInterface(Ci.nsIArray);
      if (types.length != 1) {
        throw Components.Exception(
          "Expected an nsIContentPermissionRequest with only 1 type.",
          Cr.NS_ERROR_UNEXPECTED);
      }

      let type = types.queryElementAt(0, Ci.nsIContentPermissionType).type;
      let combinedIntegration =
        Integration.contentPermission.getCombined(ContentPermissionIntegration);

      let permissionPrompt =
        combinedIntegration.createPermissionPrompt(type, request);
      if (!permissionPrompt) {
        throw Components.Exception(
          "Failed to handle permission of type ${type}",
          Cr.NS_ERROR_FAILURE);
      }

      permissionPrompt.prompt();
    } catch (ex) {
      Cu.reportError(ex);
      request.cancel();
      throw ex;
    }
  },
};

//module initialization
var NSGetFactory = XPCOMUtils.generateNSGetFactory([SuiteGlue, ContentPermissionPrompt]);
