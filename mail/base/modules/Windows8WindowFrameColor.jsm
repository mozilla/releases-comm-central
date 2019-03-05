/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

this.EXPORTED_SYMBOLS = ["Windows8WindowFrameColor"];

const {WindowsRegistry} = ChromeUtils.import("resource://gre/modules/WindowsRegistry.jsm");
const {TagUtils} = ChromeUtils.import("resource:///modules/TagUtils.jsm");

var Windows8WindowFrameColor = {
  _windowFrameColor: null,

  get() {
    if (this._windowFrameColor)
      return this._windowFrameColor;

    const HKCU = Ci.nsIWindowsRegKey.ROOT_KEY_CURRENT_USER;
    const dwmKey = "Software\\Microsoft\\Windows\\DWM";
    let customizationColor = WindowsRegistry.readRegKey(HKCU, dwmKey,
                                                        "ColorizationColor");
    if (customizationColor == undefined) {
      // Seems to be the default color (hardcoded because of bug 1065998, bug 1107902)
      return [158, 158, 158];
    }

    // The color returned from the Registry is in decimal form.
    let customizationColorHex = customizationColor.toString(16);
    let colorizationColorBalance = WindowsRegistry.readRegKey(HKCU, dwmKey,
                                                              "ColorizationColorBalance");

    return this._windowFrameColor = TagUtils.getColor(customizationColorHex,
                                                         colorizationColorBalance);
  },
};
