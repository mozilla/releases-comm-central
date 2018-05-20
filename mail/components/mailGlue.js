/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
ChromeUtils.import("resource://gre/modules/Services.jsm");
ChromeUtils.import("resource://gre/modules/AddonManager.jsm");
ChromeUtils.import("resource://gre/modules/LightweightThemeConsumer.jsm");
ChromeUtils.import("resource:///modules/distribution.js");
ChromeUtils.import("resource:///modules/mailMigrator.js");
ChromeUtils.import("resource:///modules/extensionSupport.jsm");
const { L10nRegistry, FileSource } = ChromeUtils.import("resource://gre/modules/L10nRegistry.jsm", {});

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

/**
 * Glue code that should be executed before any windows are opened. Any
 * window-independent helper methods (a la nsBrowserGlue.js) should go in
 * MailUtils.js instead.
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
  _init: function MailGlue__init() {
    Services.obs.addObserver(this, "xpcom-shutdown");
    Services.obs.addObserver(this, "final-ui-startup");
    Services.obs.addObserver(this, "mail-startup-done");
    Services.obs.addObserver(this, "handle-xul-text-link");
    Services.obs.addObserver(this, "profile-after-change");
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
        onLoadWindow: _setupBrowserConsole
      });

    function _setupToolbox(domWindow) {
      // Defines openUILinkIn and openWebLinkIn
      Services.scriptloader.loadSubScript("chrome://communicator/content/contentAreaClick.js", domWindow);
    }

    ExtensionSupport.registerWindowListener(
      "Thunderbird-internal-Toolbox",
      {
        chromeURLs: [ "chrome://devtools/content/framework/toolbox-process-window.xul" ],
        onLoadWindow: _setupToolbox
      });

  },

  // cleanup (called at shutdown)
  _dispose: function MailGlue__dispose() {
    Services.obs.removeObserver(this, "xpcom-shutdown");
    Services.obs.removeObserver(this, "final-ui-startup");
    Services.obs.removeObserver(this, "mail-startup-done");
    Services.obs.removeObserver(this, "handle-xul-text-link");
    Services.obs.removeObserver(this, "profile-after-change");
    Services.obs.removeObserver(this, "chrome-document-global-created");

    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-Toolbox");
    ExtensionSupport.unregisterWindowListener("Thunderbird-internal-BrowserConsole");
  },

  // nsIObserver implementation
  observe: function MailGlue_observe(aSubject, aTopic, aData) {
    switch (aTopic) {
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
    case "profile-after-change":
      extensionDefaults(); // extensionSupport.jsm
      break;
    case "chrome-document-global-created":
      // Set up lwt, but only if the "lightweightthemes" attr is set on the root
      // (i.e. in messenger.xul).
      aSubject.addEventListener("DOMContentLoaded", () => {
        if (aSubject.document.documentElement.hasAttribute("lightweightthemes")) {
          new LightweightThemeConsumer(aSubject.document);
        }
      }, {once: true});
      break;
    }
  },

  //nsIMailGlue implementation
  sanitize: function MG_sanitize(aParentWindow) {
    this._sanitizer.sanitize(aParentWindow);
  },

  _onProfileStartup: function MailGlue__onProfileStartup() {
    TBDistCustomizer.applyPrefDefaults();

    let locales = Services.locale.getPackagedLocales();
    const appSource = new FileSource("app", locales, "resource:///chrome/{locale}/locale/{locale}/");
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
      textcolor: "black",
      accentcolor: "white",
      author: vendorShortName,
    });
    LightweightThemeManager.addBuiltInTheme({
      id: "thunderbird-compact-dark@mozilla.org",
      name: gMailBundle.GetStringFromName("darkTheme.name"),
      description: gMailBundle.GetStringFromName("darkTheme.description"),
      iconURL: "resource:///chrome/messenger/content/messenger/dark.icon.svg",
      textcolor: "white",
      accentcolor: "black",
      popup: "#4a4a4f",
      popup_text: "rgb(249, 249, 250)",
      popup_border: "#27272b",
      author: vendorShortName,
    });
  },

 _offertToEnableAddons(aAddons) {
    let win = Services.wm.getMostRecentWindow("mail:3pane");
    let tabmail = win.document.getElementById("tabmail");

    aAddons.forEach(function(aAddon) {
    // If the add-on isn't user disabled or can't be enabled, then skip it.
    if (!aAddon.userDisabled || !(aAddon.permissions & AddonManager.PERM_CAN_ENABLE))
      return;

    tabmail.openTab("contentTab",
                    { contentPage: "about:newaddon?id=" + aAddon.id,
                      clickHandler: null });
    });
  },

  _detectNewSideloadedAddons: async function () {
    let newSideloadedAddons = await AddonManagerPrivate.getNewSideloads();
    this._offertToEnableAddons(newSideloadedAddons);
  },

  _onMailStartupDone: function MailGlue__onMailStartupDone() {
    // On Windows 7 and above, initialize the jump list module.
    const WINTASKBAR_CONTRACTID = "@mozilla.org/windows-taskbar;1";
    if (WINTASKBAR_CONTRACTID in Cc &&
        Cc[WINTASKBAR_CONTRACTID].getService(Ci.nsIWinTaskbar).available) {
      ChromeUtils.import("resource:///modules/windowsJumpLists.js");
      WinTaskbarJumpList.startup();
    }

    // For any add-ons that were installed disabled and can be enabled, offer
    // them to the user.
    var changedIDs = AddonManager.getStartupChanges(AddonManager.STARTUP_CHANGE_INSTALLED);
    AddonManager.getAddonsByIDs(changedIDs, this._offertToEnableAddons.bind(this));

    this._detectNewSideloadedAddons();
  },

  _handleLink: function MailGlue__handleLink(aSubject, aData) {
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
                             { type: "contentTab",
                               tabParams: tabParams });
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
