/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MailGlue"];

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  AppConstants: "resource://gre/modules/AppConstants.jsm",
  TBDistCustomizer: "resource:///modules/TBDistCustomizer.jsm",
  MailMigrator: "resource:///modules/MailMigrator.jsm",
  LightweightThemeConsumer:
    "resource://gre/modules/LightweightThemeConsumer.jsm",
  RemoteSecuritySettings:
    "resource://gre/modules/psm/RemoteSecuritySettings.jsm",
  PdfJs: "resource://pdf.js/PdfJs.jsm",
});

// lazy module getter

XPCOMUtils.defineLazyGetter(this, "gMailBundle", function() {
  return Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
});

ChromeUtils.defineModuleGetter(
  this,
  "ActorManagerParent",
  "resource://gre/modules/ActorManagerParent.jsm"
);

const PREF_PDFJS_ISDEFAULT_CACHE_STATE = "pdfjs.enabledCache.state";

let JSWINDOWACTORS = {
  Pdfjs: {
    parent: {
      moduleURI: "resource://pdf.js/PdfjsParent.jsm",
    },
    child: {
      moduleURI: "resource://pdf.js/PdfjsChild.jsm",
    },
    enablePreference: PREF_PDFJS_ISDEFAULT_CACHE_STATE,
    allFrames: true,
  },

  Prompt: {
    parent: {
      moduleURI: "resource:///actors/PromptParent.jsm",
    },
    includeChrome: true,
    allFrames: true,
  },

  VCard: {
    parent: {
      moduleURI: "resource:///actors/VCardParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/VCardChild.jsm",
      events: {
        click: {},
      },
    },
    allFrames: true,
  },
};

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  ExtensionSupport: "resource:///modules/ExtensionSupport.jsm",
});

/**
 * Glue code that should be executed before any windows are opened. Any
 * window-independent helper methods (a la nsBrowserGlue.js) should go in
 * MailUtils.jsm instead.
 */

function MailGlue() {
  this._init();
}

MailGlue.prototype = {
  _isNewProfile: undefined,

  // init (called at app startup)
  _init() {
    // Check if this process is the developer toolbox process, and if it is,
    // avoid starting up as much as possible.
    const envService = Cc["@mozilla.org/process/environment;1"].getService(
      Ci.nsIEnvironment
    );
    if (envService.get("MOZ_BROWSER_TOOLBOX_PORT")) {
      return;
    }

    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "intl:app-locales-changed");
    Services.obs.addObserver(this, "mail-startup-done");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "chrome-document-global-created");
    Services.obs.addObserver(this, "document-element-inserted");
    Services.obs.addObserver(this, "handlersvc-store-initialized");

    // Inject scripts into some devtools windows.
    function _setupBrowserConsole(domWindow) {
      // Browser Console is an XHTML document.
      domWindow.document.title = gMailBundle.GetStringFromName(
        "errorConsoleTitle"
      );
      Services.scriptloader.loadSubScript(
        "chrome://global/content/viewSourceUtils.js",
        domWindow
      );
    }

    ExtensionSupport.registerWindowListener(
      "Thunderbird-internal-BrowserConsole",
      {
        chromeURLs: ["chrome://devtools/content/webconsole/index.html"],
        onLoadWindow: _setupBrowserConsole,
      }
    );

    function _setupToolbox(domWindow) {
      // Defines openUILinkIn and openWebLinkIn
      Services.scriptloader.loadSubScript(
        "chrome://communicator/content/contentAreaClick.js",
        domWindow
      );
    }

    ExtensionSupport.registerWindowListener("Thunderbird-internal-Toolbox", {
      chromeURLs: [
        "chrome://devtools/content/framework/toolbox-process-window.xhtml",
      ],
      onLoadWindow: _setupToolbox,
    });

    ActorManagerParent.addJSWindowActors(JSWINDOWACTORS);
    ActorManagerParent.flush();
  },

  // cleanup (called at shutdown)
  _dispose() {
    Services.obs.removeObserver(this, "xpcom-shutdown");
    Services.obs.removeObserver(this, "final-ui-startup");
    Services.obs.removeObserver(this, "intl:app-locales-changed");
    Services.obs.removeObserver(this, "handle-xul-text-link");
    Services.obs.removeObserver(this, "chrome-document-global-created");
    Services.obs.removeObserver(this, "document-element-inserted");
    Services.obs.removeObserver(this, "handlersvc-store-initialized");

    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-Toolbox");
    ExtensionSupport.unregisterWindowListener(
      "Thunderbird-internal-BrowserConsole"
    );
  },

  // nsIObserver implementation
  observe(aSubject, aTopic, aData) {
    let fs;
    switch (aTopic) {
      case "app-startup":
        // Record the previously started version. This is used to check for
        // extensions that were disabled by an application update. We need to
        // read this pref before the Add-Ons Manager changes it.
        this.previousVersion = Services.prefs.getCharPref(
          "extensions.lastAppVersion",
          "0"
        );
        break;
      case "xpcom-shutdown":
        this._dispose();
        break;
      case "intl:app-locales-changed":
        fs = Cc["@mozilla.org/msgFolder/msgFolderService;1"].getService(
          Ci.nsIMsgFolderService
        );
        fs.initializeFolderStrings();
        break;
      case "final-ui-startup":
        fs = Cc["@mozilla.org/msgFolder/msgFolderService;1"].getService(
          Ci.nsIMsgFolderService
        );
        fs.initializeFolderStrings();
        this._onProfileStartup();
        break;
      case "mail-startup-done":
        this._onFirstWindowLoaded();
        Services.obs.removeObserver(this, "mail-startup-done");
        break;
      case "handle-xul-text-link":
        this._handleLink(aSubject, aData);
        break;
      case "chrome-document-global-created":
        // Set up lwt, but only if the "lightweightthemes" attr is set on the root
        // (i.e. in messenger.xhtml).
        aSubject.addEventListener(
          "DOMContentLoaded",
          () => {
            if (
              aSubject.document.documentElement.hasAttribute(
                "lightweightthemes"
              )
            ) {
              new LightweightThemeConsumer(aSubject.document);
            }
          },
          { once: true }
        );
        break;
      case "document-element-inserted":
        let doc = aSubject;
        if (
          doc.nodePrincipal.isSystemPrincipal &&
          (doc.contentType == "application/xhtml+xml" ||
            doc.contentType == "text/html") &&
          // People shouldn't be using our built-in custom elements in
          // system-principal about:blank anyway, and trying to support that
          // causes responsiveness regressions.  So let's not support it.
          doc.URL != "about:blank"
        ) {
          Services.scriptloader.loadSubScript(
            "chrome://messenger/content/customElements.js",
            doc.ownerGlobal
          );
        }
        break;
      case "handlersvc-store-initialized": {
        // Initialize PdfJs when running in-process and remote. This only
        // happens once since PdfJs registers global hooks. If the PdfJs
        // extension is installed the init method below will be overridden
        // leaving initialization to the extension.
        // parent only: configure default prefs, set up pref observers, register
        // pdf content handler, and initializes parent side message manager
        // shim for privileged api access.
        PdfJs.init(this._isNewProfile);
        break;
      }
    }
  },

  _onProfileStartup() {
    TBDistCustomizer.applyPrefDefaults();

    const UI_VERSION_PREF = "mail.ui-rdf.version";
    this._isNewProfile = !Services.prefs.prefHasUserValue(UI_VERSION_PREF);

    // handle any migration work that has to happen at profile startup
    MailMigrator.migrateAtProfileStartup();

    if (!Services.prefs.prefHasUserValue(PREF_PDFJS_ISDEFAULT_CACHE_STATE)) {
      PdfJs.checkIsDefault(this._isNewProfile);
    }

    // check if we're in safe mode
    if (Services.appinfo.inSafeMode) {
      Services.ww.openWindow(
        null,
        "chrome://messenger/content/safeMode.xhtml",
        "_blank",
        "chrome,centerscreen,modal,resizable=no",
        null
      );
    }

    AddonManager.maybeInstallBuiltinAddon(
      "thunderbird-compact-light@mozilla.org",
      "1.0",
      "resource:///modules/themes/light/"
    );
    AddonManager.maybeInstallBuiltinAddon(
      "thunderbird-compact-dark@mozilla.org",
      "1.0",
      "resource:///modules/themes/dark/"
    );

    if (AppConstants.MOZ_UPDATER) {
      const { AppUpdateUI } = ChromeUtils.import(
        "resource:///modules/AppUpdateUI.jsm"
      );
      AppUpdateUI.init();
    }
  },

  _onFirstWindowLoaded() {
    // On Windows 7 and above, initialize the jump list module.
    const WINTASKBAR_CONTRACTID = "@mozilla.org/windows-taskbar;1";
    if (
      WINTASKBAR_CONTRACTID in Cc &&
      Cc[WINTASKBAR_CONTRACTID].getService(Ci.nsIWinTaskbar).available
    ) {
      const { WinTaskbarJumpList } = ChromeUtils.import(
        "resource:///modules/WindowsJumpLists.jsm"
      );
      WinTaskbarJumpList.startup();
    }

    const { ExtensionsUI } = ChromeUtils.import(
      "resource:///modules/ExtensionsUI.jsm"
    );
    ExtensionsUI.init();

    // If the application has been updated, look for any extensions that may
    // have been disabled by the update, and check for newer versions of those
    // extensions.
    let currentVersion = Services.appinfo.version;
    if (this.previousVersion != "0" && this.previousVersion != currentVersion) {
      let { AddonManager } = ChromeUtils.import(
        "resource://gre/modules/AddonManager.jsm"
      );
      let startupChanges = AddonManager.getStartupChanges(
        AddonManager.STARTUP_CHANGE_DISABLED
      );
      if (startupChanges.length > 0) {
        let { XPIDatabase } = ChromeUtils.import(
          "resource://gre/modules/addons/XPIDatabase.jsm"
        );
        let addons = XPIDatabase.getAddons();
        for (let addon of addons) {
          if (
            startupChanges.includes(addon.id) &&
            addon.permissions() & AddonManager.PERM_CAN_UPGRADE &&
            !addon.isCompatible
          ) {
            AddonManager.getAddonByID(addon.id).then(addon => {
              addon.findUpdates(
                {
                  onUpdateFinished() {},
                  onUpdateAvailable(addon, install) {
                    install.install();
                  },
                },
                AddonManager.UPDATE_WHEN_NEW_APP_INSTALLED
              );
            });
          }
        }
      }
    }

    MailMigrator.migrateAtStartupDone();

    // Certificates revocation list, etc.
    Services.tm.idleDispatchToMainThread(() => {
      RemoteSecuritySettings.init();
    });

    // TODO: Kick off startup idle tasks here, handle this after the tasks are
    // complete.
    ChromeUtils.idleDispatch(() => {
      Services.obs.notifyObservers(null, "mail-startup-idle-tasks-finished");
      Services.obs.notifyObservers(null, "marionette-startup-requested");
    });
  },

  _handleLink(aSubject, aData) {
    let linkHandled = aSubject.QueryInterface(Ci.nsISupportsPRBool);
    if (!linkHandled.data) {
      let win = Services.wm.getMostRecentWindow("mail:3pane");
      aData = JSON.parse(aData);
      let tabParams = { contentPage: aData.href, clickHandler: null };
      if (win) {
        let tabmail = win.document.getElementById("tabmail");
        if (tabmail) {
          tabmail.openTab("contentTab", tabParams);
          win.focus();
          linkHandled.data = true;
          return;
        }
      }

      // If we didn't have an open 3 pane window, try and open one.
      Services.ww.openWindow(
        null,
        "chrome://messenger/content/messenger.xhtml",
        "_blank",
        "chrome,dialog=no,all",
        { type: "contentTab", tabParams }
      );
      linkHandled.data = true;
    }
  },

  // for XPCOM
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};
