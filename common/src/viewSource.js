// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gViewSourceUtils, internalSave */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { CharsetMenu } = ChromeUtils.import(
  "resource://gre/modules/CharsetMenu.jsm"
);

var gBrowser;
addEventListener("load", () => {
  gBrowser = document.getElementById("content");
  gBrowser.addEventListener("pagetitlechanged", () => {
    document.title =
      document.documentElement.getAttribute("titlepreface") +
      gBrowser.contentDocument.title +
      document.documentElement.getAttribute("titlemenuseparator") +
      document.documentElement.getAttribute("titlemodifier");
  });

  if (Services.prefs.getBoolPref("view_source.wrap_long_lines", false)) {
    document
      .getElementById("cmd_wrapLongLines")
      .setAttribute("checked", "true");
  }

  gViewSourceUtils.viewSourceInBrowser({
    ...window.arguments[0],
    viewSourceBrowser: gBrowser,
  });
  gBrowser.contentWindow.focus();
});

var viewSourceChrome = {
  promptAndGoToLine() {
    let actor = gViewSourceUtils.getViewSourceActor(gBrowser.browsingContext);
    actor.manager.getActor("ViewSourcePage").promptAndGoToLine();
  },

  toggleWrapping() {
    let state = gBrowser.contentDocument.body.classList.toggle("wrap");
    if (state) {
      document
        .getElementById("cmd_wrapLongLines")
        .setAttribute("checked", "true");
    } else {
      document.getElementById("cmd_wrapLongLines").removeAttribute("checked");
    }
    Services.prefs.setBoolPref("view_source.wrap_long_lines", state);
  },

  /**
   * Called by clicks on a menu populated by CharsetMenu.jsm to
   * change the selected character set.
   *
   * @param event
   *        The click event on a character set menuitem.
   */
  onSetCharacterSet(event) {
    if (event.target.hasAttribute("charset")) {
      let charset = event.target.getAttribute("charset");
      // Replace generic Japanese with Shift_JIS which will also auto-detect
      // ISO-2022-JP and EUC-JP.
      if (charset == "Japanese") {
        charset = "Shift_JIS";
      }
      gBrowser.characterSet = charset;
      gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE);
    }
  },

  /**
   * Reloads the browser, bypassing the network cache.
   */
  reload() {
    gBrowser.reloadWithFlags(
      Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY |
        Ci.nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE
    );
  },
};

/**
 * PrintUtils uses this to make Print Preview work.
 */
var PrintPreviewListener = {
  _ppBrowser: null,

  getPrintPreviewBrowser() {
    if (!this._ppBrowser) {
      this._ppBrowser = document.createXULElement("browser");
      this._ppBrowser.setAttribute("flex", "1");
      this._ppBrowser.setAttribute("type", "content");
    }

    if (gBrowser.isRemoteBrowser) {
      this._ppBrowser.setAttribute("remote", "true");
    } else {
      this._ppBrowser.removeAttribute("remote");
    }

    let findBar = document.getElementById("FindToolbar");
    document
      .getElementById("appcontent")
      .insertBefore(this._ppBrowser, findBar);

    return this._ppBrowser;
  },

  getSourceBrowser() {
    return gBrowser;
  },

  getNavToolbox() {
    return document.getElementById("toolbar-placeholder");
  },

  onEnter() {
    let toolbox = document.getElementById("viewSource-toolbox");
    toolbox.hidden = true;
    gBrowser.collapsed = true;
  },

  onExit() {
    this._ppBrowser.remove();
    gBrowser.collapsed = false;
    document.getElementById("viewSource-toolbox").hidden = false;
  },

  activateBrowser(browser) {
    browser.docShellIsActive = true;
  },
};

// viewZoomOverlay.js uses this
function getBrowser() {
  return gBrowser;
}

// Strips the |view-source:| for internalSave()
function ViewSourceSavePage() {
  internalSave(
    gBrowser.currentURI.spec.replace(/^view-source:/i, ""),
    null,
    null,
    null,
    null,
    null,
    "SaveLinkTitle",
    null,
    null,
    gBrowser.contentDocument,
    null,
    gBrowser.webNavigation.QueryInterface(Ci.nsIWebPageDescriptor),
    null,
    Services.scriptSecurityManager.getSystemPrincipal()
  );
}
