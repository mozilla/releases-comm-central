/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { IMServices } from "resource:///modules/IMServices.sys.mjs";

export function IMIncomingServer() {}

IMIncomingServer.prototype = {
  get wrappedJSObject() {
    return this;
  },
  _imAccount: null,
  get imAccount() {
    if (this._imAccount) {
      return this._imAccount;
    }

    const id = this.getCharValue("imAccount");
    if (!id) {
      return null;
    }
    IMServices.core.init();
    return (this._imAccount = IMServices.accounts.getAccountById(id));
  },
  set imAccount(aImAccount) {
    this._imAccount = aImAccount;
    this.setCharValue("imAccount", aImAccount.id);
  },
  _prefBranch: null,
  valid: true,
  hidden: false,
  get offlineSupportLevel() {
    return 0;
  },
  get supportsDiskSpace() {
    return false;
  },
  _key: "",
  get key() {
    return this._key;
  },
  set key(aKey) {
    this._key = aKey;
    this._prefBranch = Services.prefs.getBranch("mail.server." + aKey + ".");
  },
  equals(aServer) {
    return "wrappedJSObject" in aServer && aServer.wrappedJSObject == this;
  },

  clearAllValues() {
    IMServices.accounts.deleteAccount(this.imAccount.id);
    for (const prefName of this._prefBranch.getChildList("")) {
      this._prefBranch.clearUserPref(prefName);
    }
    delete this._prefBranch;
    delete this._imAccount;
  },

  // Returns the directory where the account would have its data stored.
  // There are currently conversation logs only.
  // It may not exist yet.
  // This is used in account removal dialog and should return the same path
  // that the removeFiles() function deletes.
  get localPath() {
    const logPath = IMServices.logs.getLogFolderPathForAccount(this.imAccount);
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(logPath);
    return file;
  },

  // Removes files created by this account.
  removeFiles() {
    IMServices.logs.deleteLogFolderForAccount(this.imAccount);
  },

  // called by nsMsgAccountManager while deleting an account:
  forgetSessionPassword() {},

  forgetPassword() {
    // Password is cleared in imAccount.remove()
    // TODO: this may need to be implemented here as a separate function
    // once IM accounts support changing username/hostname.
  },

  // Shown in the "Remove Account" confirm prompt.
  get prettyName() {
    const protocol = this.imAccount.protocol.name || this.imAccount.protocol.id;
    return protocol + " - " + this.imAccount.name;
  },

  // XXX Flo: I don't think constructedPrettyName is visible in the UI
  get constructedPrettyName() {
    return "constructedPrettyName FIXME";
  },

  port: -1,
  accountManagerChrome: "am-im.xhtml",

  // FIXME need a new imIIncomingService iface + classinfo for these 3 properties :(
  get password() {
    return this.imAccount.password;
  },
  set password(aPassword) {
    this.imAccount.password = aPassword;
  },
  get alias() {
    return this.imAccount.alias;
  },
  set alias(aAlias) {
    this.imAccount.alias = aAlias;
  },
  get autojoin() {
    try {
      const prefName = "messenger.account." + this.imAccount.id + ".autoJoin";
      return Services.prefs.getStringPref(prefName);
    } catch (e) {
      return "";
    }
  },
  set autojoin(aAutoJoin) {
    const prefName = "messenger.account." + this.imAccount.id + ".autoJoin";
    Services.prefs.setStringPref(prefName, aAutoJoin);
  },
  get autologin() {
    try {
      const prefName = "messenger.account." + this.imAccount.id + ".autoLogin";
      return Services.prefs.getBoolPref(prefName);
    } catch (e) {
      return false;
    }
  },
  set autologin(aAutoLogin) {
    const prefName = "messenger.account." + this.imAccount.id + ".autoLogin";
    Services.prefs.setBoolPref(prefName, aAutoLogin);
  },

  // This is used for user-visible advanced preferences.
  setUnicharValue(aPrefName, aValue) {
    if (aPrefName == "autojoin") {
      this.autojoin = aValue;
    } else if (aPrefName == "alias") {
      this.alias = aValue;
    } else if (aPrefName == "password") {
      this.password = aValue;
    } else {
      this.imAccount.setString(aPrefName, aValue);
    }
  },
  getUnicharValue(aPrefName) {
    if (aPrefName == "autojoin") {
      return this.autojoin;
    }
    if (aPrefName == "alias") {
      return this.alias;
    }
    if (aPrefName == "password") {
      return this.password;
    }

    try {
      const prefName =
        "messenger.account." + this.imAccount.id + ".options." + aPrefName;
      return Services.prefs.getStringPref(prefName);
    } catch (x) {
      return this._getDefault(aPrefName);
    }
  },
  setBoolValue(aPrefName, aValue) {
    if (aPrefName == "autologin") {
      this.autologin = aValue;
    }
    this.imAccount.setBool(aPrefName, aValue);
  },
  getBoolValue(aPrefName) {
    if (aPrefName == "autologin") {
      return this.autologin;
    }
    try {
      const prefName =
        "messenger.account." + this.imAccount.id + ".options." + aPrefName;
      return Services.prefs.getBoolPref(prefName);
    } catch (x) {
      return this._getDefault(aPrefName);
    }
  },
  setIntValue(aPrefName, aValue) {
    this.imAccount.setInt(aPrefName, aValue);
  },
  getIntValue(aPrefName) {
    try {
      const prefName =
        "messenger.account." + this.imAccount.id + ".options." + aPrefName;
      return Services.prefs.getIntPref(prefName);
    } catch (x) {
      return this._getDefault(aPrefName);
    }
  },
  _defaultOptionValues: null,
  _getDefault(aPrefName) {
    if (aPrefName == "otrVerifyNudge") {
      return Services.prefs.getBoolPref("chat.otr.default.verifyNudge");
    }
    if (aPrefName == "otrRequireEncryption") {
      return Services.prefs.getBoolPref("chat.otr.default.requireEncryption");
    }
    if (aPrefName == "otrAllowMsgLog") {
      return Services.prefs.getBoolPref("chat.otr.default.allowMsgLog");
    }
    if (this._defaultOptionValues) {
      return this._defaultOptionValues[aPrefName];
    }

    this._defaultOptionValues = {};
    for (const opt of this.imAccount.protocol.getOptions()) {
      const type = opt.type;
      if (type == Ci.prplIPref.typeBool) {
        this._defaultOptionValues[opt.name] = opt.getBool();
      } else if (type == Ci.prplIPref.typeInt) {
        this._defaultOptionValues[opt.name] = opt.getInt();
      } else if (type == Ci.prplIPref.typeString) {
        this._defaultOptionValues[opt.name] = opt.getString();
      } else if (type == Ci.prplIPref.typeList) {
        this._defaultOptionValues[opt.name] = opt.getListDefault();
      }
    }
    return this._defaultOptionValues[aPrefName];
  },

  // the "Char" type will be used only for "imAccount" and internally.
  setCharValue(aPrefName, aValue) {
    this._prefBranch.setCharPref(aPrefName, aValue);
  },
  getCharValue(aPrefName) {
    try {
      return this._prefBranch.getCharPref(aPrefName);
    } catch (x) {
      return "";
    }
  },

  get type() {
    return this._prefBranch.getCharPref("type");
  },
  set type(aType) {
    this._prefBranch.setCharPref("type", aType);
  },

  get username() {
    return this._prefBranch.getCharPref("userName");
  },
  set username(aUsername) {
    if (!aUsername) {
      // nsMsgAccountManager::GetIncomingServer expects the pref to
      // be named userName but some early test versions with IM had
      // the pref named username.
      return;
    }
    this._prefBranch.setCharPref("userName", aUsername);
  },

  get hostName() {
    return this._prefBranch.getCharPref("hostname");
  },
  set hostName(aHostName) {
    this._prefBranch.setCharPref("hostname", aHostName);
  },

  writeToFolderCache() {},
  closeCachedConnections() {},

  // Shutdown the server instance so at least disconnect from the server.
  shutdown() {
    // Ensure this account has not been destroyed already.
    if (this.imAccount.prplAccount) {
      this.imAccount.disconnect();
    }
  },

  setFilterList() {},

  get canBeDefaultServer() {
    return false;
  },

  // AccountManager.js verifies that spamSettings is non-null before
  // using the initialize method, but we can't just use a null value
  // because that would crash nsMsgPurgeService::PerformPurge which
  // only verifies the nsresult return value of the spamSettings
  // getter before accessing the level property.
  get spamSettings() {
    return {
      level: 0,
      initialize(aServer) {},
      QueryInterface: ChromeUtils.generateQI(["nsISpamSettings"]),
    };
  },

  // nsMsgDBFolder.cpp crashes in HandleAutoCompactEvent if this doesn't exist:
  msgStore: {
    supportsCompaction: false,
  },

  get serverURI() {
    return "im://" + this.imAccount.protocol.id + "/" + this.imAccount.name;
  },
  _rootFolder: null,
  get rootMsgFolder() {
    return this.rootFolder;
  },
  get rootFolder() {
    if (this._rootFolder) {
      return this._rootFolder;
    }

    return (this._rootFolder = {
      isServer: true,
      server: this,
      get URI() {
        return this.server.serverURI;
      },
      get prettyName() {
        return this.server.prettyName;
      }, // used in the account manager tree
      get name() {
        return this.server.prettyName + " name";
      }, // never displayed?
      // used in the folder pane tree, if we don't hide the IM accounts:
      get abbreviatedName() {
        return this.server.prettyName + "abbreviatedName";
      },
      AddFolderListener() {},
      RemoveFolderListener() {},
      descendants: [],
      getFlag: () => false,
      getFolderWithFlags: aFlags => null,
      getFoldersWithFlags: aFlags => [],
      get subFolders() {
        return [];
      },
      getStringProperty: aPropertyName => "",
      getNumUnread: aDeep => 0,
      Shutdown() {},
      QueryInterface: ChromeUtils.generateQI(["nsIMsgFolder"]),
    });
  },

  get sortOrder() {
    return 300000000;
  },

  get protocolInfo() {
    return Cc["@mozilla.org/messenger/protocol/info;1?type=im"].getService(
      Ci.nsIMsgProtocolInfo
    );
  },

  QueryInterface: ChromeUtils.generateQI(["nsIMsgIncomingServer"]),
};
