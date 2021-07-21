/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MailGlue"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

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
  ContextMenu: {
    parent: {
      moduleURI: "resource:///actors/ContextMenuParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/ContextMenuChild.jsm",
      events: {
        contextmenu: { mozSystemGroup: true },
      },
    },
    allFrames: true,
  },

  // As in ActorManagerParent.jsm, but with single-site and single-page
  // message manager groups added.
  FindBar: {
    parent: {
      moduleURI: "resource://gre/actors/FindBarParent.jsm",
    },
    child: {
      moduleURI: "resource://gre/actors/FindBarChild.jsm",
      events: {
        keypress: { mozSystemGroup: true },
      },
    },

    allFrames: true,
    messageManagerGroups: [
      "browsers",
      "single-site",
      "single-page",
      "test",
      "",
    ],
  },

  LinkClickHandler: {
    parent: {
      moduleURI: "resource:///actors/LinkClickHandlerParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/LinkClickHandlerChild.jsm",
      events: {
        click: {},
      },
    },
    messageManagerGroups: ["single-site", "webext-browsers"],
    allFrames: true,
  },

  LinkHandler: {
    parent: {
      moduleURI: "resource:///actors/LinkHandlerParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/LinkHandlerChild.jsm",
      events: {
        DOMHeadElementParsed: {},
        DOMLinkAdded: {},
        DOMLinkChanged: {},
        pageshow: {},
        // The `pagehide` event is only used to clean up state which will not be
        // present if the actor hasn't been created.
        pagehide: { createActor: false },
      },
    },

    messageManagerGroups: ["browsers", "single-site", "single-page"],
  },

  // As in ActorManagerParent.jsm, but with single-site and single-page
  // message manager groups added.
  LoginManager: {
    parent: {
      moduleURI: "resource://gre/modules/LoginManagerParent.jsm",
    },
    child: {
      moduleURI: "resource://gre/modules/LoginManagerChild.jsm",
      events: {
        DOMDocFetchSuccess: {},
        DOMFormBeforeSubmit: {},
        DOMFormHasPassword: {},
        DOMInputPasswordAdded: {},
      },
    },

    allFrames: true,
    messageManagerGroups: [
      "browsers",
      "single-site",
      "single-page",
      "webext-browsers",
      "",
    ],
  },

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

  StrictLinkClickHandler: {
    parent: {
      moduleURI: "resource:///actors/LinkClickHandlerParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/LinkClickHandlerChild.jsm",
      events: {
        click: {},
      },
    },
    messageManagerGroups: ["single-page"],
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
  MailMigrator: "resource:///modules/MailMigrator.jsm",
  LightweightThemeConsumer:
    "resource://gre/modules/LightweightThemeConsumer.jsm",
  OsEnvironment: "resource://gre/modules/OsEnvironment.jsm",
  PdfJs: "resource://pdf.js/PdfJs.jsm",
  RemoteSecuritySettings:
    "resource://gre/modules/psm/RemoteSecuritySettings.jsm",
  TBDistCustomizer: "resource:///modules/TBDistCustomizer.jsm",
});

// Seconds of idle time before the late idle tasks will be scheduled.
const LATE_TASKS_IDLE_TIME_SEC = 20;

/**
 * Glue code that should be executed before any windows are opened. Any
 * window-independent helper methods (a la nsBrowserGlue.js) should go in
 * MailUtils.jsm instead.
 */

function MailGlue() {
  XPCOMUtils.defineLazyServiceGetter(
    this,
    "_userIdleService",
    "@mozilla.org/widget/useridleservice;1",
    "nsIUserIdleService"
  );
  Services.obs.addObserver(this, "command-line-startup");
}

// This should match the constant of the same name in devtools
// (devtools/client/framework/browser-toolbox/Launcher.jsm). Otherwise the logic
// in command-line-startup will fail. We have a test to ensure it matches, at
// mail/base/test/unit/test_devtools_url.js.
MailGlue.BROWSER_TOOLBOX_WINDOW_URL =
  "chrome://devtools/content/framework/browser-toolbox/window.html";

MailGlue.prototype = {
  _isNewProfile: undefined,

  // init (called at app startup)
  _init() {
    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "intl:app-locales-changed");
    Services.obs.addObserver(this, "mail-startup-done");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "chrome-document-global-created");
    Services.obs.addObserver(this, "document-element-inserted");
    Services.obs.addObserver(this, "handlersvc-store-initialized");

    // Call the lazy getter to ensure ActorManagerParent is initialized.
    ActorManagerParent;

    // FindBar and LoginManager actors are included in JSWINDOWACTORS as they
    // also apply to the single-site and single-page message manager groups.
    // First we must unregister them to avoid errors.
    ChromeUtils.unregisterWindowActor("FindBar");
    ChromeUtils.unregisterWindowActor("LoginManager");

    ActorManagerParent.addJSWindowActors(JSWINDOWACTORS);
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

    ExtensionSupport.unregisterWindowListener(
      "Thunderbird-internal-BrowserConsole"
    );

    if (this._lateTasksIdleObserver) {
      this._userIdleService.removeIdleObserver(
        this._lateTasksIdleObserver,
        LATE_TASKS_IDLE_TIME_SEC
      );
      delete this._lateTasksIdleObserver;
    }
  },

  // nsIObserver implementation
  observe(aSubject, aTopic, aData) {
    let fs;
    switch (aTopic) {
      case "command-line-startup":
        Services.obs.removeObserver(this, "command-line-startup");

        // Check if this process is the developer toolbox process, and if it
        // is, avoid starting everything MailGlue starts.
        let commandLine = aSubject.QueryInterface(Ci.nsICommandLine);
        let flagIndex = commandLine.findFlag("chrome", true) + 1;
        if (
          flagIndex > 0 &&
          flagIndex < commandLine.length &&
          commandLine.getArgument(flagIndex) ===
            MailGlue.BROWSER_TOOLBOX_WINDOW_URL
        ) {
          return;
        }

        this._init();
        break;
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
        this._beforeUIStartup();
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

  // Runs on startup, before the first command line handler is invoked
  // (i.e. before the first window is opened).
  _beforeUIStartup() {
    TBDistCustomizer.applyPrefDefaults();

    const UI_VERSION_PREF = "mail.ui-rdf.version";
    this._isNewProfile = !Services.prefs.prefHasUserValue(UI_VERSION_PREF);

    // handle any migration work that has to happen at profile startup
    MailMigrator.migrateAtProfileStartup();

    if (!Services.prefs.prefHasUserValue(PREF_PDFJS_ISDEFAULT_CACHE_STATE)) {
      PdfJs.checkIsDefault(this._isNewProfile);
    }

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

    // check if we're in safe mode
    if (Services.appinfo.inSafeMode) {
      Services.ww.openWindow(
        null,
        "chrome://messenger/content/troubleshootMode.xhtml",
        "_blank",
        "chrome,centerscreen,modal,resizable=no",
        null
      );
    }

    AddonManager.maybeInstallBuiltinAddon(
      "thunderbird-compact-light@mozilla.org",
      "1.2",
      "resource://builtin-themes/light/"
    );
    AddonManager.maybeInstallBuiltinAddon(
      "thunderbird-compact-dark@mozilla.org",
      "1.2",
      "resource://builtin-themes/dark/"
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

    this._scheduleStartupIdleTasks();
    this._lateTasksIdleObserver = (idleService, topic, data) => {
      if (topic == "idle") {
        idleService.removeIdleObserver(
          this._lateTasksIdleObserver,
          LATE_TASKS_IDLE_TIME_SEC
        );
        delete this._lateTasksIdleObserver;
        this._scheduleBestEffortUserIdleTasks();
      }
    };
    this._userIdleService.addIdleObserver(
      this._lateTasksIdleObserver,
      LATE_TASKS_IDLE_TIME_SEC
    );
  },

  /**
   * Use this function as an entry point to schedule tasks that
   * need to run only once after startup, and can be scheduled
   * by using an idle callback.
   *
   * The functions scheduled here will fire from idle callbacks
   * once every window has finished being restored by session
   * restore, and it's guaranteed that they will run before
   * the equivalent per-window idle tasks
   * (from _schedulePerWindowIdleTasks in browser.js).
   *
   * If you have something that can wait even further than the
   * per-window initialization, and is okay with not being run in some
   * sessions, please schedule them using
   * _scheduleBestEffortUserIdleTasks.
   * Don't be fooled by thinking that the use of the timeout parameter
   * will delay your function: it will just ensure that it potentially
   * happens _earlier_ than expected (when the timeout limit has been reached),
   * but it will not make it happen later (and out of order) compared
   * to the other ones scheduled together.
   */
  _scheduleStartupIdleTasks() {
    const idleTasks = [
      {
        task() {
          // This module needs to be loaded so it registers to receive
          // FormAutoComplete:GetSelectedIndex messages and respond
          // appropriately, otherwise we get error messages like the one
          // reported in bug 1635422.
          ChromeUtils.import("resource://gre/actors/AutoCompleteParent.jsm");
        },
      },
      // WebDriver components (Remote Agent and Marionette) need to be
      // initialized as very last step.
      {
        condition: AppConstants.ENABLE_WEBDRIVER,
        task: () => {
          // Use idleDispatch a second time to run this after the per-window
          // idle tasks.
          ChromeUtils.idleDispatch(() => {
            Services.obs.notifyObservers(
              null,
              "mail-startup-idle-tasks-finished"
            );

            // Request startup of the Remote Agent (support for WebDriver BiDi
            // and the partial Chrome DevTools protocol) before Marionette.
            Services.obs.notifyObservers(null, "remote-startup-requested");
            Services.obs.notifyObservers(null, "marionette-startup-requested");
          });
        },
      },
      // Do NOT add anything after WebDriver initialization.
    ];

    for (let task of idleTasks) {
      if ("condition" in task && !task.condition) {
        continue;
      }

      ChromeUtils.idleDispatch(
        () => {
          if (!Services.startup.shuttingDown) {
            let startTime = Cu.now();
            try {
              task.task();
            } catch (ex) {
              Cu.reportError(ex);
            } finally {
              ChromeUtils.addProfilerMarker("startupIdleTask", startTime);
            }
          }
        },
        task.timeout ? { timeout: task.timeout } : undefined
      );
    }
  },

  /**
   * Use this function as an entry point to schedule tasks that we hope
   * to run once per session, at any arbitrary point in time, and which we
   * are okay with sometimes not running at all.
   *
   * This function will be called from an idle observer. Check the value of
   * LATE_TASKS_IDLE_TIME_SEC to see the current value for this idle
   * observer.
   *
   * Note: this function may never be called if the user is never idle for the
   * requisite time (LATE_TASKS_IDLE_TIME_SEC). Be certain before adding
   * something here that it's okay that it never be run.
   */
  _scheduleBestEffortUserIdleTasks() {
    const idleTasks = [
      () => {
        // Certificates revocation list, etc.
        RemoteSecuritySettings.init();
      },
      () => OsEnvironment.reportAllowedAppSources(),
    ];

    for (let task of idleTasks) {
      ChromeUtils.idleDispatch(async () => {
        if (!Services.startup.shuttingDown) {
          let startTime = Cu.now();
          try {
            await task();
          } catch (ex) {
            Cu.reportError(ex);
          } finally {
            ChromeUtils.addProfilerMarker("startupLateIdleTask", startTime);
          }
        }
      });
    }
  },

  _handleLink(aSubject, aData) {
    let linkHandled = aSubject.QueryInterface(Ci.nsISupportsPRBool);
    if (!linkHandled.data) {
      let win = Services.wm.getMostRecentWindow("mail:3pane");
      aData = JSON.parse(aData);
      let tabParams = { url: aData.href, linkHandler: null };
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
