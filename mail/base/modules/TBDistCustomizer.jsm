/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["TBDistCustomizer"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

var TBDistCustomizer = {
  applyPrefDefaults() {
    this._prefDefaultsApplied = true;
    if (!this._ini) {
      return;
    }
    // Grab the sections of the ini file
    let sections = enumToObject(this._ini.getSections());

    // The global section, and several of its fields, is required
    // Function exits if this section and its fields are not present
    if (!sections.Global) {
      return;
    }

    // Get the keys in the "Global" section  of the ini file
    let globalPrefs = enumToObject(this._ini.getKeys("Global"));
    if (!(globalPrefs.id && globalPrefs.version && globalPrefs.about)) {
      return;
    }

    // Get the entire preferences tree (defaults is an instance of nsIPrefBranch)
    let defaults = Services.prefs.getDefaultBranch(null);

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
      let keys = this._ini.getKeys("Preferences");
      for (let key of keys) {
        try {
          // Get the string value of the key
          let value = this.parseValue(this._ini.getString("Preferences", key));
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
          Cu.reportError(e);
        }
      }
    }

    // Set the prefs in the other sections
    let localizedStr = Cc["@mozilla.org/pref-localizedstring;1"].createInstance(
      Ci.nsIPrefLocalizedString
    );

    if (sections.LocalizablePreferences) {
      let keys = this._ini.getKeys("LocalizablePreferences");
      for (let key of keys) {
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
          Cu.reportError(e);
        }
      }
    }

    if (sections["LocalizablePreferences-" + this._locale]) {
      let keys = this._ini.getKeys("LocalizablePreferences-" + this._locale);
      for (let key of keys) {
        try {
          let value = this.parseValue(
            this._ini.getString("LocalizablePreferences-" + this._locale, key)
          );
          localizedStr.data = "data:text/plain," + key + "=" + value;
          defaults.setComplexValue(
            key,
            Ci.nsIPrefLocalizedString,
            localizedStr
          );
        } catch (e) {
          Cu.reportError(e);
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

XPCOMUtils.defineLazyGetter(TBDistCustomizer, "_ini", function() {
  let ini = null;
  let iniFile = Services.dirsvc.get("XCurProcD", Ci.nsIFile);
  iniFile.append("distribution");
  iniFile.append("distribution.ini");
  if (iniFile.exists()) {
    ini = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
      .getService(Ci.nsIINIParserFactory)
      .createINIParser(iniFile);
  }
  return ini;
});

XPCOMUtils.defineLazyGetter(TBDistCustomizer, "_locale", function() {
  return Services.locale.requestedLocale;
});

function enumToObject(UTF8Enumerator) {
  let ret = {};
  for (let UTF8Obj of UTF8Enumerator) {
    ret[UTF8Obj] = 1;
  }
  return ret;
}
