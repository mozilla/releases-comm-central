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

    window.addEventListener("mousemove", MousePosTracker, false);
    window.addEventListener("dragover", MousePosTracker, false);

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

function getConvWindowURL() { return "chrome://instantbird/content/instantbird.xul"; }

function getTabBrowser() { return document.getElementById("conversations"); }

function getBrowser() { return getTabBrowser().selectedBrowser; }

// Copied from mozilla/browser/base/content/utilityOverlay.js
function trimURL(aURL) {
  // This function must not modify the given URL such that calling
  // nsIURIFixup::createFixupURI with the result will produce a different URI.
  return aURL /* remove single trailing slash for http/https/ftp URLs */
             .replace(/^((?:http|https|ftp):\/\/[^/]+)\/$/, "$1")
              /* remove http:// unless the host starts with "ftp\d*\." or contains "@" */
             .replace(/^http:\/\/((?!ftp\d*\.)[^\/@]+(?:\/|$))/, "$1");
}

// Copied from mozilla/browser/base/content/browser.js (and simplified)
var XULBrowserWindow = {
  // Stored Status
  status: "",
  defaultStatus: "",
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
    return getTabBrowser().getStatusPanel();
  },

  setStatus: function (status) {
    this.status = status;
    this.updateStatusField();
  },

  setJSStatus: function () {
    // unsupported
  },

  setDefaultStatus: function (status) {
    this.defaultStatus = status;
    this.updateStatusField();
  },

  setOverLink: function (url, anchorElt) {
    // Encode bidirectional formatting characters.
    // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
    url = url.replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
                      encodeURIComponent);

    // if (gURLBar && gURLBar._mayTrimURLs /* corresponds to browser.urlbar.trimURLs */)
    // This pref is true by default for Firefox, let's follow that.
    url = trimURL(url);

    this.overLink = url;
    LinkTargetDisplay.update();
  },

  // Called before links are navigated to, allows us to retarget them if needed.
  onBeforeLinkTraversal: function(originalTarget, linkURI, linkNode, isAppTab) {
    // Simplified for IB.
    return originalTarget;
  },

  updateStatusField: function () {
    var text, type, types = ["overLink"];
    // if (this._busyUI)
    // Instantbird uses the status for typing notifications, which should
    // always be shown.
    types.push("status");
    types.push("defaultStatus");
    for (type of types) {
      text = this[type];
      if (text)
        break;
    }

    // check the current value so we don't trigger an attribute change
    // and cause needless (slow!) UI updates
    if (this.statusText != text) {
      let field = this.statusTextField;
      field.setAttribute("previoustype", field.getAttribute("type"));
      field.setAttribute("type", type);
      // Show IB typing notifications on the opposite side.
      if (this.status)
        field.setAttribute("flipped", "true");
      else
        field.removeAttribute("flipped");
      field.label = text;
      field.setAttribute("crop", type == "overLink" ? "center" : "end");
      this.statusText = text;
    }
  }
};

// Copied from mozilla/browser/base/content/browser.js
var LinkTargetDisplay = {
  DELAY_SHOW: 80, // Services.prefs.getIntPref("browser.overlink-delay");
  DELAY_HIDE: 250,
  _timer: 0,

  get _isVisible () { return XULBrowserWindow.statusTextField.label != ""; },

  update: function () {
    clearTimeout(this._timer);
    window.removeEventListener("mousemove", this, true);

    if (!XULBrowserWindow.overLink) {
      if (XULBrowserWindow.hideOverLinkImmediately)
        this._hide();
      else
        this._timer = setTimeout(this._hide.bind(this), this.DELAY_HIDE);
      return;
    }

    if (this._isVisible) {
      XULBrowserWindow.updateStatusField();
    } else {
      // Let the display appear when the mouse doesn't move within the delay
      this._showDelayed();
      window.addEventListener("mousemove", this, true);
    }
  },

  handleEvent: function (event) {
    switch (event.type) {
      case "mousemove":
        // Restart the delay since the mouse was moved
        clearTimeout(this._timer);
        this._showDelayed();
        break;
    }
  },

  _showDelayed: function () {
    this._timer = setTimeout(function (self) {
      XULBrowserWindow.updateStatusField();
      window.removeEventListener("mousemove", self, true);
    }, this.DELAY_SHOW, this);
  },

  _hide: function () {
    clearTimeout(this._timer);

    XULBrowserWindow.updateStatusField();
  }
};

// Copied from mozilla/browser/base/content/browser.js
var MousePosTracker = {
  _listeners: new Set(),
  _x: 0,
  _y: 0,
  get _windowUtils() {
    delete this._windowUtils;
    return this._windowUtils = window.getInterface(Ci.nsIDOMWindowUtils);
  },

  addListener: function (listener) {
    if (this._listeners.has(listener))
      return;

    listener._hover = false;
    this._listeners.add(listener);

    this._callListener(listener);
  },

  removeListener: function (listener) {
    this._listeners.delete(listener);
  },

  handleEvent: function (event) {
    var fullZoom = this._windowUtils.fullZoom;
    this._x = event.screenX / fullZoom - window.mozInnerScreenX;
    this._y = event.screenY / fullZoom - window.mozInnerScreenY;

    this._listeners.forEach(function (listener) {
      try {
        this._callListener(listener);
      } catch (e) {
        Cu.reportError(e);
      }
    }, this);
  },

  _callListener: function (listener) {
    let rect = listener.getMouseTargetRect();
    let hover = this._x >= rect.left &&
                this._x <= rect.right &&
                this._y >= rect.top &&
                this._y <= rect.bottom;

    if (hover == listener._hover)
      return;

    listener._hover = hover;

    if (hover) {
      if (listener.onMouseEnter)
        listener.onMouseEnter();
    } else {
      if (listener.onMouseLeave)
        listener.onMouseLeave();
    }
  }
};

function findAgain(aReversed) {
  let conv = getTabBrowser().selectedConversation;
  // Find from the bottom up if it's a conversation.
  if (conv) {
    conv.findbar.onFindAgainCommand(!aReversed);
    return;
  }
  let panel = getTabBrowser().selectedPanel;
  if (!panel)
    return;
  if (panel.findbar)
    panel.findbar.onFindAgainCommand(aReversed);
}

this.addEventListener("load", convWindow.load);
