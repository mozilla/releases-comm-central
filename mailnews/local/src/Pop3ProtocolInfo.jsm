/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["Pop3ProtocolInfo"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * @implements {nsIMsgProtocolInfo}
 */
class Pop3ProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{f99fdbf7-2e79-4ce3-9d94-7af3763b82fc}");

  requiresUsername = true;
  preflightPrettyNameWithEmailAddress = true;
  canDelete = true;
  canLoginAtStartUp = true;
  canDuplicate = true;
  canGetMessages = true;
  canGetIncomingMessages = true;
  defaultDoBiff = true;
  showComposeMsgLink = true;
  foldersCreatedAsync = false;

  get defaultLocalPath() {
    let file = this._getFileValue("mail.root.pop3-rel", "mail.root.pop3");
    if (!file) {
      file = Services.dirsvc.get("MailD", Ci.nsIFile);
      this._setFileValue("mail.root.pop3-rel", "mail.root.pop3", file);
    }
    if (!file.exists()) {
      file.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o775);
    }
    return file;
  }

  set defaultLocalPath(value) {
    this._setFileValue("mail.root.pop3-rel", "mail.root.pop3", value);
  }

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsIPop3URL.DEFAULT_POP3S_PORT
      : Ci.nsIPop3URL.DEFAULT_POP3_PORT;
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

Pop3ProtocolInfo.prototype.classID = Components.ID(
  "{7689942f-cbd1-42ad-87b9-44128354f55d}"
);
