/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/base/content/specialTabs.js
/* globals contentTabBaseType, DOMLinkHandler */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { ExtensionParent } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionParent.sys.mjs"
);

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

  shouldSwitchTo(aArgs) {
    if (!this.tab) {
      return -1;
    }
    this.tab.browser.contentWindow.selectPrefPane(
      aArgs.paneID,
      aArgs.scrollPaneTo,
      aArgs.otherArgs
    );
    return document.getElementById("tabmail").tabInfo.indexOf(this.tab);
  },

  closeTab() {
    this.tab = null;
  },

  openTab(aTab, aArgs) {
    aTab.tabNode.setIcon(
      "chrome://messenger/skin/icons/new/compact/settings.svg"
    );

    // First clone the page and set up the basics.
    const clone = document
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

    aTab.findbar = document.createXULElement("findbar");
    aTab.findbar.setAttribute(
      "browserid",
      "preferencesTabBrowser" + this.lastBrowserId
    );
    aTab.panel.appendChild(aTab.findbar);

    // Default to reload being disabled.
    aTab.reloadEnabled = false;

    aTab.url = "about:preferences";
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
      function (event) {
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
    const params = {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      postData: aArgs.postData || null,
    };
    aTab.browser.loadURI(Services.io.newURI("about:preferences"), params);

    this.tab = aTab;
    this.lastBrowserId++;
  },

  persistTab(aTab) {
    if (aTab.browser.currentURI.spec == "about:blank") {
      return null;
    }

    return {
      paneID: aTab.paneID,
      scrollPaneTo: aTab.scrollPaneTo,
      otherArgs: aTab.otherArgs,
    };
  },

  restoreTab(aTabmail, aPersistedState) {
    aTabmail.openTab("preferencesTab", {
      paneID: aPersistedState.paneID,
      scrollPaneTo: aPersistedState.scrollPaneTo,
      otherArgs: aPersistedState.otherArgs,
    });
  },
};
