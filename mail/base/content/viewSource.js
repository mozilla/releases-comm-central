// -*- indent-tabs-mode: nil; js-indent-level: 2 -*-

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gViewSourceUtils, internalSave, ZoomManager */

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

XPCOMUtils.defineLazyScriptGetter(
  this,
  "PrintUtils",
  "chrome://messenger/content/printUtils.js"
);

// Needed for printing.
window.browserDOMWindow = window.opener.browserDOMWindow;

var gBrowser;
addEventListener("load", () => {
  gBrowser = document.getElementById("content");
  gBrowser.getTabForBrowser = () => {
    return null;
  };
  gBrowser.addEventListener("pagetitlechanged", () => {
    document.title =
      document.documentElement.getAttribute("titlepreface") +
      gBrowser.contentTitle +
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

  document
    .getElementById("repair-text-encoding")
    .setAttribute("disabled", !gBrowser.mayEnableCharacterEncodingMenu);
  gBrowser.addEventListener(
    "load",
    () => {
      document
        .getElementById("repair-text-encoding")
        .setAttribute("disabled", !gBrowser.mayEnableCharacterEncodingMenu);
    },
    true
  );

  gBrowser.addEventListener(
    "DoZoomEnlargeBy10",
    () => {
      ZoomManager.scrollZoomEnlarge(gBrowser);
    },
    true
  );
  gBrowser.addEventListener(
    "DoZoomReduceBy10",
    () => {
      ZoomManager.scrollReduceEnlarge(gBrowser);
    },
    true
  );
});

var viewSourceChrome = {
  promptAndGoToLine() {
    const actor = gViewSourceUtils.getViewSourceActor(gBrowser.browsingContext);
    actor.manager.getActor("ViewSourcePage").promptAndGoToLine();
  },

  toggleWrapping() {
    const state = gBrowser.contentDocument.body.classList.toggle("wrap");
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
   * Called by clicks on a menuitem to force the character set detection.
   */
  onForceCharacterSet() {
    gBrowser.forceEncodingDetection();
    gBrowser.reloadWithFlags(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE);
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
    null,
    "SaveLinkTitle",
    null,
    null,
    gBrowser.cookieJarSettings,
    gBrowser.contentDocument,
    null,
    gBrowser.webNavigation.QueryInterface(Ci.nsIWebPageDescriptor),
    null,
    Services.scriptSecurityManager.getSystemPrincipal()
  );
}

/** Called by ContextMenuParent.sys.mjs */
function openContextMenu({ data }, browser) {
  const popup = browser.ownerDocument.getElementById("viewSourceContextMenu");

  const newEvent = document.createEvent("MouseEvent");
  const screenX = data.context.screenXDevPx / window.devicePixelRatio;
  const screenY = data.context.screenYDevPx / window.devicePixelRatio;
  newEvent.initNSMouseEvent(
    "contextmenu",
    true,
    true,
    null,
    0,
    screenX,
    screenY,
    0,
    0,
    false,
    false,
    false,
    false,
    2,
    null,
    0,
    data.context.mozInputSource
  );
  popup.openPopupAtScreen(newEvent.screenX, newEvent.screenY, true, newEvent);
}
