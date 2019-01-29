/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
const {AddonManager} = ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
const {LightweightThemeConsumer} = ChromeUtils.import("resource://gre/modules/LightweightThemeConsumer.jsm");
const {TBDistCustomizer} = ChromeUtils.import("resource:///modules/TBDistCustomizer.jsm");
const {MailMigrator} = ChromeUtils.import("resource:///modules/MailMigrator.jsm");
const {ExtensionSupport} = ChromeUtils.import("resource:///modules/ExtensionSupport.jsm");
const { L10nRegistry, FileSource } = ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm");

// lazy module getters

XPCOMUtils.defineLazyModuleGetters(this, {
  LightweightThemeManager: "resource://gre/modules/LightweightThemeManager.jsm",
});

XPCOMUtils.defineLazyGetter(this, "gBrandBundle", function() {
  return Services.strings.createBundle("chrome://branding/locale/brand.properties");
});

XPCOMUtils.defineLazyGetter(this, "gMailBundle", function() {
  return Services.strings.createBundle("chrome://messenger/locale/messenger.properties");
});

ChromeUtils.defineModuleGetter(this, "ActorManagerParent",
                               "resource://gre/modules/ActorManagerParent.jsm");

let ACTORS = {
};

/**
 * Glue code that should be executed before any windows are opened. Any
 * window-independent helper methods (a la nsBrowserGlue.js) should go in
 * MailUtils.jsm instead.
 */

function MailGlue() {
  XPCOMUtils.defineLazyGetter(this, "_sanitizer",
    function() {
      let sanitizerScope = {};
      Services.scriptloader.loadSubScript("chrome://messenger/content/sanitize.js", sanitizerScope);
      return sanitizerScope.Sanitizer;
    });

  this._init();
}

MailGlue.prototype = {
  // init (called at app startup)
  _init() {
    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "mail-startup-done");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "chrome-document-global-created");

    // Inject scripts into some devtools windows.
    function _setupBrowserConsole(domWindow) {
      domWindow.document.documentElement.setAttribute("title", gMailBundle.GetStringFromName("errorConsoleTitle"));
      Services.scriptloader.loadSubScript("chrome://global/content/viewSourceUtils.js", domWindow);
    }

    ExtensionSupport.registerWindowListener(
      "Thunderbird-internal-BrowserConsole",
      {
        chromeURLs: [ "chrome://devtools/content/webconsole/browserconsole.xul" ],
        onLoadWindow: _setupBrowserConsole,
      });

    function _setupToolbox(domWindow) {
      // Defines openUILinkIn and openWebLinkIn
      Services.scriptloader.loadSubScript("chrome://communicator/content/contentAreaClick.js", domWindow);
    }

    ExtensionSupport.registerWindowListener(
      "Thunderbird-internal-Toolbox",
      {
        chromeURLs: [ "chrome://devtools/content/framework/toolbox-process-window.xul" ],
        onLoadWindow: _setupToolbox,
      });

    ActorManagerParent.addActors(ACTORS);
    ActorManagerParent.flush();
  },

  // cleanup (called at shutdown)
  _dispose() {
    Services.obs.removeObserver(this, "xpcom-shutdown");
    Services.obs.removeObserver(this, "final-ui-startup");
    Services.obs.removeObserver(this, "mail-startup-done");
    Services.obs.removeObserver(this, "handle-xul-text-link");
    Services.obs.removeObserver(this, "chrome-document-global-created");

    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-Toolbox");
    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-BrowserConsole");
  },

  // nsIObserver implementation
  observe(aSubject, aTopic, aData) {
    switch (aTopic) {
    case "app-startup":
      const {BootstrapLoader} = ChromeUtils.import("resource:///modules/BootstrapLoader.jsm");
      AddonManager.addExternalExtensionLoader(BootstrapLoader);
      break;
    case "xpcom-shutdown":
      this._dispose();
      break;
    case "final-ui-startup":
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
      // (i.e. in messenger.xul).
      aSubject.addEventListener("DOMContentLoaded", () => {
        if (aSubject.document.documentElement.hasAttribute("lightweightthemes")) {
          new LightweightThemeConsumer(aSubject.document);
        }
      }, {once: true});

      // Set up our custom elements.
      aSubject.addEventListener("DOMWindowCreated", () => {
        let doc = aSubject.document;
        if (doc.nodePrincipal.isSystemPrincipal && (
            doc.contentType == "application/vnd.mozilla.xul+xml" ||
            doc.contentType == "application/xhtml+xml"
        )) {
          Services.scriptloader.loadSubScript(
            "chrome://messenger/content/customElements.js", doc.ownerGlobal);
        }
      }, {once: true});
      break;
    }
  },

  // nsIMailGlue implementation
  sanitize(aParentWindow) {
    this._sanitizer.sanitize(aParentWindow);
  },

  _onProfileStartup() {
    TBDistCustomizer.applyPrefDefaults();

    let locales = Services.locale.packagedLocales;
    const appSource = new FileSource("app", locales, "resource:///localization/{locale}/");
    L10nRegistry.registerSource(appSource);

    // handle any migration work that has to happen at profile startup
    MailMigrator.migrateAtProfileStartup();

    // check if we're in safe mode
    if (Services.appinfo.inSafeMode) {
      Services.ww.openWindow(null, "chrome://messenger/content/safeMode.xul",
                             "_blank", "chrome,centerscreen,modal,resizable=no", null);
    }

    let vendorShortName = gBrandBundle.GetStringFromName("vendorShortName");

    LightweightThemeManager.addBuiltInTheme({
      id: "thunderbird-compact-light@mozilla.org",
      name: gMailBundle.GetStringFromName("lightTheme.name"),
      description: gMailBundle.GetStringFromName("lightTheme.description"),
      iconURL: "resource:///chrome/messenger/content/messenger/light.icon.svg",
      textcolor: "rgb(24, 25, 26)",
      icon_color: "rgb(24, 25, 26, 0.7)",
      accentcolor: "#E3E4E6",
      popup: "#fff",
      popup_text: "#0c0c0d",
      popup_border: "#ccc",
      tab_line: "#0a84ff",
      toolbarColor: "#f5f6f7",
      toolbar_bottom_separator: "#ccc",
      toolbar_field: "#fff",
      toolbar_field_border: "#ccc",
      author: vendorShortName,
    });
    LightweightThemeManager.addBuiltInTheme({
      id: "thunderbird-compact-dark@mozilla.org",
      name: gMailBundle.GetStringFromName("darkTheme.name"),
      description: gMailBundle.GetStringFromName("darkTheme.description"),
      iconURL: "resource:///chrome/messenger/content/messenger/dark.icon.svg",
      textcolor: "rgb(249, 249, 250)",
      icon_color: "rgb(249, 249, 250, 0.7)",
      accentcolor: "hsl(240, 5%, 5%)",
      popup: "#4a4a4f",
      popup_text: "rgb(249, 249, 250)",
      popup_border: "#27272b",
      tab_line: "#0a84ff",
      toolbarColor: "hsl(240, 1%, 20%)",
      toolbar_bottom_separator: "hsla(240, 5%, 5%, 0.2",
      toolbar_field: "rgb(71, 71, 73)",
      toolbar_field_border: "rgba(249, 249, 250, 0.2)",
      toolbar_field_separator: "#5F6670",
      toolbar_field_text: "rgb(249, 249, 250)",
      sidebar: "#38383D",
      sidebar_text: "rgb(249, 249, 250)",
      sidebar_border: "#606064",
      author: vendorShortName,
    }, {
      useInDarkMode: true,
    });
  },

  _onMailStartupDone() {
    // On Windows 7 and above, initialize the jump list module.
    const WINTASKBAR_CONTRACTID = "@mozilla.org/windows-taskbar;1";
    if (WINTASKBAR_CONTRACTID in Cc &&
        Cc[WINTASKBAR_CONTRACTID].getService(Ci.nsIWinTaskbar).available) {
      const { WinTaskbarJumpList } = ChromeUtils.import("resource:///modules/windowsJumpLists.js");
      WinTaskbarJumpList.startup();
    }

    const {ExtensionsUI} = ChromeUtils.import("resource:///modules/ExtensionsUI.jsm");
    ExtensionsUI.checkForSideloadedExtensions();
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
      Services.ww.openWindow(null, "chrome://messenger/content/", "_blank",
                             "chrome,dialog=no,all",
                             { type: "contentTab", tabParams });
      linkHandled.data = true;
    }
  },

  // for XPCOM
  classID: Components.ID("{eb239c82-fac9-431e-98d7-11cacd0f71b8}"),
  QueryInterface: ChromeUtils.generateQI([Ci.nsIObserver,
                                          Ci.nsIMailGlue]),
};

var components = [MailGlue];
var NSGetFactory = XPCOMUtils.generateNSGetFactory(components);
