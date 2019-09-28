/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(this, "BrowserToolboxProcess",
                               "resource://devtools/client/framework/ToolboxProcess.jsm");

XPCOMUtils.defineLazyGetter(this, "DeveloperToolbar", function() {
  var tmp = {};
  ChromeUtils.import("resource://devtools/shared/Loader.jsm", tmp);
  var DeveloperToolbar =  tmp.require("devtools/client/shared/developer-toolbar").DeveloperToolbar;
  return new DeveloperToolbar(window);
});

var ResponsiveUI = {
  toggle() {
    this.ResponsiveUIManager.toggle(window, getBrowser().selectedTab);
  }
};

XPCOMUtils.defineLazyGetter(ResponsiveUI, "ResponsiveUIManager", function() {
  var tmp = {};
  ChromeUtils.import("resource://devtools/client/responsivedesign/responsivedesign.jsm", tmp);
  return tmp.ResponsiveUIManager;
});

var Scratchpad = {
  openScratchpad() {
    return this.ScratchpadManager.openScratchpad();
  }
};

XPCOMUtils.defineLazyGetter(Scratchpad, "ScratchpadManager", function() {
  var tmp = {};
  ChromeUtils.import("resource://devtools/client/scratchpad/scratchpad-manager.jsm", tmp);
  return tmp.ScratchpadManager;
});

ChromeUtils.defineModuleGetter(this, "gDevTools",
                               "resource://devtools/client/framework/gDevTools.jsm");

ChromeUtils.defineModuleGetter(this, "gDevToolsBrowser",
                               "resource://devtools/client/framework/gDevTools.jsm");

function openEyedropper() {
  var eyedropper = new this.Eyedropper(this, { context: "menu",
                                               copyOnSelect: true });
  eyedropper.open();
}

Object.defineProperty(this, "Eyedropper", {
  get() {
    var tmp = {};
    ChromeUtils.import("resource://devtools/shared/Loader.jsm", tmp);
    return tmp.require("devtools/client/eyedropper/eyedropper").Eyedropper;
  },
  configurable: true,
  enumerable: true
});

Object.defineProperty(this, "HUDService", {
  get() {
    var tmp = {};
    ChromeUtils.import("resource://devtools/shared/Loader.jsm", tmp);
    return tmp.require("devtools/client/webconsole/hudservice").HUDService;
  },
  configurable: true,
  enumerable: true
});

var gWebDeveloper = {
  validateThisPage: function() {
    var service = GetLocalizedStringPref("browser.validate.html.service");
    var uri = getBrowser().currentURI;
    var checkURL = service + encodeURIComponent(uri.spec);
    var opentab = Services.prefs.getBoolPref("browser.tabs.opentabfor.middleclick");
    openUILinkIn(checkURL, opentab ? "tabfocused" : "window",
                 { referrerURI: uri, relatedToCurrent: true });
  },

  enableDebugger: function(aItem) {
    var shouldEnable = aItem.getAttribute("checked") == "true";
    Services.prefs.setBoolPref("devtools.debugger.remote-enabled", shouldEnable);
  },

  handleEvent: function(aEvent) {
    switch (aEvent.type) {
      case "load":
        window.removeEventListener("load", gWebDeveloper);
        window.addEventListener("unload", gWebDeveloper);
        var popup = document.getElementById("toolsPopup");
        popup.addEventListener("popupshowing", gWebDeveloper);
        // Don't use gDevToolsBrowser.updateCommandAvailability() at the moment
        // because some tools aren't working.
        if (!gDevToolsBrowser._old_updateCommandAvailability) {
          gDevToolsBrowser._old_updateCommandAvailability = gDevToolsBrowser.updateCommandAvailability;
          gDevToolsBrowser.updateCommandAvailability = this.updateCommandAvailability;
        }
        // Add Devtools menuitems, observers, and listeners
        gDevToolsBrowser.registerBrowserWindow(window);
        Services.prefs.addObserver(this.devtoolsThemePref, this);
        this.updateDevtoolsThemeAttribute();
        break;

      case "unload":
        window.removeEventListener("unload", gWebDeveloper);
        gDevToolsBrowser.forgetBrowserWindow(window);
        Services.prefs.removeObserver(this.devtoolsThemePref, this);

        var desc = Object.getOwnPropertyDescriptor(window, "DeveloperToolbar");
        if (desc && !desc.get)
          DeveloperToolbar.destroy();
        break;

      case "popupshowing":
        this.initMenuItems();
        this.updateCommandAvailability(window);
        break;
    }
  },

  initMenuItems: function() {
    var menuitem = document.getElementById("validatePage");
    var uri = getBrowser().currentURI;
    if (uri && (uri.schemeIs("http") || uri.schemeIs("https")))
      menuitem.removeAttribute("disabled");
    else
      menuitem.setAttribute("disabled", true);

    var enabled = Services.prefs
                          .getBoolPref("devtools.debugger.remote-enabled");
    document.getElementById("devtoolsDebugger")
            .setAttribute("checked", enabled);
  },

  devtoolsThemePref: "devtools.theme",

  observe: function (subject, topic, data) {
    if (topic == "nsPref:changed" && data == this.devtoolsThemePref) {
      this.updateDevtoolsThemeAttribute();
    }
  },

  updateDevtoolsThemeAttribute: function() {
    // Set an attribute on root element to make it possible
    // to change colors based on the selected devtools theme.
    var devtoolsTheme = Services.prefs.getCharPref(this.devtoolsThemePref);
    // Bug 1096469 - Make devedition theme work with custom devtools themes.
    if (devtoolsTheme != "dark")
      devtoolsTheme = "light";

    document.documentElement.setAttribute("devtoolstheme", devtoolsTheme);
    // document.getElementById("developer-toolbar").setAttribute("devtoolstheme", devtoolsTheme);
  },

  updateCommandAvailability: function(win) {
    var doc = win.document;

    function toggleCmd(id, isEnabled) {
      var cmd = doc.getElementById(id);
      if (isEnabled) {
        cmd.removeAttribute("disabled");
        cmd.removeAttribute("hidden");
      } else {
        cmd.setAttribute("disabled", "true");
        cmd.setAttribute("hidden", "true");
      }
    };

    // Enable developer toolbar?
    var devToolbarEnabled = Services.prefs.getBoolPref("devtools.toolbar.enabled");
    toggleCmd("Tools:DevToolbar", devToolbarEnabled);
    var focusEl = doc.getElementById("Tools:DevToolbarFocus");
    if (devToolbarEnabled)
      focusEl.removeAttribute("disabled");
    else
      focusEl.setAttribute("disabled", "true");

    if (devToolbarEnabled && Services.prefs.getBoolPref("devtools.toolbar.visible"))
      win.DeveloperToolbar.show(false).catch(console.error);

    // Enable Browser Toolbox?
    var chromeEnabled = Services.prefs.getBoolPref("devtools.chrome.enabled");
    var devtoolsRemoteEnabled = Services.prefs.getBoolPref("devtools.debugger.remote-enabled");
    var remoteEnabled = chromeEnabled && devtoolsRemoteEnabled;
    toggleCmd("Tools:BrowserToolbox", remoteEnabled);
    // Currently "gMultiProcessBrowser" is always falsey.
    //toggleCmd("Tools:BrowserContentToolbox", remoteEnabled && win.gMultiProcessBrowser);
    toggleCmd("Tools:BrowserContentToolbox", false);

    // Enable DevTools connection screen, if the preference allows this.
    toggleCmd("Tools:DevToolsConnect", devtoolsRemoteEnabled);
  },
}

window.addEventListener("load", gWebDeveloper);
