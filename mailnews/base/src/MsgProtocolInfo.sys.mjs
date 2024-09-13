/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * @see {nsIMsgProtocolInfo}
 */
export class MsgProtocolInfo {
  get defaultLocalPath() {
    let file = this._getFileValue(this.RELATIVE_PREF, this.ABSOLUTE_PREF);
    if (!file) {
      file = Services.dirsvc.get(this.DIR_SERVICE_PROP, Ci.nsIFile);
      this._setFileValue(this.RELATIVE_PREF, this.ABSOLUTE_PREF, file);
    }
    if (!file.exists()) {
      file.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o775);
    }
    file.normalize();
    return file;
  }

  set defaultLocalPath(value) {
    this._setFileValue(this.RELATIVE_PREF, this.ABSOLUTE_PREF, value);
  }

  _getFileValue(relPrefName, absPrefName) {
    try {
      return Services.prefs.getComplexValue(relPrefName, Ci.nsIRelativeFilePref)
        .file;
    } catch (e) {
      try {
        const file = Services.prefs.getComplexValue(absPrefName, Ci.nsIFile);
        Services.prefs.setComplexValue(relPrefName, Ci.nsIRelativeFilePref, {
          QueryInterface: ChromeUtils.generateQI(["nsIRelativeFilePref"]),
          file,
          relativeToKey: "ProfD",
        });
        return file;
      } catch (exception) {
        return null;
      }
    }
  }

  _setFileValue(relPrefName, absPrefName, file) {
    Services.prefs.setComplexValue(relPrefName, Ci.nsIRelativeFilePref, {
      QueryInterface: ChromeUtils.generateQI(["nsIRelativeFilePref"]),
      file,
      relativeToKey: "ProfD",
    });
    Services.prefs.setComplexValue(absPrefName, Ci.nsIFile, file);
  }
}
