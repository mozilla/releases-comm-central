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
var { AddonManager } = ChromeUtils.import(
  "resource://gre/modules/AddonManager.jsm"
);
var { LightweightThemeConsumer } = ChromeUtils.import(
  "resource://gre/modules/LightweightThemeConsumer.jsm"
);
var { TBDistCustomizer } = ChromeUtils.import(
  "resource:///modules/TBDistCustomizer.jsm"
);
var { MailMigrator } = ChromeUtils.import(
  "resource:///modules/MailMigrator.jsm"
);
var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var { RemoteSecuritySettings } = ChromeUtils.import(
  "resource://gre/modules/psm/RemoteSecuritySettings.jsm"
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

let ACTORS = {};

/**
 * Glue code that should be executed before any windows are opened. Any
 * window-independent helper methods (a la nsBrowserGlue.js) should go in
 * MailUtils.jsm instead.
 */

function MailGlue() {
  XPCOMUtils.defineLazyGetter(this, "_sanitizer", function() {
    let sanitizerScope = {};
    Services.scriptloader.loadSubScript(
      "chrome://messenger/content/sanitize.js",
      sanitizerScope
    );
    return sanitizerScope.Sanitizer;
  });

  this._init();
}

MailGlue.prototype = {
  // init (called at app startup)
  _init() {
    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "intl:app-locales-changed");
    Services.obs.addObserver(this, "mail-startup-done");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "chrome-document-global-created");
    Services.obs.addObserver(this, "document-element-inserted");

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

    ActorManagerParent.addActors(ACTORS);
    ActorManagerParent.flush();
  },

  // cleanup (called at shutdown)
  _dispose() {
    Services.obs.removeObserver(this, "xpcom-shutdown");
    Services.obs.removeObserver(this, "final-ui-startup");
    Services.obs.removeObserver(this, "intl:app-locales-changed");
    Services.obs.removeObserver(this, "mail-startup-done");
    Services.obs.removeObserver(this, "handle-xul-text-link");
    Services.obs.removeObserver(this, "chrome-document-global-created");
    Services.obs.removeObserver(this, "document-element-inserted");

    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-Toolbox");
    ExtensionSupport.unregisterWindowListener(
      "Thunderbird-internal-BrowserConsole"
    );
  },

  // nsIObserver implementation
  observe(aSubject, aTopic, aData) {
    let fs;
    switch (aTopic) {
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
        this._onMailStartupDone();
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
          (doc.contentType == "application/vnd.mozilla.xhtml+xml" ||
            doc.contentType == "application/xhtml+xml" ||
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
    }
  },

  // nsIMailGlue implementation
  sanitize(aParentWindow) {
    this._sanitizer.sanitize(aParentWindow);
  },

  async _onProfileStartup() {
    TBDistCustomizer.applyPrefDefaults();

    // handle any migration work that has to happen at profile startup
    await MailMigrator.migrateAtProfileStartup();

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

  _onMailStartupDone() {
    // On Windows 7 and above, initialize the jump list module.
    const WINTASKBAR_CONTRACTID = "@mozilla.org/windows-taskbar;1";
    if (
      WINTASKBAR_CONTRACTID in Cc &&
      Cc[WINTASKBAR_CONTRACTID].getService(Ci.nsIWinTaskbar).available
    ) {
      const { WinTaskbarJumpList } = ChromeUtils.import(
        "resource:///modules/windowsJumpLists.js"
      );
      WinTaskbarJumpList.startup();
    }

    const { ExtensionsUI } = ChromeUtils.import(
      "resource:///modules/ExtensionsUI.jsm"
    );
    ExtensionsUI.checkForSideloadedExtensions();

    // Certificates revocation list, etc.
    Services.tm.idleDispatchToMainThread(() => {
      RemoteSecuritySettings.init();
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
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver, Ci.nsIMailGlue]),
};
