/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


var TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";

var convWindow = {
  load: function mo_load() {
    Components.utils.import("resource:///modules/imWindows.jsm");
    Conversations.registerWindow(window);

    if ("arguments" in window) {
      while (window.arguments[0] &&
             window.arguments[0] instanceof XULElement) {
        // swap the given tab with the default dummy conversation tab
        // and then close the original tab in the other window.
        let tab = window.arguments.shift();
        getTabBrowser().importPanel(tab);
      }
    }

    window.addEventListener("unload", convWindow.unload);
    window.addEventListener("resize", convWindow.onresize);
    window.addEventListener("activate", convWindow.onactivate, true);
    window.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIWebNavigation)
          .QueryInterface(Ci.nsIDocShellTreeItem).treeOwner
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIXULWindow)
          .XULBrowserWindow = window.XULBrowserWindow;
  },
  unload: function mo_unload() {
    Conversations.unregisterWindow(window);
  },
  onactivate: function mo_onactivate(aEvent) {
    Conversations.onWindowFocus(window);
    setTimeout(function () {
      // setting the focus to the textbox just after the window is
      // activated puts the textbox in an inconsistent state, some
      // special characters like ^ don't work, so delay the focus
      // operation...
      let panel = getTabBrowser().selectedPanel;
      panel.focus();
      if ("onSelect" in panel)
        panel.onSelect();
    }, 0);
  },
  onresize: function mo_onresize(aEvent) {
    if (aEvent.originalTarget != window)
      return;

    // Resize each textbox (if the splitter has not been used).
    let panels = getTabBrowser().tabPanels;
    for (let panel of panels) {
      if ("onResize" in panel)
        panel.onResize(aEvent);
    }
  }
};

function getConvWindowURL() "chrome://instantbird/content/instantbird.xul"

function getTabBrowser() document.getElementById("conversations")

function getBrowser() getTabBrowser().selectedBrowser

// Copied from mozilla/browser/base/content/browser.js (and simplified)
var XULBrowserWindow = {
  // Stored Status
  status: "",
  defaultStatus: "",
  jsStatus: "",
  jsDefaultStatus: "",
  overLink: "",
  statusText: "",

  QueryInterface: function (aIID) {
    if (aIID.equals(Ci.nsISupportsWeakReference) ||
        aIID.equals(Ci.nsIXULBrowserWindow) ||
        aIID.equals(Ci.nsISupports))
      return this;
    throw Components.results.NS_NOINTERFACE;
  },

  get statusTextField () {
    delete this.statusTextField;
    return this.statusTextField = document.getElementById("statusbar-display");
  },

  setStatus: function (status) {
    this.status = status;
    this.updateStatusField();
  },

  setJSStatus: function (status) {
    this.jsStatus = status;
    this.updateStatusField();
  },

  setJSDefaultStatus: function (status) {
    this.jsDefaultStatus = status;
    this.updateStatusField();
  },

  setDefaultStatus: function (status) {
    this.defaultStatus = status;
    this.updateStatusField();
  },

  setOverLink: function (link, b) {
    // Encode bidirectional formatting characters.
    // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
    this.overLink = link.replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
                                 encodeURIComponent);
    this.updateStatusField();
  },

  // Called before links are navigated to, allows us to retarget them if needed.
  onBeforeLinkTraversal: function(originalTarget, linkURI, linkNode, isAppTab) {
    return originalTarget;
  },

  setStatusEnd: function (aStatusEndText, aError) {
    let field = document.getElementById("statusbar-display-end");
    field.label = aStatusEndText;
    field.hidden = !aStatusEndText;
    if (aError)
      field.setAttribute("error", "true");
    else
      field.removeAttribute("error");
  },

  updateStatusField: function () {
    var text = this.overLink || this.status || this.jsStatus || this.jsDefaultStatus || this.defaultStatus;

    // check the current value so we don't trigger an attribute change
    // and cause needless (slow!) UI updates
    if (this.statusText != text) {
      this.statusTextField.label = text;
      this.statusText = text;
    }
  }
}

this.addEventListener("load", convWindow.load);
