/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

export var TBDistCustomizer = {
  applyPrefDefaults() {
    this._prefDefaultsApplied = true;
    if (!this._ini) {
      return;
    }
    // Grab the sections of the ini file
    const sections = enumToObject(this._ini.getSections());

    // The global section, and several of its fields, is required
    // Function exits if this section and its fields are not present
    if (!sections.Global) {
      return;
    }

    // Get the keys in the "Global" section  of the ini file
    const globalPrefs = enumToObject(this._ini.getKeys("Global"));
    if (!(globalPrefs.id && globalPrefs.version && globalPrefs.about)) {
      return;
    }

    // Get the entire preferences tree (defaults is an instance of nsIPrefBranch)
    const defaults = Services.prefs.getDefaultBranch(null);

    // Set the following user prefs
    defaults.setCharPref(
      "distribution.id",
      this._ini.getString("Global", "id")
    );
    defaults.setCharPref(
      "distribution.version",
      this._ini.getString("Global", "version")
    );
    let partnerAbout;
    if (globalPrefs["about." + this._locale]) {
      partnerAbout = this._ini.getString("Global", "about." + this._locale);
    } else {
      partnerAbout = this._ini.getString("Global", "about");
    }
    defaults.setStringPref("distribution.about", partnerAbout);

    if (sections.Preferences) {
      const keys = this._ini.getKeys("Preferences");
      for (const key of keys) {
        try {
          // Get the string value of the key
          const value = this.parseValue(
            this._ini.getString("Preferences", key)
          );
          // After determining what type it is, set the pref
          switch (typeof value) {
            case "boolean":
              defaults.setBoolPref(key, value);
              break;
            case "number":
              defaults.setIntPref(key, value);
              break;
            case "string":
              defaults.setCharPref(key, value);
              break;
            case "undefined":
              // In case of custom pref created by partner
              defaults.setCharPref(key, value);
              break;
          }
        } catch (e) {
          console.error(e);
        }
      }
    }

    // Set the prefs in the other sections
    const localizedStr = Cc[
      "@mozilla.org/pref-localizedstring;1"
    ].createInstance(Ci.nsIPrefLocalizedString);

    if (sections.LocalizablePreferences) {
      const keys = this._ini.getKeys("LocalizablePreferences");
      for (const key of keys) {
        try {
          let value = this.parseValue(
            this._ini.getString("LocalizablePreferences", key)
          );
          value = value.replace(/%LOCALE%/g, this._locale);
          localizedStr.data = "data:text/plain," + key + "=" + value;
          defaults.setComplexValue(
            key,
            Ci.nsIPrefLocalizedString,
            localizedStr
          );
        } catch (e) {
          console.error(e);
        }
      }
    }

    if (sections["LocalizablePreferences-" + this._locale]) {
      const keys = this._ini.getKeys("LocalizablePreferences-" + this._locale);
      for (const key of keys) {
        try {
          const value = this.parseValue(
            this._ini.getString("LocalizablePreferences-" + this._locale, key)
          );
          localizedStr.data = "data:text/plain," + key + "=" + value;
          defaults.setComplexValue(
            key,
            Ci.nsIPrefLocalizedString,
            localizedStr
          );
        } catch (e) {
          console.error(e);
        }
      }
    }
  },

  parseValue(value) {
    try {
      value = JSON.parse(value);
    } catch (e) {
      // JSON.parse catches numbers and booleans.
      // Anything else, we assume is a string.
      // Remove the quotes that aren't needed anymore.
      value = value.replace(/^"/, "");
      value = value.replace(/"$/, "");
    }
    return value;
  },
};

ChromeUtils.defineLazyGetter(TBDistCustomizer, "_ini", function () {
  let ini = null;
  const iniFile = Services.dirsvc.get("XCurProcD", Ci.nsIFile);
  iniFile.append("distribution");
  iniFile.append("distribution.ini");
  if (iniFile.exists()) {
    ini = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
      .getService(Ci.nsIINIParserFactory)
      .createINIParser(iniFile);
  }
  return ini;
});

ChromeUtils.defineLazyGetter(TBDistCustomizer, "_locale", function () {
  return Services.locale.requestedLocale;
});

function enumToObject(UTF8Enumerator) {
  const ret = {};
  for (const UTF8Obj of UTF8Enumerator) {
    ret[UTF8Obj] = 1;
  }
  return ret;
}
