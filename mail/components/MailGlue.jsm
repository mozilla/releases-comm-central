/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var EXPORTED_SYMBOLS = ["MailGlue", "MailTelemetryForTests"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

const lazy = {};

// lazy module getter

XPCOMUtils.defineLazyGetter(lazy, "gMailBundle", function() {
  return Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  ActorManagerParent: "resource://gre/modules/ActorManagerParent.jsm",
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  cal: "resource:///modules/calendar/calUtils.jsm",
  ChatCore: "resource:///modules/chatHandler.jsm",
  ExtensionSupport: "resource:///modules/ExtensionSupport.jsm",
  MailMigrator: "resource:///modules/MailMigrator.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  MailUsageTelemetry: "resource:///modules/MailUsageTelemetry.jsm",
  LightweightThemeConsumer:
    "resource://gre/modules/LightweightThemeConsumer.jsm",
  OsEnvironment: "resource://gre/modules/OsEnvironment.jsm",
  PdfJs: "resource://pdf.js/PdfJs.jsm",
  RemoteSecuritySettings:
    "resource://gre/modules/psm/RemoteSecuritySettings.jsm",
  TBDistCustomizer: "resource:///modules/TBDistCustomizer.jsm",
});

const PREF_PDFJS_ISDEFAULT_CACHE_STATE = "pdfjs.enabledCache.state";

let JSWINDOWACTORS = {
  ChatAction: {
    matches: ["chrome://chat/content/conv.html"],
    parent: {
      moduleURI: "resource:///actors/ChatActionParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/ChatActionChild.jsm",
      events: {
        contextmenu: { mozSystemGroup: true },
      },
    },
  },

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

  MailLink: {
    parent: {
      moduleURI: "resource:///actors/MailLinkParent.jsm",
    },
    child: {
      moduleURI: "resource:///actors/MailLinkChild.jsm",
      events: {
        click: {},
      },
    },
    allFrames: true,
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
  this._init();
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
    // Start-up notifications, in order.
    // app-startup happens first, registered in components.conf.
    Services.obs.addObserver(this, "command-line-startup");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "mail-startup-done");

    // Shut-down notifications.
    Services.obs.addObserver(this, "xpcom-shutdown");

    // General notifications.
    Services.obs.addObserver(this, "intl:app-locales-changed");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "chrome-document-global-created");
    Services.obs.addObserver(this, "document-element-inserted");
    Services.obs.addObserver(this, "handlersvc-store-initialized");

    // Call the lazy getter to ensure ActorManagerParent is initialized.
    lazy.ActorManagerParent;

    // FindBar and LoginManager actors are included in JSWINDOWACTORS as they
    // also apply to the single-site and single-page message manager groups.
    // First we must unregister them to avoid errors.
    ChromeUtils.unregisterWindowActor("FindBar");
    ChromeUtils.unregisterWindowActor("LoginManager");

    lazy.ActorManagerParent.addJSWindowActors(JSWINDOWACTORS);
  },

  // cleanup (called at shutdown)
  _dispose() {
    Services.obs.removeObserver(this, "command-line-startup");
    Services.obs.removeObserver(this, "final-ui-startup");
    // mail-startup-done is removed by its handler.

    Services.obs.removeObserver(this, "xpcom-shutdown");

    Services.obs.removeObserver(this, "intl:app-locales-changed");
    Services.obs.removeObserver(this, "handle-xul-text-link");
    Services.obs.removeObserver(this, "chrome-document-global-created");
    Services.obs.removeObserver(this, "document-element-inserted");
    Services.obs.removeObserver(this, "handlersvc-store-initialized");

    lazy.ExtensionSupport.unregisterWindowListener(
      "Thunderbird-internal-BrowserConsole"
    );

    lazy.MailUsageTelemetry.uninit();

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
      case "command-line-startup":
        // Check if this process is the developer toolbox process, and if it
        // is, stop MailGlue from doing anything more. Also sets a flag that
        // can be checked to see if this is the toolbox process.
        let isToolboxProcess = false;
        let commandLine = aSubject.QueryInterface(Ci.nsICommandLine);
        let flagIndex = commandLine.findFlag("chrome", true) + 1;
        if (
          flagIndex > 0 &&
          flagIndex < commandLine.length &&
          commandLine.getArgument(flagIndex) ===
            MailGlue.BROWSER_TOOLBOX_WINDOW_URL
        ) {
          isToolboxProcess = true;
        }

        MailGlue.__defineGetter__("isToolboxProcess", () => isToolboxProcess);

        if (isToolboxProcess) {
          // Clean up all of the listeners.
          this._dispose();
        }
        break;
      case "final-ui-startup":
        Cc["@mozilla.org/msgFolder/msgFolderService;1"]
          .getService(Ci.nsIMsgFolderService)
          .initializeFolderStrings();
        Cc["@mozilla.org/msgDBView/msgDBViewService;1"]
          .getService(Ci.nsIMsgDBViewService)
          .initializeDBViewStrings();
        this._beforeUIStartup();
        break;
      case "mail-startup-done":
        this._onFirstWindowLoaded();
        Services.obs.removeObserver(this, "mail-startup-done");
        break;
      case "xpcom-shutdown":
        this._dispose();
        break;
      case "intl:app-locales-changed":
        Cc["@mozilla.org/msgFolder/msgFolderService;1"]
          .getService(Ci.nsIMsgFolderService)
          .initializeFolderStrings();
        Cc["@mozilla.org/msgDBView/msgDBViewService;1"]
          .getService(Ci.nsIMsgDBViewService)
          .initializeDBViewStrings();
        let windows = Services.wm.getEnumerator("mail:3pane");
        while (windows.hasMoreElements()) {
          let win = windows.getNext();
          win.document.getElementById("threadTree")?.invalidate();
        }
        // Refresh the folder tree.
        let fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
          Ci.nsIFolderLookupService
        );
        fls.setPrettyNameFromOriginalAllFolders();
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
              new lazy.LightweightThemeConsumer(aSubject.document);
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
        lazy.PdfJs.init(this._isNewProfile);
        break;
      }
    }
  },

  // Runs on startup, before the first command line handler is invoked
  // (i.e. before the first window is opened).
  _beforeUIStartup() {
    lazy.TBDistCustomizer.applyPrefDefaults();

    const UI_VERSION_PREF = "mail.ui-rdf.version";
    this._isNewProfile = !Services.prefs.prefHasUserValue(UI_VERSION_PREF);

    // handle any migration work that has to happen at profile startup
    lazy.MailMigrator.migrateAtProfileStartup();

    if (!Services.prefs.prefHasUserValue(PREF_PDFJS_ISDEFAULT_CACHE_STATE)) {
      lazy.PdfJs.checkIsDefault(this._isNewProfile);
    }

    // Inject scripts into some devtools windows.
    function _setupBrowserConsole(domWindow) {
      // Browser Console is an XHTML document.
      domWindow.document.title = lazy.gMailBundle.GetStringFromName(
        "errorConsoleTitle"
      );
      Services.scriptloader.loadSubScript(
        "chrome://global/content/viewSourceUtils.js",
        domWindow
      );
    }

    lazy.ExtensionSupport.registerWindowListener(
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

    lazy.AddonManager.maybeInstallBuiltinAddon(
      "thunderbird-compact-light@mozilla.org",
      "1.2",
      "resource://builtin-themes/light/"
    );
    lazy.AddonManager.maybeInstallBuiltinAddon(
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
    // Start these services.
    Cc["@mozilla.org/newMailNotificationService;1"].getService(
      Ci.mozINewMailNotificationService
    );
    Cc["@mozilla.org/mail/notification-manager;1"].getService(
      Ci.mozINewMailListener
    );
    Cc["@mozilla.org/chat/logger;1"].getService(Ci.imILogger);

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

    // If the application has been updated, check all installed extensions for
    // updates.
    let currentVersion = Services.appinfo.version;
    if (this.previousVersion != "0" && this.previousVersion != currentVersion) {
      let { AddonManager } = ChromeUtils.import(
        "resource://gre/modules/AddonManager.jsm"
      );
      let { XPIDatabase } = ChromeUtils.import(
        "resource://gre/modules/addons/XPIDatabase.jsm"
      );
      let addons = XPIDatabase.getAddons();
      for (let addon of addons) {
        if (addon.permissions() & AddonManager.PERM_CAN_UPGRADE) {
          AddonManager.getAddonByID(addon.id).then(addon => {
            if (!AddonManager.shouldAutoUpdate(addon)) {
              return;
            }
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

    if (AppConstants.ASAN_REPORTER) {
      var { AsanReporter } = ChromeUtils.import(
        "resource://gre/modules/AsanReporter.jsm"
      );
      AsanReporter.init();
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

    lazy.MailUsageTelemetry.init();
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
      {
        task() {
          // Make sure Gloda's up and running.
          ChromeUtils.import("resource:///modules/gloda/GlodaPublic.jsm");
        },
      },
      {
        condition: Services.prefs.getBoolPref("mail.chat.enabled"),
        task() {
          lazy.ChatCore.idleStart();
        },
      },
      {
        task() {
          // Use idleDispatch a second time to run this after the per-window
          // idle tasks.
          ChromeUtils.idleDispatch(() => {
            Services.obs.notifyObservers(
              null,
              "mail-startup-idle-tasks-finished"
            );
          });
        },
      },
      // Do NOT add anything after idle tasks finished.
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
      // Certificates revocation list, etc.
      () => lazy.RemoteSecuritySettings.init(),
      // If we haven't already, ensure the address book manager is ready.
      // This must happen at some point so that CardDAV address books sync.
      () => lazy.MailServices.ab.directories,
      // Telemetry.
      async () => {
        lazy.OsEnvironment.reportAllowedAppSources();
        reportAccountTypes();
        reportAddressBookTypes();
        reportAccountSizes();
        await reportCalendars();
        reportBooleanPreferences();
      },
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
        {
          type: "contentTab",
          tabParams,
        }
      );
      linkHandled.data = true;
    }
  },

  // for XPCOM
  QueryInterface: ChromeUtils.generateQI(["nsIObserver"]),
};

/**
 * Report account types to telemetry. For im accounts, use `im_protocol` as
 * scalar key name.
 */
function reportAccountTypes() {
  // Init all count with 0, so that when an account was set up before but
  // removed now, we reset it in telemetry report.
  let report = {
    pop3: 0,
    imap: 0,
    nntp: 0,
    exchange: 0,
    rss: 0,
    im_gtalk: 0,
    im_irc: 0,
    im_jabber: 0,
    im_matrix: 0,
    im_odnoklassniki: 0,
  };
  for (let account of lazy.MailServices.accounts.accounts) {
    let type = account.incomingServer.type;
    if (type == "none") {
      // Reporting one Local Folders account is not that useful. Skip it.
      continue;
    }
    if (type === "im") {
      let protocol =
        account.incomingServer.wrappedJSObject.imAccount.protocol
          .normalizedName;
      type = `im_${protocol}`;
    }
    // It's still possible to report other types not explicitly specified due to
    // account types that used to exist, but no longer -- e.g. im_yahoo.
    if (!report[type]) {
      report[type] = 0;
    }
    report[type]++;
  }
  for (let [type, count] of Object.entries(report)) {
    Services.telemetry.keyedScalarSet("tb.account.count", type, count);
  }
}

/**
 * Report size on disk and messages count of each type of folder to telemetry.
 */
function reportAccountSizes() {
  for (let server of lazy.MailServices.accounts.allServers) {
    if (
      server instanceof Ci.nsIPop3IncomingServer &&
      server.deferredToAccount
    ) {
      // Skip deferred accounts
      continue;
    }

    for (let folder of server.rootFolder.descendants) {
      let key =
        [
          "Inbox",
          "Drafts",
          "Trash",
          "SentMail",
          "Templates",
          "Junk",
          "Archive",
          "Queue",
        ].find(x => folder.getFlag(Ci.nsMsgFolderFlags[x])) || "Other";
      let totalMessages = folder.getTotalMessages(false);
      if (totalMessages > 0) {
        Services.telemetry.keyedScalarAdd(
          "tb.account.size_on_disk",
          key,
          folder.sizeOnDisk
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.total_messages",
          key,
          folder.getTotalMessages(false)
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.size_on_disk",
          "Total",
          folder.sizeOnDisk
        );
        Services.telemetry.keyedScalarAdd(
          "tb.account.total_messages",
          "Total",
          folder.getTotalMessages(false)
        );
      }
    }
  }
}

/**
 * Report addressbook count and contact count to telemetry, keyed by addressbook
 * type. Type is one of ["jsaddrbook", "jscarddav", "moz-abldapdirectory"], see
 * AddrBookManager.jsm for more details.
 *
 * NOTE: We didn't use `dir.dirType` because it's just an integer, instead we
 * use the scheme of `dir.URI` as the type.
 */
function reportAddressBookTypes() {
  let report = {};
  for (let dir of lazy.MailServices.ab.directories) {
    let type = dir.URI.split(":")[0];

    if (!report[type]) {
      report[type] = { count: 0, contactCount: 0 };
    }
    report[type].count++;

    try {
      report[type].contactCount += dir.childCardCount;
    } catch (ex) {
      // Directories may throw NS_ERROR_NOT_IMPLEMENTED.
    }
  }

  for (let [type, { count, contactCount }] of Object.entries(report)) {
    Services.telemetry.keyedScalarSet(
      "tb.addressbook.addressbook_count",
      type,
      count
    );
    Services.telemetry.keyedScalarSet(
      "tb.addressbook.contact_count",
      type,
      contactCount
    );
  }
}

/**
 * A telemetry probe to report calendar count and read only calendar count.
 */
async function reportCalendars() {
  let telemetryReport = {};
  let home = lazy.cal.l10n.getCalString("homeCalendarName");

  for (let calendar of lazy.cal.manager.getCalendars()) {
    if (calendar.name == home && calendar.type == "storage") {
      // Ignore the "Home" calendar if it is disabled or unused as it's
      // automatically added.
      if (calendar.getProperty("disabled")) {
        continue;
      }
      let items = await calendar.getItemsAsArray(
        Ci.calICalendar.ITEM_FILTER_ALL_ITEMS,
        1,
        null,
        null
      );
      if (!items.length) {
        continue;
      }
    }
    if (!telemetryReport[calendar.type]) {
      telemetryReport[calendar.type] = { count: 0, readOnlyCount: 0 };
    }
    telemetryReport[calendar.type].count++;
    if (calendar.readOnly) {
      telemetryReport[calendar.type].readOnlyCount++;
    }
  }

  for (let [type, { count, readOnlyCount }] of Object.entries(
    telemetryReport
  )) {
    Services.telemetry.keyedScalarSet(
      "tb.calendar.calendar_count",
      type.toLowerCase(),
      count
    );
    Services.telemetry.keyedScalarSet(
      "tb.calendar.read_only_calendar_count",
      type.toLowerCase(),
      readOnlyCount
    );
  }
}

function reportBooleanPreferences() {
  let booleanPrefs = [
    // General
    "browser.cache.disk.smart_size.enabled",
    "general.autoScroll",
    "general.smoothScroll",
    "intl.regional_prefs.use_os_locales",
    "layers.acceleration.disabled",
    "mail.biff.play_sound",
    "mail.close_message_window.on_delete",
    "mail.display_glyph",
    "mail.prompt_purge_threshhold",
    "mail.purge.ask",
    "mail.showCondensedAddresses",
    "mailnews.database.global.indexer.enabled",
    "mailnews.mark_message_read.auto",
    "mailnews.mark_message_read.delay",
    "mailnews.reuse_message_window",
    "mailnews.start_page.enabled",
    "searchintegration.enable",

    // Fonts
    "mail.fixed_width_messages",

    // Colors
    "browser.display.use_system_colors",
    "browser.underline_anchors",

    // Read receipts
    "mail.mdn.report.enabled",
    "mail.receipt.request_return_receipt_on",

    // Connection
    "network.proxy.share_proxy_settings",
    "network.proxy.socks_remote_dns",
    "pref.advanced.proxies.disable_button.reload",
    "signon.autologin.proxy",

    // Offline
    "offline.autoDetect",

    // Compose
    "ldap_2.autoComplete.useDirectory",
    "mail.collect_email_address_outgoing",
    "mail.compose.attachment_reminder",
    "mail.compose.autosave",
    "mail.compose.big_attachments.notify",
    "mail.compose.default_to_paragraph",
    "mail.enable_autocomplete",
    "mail.forward_add_extension",
    "mail.SpellCheckBeforeSend",
    "mail.spellcheck.inline",
    "mail.warn_on_send_accel_key",
    "msgcompose.default_colors",
    "pref.ldap.disable_button.edit_directories",

    // Send options
    "mailnews.sendformat.auto_downgrade",

    // Privacy
    "browser.safebrowsing.enabled",
    "mail.phishing.detection.enabled",
    "mail.spam.logging.enabled",
    "mail.spam.manualMark",
    "mail.spam.markAsReadOnSpam",
    "mailnews.downloadToTempFile",
    "mailnews.message_display.disable_remote_image",
    "network.cookie.blockFutureCookies",
    "places.history.enabled",
    "pref.privacy.disable_button.cookie_exceptions",
    "pref.privacy.disable_button.view_cookies",
    "pref.privacy.disable_button.view_passwords",
    "privacy.donottrackheader.enabled",
    "security.disable_button.openCertManager",
    "security.disable_button.openDeviceManager",

    // Chat
    "messenger.options.getAttentionOnNewMessages",
    "messenger.status.reportIdle",
    "messenger.status.awayWhenIdle",
    "mail.chat.enabled",
    "mail.chat.play_sound",
    "mail.chat.show_desktop_notifications",
    "purple.conversations.im.send_typing",
    "purple.logging.log_chats",
    "purple.logging.log_ims",
    "purple.logging.log_system",

    // Calendar views
    "calendar.view.showLocation",
    "calendar.view-minimonth.showWeekNumber",
    "calendar.week.d0sundaysoff",
    "calendar.week.d1mondaysoff",
    "calendar.week.d2tuesdaysoff",
    "calendar.week.d3wednesdaysoff",
    "calendar.week.d4thursdaysoff",
    "calendar.week.d5fridaysoff",
    "calendar.week.d6saturdaysoff",

    // Calendar general
    "calendar.item.editInTab",
    "calendar.item.promptDelete",
    "calendar.view.useSystemColors",

    // Alarms
    "calendar.alarms.playsound",
    "calendar.alarms.show",
    "calendar.alarms.showmissed",
  ];

  // Platform-specific preferences
  if (AppConstants.platform === "win") {
    booleanPrefs.push("mail.biff.show_tray_icon", "mail.minimizeToTray");
  }

  if (AppConstants.platform !== "macosx") {
    booleanPrefs.push(
      "mail.biff.show_alert",
      "mail.biff.use_system_alert",

      // Notifications
      "mail.biff.alert.show_preview",
      "mail.biff.alert.show_sender",
      "mail.biff.alert.show_subject"
    );
  }

  // Compile-time flag-dependent preferences
  if (AppConstants.HAVE_SHELL_SERVICE) {
    booleanPrefs.push("mail.shell.checkDefaultClient");
  }

  if (AppConstants.MOZ_WIDGET_GTK) {
    booleanPrefs.push("widget.gtk.overlay-scrollbars.enabled");
  }

  if (AppConstants.MOZ_MAINTENANCE_SERVICE) {
    booleanPrefs.push("app.update.service.enabled");
  }

  if (AppConstants.MOZ_DATA_REPORTING) {
    booleanPrefs.push("datareporting.healthreport.uploadEnabled");
  }

  if (AppConstants.MOZ_CRASHREPORTER) {
    booleanPrefs.push("browser.crashReports.unsubmittedCheck.autoSubmit2");
  }

  // Fetch and report preference values
  for (let prefName of booleanPrefs) {
    let prefValue = Services.prefs.getBoolPref(prefName, false);

    Services.telemetry.keyedScalarSet(
      "tb.preferences.boolean",
      prefName,
      prefValue
    );
  }
}

/**
 * Export these functions so we can test them. This object shouldn't be
 * accessed outside of a test (hence the name).
 */
var MailTelemetryForTests = {
  reportAccountTypes,
  reportAccountSizes,
  reportAddressBookTypes,
  reportCalendars,
  reportBooleanPreferences,
};
