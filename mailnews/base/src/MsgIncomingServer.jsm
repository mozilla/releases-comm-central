/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["MsgIncomingServer"];

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

/**
 * A base class for incoming server, should not be used directly.
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 * @abstract
 */
class MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
  ]);

  constructor() {
    // nsIMsgIncomingServer attributes that map directly to pref values.
    [
      ["Char", "username", "userName"],
      ["Char", "type"],
      ["Char", "clientid"],
      ["Int", "authMethod"],
      ["Int", "biffMinutes", "check_time"],
      ["Int", "maxMessageSize", "max_size"],
      ["Bool", "clientidEnabled"],
      ["Bool", "downloadOnBiff", "download_on_biff"],
      ["Bool", "valid"],
      ["Bool", "emptyTrashOnExit", "empty_trash_on_exit"],
      ["Bool", "canDelete"],
      ["Bool", "loginAtStartUp", "login_at_startup"],
      [
        "Bool",
        "defaultCopiesAndFoldersPrefsToServer",
        "allows_specialfolders_usage",
      ],
      ["Bool", "canCreateFoldersOnServer", "canCreateFolders"],
      ["Bool", "canFileMessagesOnServer", "canFileMessages"],
      ["Bool", "limitOfflineMessageSize", "limie_offline_message_size"],
      ["Bool", "hidden"],
    ].forEach(([type, attrName, prefName]) => {
      prefName = prefName || attrName;
      Object.defineProperty(this, attrName, {
        get: () => this[`get${type}Value`](prefName),
        set: value => {
          this[`set${type}Value`](prefName, value);
        },
      });
    });
  }

  get key() {
    return this._key;
  }

  set key(key) {
    this._key = key;
    this._prefs = Services.prefs.getBranch(`mail.server.${key}.`);
  }

  get hostName() {
    let hostname = this.getCharValue("hostname");
    if (hostname.includes(":")) {
      // Reformat the hostname if it contains a port number.
      this.hostName = hostname;
      return this.hostName;
    }
    return hostname;
  }

  set hostName(value) {
    let [host, port] = value.split(":");
    if (port) {
      this.port = Number(port);
    }
    this.setCharValue("hostname", host);
  }

  get port() {
    let port = this.getIntValue("port");
    if (port > 1) {
      return port;
    }

    // If the port isn't set, use the default port based on the protocol.
    return this.protocolInfo.getDefaultServerPort(
      this.socketType == Ci.nsMsgSocketType.SSL
    );
  }

  set port(value) {
    this.setIntValue("port", value);
  }

  get protocolInfo() {
    return Cc[
      `@mozilla.org/messenger/protocol/info;1?type=${this.type}`
    ].getService(Ci.nsIMsgProtocolInfo);
  }

  get socketType() {
    return this._prefs.getIntPref(
      "socketType",
      // socketType is set to default value. Look at isSecure setting.
      this._prefs.getBoolPref("isSecure", false)
        ? Ci.nsMsgSocketType.SSL
        : Ci.nsMsgSocketType.plain
    );
  }

  get serverURI() {
    // Construct <localStoreType>://[<username>@]<hostname>.
    let auth = this.username ? `${encodeURIComponent(this.username)}@` : "";
    return `${this.localStoreType}://${auth}${encodeURIComponent(
      this.hostName
    )}`;
  }

  get prettyName() {
    return this.getUnicharValue("name") || this.constructedPrettyName;
  }

  set prettyName(value) {
    this.setUnicharValue("name", value);
    this.rootFolder.prettyName = value;
  }

  get constructedPrettyName() {
    let prefix = this.username ? `${this.username} on ` : "";
    return `${prefix}${this.hostName}`;
  }

  get localPath() {
    let localPath = this.getFileValue("directory-rel", "directory");
    if (localPath) {
      // If the local path has already been set, use it.
      return localPath;
    }

    // Create the path using protocol info and hostname.
    localPath = this.protocolInfo.defaultLocalPath;
    if (!localPath.exists()) {
      localPath.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
    }

    localPath.append(this.hostName);
    localPath.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

    this.localPath = localPath;
    return localPath;
  }

  set localPath(localPath) {
    this.setFileValue("directory-rel", "directory", localPath);
  }

  get rootFolder() {
    if (!this._rootFolder) {
      this._rootFolder = MailServices.folderLookup.getOrCreateFolderForURL(
        this.serverURI
      );
    }
    return this._rootFolder;
  }

  getCharValue(prefName) {
    return this._prefs.getCharPref(prefName, "");
  }

  setCharValue(prefName, value) {
    if (!value) {
      this._prefs.clearUserPref(prefName);
      return;
    }
    this._prefs.setCharPref(prefName, value);
  }

  getUnicharValue(prefName) {
    return this._prefs.getStringPref(prefName, "");
  }

  setUnicharValue(prefName, value) {
    if (!value) {
      this._prefs.clearUserPref(prefName);
      return;
    }
    this._prefs.setStringPref(prefName, value);
  }

  getIntValue(prefName) {
    return this._prefs.getIntPref(prefName, 0);
  }

  setIntValue(prefName, value) {
    this._prefs.setIntPref(prefName, value);
  }

  getBoolValue(prefName) {
    return this._prefs.getBoolPref(prefName, false);
  }

  setBoolValue(prefName, value) {
    this._prefs.setBoolPref(prefName, value);
  }

  getFileValue(relPrefName, absPrefName) {
    try {
      return this._prefs.getComplexValue(relPrefName, Ci.nsIRelativeFilePref)
        .file;
    } catch (e) {
      try {
        let file = this._prefs.getComplexValue(absPrefName, Ci.nsIFile);
        this._prefs.setComplexValue(relPrefName, Ci.nsIRelativeFilePref, {
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

  setFileValue(relPrefName, absPrefName, file) {
    this._prefs.setComplexValue(relPrefName, Ci.nsIRelativeFilePref, {
      QueryInterface: ChromeUtils.generateQI(["nsIRelativeFilePref"]),
      file,
      relativeToKey: "ProfD",
    });
    this._prefs.setComplexValue(absPrefName, Ci.nsIFile, file);
  }
}
