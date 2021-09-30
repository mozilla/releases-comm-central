/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["BuiltInThemes"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

// List of themes built in to the browser. The themes are represented by objects
// containing their id, current version, and path relative to
// resource://builtin-themes/.
const STANDARD_THEMES = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    {
      version: "1.2",
      path: "light/",
    },
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    {
      version: "1.2",
      path: "dark/",
    },
  ],
]);

const COLORWAY_THEMES = new Map();

class _BuiltInThemes {
  constructor() {
  }

  /**
   * @param {string} id An addon's id string.
   * @returns {string}
   *   If `id` refers to a built-in theme, returns a path pointing to the
   *   theme's preview image. Null otherwise.
   */
  previewForBuiltInThemeId(id) {
    if (STANDARD_THEMES.has(id)) {
      return `resource://builtin-themes/${
        STANDARD_THEMES.get(id).path
      }preview.svg`;
    }

    return null;
  }

  /**
   * If the active theme is built-in, this function calls
   * AddonManager.maybeInstallBuiltinAddon for that theme.
   */
  maybeInstallActiveBuiltInTheme() {
    let activeThemeID = Services.prefs.getStringPref(
      "extensions.activeThemeID",
      "default-theme@mozilla.org"
    );
    let activeBuiltInTheme = STANDARD_THEMES.get(activeThemeID);
    if (activeBuiltInTheme) {
      AddonManager.maybeInstallBuiltinAddon(
        activeThemeID,
        activeBuiltInTheme.version,
        `resource://builtin-themes/${activeBuiltInTheme.path}`
      );
    }
  }

  /**
   * Ensures that all built-in themes are installed.
   */
  async ensureBuiltInThemes() {
    let installPromises = [];
    for (let [id, { version, path }] of STANDARD_THEMES.entries()) {
      installPromises.push(
        AddonManager.maybeInstallBuiltinAddon(
          id,
          version,
          `resource://builtin-themes/${path}`
        )
      );
    }

    await Promise.all(installPromises);
  }
}

var BuiltInThemes = new _BuiltInThemes();
