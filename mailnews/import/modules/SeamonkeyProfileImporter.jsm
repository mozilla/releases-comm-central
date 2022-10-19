/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["SeamonkeyProfileImporter"];

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { ThunderbirdProfileImporter } = ChromeUtils.import(
  "resource:///modules/ThunderbirdProfileImporter.jsm"
);

/**
 * A module to import things from a seamonkey profile dir into the current
 * profile.
 */
class SeamonkeyProfileImporter extends ThunderbirdProfileImporter {
  NAME = "SeaMonkey";

  /** @see BaseProfileImporter */
  async getSourceProfiles() {
    let slugs = {
      win: ["AppData", "Mozilla", "SeaMonkey"],
      macosx: ["ULibDir", "Application Support", "SeaMonkey"],
      linux: ["Home", ".mozilla", "seamonkey"],
    }[AppConstants.platform];
    if (!slugs) {
      // We don't recognize this OS.
      return [];
    }

    let seamonkeyRoot = Services.dirsvc.get(slugs[0], Ci.nsIFile);
    slugs.slice(1).forEach(seamonkeyRoot.append);
    let profilesIni = seamonkeyRoot.clone();
    profilesIni.append("profiles.ini");
    if (!profilesIni.exists()) {
      // No Seamonkey profile found in the well known location.
      return [];
    }

    let profiles = [];
    let ini = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
      .getService(Ci.nsIINIParserFactory)
      .createINIParser(profilesIni);
    for (let section of ini.getSections()) {
      let keys = [...ini.getKeys(section)];
      if (!keys.includes("Path")) {
        // Not a profile section.
        continue;
      }

      let name = keys.includes("Name") ? ini.getString(section, "Name") : null;
      let path = ini.getString(section, "Path");
      let isRelative = keys.includes("IsRelative")
        ? ini.getString(section, "IsRelative") == "1"
        : false;

      let dir;
      if (isRelative) {
        dir = seamonkeyRoot.clone();
        dir.append(path);
      } else {
        dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        dir.initWithPath(path);
      }
      if (!dir.exists()) {
        // Not a valid profile.
        continue;
      }
      profiles.push({ name, dir });
    }
    return profiles;
  }
}
