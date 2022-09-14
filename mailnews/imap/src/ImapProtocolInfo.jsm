/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ImapProtocolInfo"];

/**
 * @implements {nsIMsgProtocolInfo}
 */
class ImapProtocolInfo {
  QueryInterface = ChromeUtils.generateQI(["nsIMsgProtocolInfo"]);

  serverIID = Components.ID("{b02a4e1c-0d9e-498c-8b9d-18917ba9f65b}");

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
    let file = this._getFileValue("mail.root.imap-rel", "mail.root.imap");
    if (!file) {
      file = Services.dirsvc.get("MailD", Ci.nsIFile);
      this._setFileValue("mail.root.imap-rel", "mail.root.imap", file);
    }
    if (!file.exists()) {
      file.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o775);
    }
    return file;
  }

  set defaultLocalPath(value) {
    this._setFileValue("mail.root.imap-rel", "mail.root.imap", value);
  }

  getDefaultServerPort(isSecure) {
    return isSecure
      ? Ci.nsIImapUrl.DEFAULT_IMAPS_PORT
      : Ci.nsIImapUrl.DEFAULT_IMAP_PORT;
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

ImapProtocolInfo.prototype.classID = Components.ID(
  "{1d9473bc-423a-4632-ad5d-802154e80f6f}"
);
