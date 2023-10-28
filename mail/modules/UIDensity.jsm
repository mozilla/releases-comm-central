/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["UIDensity"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

var registeredWindows = new Set();

function updateWindow(win) {
  switch (UIDensity.prefValue) {
    case UIDensity.MODE_COMPACT:
      win.document.documentElement.setAttribute("uidensity", "compact");
      break;
    case UIDensity.MODE_TOUCH:
      win.document.documentElement.setAttribute("uidensity", "touch");
      break;
    default:
      win.document.documentElement.removeAttribute("uidensity");
      break;
  }

  if (win.TabsInTitlebar !== undefined) {
    win.TabsInTitlebar.update();
  }

  win.dispatchEvent(
    new win.CustomEvent("uidensitychange", { detail: UIDensity.prefValue })
  );
}

function updateAllWindows() {
  for (const win of registeredWindows) {
    updateWindow(win);
  }
}

var UIDensity = {
  MODE_COMPACT: 0,
  MODE_NORMAL: 1,
  MODE_TOUCH: 2,

  prefName: "mail.uidensity",

  /**
   * Set the UI density.
   *
   * @param {integer} mode - One of the MODE constants.
   */
  setMode(mode) {
    Services.prefs.setIntPref(this.prefName, mode);
  },

  /**
   * Register a window to be updated if the mode ever changes. The current
   * value is applied to the window. Deregistration is automatic.
   *
   * @param {Window} win
   */
  registerWindow(win) {
    registeredWindows.add(win);
    win.addEventListener("unload", () => registeredWindows.delete(win));
    updateWindow(win);
  },
};

XPCOMUtils.defineLazyPreferenceGetter(
  UIDensity,
  "prefValue",
  UIDensity.prefName,
  null,
  updateAllWindows
);
