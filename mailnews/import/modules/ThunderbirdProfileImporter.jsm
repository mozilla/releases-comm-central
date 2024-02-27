/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ThunderbirdProfileImporter"];

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { BaseProfileImporter } = ChromeUtils.import(
  "resource:///modules/BaseProfileImporter.jsm"
);
var { AddrBookFileImporter } = ChromeUtils.import(
  "resource:///modules/AddrBookFileImporter.jsm"
);

/**
 * A pref is represented as [type, name, value].
 *
 * @typedef {["Bool"|"Char"|"Int", string, number|string|boolean]} PrefItem
 *
 * A map from source smtp server key to target smtp server key.
 * @typedef {Map<string, string>} SmtpServerKeyMap
 *
 * A map from source identity key to target identity key.
 * @typedef {Map<string, string>} IdentityKeyMap
 *
 * A map from source IM account key to target IM account key.
 * @typedef {Map<string, string>} IMAccountKeyMap
 *
 * A map from source incoming server key to target incoming server key.
 * @typedef {Map<string, string>} IncomingServerKeyMap
 */

// Pref branches that need special handling.
const ACCOUNT_MANAGER = "mail.accountmanager.";
const MAIL_IDENTITY = "mail.identity.";
const MAIL_SERVER = "mail.server.";
const MAIL_ACCOUNT = "mail.account.";
const IM_ACCOUNT = "messenger.account.";
const MAIL_SMTP = "mail.smtp.";
const SMTP_SERVER = "mail.smtpserver.";
const ADDRESS_BOOK = "ldap_2.servers.";
const LDAP_AUTO_COMPLETE = "ldap_2.autoComplete.";
const CALENDAR = "calendar.registry.";
const CALENDAR_LIST = "calendar.list.";

// Prefs (branches) that we do not want to copy directly.
const IGNORE_PREFS = [
  "app.update.",
  "browser.",
  "calendar.timezone",
  "devtools.",
  "extensions.",
  "mail.cloud_files.accounts.",
  "mail.newsrc_root",
  "mail.root.",
  "mail.smtpservers",
  "messenger.accounts",
  "print.",
  "services.",
  "toolkit.telemetry.",
];

/**
 * A module to import things from another thunderbird profile dir into the
 * current profile.
 */
class ThunderbirdProfileImporter extends BaseProfileImporter {
  NAME = "Thunderbird";

  IGNORE_DIRS = [
    "chrome_debugger_profile",
    "crashes",
    "datareporting",
    "extensions",
    "extension-store",
    "logs",
    "minidumps",
    "saved-telemetry-pings",
    "security_state",
    "storage",
    "xulstore",
  ];

  async getSourceProfiles() {
    const profileService = Cc[
      "@mozilla.org/toolkit/profile-service;1"
    ].getService(Ci.nsIToolkitProfileService);
    const sourceProfiles = [];
    for (const profile of profileService.profiles) {
      if (profile == profileService.currentProfile) {
        continue;
      }
      sourceProfiles.push({
        name: profile.name,
        dir: profile.rootDir,
      });
    }
    return sourceProfiles;
  }

  async startImport(sourceProfileDir, items) {
    this._logger.debug(
      `Start importing from ${sourceProfileDir.path}, items=${JSON.stringify(
        items
      )}`
    );

    this._sourceProfileDir = sourceProfileDir;
    this._items = items;
    this._itemsTotalCount = Object.values(items).filter(Boolean).length;
    this._itemsImportedCount = 0;

    try {
      this._localServer = MailServices.accounts.localFoldersServer;
    } catch (e) {}

    if (items.accounts || items.addressBooks || items.calendars) {
      await this._loadPreferences();
    }

    if (this._items.accounts) {
      await this._importServersAndAccounts();
      this._importOtherPrefs(this._otherPrefs);
      await this._updateProgress();
    }

    if (this._items.addressBooks) {
      await this._importAddressBooks(
        this._branchPrefsMap.get(ADDRESS_BOOK),
        this._collectPrefsToObject(this._branchPrefsMap.get(LDAP_AUTO_COMPLETE))
      );
      await this._updateProgress();
    }

    if (this._items.calendars) {
      this._importCalendars(
        this._branchPrefsMap.get(CALENDAR),
        this._collectPrefsToObject(this._branchPrefsMap.get(CALENDAR_LIST))
      );
      await this._updateProgress();
    }

    if (!this._items.accounts && this._items.mailMessages) {
      this._importMailMessagesToLocal();
    }

    await this._updateProgress();

    return true;
  }

  /**
   * Collect interested prefs from this._sourceProfileDir.
   */
  async _loadPreferences() {
    // A Map to collect all prefs in interested pref branches.
    // @type {Map<string, PrefItem[]>}
    this._branchPrefsMap = new Map([
      [ACCOUNT_MANAGER, []],
      [MAIL_IDENTITY, []],
      [MAIL_SERVER, []],
      [MAIL_ACCOUNT, []],
      [IM_ACCOUNT, []],
      [MAIL_SMTP, []],
      [SMTP_SERVER, []],
      [ADDRESS_BOOK, []],
      [LDAP_AUTO_COMPLETE, []],
      [CALENDAR, []],
      [CALENDAR_LIST, []],
    ]);
    this._otherPrefs = [];

    const sourcePrefsFile = this._sourceProfileDir.clone();
    sourcePrefsFile.append("prefs.js");
    const sourcePrefsBuffer = await IOUtils.read(sourcePrefsFile.path);

    const savePref = (type, name, value) => {
      for (const [branchName, branchPrefs] of this._branchPrefsMap) {
        if (name.startsWith(branchName)) {
          branchPrefs.push([type, name.slice(branchName.length), value]);
          return;
        }
      }
      if (IGNORE_PREFS.some(ignore => name.startsWith(ignore))) {
        return;
      }
      // Collect all the other prefs.
      this._otherPrefs.push([type, name, value]);
    };

    Services.prefs.parsePrefsFromBuffer(sourcePrefsBuffer, {
      onStringPref: (kind, name, value) => savePref("Char", name, value),
      onIntPref: (kind, name, value) => savePref("Int", name, value),
      onBoolPref: (kind, name, value) => savePref("Bool", name, value),
      onError: msg => {
        throw new Error(msg);
      },
    });
  }

  /**
   * Import all the servers and accounts.
   */
  async _importServersAndAccounts() {
    // Import SMTP servers first, the importing order is important.
    const smtpServerKeyMap = this._importSmtpServers(
      this._branchPrefsMap.get(SMTP_SERVER),
      this._collectPrefsToObject(this._branchPrefsMap.get(MAIL_SMTP))
        .defaultserver
    );

    // mail.identity.idN.smtpServer depends on transformed smtp server key.
    const identityKeyMap = this._importIdentities(
      this._branchPrefsMap.get(MAIL_IDENTITY),
      smtpServerKeyMap
    );
    const imAccountKeyMap = await this._importIMAccounts(
      this._branchPrefsMap.get(IM_ACCOUNT)
    );

    const accountManager = this._collectPrefsToObject(
      this._branchPrefsMap.get(ACCOUNT_MANAGER)
    );
    // Officially we only support one Local Folders account, if we already have
    // one, do not import a new one.
    this._sourceLocalServerKeyToSkip = this._localServer
      ? accountManager.localfoldersserver
      : null;
    this._sourceLocalServerAttrs = {};

    // mail.server.serverN.imAccount depends on transformed im account key.
    const incomingServerKeyMap = await this._importIncomingServers(
      this._branchPrefsMap.get(MAIL_SERVER),
      imAccountKeyMap
    );

    // mail.account.accountN.{identities, server} depends on previous steps.
    this._importAccounts(
      this._branchPrefsMap.get(MAIL_ACCOUNT),
      accountManager.accounts,
      accountManager.defaultaccount,
      identityKeyMap,
      incomingServerKeyMap
    );

    await this._importMailMessages(incomingServerKeyMap);
    if (this._sourceLocalServerKeyToSkip) {
      this._mergeLocalFolders();
    }

    if (accountManager.accounts) {
      this._onImportAccounts();
    }
  }

  /**
   * Collect an array of prefs to an object.
   *
   * @param {PrefItem[]} prefs - An array of prefs.
   * @returns {object} An object mapping pref name to pref value.
   */
  _collectPrefsToObject(prefs) {
    const obj = {};
    for (const [, name, value] of prefs) {
      obj[name] = value;
    }
    return obj;
  }

  /**
   * Import SMTP servers.
   *
   * @param {PrefItem[]} prefs - All source prefs in the SMTP_SERVER branch.
   * @param {string} sourceDefaultServer - The value of mail.smtp.defaultserver
   *   in the source profile.
   * @returns {smtpServerKeyMap} A map from source server key to new server key.
   */
  _importSmtpServers(prefs, sourceDefaultServer) {
    const smtpServerKeyMap = new Map();
    const branch = Services.prefs.getBranch(SMTP_SERVER);
    for (const [type, name, value] of prefs) {
      const key = name.split(".")[0];
      let newServerKey = smtpServerKeyMap.get(key);
      if (!newServerKey) {
        // For every smtp server, create a new one to avoid conflicts.
        const server = MailServices.smtp.createServer();
        newServerKey = server.key;
        smtpServerKeyMap.set(key, newServerKey);
        this._logger.debug(
          `Mapping SMTP server from ${key} to ${newServerKey}`
        );
      }

      const newName = `${newServerKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }

    // Set defaultserver if it doesn't already exist.
    const defaultServer = Services.prefs.getCharPref(
      "mail.smtp.defaultserver",
      ""
    );
    if (sourceDefaultServer && !defaultServer) {
      Services.prefs.setCharPref(
        "mail.smtp.defaultserver",
        smtpServerKeyMap.get(sourceDefaultServer)
      );
    }
    return smtpServerKeyMap;
  }

  /**
   * Import mail identites.
   *
   * @param {PrefItem[]} prefs - All source prefs in the MAIL_IDENTITY branch.
   * @param {SmtpServerKeyMap} smtpServerKeyMap - A map from the source SMTP
   *   server key to new SMTP server key.
   * @returns {IdentityKeyMap} A map from the source identity key to new identity
   *   key.
   */
  _importIdentities(prefs, smtpServerKeyMap) {
    const identityKeyMap = new Map();
    const branch = Services.prefs.getBranch(MAIL_IDENTITY);
    for (const [type, name, value] of prefs) {
      const key = name.split(".")[0];
      let newIdentityKey = identityKeyMap.get(key);
      if (!newIdentityKey) {
        // For every identity, create a new one to avoid conflicts.
        const identity = MailServices.accounts.createIdentity();
        newIdentityKey = identity.key;
        identityKeyMap.set(key, newIdentityKey);
        this._logger.debug(`Mapping identity from ${key} to ${newIdentityKey}`);
      }

      const newName = `${newIdentityKey}${name.slice(key.length)}`;
      let newValue = value;
      if (name.endsWith(".smtpServer")) {
        newValue = smtpServerKeyMap.get(value) || newValue;
      }
      branch[`set${type}Pref`](newName, newValue);
    }
    return identityKeyMap;
  }

  /**
   * Import IM accounts.
   *
   * @param {Array<[string, string, number|string|boolean]>} prefs - All source
   *   prefs in the IM_ACCOUNT branch.
   * @returns {IMAccountKeyMap} A map from the source account key to new account
   *   key.
   */
  async _importIMAccounts(prefs) {
    const imAccountKeyMap = new Map();
    const branch = Services.prefs.getBranch(IM_ACCOUNT);

    let lastKey = 1;
    function _getUniqueAccountKey() {
      const key = `account${lastKey++}`;
      if (Services.prefs.getCharPref(`messenger.account.${key}.name`, "")) {
        return _getUniqueAccountKey();
      }
      return key;
    }

    for (const [type, name, value] of prefs) {
      const key = name.split(".")[0];
      let newAccountKey = imAccountKeyMap.get(key);
      if (!newAccountKey) {
        // For every account, create a new one to avoid conflicts.
        newAccountKey = _getUniqueAccountKey();
        imAccountKeyMap.set(key, newAccountKey);
        this._logger.debug(
          `Mapping IM account from ${key} to ${newAccountKey}`
        );
      }

      const newName = `${newAccountKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }

    return imAccountKeyMap;
  }

  /**
   * Import incoming servers.
   *
   * @param {PrefItem[]} prefs - All source prefs in the MAIL_SERVER branch.
   * @param {IMAccountKeyMap} imAccountKeyMap - A map from the source account
   *   key to new account key.
   * @returns {IncomingServerKeyMap} A map from the source server key to new
   *   server key.
   */
  async _importIncomingServers(prefs, imAccountKeyMap) {
    const incomingServerKeyMap = new Map();
    const branch = Services.prefs.getBranch(MAIL_SERVER);

    let lastKey = 1;
    function _getUniqueIncomingServerKey() {
      const key = `server${lastKey++}`;
      if (branch.getCharPref(`${key}.type`, "")) {
        return _getUniqueIncomingServerKey();
      }
      return key;
    }

    for (const [type, name, value] of prefs) {
      const [key, attr] = name.split(".");
      if (key == this._sourceLocalServerKeyToSkip) {
        if (["directory", "directory-rel"].includes(attr)) {
          this._sourceLocalServerAttrs[attr] = value;
        }
        // We already have a Local Folders account.
        continue;
      }
      if (attr == "deferred_to_account") {
        // Handling deferred account is a bit complicated, to prevent potential
        // problems, just skip this pref so it becomes a normal account.
        continue;
      }
      let newServerKey = incomingServerKeyMap.get(key);
      if (!newServerKey) {
        // For every incoming server, create a new one to avoid conflicts.
        newServerKey = _getUniqueIncomingServerKey();
        incomingServerKeyMap.set(key, newServerKey);
        this._logger.debug(`Mapping server from ${key} to ${newServerKey}`);
      }

      const newName = `${newServerKey}${name.slice(key.length)}`;
      let newValue = value;
      if (newName.endsWith(".imAccount")) {
        newValue = imAccountKeyMap.get(value);
      }
      branch[`set${type}Pref`](newName, newValue || value);
    }
    return incomingServerKeyMap;
  }

  /**
   * Import mail accounts.
   *
   * @param {PrefItem[]} prefs - All source prefs in the MAIL_ACCOUNT branch.
   * @param {string} sourceAccounts - The value of mail.accountmanager.accounts
   *   in the source profile.
   * @param {string} sourceDefaultAccount - The value of
   *   mail.accountmanager.defaultaccount in the source profile.
   * @param {IdentityKeyMap} identityKeyMap - A map from the source identity key
   *   to new identity key.
   * @param {IncomingServerKeyMap} incomingServerKeyMap - A map from the source
   *   server key to new server key.
   */
  _importAccounts(
    prefs,
    sourceAccounts,
    sourceDefaultAccount,
    identityKeyMap,
    incomingServerKeyMap
  ) {
    const accountKeyMap = new Map();
    const branch = Services.prefs.getBranch(MAIL_ACCOUNT);
    for (const [type, name, value] of prefs) {
      const key = name.split(".")[0];
      if (key == "lastKey" || value == this._sourceLocalServerKeyToSkip) {
        continue;
      }
      let newAccountKey = accountKeyMap.get(key);
      if (!newAccountKey) {
        // For every account, create a new one to avoid conflicts.
        newAccountKey = MailServices.accounts.getUniqueAccountKey();
        accountKeyMap.set(key, newAccountKey);
      }

      const newName = `${newAccountKey}${name.slice(key.length)}`;
      let newValue = value;
      if (name.endsWith(".identities")) {
        // An account can have multiple identities.
        newValue = value
          .split(",")
          .map(v => identityKeyMap.get(v))
          .filter(Boolean)
          .join(",");
      } else if (name.endsWith(".server")) {
        newValue = incomingServerKeyMap.get(value);
      }
      branch[`set${type}Pref`](newName, newValue || value);
    }

    // Append newly create accounts to mail.accountmanager.accounts.
    const accounts = Services.prefs
      .getCharPref("mail.accountmanager.accounts", "")
      .split(",");
    if (sourceAccounts) {
      for (const sourceAccountKey of sourceAccounts.split(",")) {
        accounts.push(accountKeyMap.get(sourceAccountKey));
      }
      Services.prefs.setCharPref(
        "mail.accountmanager.accounts",
        accounts.filter(Boolean).join(",")
      );
    }

    // Set defaultaccount if it doesn't already exist.
    const defaultAccount = Services.prefs.getCharPref(
      "mail.accountmanager.defaultaccount",
      ""
    );
    if (sourceDefaultAccount && !defaultAccount) {
      Services.prefs.setCharPref(
        "mail.accountmanager.defaultaccount",
        accountKeyMap.get(sourceDefaultAccount)
      );
    }
  }

  /**
   * Try to locate a file specified by the relative path, if not possible, use
   *   the absolute path.
   *
   * @param {string} relValue - The pref value for the relative file path.
   * @param {string} absValue - The pref value for the absolute file path.
   * @returns {nsIFile}
   */
  _getSourceFileFromPaths(relValue, absValue) {
    const relPath = relValue.slice("[ProfD]".length);
    const parts = relPath.split("/");
    if (!relValue.startsWith("[ProfD]") || parts.includes("..")) {
      // If we don't recognize this path or if it's a path outside the ProfD,
      // use absValue instead.
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      try {
        file.initWithPath(absValue);
      } catch (e) {
        this._logger.warn("nsIFile.initWithPath failed for path=", absValue);
        return null;
      }
      return file;
    }

    const sourceFile = this._sourceProfileDir.clone();
    for (const part of parts) {
      sourceFile.append(part);
    }
    return sourceFile;
  }

  /**
   * Copy mail folders from this._sourceProfileDir to the current profile dir.
   *
   * @param {PrefKeyMap} incomingServerKeyMap - A map from the source server key
   *   to new server key.
   */
  async _importMailMessages(incomingServerKeyMap) {
    for (const key of incomingServerKeyMap.values()) {
      const branch = Services.prefs.getBranch(`${MAIL_SERVER}${key}.`);
      if (!branch) {
        continue;
      }
      const type = branch.getCharPref("type", "");
      const hostname = branch.getCharPref("hostname", "");
      if (!type || !hostname) {
        continue;
      }

      const targetDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      if (type == "imap") {
        targetDir.append("ImapMail");
      } else if (type == "nntp") {
        targetDir.append("News");
      } else if (["none", "pop3", "rss"].includes(type)) {
        targetDir.append("Mail");
      } else {
        continue;
      }

      this._logger.debug("Importing mail messages for", key);

      const sourceDir = this._getSourceFileFromPaths(
        branch.getCharPref("directory-rel", ""),
        branch.getCharPref("directory", "")
      );
      if (sourceDir?.exists()) {
        // Use the hostname as mail folder name and ensure it's unique.
        targetDir.append(hostname);
        targetDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);

        this._recursivelyCopyMsgFolder(sourceDir, targetDir);
        branch.setCharPref("directory", targetDir.path);
        // .directory-rel may be outdated, it will be created when first needed.
        branch.clearUserPref("directory-rel");
      }

      if (type == "nntp") {
        const targetNewsrc = Services.dirsvc.get("ProfD", Ci.nsIFile);
        targetNewsrc.append("News");
        targetNewsrc.append(`newsrc-${hostname}`);
        targetNewsrc.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);

        const sourceNewsrc = this._getSourceFileFromPaths(
          branch.getCharPref("newsrc.file-rel", ""),
          branch.getCharPref("newsrc.file", "")
        );
        if (sourceNewsrc?.exists()) {
          this._logger.debug(
            `Copying ${sourceNewsrc.path} to ${targetNewsrc.path}`
          );
          sourceNewsrc.copyTo(targetNewsrc.parent, targetNewsrc.leafName);
        }

        branch.setCharPref("newsrc.file", targetNewsrc.path);
        // .file-rel may be outdated, it will be created when first needed.
        branch.clearUserPref("newsrc.file-rel");
      }
    }
  }

  /**
   * Merge Local Folders from the source profile into the current profile.
   * Source Local Folders become a subfoler of the current Local Folders.
   */
  _mergeLocalFolders() {
    const sourceDir = this._getSourceFileFromPaths(
      this._sourceLocalServerAttrs["directory-rel"],
      this._sourceLocalServerAttrs.directory
    );
    if (!sourceDir?.exists()) {
      return;
    }
    const rootMsgFolder = this._localServer.rootMsgFolder;
    const folderName = rootMsgFolder.generateUniqueSubfolderName(
      "Local Folders",
      null
    );
    rootMsgFolder.createSubfolder(folderName, null);
    const targetDir = rootMsgFolder.filePath;
    targetDir.append(folderName + ".sbd");
    this._logger.debug(
      `Copying ${sourceDir.path} to ${targetDir.path} in Local Folders`
    );
    this._recursivelyCopyMsgFolder(sourceDir, targetDir, true);
  }

  /**
   * Copy a source msg folder to a destination.
   *
   * @param {nsIFile} sourceDir - The source msg folder location.
   * @param {nsIFile} targetDir - The target msg folder location.
   * @param {boolean} isTargetLocal - Whether the targetDir is a subfolder in
   *   the Local Folders.
   */
  _recursivelyCopyMsgFolder(sourceDir, targetDir, isTargetLocal) {
    this._logger.debug(`Copying ${sourceDir.path} to ${targetDir.path}`);

    // Copy the whole sourceDir.
    if (!isTargetLocal && this._items.accounts && this._items.mailMessages) {
      // Remove the folder so that nsIFile.copyTo doesn't copy into targetDir.
      targetDir.remove(false);
      sourceDir.copyTo(targetDir.parent, targetDir.leafName);
      return;
    }

    for (const entry of sourceDir.directoryEntries) {
      if (entry.isDirectory()) {
        const newFolder = targetDir.clone();
        newFolder.append(entry.leafName);
        newFolder.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
        this._recursivelyCopyMsgFolder(entry, newFolder);
      } else {
        const leafName = entry.leafName;
        const extName = leafName.slice(leafName.lastIndexOf(".") + 1);
        if (isTargetLocal) {
          // When copying to Local Folders, drop database files so that special
          // folders (Inbox, Trash) become normal folders. Otherwise, imported
          // special folders can't be deleted.
          if (extName != "msf") {
            entry.copyTo(targetDir, leafName);
          }
        } else if (
          this._items.accounts &&
          extName != leafName &&
          ["msf", "dat"].includes(extName)
        ) {
          // Copy only the folder structure, databases and filter rules.
          // Ignore the messages themselves.
          entry.copyTo(targetDir, leafName);
        }
      }
    }
  }

  /**
   * Import msg folders from this._sourceProfileDir into the Local Folders of
   * the current profile.
   */
  _importMailMessagesToLocal() {
    // Make sure Local Folders exist first.
    if (!this._localServer) {
      MailServices.accounts.createLocalMailAccount();
      this._localServer = MailServices.accounts.localFoldersServer;
    }
    const localMsgFolder = this._localServer.rootMsgFolder;
    const localRootDir = this._localServer.rootMsgFolder.filePath;
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/importMsgs.properties"
    );

    // Create a "Thunderbird Import" folder, and import into it.
    const wrapFolderName = localMsgFolder.generateUniqueSubfolderName(
      bundle.formatStringFromName("ImportModuleFolderName", [this.NAME]),
      null
    );
    localMsgFolder.createSubfolder(wrapFolderName, null);
    const targetRootMsgFolder = localMsgFolder.getChildNamed(wrapFolderName);

    // Import mail folders.
    for (const name of ["ImapMail", "News", "Mail"]) {
      const sourceDir = this._sourceProfileDir.clone();
      sourceDir.append(name);
      if (!sourceDir.exists()) {
        continue;
      }

      for (const entry of sourceDir.directoryEntries) {
        if (entry.isDirectory()) {
          if (name == "Mail" && entry.leafName == "Feeds") {
            continue;
          }
          const targetDir = localRootDir.clone();
          const folderName = targetRootMsgFolder.generateUniqueSubfolderName(
            entry.leafName,
            null
          );
          targetRootMsgFolder.createSubfolder(folderName, null);
          targetDir.append(wrapFolderName + ".sbd");
          targetDir.append(folderName + ".sbd");
          targetDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
          this._recursivelyCopyMsgFolder(entry, targetDir, true);
        }
      }
    }
  }

  /**
   * Import a pref from source only when this pref has no user value in the
   * current profile.
   *
   * @param {PrefItem[]} prefs - All source prefs to try to import.
   */
  _importOtherPrefs(prefs) {
    const tags = {};
    for (const [type, name, value] of prefs) {
      if (name.startsWith("mailnews.tags.")) {
        const [, , key, attr] = name.split(".");
        if (!tags[key]) {
          tags[key] = {};
        }
        tags[key][attr] = value;
        continue;
      }
      if (!Services.prefs.prefHasUserValue(name)) {
        Services.prefs[`set${type}Pref`](name, value);
      }
    }

    // Import tags, but do not overwrite existing customized tags.
    const bundle = Services.strings.createBundle(
      "chrome://messenger/locale/messenger.properties"
    );
    for (const [key, { color, tag }] of Object.entries(tags)) {
      if (!color || !tag) {
        continue;
      }
      let currentTagColor, currentTagTag;
      try {
        currentTagColor = MailServices.tags.getColorForKey(key);
        currentTagTag = MailServices.tags.getTagForKey(key);
      } catch (e) {
        // No tag exists for this key in the current profile, safe to write.
        Services.prefs.setCharPref(`mailnews.tags.${key}.color`, color);
        Services.prefs.setCharPref(`mailnews.tags.${key}.tag`, tag);
      }
      if (currentTagColor == color && currentTagTag == tag) {
        continue;
      }
      if (
        ["$label1", "$label2", "$label3", "$label4", "$label5"].includes(key)
      ) {
        const seq = key.at(-1);
        const defaultColor = Services.prefs.getCharPref(
          `mailnews.labels.color.${seq}`
        );
        const defaultTag = bundle.GetStringFromName(
          `mailnews.labels.description.${seq}`
        );
        if (currentTagColor == defaultColor && currentTagTag == defaultTag) {
          // The existing tag is in default state, safe to write.
          Services.prefs.setCharPref(`mailnews.tags.${key}.color`, color);
          Services.prefs.setCharPref(`mailnews.tags.${key}.tag`, tag);
        }
      }
    }
  }

  /**
   * Import address books.
   *
   * @param {PrefItem[]} prefs - All source prefs in the ADDRESS_BOOK branch.
   * @param {object} ldapAutoComplete - Pref values of LDAP_AUTO_COMPLETE branch.
   * @param {boolean} ldapAutoComplete.useDirectory
   * @param {string} ldapAutoComplete.directoryServer
   */
  async _importAddressBooks(prefs, ldapAutoComplete) {
    const keyMap = new Map();
    const branch = Services.prefs.getBranch(ADDRESS_BOOK);
    for (let [type, name, value] of prefs) {
      const [key, attr] = name.split(".");
      if (["pab", "history"].includes(key)) {
        continue;
      }
      if (attr == "uid") {
        // Prevent duplicated uids when importing back, uid will be created when
        // first used.
        continue;
      }
      let newKey = keyMap.get(key);
      if (!newKey) {
        // For every address book, create a new one to avoid conflicts.
        let uniqueCount = 0;
        newKey = key;
        // @see https://github.com/eslint/eslint/issues/17807
        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (!branch.getCharPref(`${newKey}.filename`, "")) {
            break;
          }
          newKey = `${key}${++uniqueCount}`;
        }
        keyMap.set(key, newKey);
      }

      const newName = `${newKey}${name.slice(key.length)}`;
      if (newName.endsWith(".dirType") && value == 2) {
        // dirType=2 is a Mab file, we will migrate it in _copyAddressBookDatabases.
        value = Ci.nsIAbManager.JS_DIRECTORY_TYPE;
      }
      branch[`set${type}Pref`](newName, value);
    }

    // Transform the value of ldap_2.autoComplete.directoryServer if needed.
    if (
      ldapAutoComplete.useDirectory &&
      ldapAutoComplete.directoryServer &&
      !Services.prefs.getBoolPref(`${LDAP_AUTO_COMPLETE}useDirectory`, false)
    ) {
      const key = ldapAutoComplete.directoryServer.split("/").slice(-1)[0];
      const newKey = keyMap.get(key);
      if (newKey) {
        Services.prefs.setBoolPref(`${LDAP_AUTO_COMPLETE}useDirectory`, true);
        Services.prefs.setCharPref(
          `${LDAP_AUTO_COMPLETE}directoryServer`,
          `ldap_2.servers.${newKey}`
        );
      }
    }

    await this._copyAddressBookDatabases(keyMap);
  }

  /**
   * Copy sqlite files from this._sourceProfileDir to the current profile dir.
   *
   * @param {Map<string, string>} keyMap - A map from the source address
   *   book key to new address book key.
   */
  async _copyAddressBookDatabases(keyMap) {
    let hasMabFile = false;

    // Copy user created address books.
    for (const key of keyMap.values()) {
      const branch = Services.prefs.getBranch(`${ADDRESS_BOOK}${key}.`);
      const filename = branch.getCharPref("filename", "");
      if (!filename) {
        continue;
      }
      const sourceFile = this._sourceProfileDir.clone();
      sourceFile.append(filename);
      if (!sourceFile.exists()) {
        this._logger.debug(
          `Ignoring non-existing address book file ${sourceFile.path}`
        );
        continue;
      }

      let leafName = sourceFile.leafName;
      const isMabFile = leafName.endsWith(".mab");
      if (isMabFile) {
        leafName = leafName.slice(0, -4) + ".sqlite";
        hasMabFile = true;
      }
      const targetFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      targetFile.append(leafName);
      targetFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
      branch.setCharPref("filename", targetFile.leafName);
      this._logger.debug(`Copying ${sourceFile.path} to ${targetFile.path}`);
      if (isMabFile) {
        await this._migrateMabToSqlite(sourceFile, targetFile);
      } else {
        sourceFile.copyTo(targetFile.parent, targetFile.leafName);
        // Write-Ahead Logging file contains changes not written to .sqlite file
        // yet.
        const sourceWalFile = this._sourceProfileDir.clone();
        sourceWalFile.append(filename + "-wal");
        if (sourceWalFile.exists()) {
          sourceWalFile.copyTo(targetFile.parent, targetFile.leafName + "-wal");
        }
      }
    }

    if (hasMabFile) {
      await this._importMorkDatabase("abook");
      await this._importMorkDatabase("history");
    } else {
      // Copy or import Personal Address Book.
      await this._importAddressBookDatabase("abook.sqlite");
      // Copy or import Collected Addresses.
      await this._importAddressBookDatabase("history.sqlite");
    }
  }

  /**
   * Copy a sqlite file from this._sourceProfileDir to the current profile dir.
   *
   * @param {string} filename - The name of the sqlite file.
   */
  async _importAddressBookDatabase(filename) {
    const sourceFile = this._sourceProfileDir.clone();
    sourceFile.append(filename);
    if (!sourceFile.exists()) {
      return;
    }

    const targetDirectory = MailServices.ab.getDirectory(
      `jsaddrbook://${filename}`
    );
    if (!targetDirectory) {
      sourceFile.copyTo(Services.dirsvc.get("ProfD", Ci.nsIFile), "");
      return;
    }

    const importer = new AddrBookFileImporter("sqlite");
    await importer.startImport(sourceFile, targetDirectory);
  }

  /**
   * Migrate an address book .mab file to a .sqlite file.
   *
   * @param {nsIFile} sourceMabFile - The source .mab file.
   * @param {nsIFile} targetSqliteFile - The target .sqlite file, should already
   *   exists in the profile dir.
   */
  async _migrateMabToSqlite(sourceMabFile, targetSqliteFile) {
    // It's better to use MailServices.ab.getDirectory, but we need to refresh
    // AddrBookManager first.
    const targetDirectory = Cc[
      "@mozilla.org/addressbook/directory;1?type=jsaddrbook"
    ].createInstance(Ci.nsIAbDirectory);
    targetDirectory.init(`jsaddrbook://${targetSqliteFile.leafName}`);

    const importer = new AddrBookFileImporter("mab");
    await importer.startImport(sourceMabFile, targetDirectory);
  }

  /**
   * Import pab/history address book from mab file into the corresponding sqlite
   *   file.
   *
   * @param {string} basename - The filename without extension, e.g. "abook".
   */
  async _importMorkDatabase(basename) {
    this._logger.debug(`Importing ${basename}.mab into ${basename}.sqlite`);

    const sourceMabFile = this._sourceProfileDir.clone();
    sourceMabFile.append(`${basename}.mab`);
    if (!sourceMabFile.exists()) {
      return;
    }

    let targetDirectory;
    try {
      targetDirectory = MailServices.ab.getDirectory(
        `jsaddrbook://${basename}.sqlite`
      );
    } catch (e) {
      this._logger.warn(`Failed to open ${basename}.sqlite`, e);
      return;
    }

    const importer = new AddrBookFileImporter("mab");
    await importer.startImport(sourceMabFile, targetDirectory);
  }

  /**
   * Import calendars.
   *
   * For storage calendars, we need to import everything from the source
   * local.sqlite to the target local.sqlite, which is not implemented yet, see
   * bug 1719582.
   *
   * @param {PrefItem[]} prefs - All source prefs in the CALENDAR branch.
   * @param {object} calendarList - Pref values of CALENDAR_LIST branch.
   */
  _importCalendars(prefs, calendarList) {
    const branch = Services.prefs.getBranch(CALENDAR);
    for (const [type, name, value] of prefs) {
      branch[`set${type}Pref`](name, value);
    }

    if (calendarList.sortOrder) {
      const prefName = `${CALENDAR_LIST}sortOrder`;
      const prefValue =
        Services.prefs.getCharPref(prefName, "") + " " + calendarList.sortOrder;
      Services.prefs.setCharPref(prefName, prefValue.trim());
    }
  }
}
