/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/base/content/specialTabs.js
/* globals contentTabBaseType, DOMLinkHandler */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { ExtensionParent } = ChromeUtils.import(
  "resource://gre/modules/ExtensionParent.jsm"
);

var gPrefTab = null;

/**
 * A tab to show Preferences.
 */
var preferencesTabType = {
  __proto__: contentTabBaseType,
  name: "preferencesTab",
  perTabPanel: "vbox",
  lastBrowserId: 0,
  bundle: Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  ),
  protoSvc: Cc["@mozilla.org/uriloader/external-protocol-service;1"].getService(
    Ci.nsIExternalProtocolService
  ),

  get loadingTabString() {
    delete this.loadingTabString;
    return (this.loadingTabString = document
      .getElementById("bundle_messenger")
      .getString("loadingTab"));
  },

  modes: {
    preferencesTab: {
      type: "preferencesTab",
    },
  },

  initialize() {
    let tabmail = document.getElementById("tabmail");
    tabmail.registerTabType(this);
  },

  shouldSwitchTo(aArgs) {
    if (!gPrefTab) {
      return -1;
    }
    gPrefTab.browser.contentWindow.selectPrefPane(
      aArgs.paneID,
      aArgs.scrollPaneTo,
      aArgs.otherArgs
    );
    return document.getElementById("tabmail").tabInfo.indexOf(gPrefTab);
  },

  closeTab(aTab) {
    gPrefTab = null;
  },

  openTab(aTab, aArgs) {
    if (!("url" in aArgs)) {
      throw new Error("url must be specified");
    }

    // First clone the page and set up the basics.
    let clone = document
      .getElementById("preferencesTab")
      .firstElementChild.cloneNode(true);

    clone.setAttribute("id", "preferencesTab" + this.lastBrowserId);
    clone.setAttribute("collapsed", false);

    aTab.panel.setAttribute("id", "preferencesTabWrapper" + this.lastBrowserId);
    aTab.panel.appendChild(clone);

    // Start setting up the browser.
    aTab.browser = aTab.panel.querySelector("browser");
    aTab.browser.setAttribute(
      "id",
      "preferencesTabBrowser" + this.lastBrowserId
    );
    aTab.browser.setAttribute("autocompletepopup", "PopupAutoComplete");
    aTab.browser.addEventListener("DOMLinkAdded", DOMLinkHandler);

    aTab.findbar = aTab.panel.querySelector("findbar");
    aTab.findbar.setAttribute(
      "browserid",
      "preferencesTabBrowser" + this.lastBrowserId
    );

    // Default to reload being disabled.
    aTab.reloadEnabled = false;

    aTab.url = aArgs.url;
    aTab.paneID = aArgs.paneID;
    aTab.scrollPaneTo = aArgs.scrollPaneTo;
    aTab.otherArgs = aArgs.otherArgs;

    // Now set up the listeners.
    this._setUpTitleListener(aTab);
    this._setUpCloseWindowListener(aTab);

    // Wait for full loading of the tab and the automatic selecting of last tab.
    // Then run the given onload code.
    aTab.browser.addEventListener(
      "paneSelected",
      function(event) {
        aTab.pageLoading = false;
        aTab.pageLoaded = true;

        if ("onLoad" in aArgs) {
          // Let selection of the initial pane complete before selecting another.
          // Otherwise we can end up with two panes selected at once.
          aTab.browser.contentWindow.setTimeout(() => {
            // By now, the tab could already be closed. Check that it isn't.
            if (aTab.panel) {
              aArgs.onLoad(event, aTab.browser);
            }
          }, 0);
        }
      },
      { once: true }
    );

    // Initialize our unit testing variables.
    aTab.pageLoading = true;
    aTab.pageLoaded = false;

    // Now start loading the content.
    aTab.title = this.loadingTabString;

    ExtensionParent.apiManager.emit("extension-browser-inserted", aTab.browser);
    let params = {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      postData: aArgs.postData || null,
    };
    aTab.browser.loadURI(aArgs.url, params);

    gPrefTab = aTab;
    this.lastBrowserId++;
  },

  persistTab(aTab) {
    if (aTab.browser.currentURI.spec == "about:blank") {
      return null;
    }

    return {
      tabURI: aTab.url,
      paneID: aTab.paneID,
      scrollPaneTo: aTab.scrollPaneTo,
      otherArgs: aTab.otherArgs,
    };
  },

  restoreTab(aTabmail, aPersistedState) {
    aTabmail.openTab("preferencesTab", {
      url: aPersistedState.tabURI,
      paneID: aPersistedState.paneID,
      scrollPaneTo: aPersistedState.scrollPaneTo,
      otherArgs: aPersistedState.otherArgs,
    });
  },
};
