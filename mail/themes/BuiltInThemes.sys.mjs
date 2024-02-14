/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
});

// List of themes built in to the browser. The themes are represented by objects
// containing their id, current version, and path relative to
// resource://builtin-themes/.
const STANDARD_THEMES = new Map([
  [
    "thunderbird-compact-light@mozilla.org",
    {
      version: "1.3",
      path: "light/",
    },
  ],
  [
    "thunderbird-compact-dark@mozilla.org",
    {
      version: "1.3",
      path: "dark/",
    },
  ],
]);

class _BuiltInThemes {
  constructor() {}

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
   * @param {string} id An addon's id string.
   * @returns {boolean}
   *   True if the theme with id `id` is a monochromatic theme.
   */
  isMonochromaticTheme(id) {
    return id.endsWith("-colorway@mozilla.org");
  }

  /**
   * @param {string} id
   *   The theme's id.
   * @returns {boolean}
   *   True if the theme with id `id` is both expired and retained. That is,
   *   the user has the ability to use it after its expiry date.
   *   Or it would - this is just a shim not to break assumptions...
   */
  isRetainedExpiredTheme(id) {
    return false;
  }

  /**
   * If the active theme is built-in, this function calls
   * AddonManager.maybeInstallBuiltinAddon for that theme.
   */
  maybeInstallActiveBuiltInTheme() {
    const activeThemeID = Services.prefs.getStringPref(
      "extensions.activeThemeID",
      "default-theme@mozilla.org"
    );
    const activeBuiltInTheme = STANDARD_THEMES.get(activeThemeID);
    if (activeBuiltInTheme) {
      lazy.AddonManager.maybeInstallBuiltinAddon(
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
    const installPromises = [];
    for (const [id, { version, path }] of STANDARD_THEMES.entries()) {
      installPromises.push(
        lazy.AddonManager.maybeInstallBuiltinAddon(
          id,
          version,
          `resource://builtin-themes/${path}`
        )
      );
    }

    await Promise.all(installPromises);
  }
}

export var BuiltInThemes = new _BuiltInThemes();
