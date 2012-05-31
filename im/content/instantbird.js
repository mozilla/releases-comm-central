/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */


var TAB_DROP_TYPE = "application/x-moz-tabbrowser-tab";

var convWindow = {
  load: function mo_load() {
    Components.utils.import("resource:///modules/imWindows.jsm");
    Conversations.registerWindow(window);

    if ("arguments" in window) {
      while (window.arguments[0] instanceof XULElement) {
        // swap the given tab with the default dummy conversation tab
        // and then close the original tab in the other window.
        let tab = window.arguments.shift();
        document.getElementById("conversations").importConversation(tab);
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
      // activated puts the textbox in an unconsistant state, some
      // special characters like ^ don't work, so delay the focus
      // operation...
      getBrowser().selectedConversation.focus();
    }, 0);
  },
  onresize: function mo_onresize(aEvent) {
    if (aEvent.originalTarget != window)
      return;

    // Resize each textbox (if the splitter has not been used).
    let convs = getBrowser().conversations;
    for each (let conv in convs)
      conv.onConvResize(aEvent);
  }
};

function getConvWindowURL() "chrome://instantbird/content/instantbird.xul"

function getBrowser()
{
  return document.getElementById("conversations");
}

// Inspired from the same function in mozilla/browser/base/content/browser.js
function FillInHTMLTooltip(tipElement)
{
  if (tipElement.namespaceURI == "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul")
    return false;

  var defView = tipElement.ownerDocument && tipElement.ownerDocument.defaultView;
  // XXX Work around bug 350679:
  // "Tooltips can be fired in documents with no view".
  if (!defView)
    return false;

  while (tipElement) {
    if (tipElement.nodeType == Node.ELEMENT_NODE) {
      let titleText = tipElement.getAttribute("title");
      if (titleText && /\S/.test(titleText)) {
        let direction = defView.getComputedStyle(tipElement, "")
                               .getPropertyValue("direction");
        let tipNode = document.getElementById("aHTMLTooltip");
        tipNode.style.direction = direction;
        // Per HTML 4.01 6.2 (CDATA section), literal CRs and tabs should be
        // replaced with spaces, and LFs should be removed entirely.
        // XXX Bug 322270: We don't preserve the result of entities like &#13;,
        // which should result in a line break in the tooltip, because we can't
        // distinguish that from a literal character in the source by this point.
        titleText = titleText.replace(/[\r\t]/g, ' ').replace(/\n/g, '');
        tipNode.setAttribute("label", titleText);
        return true;
      }
      // When hovering a link, displaying a tooltip for a parent
      // element is confusing, so we prevent it here.
      if (tipElement.hasAttribute("href"))
        return false;
    }
    tipElement = tipElement.parentNode;
  }

  return false;
}

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
    throw Cr.NS_NOINTERFACE;
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
