/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["UIFontSize"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var registeredWindows = new Set();

function updateWindow(win) {
  if (UIFontSize.prefValue == UIFontSize.DEFAULT) {
    win.document.documentElement.style.removeProperty("font-size");
    return;
  }

  // Prevent any font update if the defined value can make the UI unusable.
  if (
    UIFontSize.prefValue <= UIFontSize.MIN_VALUE ||
    UIFontSize.prefValue >= UIFontSize.MAX_VALUE
  ) {
    // Reset to the default font size.
    UIFontSize.setSize(0);
    Services.console.logStringMessage(
      `Unsupported font size: ${UIFontSize.prefValue}`
    );
    return;
  }

  win.document.documentElement.style.setProperty(
    "font-size",
    `${UIFontSize.prefValue}px`
  );
}

function updateAllWindows() {
  for (let win of registeredWindows) {
    updateWindow(win);
  }
}

var UIFontSize = {
  DEFAULT: 0,
  MIN_VALUE: 9,
  MAX_VALUE: 30,

  /**
   * Set the font size.
   *
   * @param {integer} size - The new size value.
   */
  setSize(size) {
    Services.prefs.setIntPref("mail.uifontsize", size);
  },

  /**
   * Register a window to be updated if the size ever changes. The current
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
  UIFontSize,
  "prefValue",
  "mail.uifontsize",
  null,
  updateAllWindows
);
