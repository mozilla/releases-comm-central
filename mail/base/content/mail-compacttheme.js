/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Enables compacttheme.css when needed.
 */
var CompactTheme = {
  get styleSheet() {
    // Change getter into a read/write property.
    delete this.styleSheet;
    for (let styleSheet of document.styleSheets) {
      if (styleSheet.href == "chrome://messenger/skin/compacttheme.css") {
        this.styleSheet = styleSheet;
        break;
      }
    }
    return this.styleSheet;
  },

  get isStyleSheetEnabled() {
    return this.styleSheet && !this.styleSheet.disabled;
  },

  get isThemeCurrentlyApplied() {
    let theme = LightweightThemeManager.currentThemeWithPersistedData;
    return theme && (
           theme.id == "thunderbird-compact-dark@mozilla.org" ||
           theme.id == "thunderbird-compact-light@mozilla.org");
  },

  init() {
    Services.obs.addObserver(this, "lightweight-theme-styling-update");

    if (this.isThemeCurrentlyApplied) {
      this._toggleStyleSheet(true);
    }
  },

  observe(subject, topic, data) {
    if (topic == "lightweight-theme-styling-update") {
      let { theme } = JSON.parse(data) || {};
      if (theme && (
          theme.id == "thunderbird-compact-light@mozilla.org" ||
          theme.id == "thunderbird-compact-dark@mozilla.org")) {
        // We are using the theme ID on this object instead of always referencing
        // LightweightThemeManager.currentTheme in case this is a preview
        this._toggleStyleSheet(true);
      } else {
        this._toggleStyleSheet(false);
      }

    }
  },

  _toggleStyleSheet(enabled) {
    let wasEnabled = this.isStyleSheetEnabled;
    if (enabled) {
      this.styleSheet.disabled = false;
    } else if (!enabled && wasEnabled) {
      this.styleSheet.disabled = true;
    }
  },

  uninit() {
    Services.obs.removeObserver(this, "lightweight-theme-styling-update");
    // If the getter still exists, remove it.
    if (Object.getOwnPropertyDescriptor(this, "styleSheet").get)
      delete this.styleSheet;
    this.styleSheet = null;
  },
};
