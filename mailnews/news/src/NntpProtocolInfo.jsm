/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["NntpProtocolInfo"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * @implements {nsIMsgProtocolInfo}
 */
class NntpProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{dc4ad42f-bc98-4193-a469-0cfa95ed9bcb}");

  requiresUsername = false;
  preflightPrettyNameWithEmailAddress = false;
  canDelete = true;
  canLoginAtStartUp = true;
  canDuplicate = true;
  canGetMessages = false;
  canGetIncomingMessages = false;
  defaultDoBiff = false;
  showComposeMsgLink = false;
  foldersCreatedAsync = false;

  get defaultLocalPath() {
    let file = this._getFileValue("mail.newsrc_root-rel", "mail.newsrc_root");
    if (!file) {
      file = Services.dirsvc.get("NewsD", Ci.nsIFile);
      this._setFileValue("mail.newsrc_root-rel", "mail.newsrc_root", file);
    }
    if (!file.exists()) {
      file.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o775);
    }
    return file;
  }

  set defaultLocalPath(value) {
    this._setFileValue("mail.root.nntp-rel", "mail.root.nntp", value);
  }

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsINntpUrl.DEFAULT_NNTPS_PORT
      : Ci.nsINntpUrl.DEFAULT_NNTP_PORT;
  }

  _getFileValue(relPrefName, absPrefName) {
    try {
      return Services.prefs.getComplexValue(relPrefName, Ci.nsIRelativeFilePref)
        .file;
    } catch (e) {
      try {
        let file = Services.prefs.getComplexValue(absPrefName, Ci.nsIFile);
        Services.prefs.setComplexValue(relPrefName, Ci.nsIRelativeFilePref, {
          QueryInterface: ChromeUtils.generateQI(["nsIRelativeFilePref"]),
          file,
          relativeToKey: "ProfD",
        });
        return file;
      } catch (e) {
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

NntpProtocolInfo.prototype.classID = Components.ID(
  "{7d71db22-0624-4c9f-8d70-dea6ab3ff076}"
);
