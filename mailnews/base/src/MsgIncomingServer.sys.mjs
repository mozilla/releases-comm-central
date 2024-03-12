/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * When hostname/username changes, update the corresponding entry in
 * nsILoginManager.
 *
 * @param {string} localStoreType - The store type of the current server.
 * @param {string} oldHostname - The hostname before the change.
 * @param {string} oldUsername - The username before the change.
 * @param {string} newHostname - The hostname after the change.
 * @param {string} newUsername - The username after the change.
 */
function migratePassword(
  localStoreType,
  oldHostname,
  oldUsername,
  newHostname,
  newUsername
) {
  // When constructing nsIURI, need to wrap IPv6 address in [].
  oldHostname = oldHostname.includes(":") ? `[${oldHostname}]` : oldHostname;
  const oldServerUri = `${localStoreType}://${encodeURIComponent(oldHostname)}`;
  newHostname = newHostname.includes(":") ? `[${newHostname}]` : newHostname;
  const newServerUri = `${localStoreType}://${encodeURIComponent(newHostname)}`;

  const logins = Services.logins.findLogins(oldServerUri, "", oldServerUri);
  for (const login of logins) {
    if (login.username == oldUsername) {
      // If a nsILoginInfo exists for the old hostname/username, update it to
      // use the new hostname/username.
      const newLogin = Cc[
        "@mozilla.org/login-manager/loginInfo;1"
      ].createInstance(Ci.nsILoginInfo);
      newLogin.init(
        newServerUri,
        null,
        newServerUri,
        newUsername,
        login.password,
        "",
        ""
      );
      Services.logins.modifyLogin(login, newLogin);
    }
  }
}

/**
 * When hostname/username changes, update the folder attributes in related
 * identities.
 *
 * @param {string} oldServerUri - The server uri before the change.
 * @param {string} newServerUri - The server uri after the change.
 */
function migrateIdentities(oldServerUri, newServerUri) {
  for (const identity of MailServices.accounts.allIdentities) {
    const attributes = [
      "fcc_folder",
      "draft_folder",
      "archive_folder",
      "stationery_folder",
    ];
    for (const attr of attributes) {
      const folderUri = identity.getUnicharAttribute(attr);
      if (folderUri.startsWith(oldServerUri)) {
        identity.setUnicharAttribute(
          attr,
          folderUri.replace(oldServerUri, newServerUri)
        );
      }
    }
  }
}

/**
 * When hostname/username changes, update .spamActionTargetAccount and
 * .spamActionTargetFolder prefs.
 *
 * @param {string} oldServerUri - The server uri before the change.
 * @param {string} newServerUri - The server uri after the change.
 */
function migrateSpamActions(oldServerUri, newServerUri) {
  for (const server of MailServices.accounts.allServers) {
    const targetAccount = server.getCharValue("spamActionTargetAccount");
    const targetFolder = server.getUnicharValue("spamActionTargetFolder");
    if (targetAccount.startsWith(oldServerUri)) {
      server.setCharValue(
        "spamActionTargetAccount",
        targetAccount.replace(oldServerUri, newServerUri)
      );
    }
    if (targetFolder.startsWith(oldServerUri)) {
      server.setUnicharValue(
        "spamActionTargetFolder",
        targetFolder.replace(oldServerUri, newServerUri)
      );
    }
  }
}

/**
 * When hostname/username changes, update targetFolderUri in related filters
 * to the new folder uri.
 *
 * @param {string} oldServerUri - The server uri before the change.
 * @param {string} newServerUri - The server uri after the change.
 */
function migrateFilters(oldServerUri, newServerUri) {
  for (const server of MailServices.accounts.allServers) {
    let filterList;
    try {
      filterList = server.getFilterList(null);
      if (!server.canHaveFilters || !filterList) {
        continue;
      }
    } catch (e) {
      continue;
    }
    let changed = false;
    for (let i = 0; i < filterList.filterCount; i++) {
      const filter = filterList.getFilterAt(i);
      for (const action of filter.sortedActionList) {
        let targetFolderUri;
        try {
          targetFolderUri = action.targetFolderUri;
        } catch (e) {
          continue;
        }
        if (targetFolderUri.startsWith(oldServerUri)) {
          action.targetFolderUri = targetFolderUri.replace(
            oldServerUri,
            newServerUri
          );
          changed = true;
        }
      }
    }
    if (changed) {
      filterList.saveToDefaultFile();
    }
  }
}

/**
 * Migrate server uris in LoginManager and various account/folder prefs.
 *
 * @param {string} localStoreType - The store type of the current server.
 * @param {string} oldHostname - The hostname before the change.
 * @param {string} oldUsername - The username before the change.
 * @param {string} newHostname - The hostname after the change.
 * @param {string} newUsername - The username after the change.
 */
export function migrateServerUris(
  localStoreType,
  oldHostname,
  oldUsername,
  newHostname,
  newUsername
) {
  try {
    migratePassword(
      localStoreType,
      oldHostname,
      oldUsername,
      newHostname,
      newUsername
    );
  } catch (e) {
    console.error(e);
  }

  const oldAuth = oldUsername ? `${encodeURIComponent(oldUsername)}@` : "";
  const newAuth = newUsername ? `${encodeURIComponent(newUsername)}@` : "";
  // When constructing nsIURI, need to wrap IPv6 address in [].
  oldHostname = oldHostname.includes(":") ? `[${oldHostname}]` : oldHostname;
  const oldServerUri = `${localStoreType}://${oldAuth}${encodeURIComponent(
    oldHostname
  )}`;
  newHostname = newHostname.includes(":") ? `[${newHostname}]` : newHostname;
  const newServerUri = `${localStoreType}://${newAuth}${encodeURIComponent(
    newHostname
  )}`;

  try {
    migrateIdentities(oldServerUri, newServerUri);
  } catch (e) {
    console.error(e);
  }
  try {
    migrateSpamActions(oldServerUri, newServerUri);
  } catch (e) {
    console.error(e);
  }
  try {
    migrateFilters(oldServerUri, newServerUri);
  } catch (e) {
    console.error(e);
  }
}

/**
 * A base class for incoming server, should not be used directly.
 *
 * @implements {nsIMsgIncomingServer}
 * @implements {nsISupportsWeakReference}
 * @implements {nsIObserver}
 * @abstract
 */
export class MsgIncomingServer {
  QueryInterface = ChromeUtils.generateQI([
    "nsIMsgIncomingServer",
    "nsISupportsWeakReference",
    "nsIObserver",
  ]);

  constructor() {
    // nsIMsgIncomingServer attributes that map directly to pref values.
    this._mapAttrsToPrefs([
      ["Char", "type"],
      ["Char", "clientid"],
      ["Int", "authMethod"],
      ["Int", "biffMinutes", "check_time"],
      ["Int", "maxMessageSize", "max_size"],
      ["Int", "incomingDuplicateAction", "dup_action"],
      ["Bool", "clientidEnabled"],
      ["Bool", "downloadOnBiff", "download_on_biff"],
      ["Bool", "valid"],
      ["Bool", "emptyTrashOnExit", "empty_trash_on_exit"],
      ["Bool", "loginAtStartUp", "login_at_startup"],
      [
        "Bool",
        "defaultCopiesAndFoldersPrefsToServer",
        "allows_specialfolders_usage",
      ],
      ["Bool", "canCreateFoldersOnServer", "canCreateFolders"],
      ["Bool", "canFileMessagesOnServer", "canFileMessages"],
      ["Bool", "limitOfflineMessageSize", "limit_offline_message_size"],
      ["Bool", "hidden"],
    ]);

    // nsIMsgIncomingServer attributes.
    this.performingBiff = false;
    this.accountManagerChrome = "am-main.xhtml";
    this.biffState = Ci.nsIMsgFolder.nsMsgBiffState_Unknown;
    this.canHaveFilters = true;
    this.canBeDefaultServer = false;
    this.supportsDiskSpace = true;
    this.canUndoDeleteOnServer = true;
    this.sortOrder = 100000000;

    // @type {Map<string, number>} - The key is MsgId+Subject, the value is
    //   this._hdrIndex.
    this._knownHdrMap = new Map();
    this._hdrIndex = 0;

    Services.obs.addObserver(this, "passwordmgr-storage-changed", true);
  }

  /**
   * Observe() receives notifications for all accounts, not just this server's
   * account. So we ignore all notifications not intended for this server.
   * When the state of the password manager changes we need to clear the
   * this server's password from the cache in case the user just changed or
   * removed the password or username.
   * OAuth2 servers often automatically change the password manager's stored
   * password (the token).
   */
  observe(subject, topic, data) {
    if (topic == "passwordmgr-storage-changed") {
      // Check that the notification is for this server and user.
      let otherFullName = "";
      let otherUsername = "";
      if (subject instanceof Ci.nsILoginInfo) {
        // The login info for a server has been removed with data being
        // "removeLogin" or "removeAllLogins".
        otherFullName = subject.origin;
        otherUsername = subject.username;
      } else if (subject instanceof Ci.nsIArray && subject.length > 0) {
        // Probably a 2 element array containing old and new login info due to
        // data being "modifyLogin". E.g., a user has modified the password or
        // username in the password manager or an OAuth2 token string has
        // automatically changed. Only need to look at names in first array
        // element (login info before any modification) since the user might
        // have changed the username as found in the 2nd elements. (The
        // hostname can't be modified in the password manager.
        otherFullName = subject.queryElementAt(0, Ci.nsISupports).origin;
        otherUsername = subject.queryElementAt(0, Ci.nsISupports).username;
      }
      if (otherFullName) {
        if (
          otherFullName != "mailbox://" + this.hostName ||
          otherUsername != this.username
        ) {
          // Not for this server; keep this server's cached password.
          return;
        }
      } else if (data != "hostSavingDisabled") {
        // "hostSavingDisabled" only occurs during test_smtpServer.js and
        // expects the password to be removed from memory cache. Otherwise, we
        // don't have enough information to decide to remove the cached
        // password, so keep it.
        return;
      }
      // Remove the password for this server cached in memory.
      this.password = "";
    }
  }

  /**
   * Set up getters/setters for attributes that map directly to pref values.
   *
   * @param {string[]} attributes - An array of attributes. Each attribute is
   *   defined by its type, name and corresponding prefName.
   */
  _mapAttrsToPrefs(attributes) {
    for (let [type, attrName, prefName] of attributes) {
      prefName = prefName || attrName;
      Object.defineProperty(this, attrName, {
        configurable: true,
        get: () => this[`get${type}Value`](prefName),
        set: value => {
          this[`set${type}Value`](prefName, value);
        },
      });
    }
  }

  get key() {
    return this._key;
  }

  set key(key) {
    this._key = key;
    this._prefs = Services.prefs.getBranch(`mail.server.${key}.`);
    this._defaultPrefs = Services.prefs.getBranch("mail.server.default.");
  }

  get UID() {
    const uid = this._prefs.getStringPref("uid", "");
    if (uid) {
      return uid;
    }
    return (this.UID = Services.uuid
      .generateUUID()
      .toString()
      .substring(1, 37));
  }

  set UID(uid) {
    if (this._prefs.prefHasUserValue("uid")) {
      throw new Components.Exception("uid is already set", Cr.NS_ERROR_ABORT);
    }
    this._prefs.setStringPref("uid", uid);
  }

  get hostName() {
    const hostname = this.getUnicharValue("hostname");
    if (hostname.includes(":")) {
      // Reformat the hostname if it contains a port number.
      this.hostName = hostname;
      return this.hostName;
    }
    return hostname;
  }

  set hostName(value) {
    const oldName = this.hostName;
    this._setHostName("hostname", value);

    if (oldName && oldName != value) {
      this.onUserOrHostNameChanged(oldName, value, true);
    }
  }

  _setHostName(prefName, value) {
    const [host, port] = value.split(":");
    if (port) {
      this.port = Number(port);
    }
    this.setUnicharValue(prefName, host);
  }

  get username() {
    return this.getUnicharValue("userName");
  }

  set username(value) {
    const oldName = this.username;
    if (oldName && oldName != value) {
      this.setUnicharValue("userName", value);
      this.onUserOrHostNameChanged(oldName, value, false);
    } else {
      this.setUnicharValue("userName", value);
    }
  }

  get port() {
    const port = this.getIntValue("port");
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
    try {
      return this._prefs.getIntPref("socketType");
    } catch (e) {
      // socketType is set to default value. Look at isSecure setting.
      if (this._prefs.getBoolPref("isSecure", false)) {
        return Ci.nsMsgSocketType.SSL;
      }
      return this._defaultPrefs.getIntPref(
        "socketType",
        Ci.nsMsgSocketType.plain
      );
    }
  }

  set socketType(value) {
    const wasSecure = this.isSecure;
    this._prefs.setIntPref("socketType", value);
    const isSecure = this.isSecure;
    if (wasSecure != isSecure) {
      this.rootFolder.NotifyBoolPropertyChanged(
        "isSecure",
        wasSecure,
        isSecure
      );
    }
  }

  get isSecure() {
    return [Ci.nsMsgSocketType.alwaysSTARTTLS, Ci.nsMsgSocketType.SSL].includes(
      this.socketType
    );
  }

  get serverURI() {
    return this._getServerURI(true);
  }

  /**
   * Get server URI in the form of localStoreType://[user@]hostname.
   *
   * @param {boolean} includeUsername - Whether to include the username.
   * @returns {string}
   */
  _getServerURI(includeUsername) {
    const auth =
      includeUsername && this.username
        ? `${encodeURIComponent(this.username)}@`
        : "";
    // When constructing nsIURI, need to wrap IPv6 address in [].
    const hostname = this.hostName.includes(":")
      ? `[${this.hostName}]`
      : this.hostName;
    return `${this.localStoreType}://${auth}${encodeURIComponent(hostname)}`;
  }

  get prettyName() {
    return this.getUnicharValue("name") || this.constructedPrettyName;
  }

  set prettyName(value) {
    this.setUnicharValue("name", value);
    this.rootFolder.prettyName = value;
  }

  /**
   * Construct a pretty name from username and hostname.
   *
   * @param {string} username - The user name.
   * @param {string} hostname - The host name.
   * @returns {string}
   */
  _constructPrettyName(username, hostname) {
    const prefix = username ? `${username} on ` : "";
    return `${prefix}${hostname}`;
  }

  get constructedPrettyName() {
    return this._constructPrettyName(this.username, this.hostName);
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

  get rootMsgFolder() {
    return this.rootFolder;
  }

  get msgStore() {
    if (!this._msgStore) {
      let contractId = this.getCharValue("storeContractID");
      if (!contractId) {
        contractId = "@mozilla.org/msgstore/berkeleystore;1";
        this.setCharValue("storeContractID", contractId);
      }

      // After someone starts using the pluggable store, we can no longer
      // change the value.
      this.setBoolValue("canChangeStoreType", false);

      this._msgStore = Cc[contractId].createInstance(Ci.nsIMsgPluggableStore);
    }
    return this._msgStore;
  }

  get doBiff() {
    try {
      return this._prefs.getBoolPref("check_new_mail");
    } catch (e) {
      return this.protocolInfo.defaultDoBiff;
    }
  }

  set doBiff(value) {
    const biffManager = Cc["@mozilla.org/messenger/biffManager;1"].getService(
      Ci.nsIMsgBiffManager
    );
    if (value) {
      biffManager.addServerBiff(this);
    } else {
      biffManager.removeServerBiff(this);
    }
    this._prefs.setBoolPref("check_new_mail", value);
  }

  /**
   * type, attribute name, pref name
   */
  _retentionSettingsPrefs = [
    ["Int", "retainByPreference", "retainBy"],
    ["Int", "numHeadersToKeep", "numHdrsToKeep"],
    ["Int", "daysToKeepHdrs"],
    ["Int", "daysToKeepBodies"],
    ["Bool", "cleanupBodiesByDays", "cleanupBodies"],
    ["Bool", "applyToFlaggedMessages"],
  ];

  get retentionSettings() {
    const settings = Cc[
      "@mozilla.org/msgDatabase/retentionSettings;1"
    ].createInstance(Ci.nsIMsgRetentionSettings);
    for (let [type, attrName, prefName] of this._retentionSettingsPrefs) {
      prefName = prefName || attrName;
      settings[attrName] = this[`get${type}Value`](prefName);
    }
    return settings;
  }

  set retentionSettings(settings) {
    for (let [type, attrName, prefName] of this._retentionSettingsPrefs) {
      prefName = prefName || attrName;
      this[`set${type}Value`](prefName, settings[attrName]);
    }
  }

  get spamSettings() {
    if (!this.getCharValue("spamActionTargetAccount")) {
      this.setCharValue("spamActionTargetAccount", this.serverURI);
    }
    if (!this._spamSettings) {
      this._spamSettings = Cc[
        "@mozilla.org/messenger/spamsettings;1"
      ].createInstance(Ci.nsISpamSettings);
      try {
        this._spamSettings.initialize(this);
      } catch (e) {
        console.error(e);
      }
    }
    return this._spamSettings;
  }

  get spamFilterPlugin() {
    if (!this._spamFilterPlugin) {
      this._spamFilterPlugin = Cc[
        "@mozilla.org/messenger/filter-plugin;1?name=bayesianfilter"
      ].getService(Ci.nsIMsgFilterPlugin);
    }
    return this._spamFilterPlugin;
  }

  get isDeferredTo() {
    const account = MailServices.accounts.findAccountForServer(this);
    if (!account) {
      return false;
    }
    return MailServices.accounts.allServers.some(
      server => server.getCharValue("deferred_to_account") == account.key
    );
  }

  get serverRequiresPasswordForBiff() {
    return true;
  }

  /**
   * type, attribute name, pref name
   */
  _downloadSettingsPrefs = [
    ["Int", "ageLimitOfMsgsToDownload", "ageLimit"],
    ["Bool", "downloadUnreadOnly"],
    ["Bool", "downloadByDate"],
  ];

  get downloadSettings() {
    if (!this._downloadSettings) {
      this._downloadSettings = Cc[
        "@mozilla.org/msgDatabase/downloadSettings;1"
      ].createInstance(Ci.nsIMsgDownloadSettings);
      for (let [type, attrName, prefName] of this._downloadSettingsPrefs) {
        prefName = prefName || attrName;
        this._downloadSettings[attrName] = this[`get${type}Value`](prefName);
      }
    }
    return this._downloadSettings;
  }

  set downloadSettings(settings) {
    this._downloadSettings = settings;
    for (let [type, attrName, prefName] of this._downloadSettingsPrefs) {
      prefName = prefName || attrName;
      this[`set${type}Value`](prefName, settings[attrName]);
    }
  }

  get offlineSupportLevel() {
    const OFFLINE_SUPPORT_LEVEL_NONE = 0;
    const OFFLINE_SUPPORT_LEVEL_UNDEFINED = -1;
    const level = this.getIntValue("offline_support_level");
    return level == OFFLINE_SUPPORT_LEVEL_UNDEFINED
      ? OFFLINE_SUPPORT_LEVEL_NONE
      : level;
  }

  get filterScope() {
    return Ci.nsMsgSearchScope.offlineMailFilter;
  }

  get searchScope() {
    return Ci.nsMsgSearchScope.offlineMail;
  }

  get passwordPromptRequired() {
    if (!this.serverRequiresPasswordForBiff) {
      // If the password is not even required for biff we don't need to check
      // any further.
      return false;
    }
    if (!this.password) {
      // If the password is empty, check to see if it is stored.
      this.password = this._getPasswordWithoutUI();
    }
    if (this.password) {
      return false;
    }
    return this.authMethod != Ci.nsMsgAuthMethod.OAuth2;
  }

  getCharValue(prefName) {
    try {
      return this._prefs.getCharPref(prefName);
    } catch (e) {
      return this._defaultPrefs.getCharPref(prefName, "");
    }
  }

  setCharValue(prefName, value) {
    const defaultValue = this._defaultPrefs.getCharPref(prefName, "");
    if (!value || value == defaultValue) {
      this._prefs.clearUserPref(prefName);
    } else {
      this._prefs.setCharPref(prefName, value);
    }
  }

  getUnicharValue(prefName) {
    try {
      return this._prefs.getStringPref(prefName);
    } catch (e) {
      return this._defaultPrefs.getStringPref(prefName, "");
    }
  }

  setUnicharValue(prefName, value) {
    const defaultValue = this._defaultPrefs.getStringPref(prefName, "");
    if (!value || value == defaultValue) {
      this._prefs.clearUserPref(prefName);
    } else {
      this._prefs.setStringPref(prefName, value);
    }
  }

  getIntValue(prefName) {
    try {
      return this._prefs.getIntPref(prefName);
    } catch (e) {
      return this._defaultPrefs.getIntPref(prefName, 0);
    }
  }

  setIntValue(prefName, value) {
    const defaultValue = this._defaultPrefs.getIntPref(prefName, value - 1);
    if (defaultValue == value) {
      this._prefs.clearUserPref(prefName);
    } else {
      this._prefs.setIntPref(prefName, value);
    }
  }

  getBoolValue(prefName) {
    try {
      return this._prefs.getBoolPref(prefName);
    } catch (e) {
      return this._defaultPrefs.getBoolPref(prefName, false);
    }
  }

  setBoolValue(prefName, value) {
    const defaultValue = this._defaultPrefs.getBoolPref(prefName, !value);
    if (defaultValue == value) {
      this._prefs.clearUserPref(prefName);
    } else {
      this._prefs.setBoolPref(prefName, value);
    }
  }

  getFileValue(relPrefName, absPrefName) {
    try {
      const file = this._prefs.getComplexValue(
        relPrefName,
        Ci.nsIRelativeFilePref
      ).file;
      file.normalize();
      return file;
    } catch (e) {
      try {
        const file = this._prefs.getComplexValue(absPrefName, Ci.nsIFile);
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

  onUserOrHostNameChanged(oldValue, newValue, hostnameChanged) {
    migrateServerUris(
      this.localStoreType,
      hostnameChanged ? oldValue : this.hostName,
      hostnameChanged ? this.username : oldValue,
      this.hostName,
      this.username
    );
    this._spamSettings = null;

    // Clear the clientid because the user or host have changed.
    this.clientid = "";

    let atIndex = newValue.indexOf("@");
    if (!this.prettyName || (!hostnameChanged && atIndex != -1)) {
      // If new username contains @ then better not update the pretty name.
      return;
    }

    atIndex = this.prettyName.indexOf("@");
    if (
      !hostnameChanged &&
      atIndex != -1 &&
      oldValue == this.prettyName.slice(0, atIndex)
    ) {
      // If username changed and the pretty name has the old username before @,
      // update to the new username.
      this.prettyName = newValue + this.prettyName.slice(atIndex);
    } else if (
      hostnameChanged &&
      oldValue == this.prettyName.slice(atIndex + 1)
    ) {
      // If hostname changed and the pretty name has the old hostname after @,
      // update to the new hostname.
      this.prettyName = this.prettyName.slice(0, atIndex + 1) + newValue;
    } else {
      // Set the `name` pref anyway, to make tests happy.
      // eslint-disable-next-line no-self-assign
      this.prettyName = this.prettyName;
    }
  }

  /**
   * Try to get the password from nsILoginManager.
   *
   * @returns {string}
   */
  _getPasswordWithoutUI() {
    const serverURI = this._getServerURI();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        return login.password;
      }
    }
    return null;
  }

  getPasswordWithUI(promptMessage, promptTitle) {
    const password = this._getPasswordWithoutUI();
    if (password) {
      this.password = password;
      return this.password;
    }
    const outUsername = {};
    const outPassword = {};
    let ok;
    // This prompt has a checkbox for saving password.
    const authPrompt = Cc["@mozilla.org/messenger/msgAuthPrompt;1"].getService(
      Ci.nsIAuthPrompt
    );
    if (this.username) {
      ok = authPrompt.promptPassword(
        promptTitle,
        promptMessage,
        this.serverURI,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outPassword
      );
    } else {
      ok = authPrompt.promptUsernameAndPassword(
        promptTitle,
        promptMessage,
        this.serverURI,
        Ci.nsIAuthPrompt.SAVE_PASSWORD_PERMANENTLY,
        outUsername,
        outPassword
      );
    }
    if (ok) {
      if (outUsername.value) {
        this.username = outUsername.value;
      }
      this.password = outPassword.value;
    } else {
      throw Components.Exception("Password dialog canceled", Cr.NS_ERROR_ABORT);
    }
    return this.password;
  }

  forgetPassword() {
    const serverURI = this._getServerURI();
    const logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (const login of logins) {
      if (login.username == this.username) {
        Services.logins.removeLogin(login);
      }
    }
    this.password = "";
  }

  forgetSessionPassword() {
    this.password = "";
  }

  closeCachedConnections() {}

  shutdown() {
    this.closeCachedConnections();

    if (this._filterList) {
      this._filterList.logStream = null;
      this._filterList = null;
    }
    if (this._spamSettings) {
      this._spamSettings.logStream = null;
      this._spamSettings = null;
    }

    Services.obs.removeObserver(this, "passwordmgr-storage-changed");
  }

  getFilterList(msgWindow) {
    if (!this._filterList) {
      if (!this.rootFolder.filePath.path) {
        // Happens in tests.
        return null;
      }
      const filterFile = this.rootFolder.filePath.clone();
      filterFile.append("msgFilterRules.dat");
      try {
        this._filterList = MailServices.filters.OpenFilterList(
          filterFile,
          this.rootFolder,
          msgWindow
        );
      } catch (e) {
        console.error(e);
        const NS_ERROR_FILE_FS_CORRUPTED = 0x80520016;
        if (e.result == NS_ERROR_FILE_FS_CORRUPTED && filterFile.exists()) {
          // OpenFilterList will create a new one next time.
          filterFile.renameTo(filterFile.parent, "msgFilterRules.dat.orig");
        }
      }
    }
    return this._filterList;
  }

  setFilterList(value) {
    this._filterList = value;
  }

  getEditableFilterList(msgWindow) {
    if (!this._editableFilterList) {
      return this.getFilterList(msgWindow);
    }
    return this._editableFilterList;
  }

  setEditableFilterList(value) {
    this._editableFilterList = value;
  }

  setDefaultLocalPath(value) {
    this.protocolInfo.setDefaultLocalPath(value);
  }

  getNewMessages(folder, msgWindow, urlListener) {
    folder.getNewMessages(msgWindow, urlListener);
  }

  writeToFolderCache(folderCache) {
    this.rootFolder.writeToFolderCache(folderCache, true);
  }

  clearAllValues() {
    for (const prefName of this._prefs.getChildList("")) {
      this._prefs.clearUserPref(prefName);
    }
  }

  removeFiles() {
    if (this.getCharValue("deferred_to_account") || this.isDeferredTo) {
      throw Components.Exception(
        "Should not remove files for a deferred account",
        Cr.NS_ERROR_FAILURE
      );
    }
    this.localPath.remove(true);
  }

  getMsgFolderFromURI(folder, uri) {
    try {
      return this.rootMsgFolder.getChildWithURI(uri, true, true) || folder;
    } catch (e) {
      return folder;
    }
  }

  isNewHdrDuplicate(newHdr) {
    // If the message has been partially downloaded, the message should not
    // be considered a duplicated message. See bug 714090.
    if (newHdr.flags & Ci.nsMsgMessageFlags.Partial) {
      return false;
    }

    if (!newHdr.subject || !newHdr.messageId) {
      return false;
    }

    const key = `${newHdr.messageId}${newHdr.subject}`;
    if (this._knownHdrMap.get(key)) {
      return true;
    }

    this._knownHdrMap.set(key, ++this._hdrIndex);

    const MAX_SIZE = 500;
    if (this._knownHdrMap.size > MAX_SIZE) {
      // Release the oldest half of downloaded hdrs.
      for (const [k, v] of this._knownHdrMap) {
        if (v < this._hdrIndex - MAX_SIZE / 2) {
          this._knownHdrMap.delete(k);
        } else if (this._knownHdrMap.size <= MAX_SIZE / 2) {
          break;
        }
      }
    }
    return false;
  }

  equals(server) {
    return this.key == server.key;
  }

  _configureTemporaryReturnReceiptsFilter(filterList) {
    const identity = MailServices.accounts.getFirstIdentityForServer(this);
    if (!identity) {
      return;
    }
    let incorp = Ci.nsIMsgMdnGenerator.eIncorporateInbox;
    if (identity.getBoolAttribute("use_custom_prefs")) {
      incorp = this.getIntValue("incorporate_return_receipt");
    } else {
      incorp = Services.prefs.getIntPref("mail.incorporate.return_receipt");
    }

    const enable = incorp == Ci.nsIMsgMdnGenerator.eIncorporateSent;

    const FILTER_NAME = "mozilla-temporary-internal-MDN-receipt-filter";
    let filter = filterList.getFilterNamed(FILTER_NAME);

    if (filter) {
      filter.enabled = enable;
      return;
    } else if (!enable || !identity.fccFolder) {
      return;
    }

    filter = filterList.createFilter(FILTER_NAME);
    if (!filter) {
      return;
    }

    filter.enabled = true;
    filter.temporary = true;

    let term = filter.createTerm();
    let value = term.value;
    value.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
    value.str = "multipart/report";
    term.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
    term.op = Ci.nsMsgSearchOp.Contains;
    term.booleanAnd = true;
    term.arbitraryHeader = "Content-Type";
    term.value = value;
    filter.appendTerm(term);

    term = filter.createTerm();
    value = term.value;
    value.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
    value.str = "disposition-notification";
    term.attrib = Ci.nsMsgSearchAttrib.OtherHeader + 1;
    term.op = Ci.nsMsgSearchOp.Contains;
    term.booleanAnd = true;
    term.arbitraryHeader = "Content-Type";
    term.value = value;
    filter.appendTerm(term);

    const action = filter.createAction();
    action.type = Ci.nsMsgFilterAction.MoveToFolder;
    action.targetFolderUri = identity.fccFolder;
    filter.appendAction(action);
    filterList.insertFilterAt(0, filter);
  }

  _configureTemporaryServerSpamFilters(filterList) {
    const spamSettings = this.spamSettings;
    if (!spamSettings.useServerFilter) {
      return;
    }
    const serverFilterName = spamSettings.serverFilterName;
    const serverFilterTrustFlags = spamSettings.serverFilterTrustFlags;
    if (!serverFilterName || !serverFilterName) {
      return;
    }

    // Check if filters have been setup already.
    const yesFilterName = `${serverFilterName}Yes`;
    const noFilterName = `${serverFilterName}No`;
    let filter = filterList.getFilterNamed(yesFilterName);
    if (!filter) {
      filter = filterList.getFilterNamed(noFilterName);
    }
    if (filter) {
      return;
    }

    const serverFilterList = MailServices.filters.OpenFilterList(
      spamSettings.serverFilterFile,
      null,
      null
    );
    filter = serverFilterList.getFilterNamed(yesFilterName);
    if (filter && serverFilterTrustFlags & Ci.nsISpamSettings.TRUST_POSITIVES) {
      filter.temporary = true;
      // Check if we're supposed to move junk mail to junk folder; if so, add
      // filter action to do so.
      const searchTerms = filter.searchTerms;
      if (searchTerms.length) {
        searchTerms[0].beginsGrouping = true;
        searchTerms.at(-1).endsGrouping = true;
      }

      // Create a new term, checking if the user set junk status. The term will
      // search for junkscoreorigin != "user".
      const term = filter.createTerm();
      term.attrib = Ci.nsMsgSearchAttrib.JunkScoreOrigin;
      term.op = Ci.nsMsgSearchOp.Isnt;
      term.booleanAnd = true;
      const value = term.value;
      value.attrib = Ci.nsMsgSearchAttrib.JunkScoreOrigin;
      value.str = "user";
      term.value = value;
      filter.appendTerm(term);

      if (spamSettings.moveOnSpam) {
        const spamFolderURI = spamSettings.spamFolderURI;
        if (spamFolderURI) {
          const action = filter.createAction();
          action.type = Ci.nsMsgFilterAction.MoveToFolder;
          action.targetFolderUri = spamFolderURI;
          filter.appendAction(action);
        }
      }

      if (spamSettings.markAsReadOnSpam) {
        const action = filter.createAction();
        action.type = Ci.nsMsgFilterAction.MarkRead;
        filter.appendAction(action);
      }
      filterList.insertFilterAt(0, filter);
    }

    filter = serverFilterList.getFilterNamed(noFilterName);
    if (filter && serverFilterTrustFlags & Ci.nsISpamSettings.TRUST_NEGATIVES) {
      filter.temporary = true;
      filterList.insertFilterAt(0, filter);
    }
  }

  configureTemporaryFilters(filterList) {
    this._configureTemporaryReturnReceiptsFilter(filterList);
    this._configureTemporaryServerSpamFilters(filterList);
  }

  clearTemporaryReturnReceiptsFilter() {
    if (!this._filterList) {
      return;
    }
    const filter = this._filterList.getFilterNamed(
      "mozilla-temporary-internal-MDN-receipt-filter"
    );
    if (filter) {
      this._filterList.removeFilter(filter);
    }
  }

  performExpand(msgWindow) {}

  get wrappedJSObject() {
    return this;
  }

  _passwordPromise = null;

  /**
   * Show a password prompt. If a prompt is currently shown, just wait for it.
   *
   * @param {string} message - The text inside the prompt.
   * @param {string} title - The title of the prompt.
   */
  async getPasswordWithUIAsync(message, title) {
    if (this._passwordPromise) {
      await this._passwordPromise;
      return this.password;
    }
    const deferred = {};
    this._passwordPromise = new Promise((resolve, reject) => {
      deferred.resolve = resolve;
      deferred.reject = reject;
    });
    try {
      this.getPasswordWithUI(message, title);
    } catch (e) {
      deferred.reject(e);
      throw e;
    } finally {
      this._passwordPromise = null;
    }
    deferred.resolve();
    return this.password;
  }
}
