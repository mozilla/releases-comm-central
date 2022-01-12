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
    this._mapAttrsToPrefs([
      ["Unichar", "username", "userName"],
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
      ["Bool", "canDelete"],
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
    this.downloadMessagesAtStartup = false;
    this.canHaveFilters = true;
    this.canBeDefaultServer = false;
    this.displayStartupPage = true;
    this.supportsDiskSpace = true;
    this.canCompactFoldersOnServer = true;
    this.canUndoDeleteOnServer = true;
    this.sortOrder = 100000000;

    // @type {Map<string, number>} - The key is MsgId+Subject, the value is
    //   this._hdrIndex.
    this._knownHdrMap = new Map();
    this._hdrIndex = 0;
  }

  /**
   * Set up getters/setters for attributes that map directly to pref values.
   * @param {string[]} - An array of attributes, each attribute is defined by
   *   its type, name and corresponding prefName.
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

  get hostName() {
    let hostname = this.getUnicharValue("hostname");
    if (hostname.includes(":")) {
      // Reformat the hostname if it contains a port number.
      this.hostName = hostname;
      return this.hostName;
    }
    return hostname;
  }

  set hostName(value) {
    this._setHostName("hostname", value);
  }

  _setHostName(prefName, value) {
    let [host, port] = value.split(":");
    if (port) {
      this.port = Number(port);
    }
    this.setUnicharValue(prefName, host);
  }

  get realHostName() {
    return this.getUnicharValue("realhostname") || this.hostName;
  }

  set realHostName(value) {
    let oldName = this.realHostName;
    this._setHostName("realhostname", value);

    if (oldName != value) {
      this.onUserOrHostNameChanged(oldName, value, true);
    }
  }

  get realUsername() {
    return this.getUnicharValue("realuserName") || this.username;
  }

  set realUsername(value) {
    let oldName = this.realUsername;
    this.setUnicharValue("realuserName", value);

    if (oldName != value) {
      this.onUserOrHostNameChanged(oldName, value, false);
    }
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
    let wasSecure = this.isSecure;
    this._prefs.setIntPref("socketType", value);
    let isSecure = this.isSecure;
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
   * @param {boolean} includeUsername - Whether to include the username.
   * @returns {string}
   */
  _getServerURI(includeUsername) {
    let auth =
      includeUsername && this.username
        ? `${encodeURIComponent(this.username)}@`
        : "";
    // When constructing nsIURI, need to wrap IPv6 address in [].
    let hostname = this.hostName.includes(":")
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
   * @param {string} username - The user name.
   * @param {string} hostname - The host name.
   * @retursn {string}
   */
  _constructPrettyName(username, hostname) {
    let prefix = username ? `${username} on ` : "";
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
    let biffManager = Cc["@mozilla.org/messenger/biffManager;1"].getService(
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
    let settings = Cc[
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
      this._spamSettings.initialize(this);
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
    let account = MailServices.accounts.FindAccountForServer(this);
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

  get canEmptyTrashOnExit() {
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
    let level = this.getIntValue("offline_support_level");
    return level == OFFLINE_SUPPORT_LEVEL_UNDEFINED
      ? OFFLINE_SUPPORT_LEVEL_NONE
      : level;
  }

  set offlineSupportLevel(value) {
    this.setIntValue("offline_support_level", value);
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
    let defaultValue = this._defaultPrefs.getCharPref(prefName, "");
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
    let defaultValue = this._defaultPrefs.getStringPref(prefName, "");
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
    let defaultValue = this._defaultPrefs.getIntPref(prefName, value - 1);
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
    let defaultValue = this._defaultPrefs.getBoolPref(prefName, !value);
    if (defaultValue == value) {
      this._prefs.clearUserPref(prefName);
    } else {
      this._prefs.setBoolPref(prefName, value);
    }
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

  onUserOrHostNameChanged(oldValue, newValue, hostnameChanged) {
    // Reset password so that users are prompted for new password for the new
    // user/host.
    let atIndex = newValue.indexOf("@");
    if (
      hostnameChanged ||
      atIndex == -1 ||
      // If only username changed and the new name just added a domain, we can
      // keep the password.
      newValue.slice(0, atIndex) != oldValue
    ) {
      this.forgetPassword();
    }

    // Let the derived class close all cached connection to the old host.
    this.closeCachedConnections();

    // Notify any listeners for account server changes.
    MailServices.accounts.notifyServerChanged(this);

    // Clear the clientid because the user or host have changed.
    this.clientid = "";

    if (hostnameChanged) {
      this.prettyName = this._constructPrettyName(this.realUsername, newValue);
    } else {
      this.prettyName = this._constructPrettyName(newValue, this.realHostName);
    }
  }

  /**
   * Try to get the password from nsILoginManager.
   * @returns {string}
   */
  _getPasswordWithoutUI() {
    let serverURI = this._getServerURI();
    let logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (let login of logins) {
      if (login.username == this.username) {
        return login.password;
      }
    }
    return null;
  }

  getPasswordWithUI(promptMessage, promptTitle, msgWindow) {
    let password = this._getPasswordWithoutUI();
    if (password) {
      this.password = password;
      return this.password;
    }
    let outUsername = {};
    let outPassword = {};
    let ok;
    let authPrompt =
      msgWindow?.authPrompt || Services.ww.getNewAuthPrompter(null);
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
    }
    return this.password;
  }

  forgetPassword() {
    let serverURI = this._getServerURI();
    let logins = Services.logins.findLogins(serverURI, "", serverURI);
    for (let login of logins) {
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
  }

  getFilterList(msgWindow) {
    if (!this._filterList) {
      let filterFile = this.rootFolder.filePath.clone();
      filterFile.append("msgFilterRules.dat");
      this._filterList = MailServices.filters.OpenFilterList(
        filterFile,
        this.rootFolder,
        msgWindow
      );
    }
    return this._filterList;
  }

  setFilterList(value) {
    this._filterList = value;
  }

  getEditableFilterList(msgWindow) {
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
    for (let prefName of this._prefs.getChildList("")) {
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

    let key = `${newHdr.messageId}${newHdr.subject}`;
    if (this._knownHdrMap.get(key)) {
      return true;
    }

    this._knownHdrMap.set(key, ++this._hdrIndex);

    const MAX_SIZE = 500;
    if (this._knownHdrMap.size > MAX_SIZE) {
      // Release the oldest half of downloaded hdrs.
      for (let [k, v] of this._knownHdrMap) {
        if (v < this._hdrIndex - MAX_SIZE / 2) {
          this._knownHdrMap.delete(k);
        } else if (this._knownHdrMap.size <= MAX_SIZE / 2) {
          break;
        }
      }
    }
    return false;
  }

  displayOfflineMsg(msgWindow) {
    let bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    msgWindow.displayHTMLInMessagePane(
      bundle.GetStringFromName("nocachedbodytitle"),
      bundle.GetStringFromName("nocachedbodybody2"),
      true
    );
  }

  equals(server) {
    return this.key == server.key;
  }

  _configureTemporaryReturnReceiptsFilter(filterList) {
    let identity = MailServices.accounts.getFirstIdentityForServer(this);
    if (!identity) {
      return;
    }
    let incorp = Ci.nsIMsgMdnGenerator.eIncorporateInbox;
    if (identity.getBoolAttribute("use_custom_prefs")) {
      incorp = this.getIntValue("incorporate_return_receipt");
    } else {
      incorp = Services.prefs.getIntPref("mail.incorporate.return_receipt");
    }

    let enable = incorp == Ci.nsIMsgMdnGenerator.eIncorporateSent;

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

    let action = filter.createAction();
    action.type = Ci.nsMsgFilterAction.MoveToFolder;
    action.targetFolderUri = identity.fccFolder;
    filter.appendAction(action);
    filterList.insertFilterAt(0, filter);
  }

  _configureTemporaryServerSpamFilters(filterList) {
    let spamSettings = this.spamSettings;
    if (!spamSettings.useServerFilter) {
      return;
    }
    let serverFilterName = spamSettings.serverFilterName;
    let serverFilterTrustFlags = spamSettings.serverFilterTrustFlags;
    if (!serverFilterName || !serverFilterName) {
      return;
    }

    // Check if filters have been setup already.
    let yesFilterName = `${serverFilterName}Yes`;
    let noFilterName = `${serverFilterName}No`;
    let filter = filterList.getFilterNamed(yesFilterName);
    if (!filter) {
      filter = filterList.getFilterNamed(noFilterName);
    }
    if (filter) {
      return;
    }

    let serverFilterList = MailServices.filters.OpenFilterList(
      spamSettings.serverFilterFile,
      null,
      null
    );
    filter = serverFilterList.getFilterNamed(yesFilterName);
    if (filter && serverFilterTrustFlags & Ci.nsISpamSettings.TRUST_POSITIVES) {
      filter.temporary = true;
      // Check if we're supposed to move junk mail to junk folder; if so, add
      // filter action to do so.
      let searchTerms = filter.searchTerms;
      if (searchTerms.length) {
        searchTerms[0].beginsGrouping = true;
        searchTerms.at(-1).endsGrouping = true;
      }

      // Create a new term, checking if the user set junk status. The term will
      // search for junkscoreorigin != "user".
      let term = filter.createTerm();
      term.attrib = Ci.nsMsgSearchAttrib.JunkScoreOrigin;
      term.op = Ci.nsMsgSearchOp.Isnt;
      term.booleanAnd = true;
      let value = term.value;
      value.attrib = Ci.nsMsgSearchAttrib.JunkScoreOrigin;
      value.str = "user";
      term.value = value;
      filter.appendTerm(term);

      if (spamSettings.moveOnSpam) {
        let spamFolderURI = spamSettings.spamFolderURI;
        if (spamFolderURI) {
          let action = filter.createAction();
          action.type = Ci.nsMsgFilterAction.MoveToFolder;
          action.targetFolderUri = spamFolderURI;
          filter.appendAction(action);
        }
      }

      if (spamSettings.markAsReadOnSpam) {
        let action = filter.createAction();
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
    let filter = this._filterList.getFilterNamed(
      "mozilla-temporary-internal-MDN-receipt-filter"
    );
    if (filter) {
      this._filterList.removeFilter(filter);
    }
  }

  getForcePropertyEmpty(name) {
    return this.getCharValue(`${name}.empty`) == "true";
  }

  setForcePropertyEmpty(name, value) {
    return this.setCharValue(`${name}.empty`, value ? "true" : "");
  }

  performExpand(msgWindow) {}
}
