/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";
import { ThunderbirdProfileImporter } from "resource:///modules/ThunderbirdProfileImporter.sys.mjs";

/**
 * A module to import things from a seamonkey profile dir into the current
 * profile.
 */
export class SeamonkeyProfileImporter extends ThunderbirdProfileImporter {
  NAME = "SeaMonkey";

  /** @see BaseProfileImporter */
  async getSourceProfiles() {
    const slugs = {
      win: ["AppData", "Mozilla", "SeaMonkey"],
      macosx: ["ULibDir", "Application Support", "SeaMonkey"],
      linux: ["Home", ".mozilla", "seamonkey"],
    }[AppConstants.platform];
    if (!slugs) {
      // We don't recognize this OS.
      return [];
    }

    const seamonkeyRoot = Services.dirsvc.get(slugs[0], Ci.nsIFile);
    slugs.slice(1).forEach(seamonkeyRoot.append);
    const profilesIni = seamonkeyRoot.clone();
    profilesIni.append("profiles.ini");
    if (!profilesIni.exists()) {
      this._logger.debug(
        "No SeaMonkey profile found in the well known location."
      );
      return [];
    }

    const profiles = [];
    const ini = Cc["@mozilla.org/xpcom/ini-parser-factory;1"]
      .getService(Ci.nsIINIParserFactory)
      .createINIParser(profilesIni);
    for (const section of ini.getSections()) {
      const keys = [...ini.getKeys(section)];
      if (!keys.includes("Path")) {
        // Not a profile section.
        continue;
      }

      const name = keys.includes("Name")
        ? ini.getString(section, "Name")
        : null;
      const path = ini.getString(section, "Path");
      const isRelative = keys.includes("IsRelative")
        ? ini.getString(section, "IsRelative") == "1"
        : false;

      let dir;
      try {
        if (isRelative) {
          dir = seamonkeyRoot.clone();
          dir.appendRelativePath(path);
        } else {
          dir = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
          dir.initWithPath(path);
        }
      } catch (ex) {
        this._logger.warn(
          `Path ${path} is incorrect; isRelative=${isRelative}`
        );
        continue;
      }
      if (!dir.exists()) {
        this._logger.warn(`${dir.path} does not exist`);
        // Not a valid profile.
        continue;
      }
      profiles.push({ name, dir });
    }
    return profiles;
  }
}
