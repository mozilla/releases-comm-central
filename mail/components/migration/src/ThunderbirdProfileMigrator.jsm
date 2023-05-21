/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ThunderbirdProfileMigrator"];

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const lazy = {};
XPCOMUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/importDialog.ftl"])
);

// Pref branches that need special handling.
const MAIL_IDENTITY = "mail.identity.";
const MAIL_SERVER = "mail.server.";
const MAIL_ACCOUNT = "mail.account.";
const IM_ACCOUNT = "messenger.account.";
const SMTP_SERVER = "mail.smtpserver.";
const ADDRESS_BOOK = "ldap_2.servers.";
const LDAP_AUTO_COMPLETE = "ldap_2.autoComplete.";
const CALENDAR = "calendar.registry.";

// Prefs (branches) that we do not want to copy directly.
const IGNORE_PREFS = [
  "app.update.",
  "browser.",
  "calendar.list.sortOrder",
  "calendar.timezone",
  "devtools.",
  "extensions.",
  "mail.accountmanager.",
  "mail.cloud_files.accounts.",
  "mail.newsrc_root",
  "mail.root.",
  "mail.smtpservers",
  "messenger.accounts",
  "print.",
  "services.",
  "toolkit.telemetry.",
];

// When importing from a zip file, ignoring these folders.
const IGNORE_DIRS = [
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

/**
 * A class to support importing from a Thunderbird profile directory.
 *
 * @implements {nsIMailProfileMigrator}
 */
class ThunderbirdProfileMigrator {
  QueryInterface = ChromeUtils.generateQI(["nsIMailProfileMigrator"]);

  get wrappedJSObject() {
    return this;
  }

  _logger = console.createInstance({
    prefix: "mail.import",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mail.import.loglevel",
  });

  get sourceExists() {
    return true;
  }

  get sourceProfiles() {
    return this._sourceProfileDir ? [this._sourceProfileDir.path] : [];
  }

  get sourceHasMultipleProfiles() {
    return false;
  }

  /**
   * Other profile migrators try known install directories to get a source
   * profile dir. But in this class, we always ask user for the profile
   * location.
   */
  async getProfileDir(window, type) {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    let [filePickerTitleZip, filePickerTitleDir] = await lazy.l10n.formatValues(
      ["import-select-profile-zip", "import-select-profile-dir"]
    );
    switch (type) {
      case "zip":
        filePicker.init(window, filePickerTitleZip, filePicker.modeOpen);
        filePicker.appendFilter("", "*.zip");
        break;
      case "dir":
        filePicker.init(window, filePickerTitleDir, filePicker.modeGetFolder);
        break;
      default:
        throw new Error(`Unsupported type: ${type}`);
    }
    let selectedFile = await new Promise((resolve, reject) => {
      filePicker.open(rv => {
        if (rv != Ci.nsIFilePicker.returnOK || !filePicker.file) {
          reject(new Error("file-picker-cancelled"));
          return;
        }
        resolve(filePicker.file);
      });
    });
    if (selectedFile.isDirectory()) {
      this._sourceProfileDir = selectedFile;
    } else {
      if (selectedFile.fileSize > 2147483647) {
        // nsIZipReader only supports zip file less than 2GB.
        // throw new Error(zipFileTooBigMessage);
        throw new Error("zip-file-too-big");
      }
      this._importingFromZip = true;
      // Extract the zip file to a tmp dir.
      let targetDir = Services.dirsvc.get("TmpD", Ci.nsIFile);
      targetDir.append("tmp-profile");
      targetDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      let ZipReader = Components.Constructor(
        "@mozilla.org/libjar/zip-reader;1",
        "nsIZipReader",
        "open"
      );
      let zip = ZipReader(filePicker.file);
      for (let entry of zip.findEntries(null)) {
        let parts = entry.split("/");
        if (IGNORE_DIRS.includes(parts[1]) || entry.endsWith("/")) {
          continue;
        }
        // Folders can not be unzipped recursively, have to iterate and
        // extract all file entries one by one.
        let target = targetDir.clone();
        for (let part of parts.slice(1)) {
          // Drop the root folder name in the zip file.
          target.append(part);
        }
        if (!target.parent.exists()) {
          target.parent.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
        }
        try {
          this._logger.debug(`Extracting ${entry} to ${target.path}`);
          zip.extract(entry, target);
        } catch (e) {
          this._logger.error(e);
        }
      }
      // Use the tmp dir as source profile dir.
      this._sourceProfileDir = targetDir;
    }
  }

  getMigrateData() {
    return (
      Ci.nsIMailProfileMigrator.ACCOUNT_SETTINGS |
      Ci.nsIMailProfileMigrator.MAILDATA |
      Ci.nsIMailProfileMigrator.NEWSDATA |
      Ci.nsIMailProfileMigrator.ADDRESSBOOK_DATA |
      Ci.nsIMailProfileMigrator.SETTINGS
    );
  }

  migrate(items, startup, profile) {
    throw new Error("migrate not implemented");
  }

  async asyncMigrate() {
    Services.obs.notifyObservers(null, "Migration:Started");
    try {
      await this._importPreferences();
    } finally {
      if (this._importingFromZip) {
        IOUtils.remove(this._sourceProfileDir.path, { recursive: true });
      }
    }
    Services.obs.notifyObservers(null, "Migration:Ended");
  }

  /**
   * Collect interested prefs from this._sourceProfileDir, then import them one
   * by one.
   */
  async _importPreferences() {
    // A Map to collect all prefs in interested pref branches.
    // @type {Map<string, PrefItem[]>}
    let branchPrefsMap = new Map([
      [MAIL_IDENTITY, []],
      [MAIL_SERVER, []],
      [MAIL_ACCOUNT, []],
      [IM_ACCOUNT, []],
      [SMTP_SERVER, []],
      [ADDRESS_BOOK, []],
      [CALENDAR, []],
    ]);
    let accounts;
    let defaultAccount;
    let defaultSmtpServer;
    let ldapAutoComplete = {};
    let otherPrefs = [];

    let sourcePrefsFile = this._sourceProfileDir.clone();
    sourcePrefsFile.append("prefs.js");
    let sourcePrefsBuffer = await IOUtils.read(sourcePrefsFile.path);

    let savePref = (type, name, value) => {
      for (let [branchName, branchPrefs] of branchPrefsMap) {
        if (name.startsWith(branchName)) {
          branchPrefs.push([type, name.slice(branchName.length), value]);
          return;
        }
      }
      if (name == "mail.accountmanager.accounts") {
        accounts = value;
        return;
      }
      if (name == "mail.accountmanager.defaultaccount") {
        defaultAccount = value;
        return;
      }
      if (name == "mail.smtp.defaultserver") {
        defaultSmtpServer = value;
        return;
      }
      if (name.startsWith(LDAP_AUTO_COMPLETE)) {
        ldapAutoComplete[name.slice(LDAP_AUTO_COMPLETE.length)] = value;
        return;
      }
      if (IGNORE_PREFS.some(ignore => name.startsWith(ignore))) {
        return;
      }
      // Collect all the other prefs.
      otherPrefs.push([type, name, value]);
    };

    Services.prefs.parsePrefsFromBuffer(sourcePrefsBuffer, {
      onStringPref: (kind, name, value) => savePref("Char", name, value),
      onIntPref: (kind, name, value) => savePref("Int", name, value),
      onBoolPref: (kind, name, value) => savePref("Bool", name, value),
      onError: msg => {
        throw new Error(msg);
      },
    });

    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.ACCOUNT_SETTINGS
    );
    await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));

    // Import SMTP servers first, the importing order is important.
    let smtpServerKeyMap = this._importSmtpServers(
      branchPrefsMap.get(SMTP_SERVER),
      defaultSmtpServer
    );
    // mail.identity.idN.smtpServer depends on transformed smtp server key.
    let identityKeyMap = this._importIdentities(
      branchPrefsMap.get(MAIL_IDENTITY),
      smtpServerKeyMap
    );
    let imAccountKeyMap = await this._importIMAccounts(
      branchPrefsMap.get(IM_ACCOUNT)
    );
    // mail.server.serverN.imAccount depends on transformed im account key.
    let incomingServerKeyMap = await this._importIncomingServers(
      branchPrefsMap.get(MAIL_SERVER),
      imAccountKeyMap
    );
    // mail.account.accountN.{identities, server} depends on previous steps.
    this._importAccounts(
      branchPrefsMap.get(MAIL_ACCOUNT),
      accounts,
      defaultAccount,
      identityKeyMap,
      incomingServerKeyMap
    );
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.ACCOUNT_SETTINGS
    );
    Services.obs.notifyObservers(null, "Migration:Progress", "25");
    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.MAILDATA
    );
    await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));

    await this._copyMailFolders(incomingServerKeyMap);
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.MAILDATA
    );
    Services.obs.notifyObservers(null, "Migration:Progress", "50");
    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.ADDRESSBOOK_DATA
    );
    await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));

    this._importAddressBooks(
      branchPrefsMap.get(ADDRESS_BOOK),
      ldapAutoComplete
    );
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.ADDRESSBOOK_DATA
    );
    Services.obs.notifyObservers(null, "Migration:Progress", "75");
    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.SETTINGS
    );
    await new Promise(resolve => Services.tm.dispatchToMainThread(resolve));

    this._importPasswords();
    this._importOtherPrefs(otherPrefs);
    this._importCalendars(branchPrefsMap.get(CALENDAR));
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.SETTINGS
    );
    Services.obs.notifyObservers(null, "Migration:Progress", "100");
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
    let smtpServerKeyMap = new Map();
    let branch = Services.prefs.getBranch(SMTP_SERVER);
    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      let newServerKey = smtpServerKeyMap.get(key);
      if (!newServerKey) {
        // For every smtp server, create a new one to avoid conflicts.
        let server = MailServices.smtp.createServer();
        newServerKey = server.key;
        smtpServerKeyMap.set(key, newServerKey);
        this._logger.debug(
          `Mapping SMTP server from ${key} to ${newServerKey}`
        );
      }

      let newName = `${newServerKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }

    // Set defaultserver if it doesn't already exist.
    let defaultServer = Services.prefs.getCharPref(
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
    let identityKeyMap = new Map();
    let branch = Services.prefs.getBranch(MAIL_IDENTITY);
    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      let newIdentityKey = identityKeyMap.get(key);
      if (!newIdentityKey) {
        // For every identity, create a new one to avoid conflicts.
        let identity = MailServices.accounts.createIdentity();
        newIdentityKey = identity.key;
        identityKeyMap.set(key, newIdentityKey);
        this._logger.debug(`Mapping identity from ${key} to ${newIdentityKey}`);
      }

      let newName = `${newIdentityKey}${name.slice(key.length)}`;
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
    let imAccountKeyMap = new Map();
    let branch = Services.prefs.getBranch(IM_ACCOUNT);

    let lastKey = 1;
    function _getUniqueAccountKey() {
      let key = `account${lastKey++}`;
      if (Services.prefs.getCharPref(`messenger.account.${key}.name`, "")) {
        return _getUniqueAccountKey();
      }
      return key;
    }

    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      let newAccountKey = imAccountKeyMap.get(key);
      if (!newAccountKey) {
        // For every account, create a new one to avoid conflicts.
        newAccountKey = _getUniqueAccountKey();
        imAccountKeyMap.set(key, newAccountKey);
        this._logger.debug(
          `Mapping IM account from ${key} to ${newAccountKey}`
        );
      }

      let newName = `${newAccountKey}${name.slice(key.length)}`;
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
    let incomingServerKeyMap = new Map();
    let branch = Services.prefs.getBranch(MAIL_SERVER);

    let lastKey = 1;
    function _getUniqueIncomingServerKey() {
      let key = `server${lastKey++}`;
      if (branch.getCharPref(`${key}.type`, "")) {
        return _getUniqueIncomingServerKey();
      }
      return key;
    }

    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      let newServerKey = incomingServerKeyMap.get(key);
      if (!newServerKey) {
        // For every incoming server, create a new one to avoid conflicts.
        newServerKey = _getUniqueIncomingServerKey();
        incomingServerKeyMap.set(key, newServerKey);
        this._logger.debug(`Mapping server from ${key} to ${newServerKey}`);
      }

      let newName = `${newServerKey}${name.slice(key.length)}`;
      let newValue = value;
      if (newName.endsWith(".imAccount")) {
        newValue = imAccountKeyMap.get(value);
      }
      branch[`set${type}Pref`](newName, newValue || value);
    }
    return incomingServerKeyMap;
  }

  /**
   * Copy mail folders from this._sourceProfileDir to the current profile dir.
   *
   * @param {PrefKeyMap} incomingServerKeyMap - A map from the source server key
   *   to new server key.
   */
  async _copyMailFolders(incomingServerKeyMap) {
    for (let key of incomingServerKeyMap.values()) {
      let branch = Services.prefs.getBranch(`${MAIL_SERVER}${key}.`);
      if (!branch) {
        continue;
      }
      let type = branch.getCharPref("type", "");
      let hostname = branch.getCharPref("hostname", "");
      if (!type || !hostname) {
        continue;
      }

      // Use .directory-rel instead of .directory because .directory is an
      // absolute path which may not exists.
      let directoryRel = branch.getCharPref("directory-rel", "");
      if (!directoryRel.startsWith("[ProfD]")) {
        continue;
      }
      directoryRel = directoryRel.slice("[ProfD]".length);

      let targetDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
      if (type == "imap") {
        targetDir.append("ImapMail");
      } else if (type == "nntp") {
        targetDir.append("News");
      } else if (["none", "pop3", "rss"].includes(type)) {
        targetDir.append("Mail");
      } else {
        continue;
      }

      // Use the hostname as mail folder name and ensure it's unique.
      targetDir.append(hostname);
      targetDir.createUnique(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
      // Remove the folder so that nsIFile.copyTo doesn't copy into targetDir.
      targetDir.remove(false);

      let sourceDir = this._sourceProfileDir.clone();
      for (let part of directoryRel.split("/")) {
        sourceDir.append(part);
      }
      if (
        sourceDir.exists() &&
        (type != "imap" || Services.appinfo.OS != "WINNT")
      ) {
        // For some reasons, if mail folders are copied on Windows,
        // `errorGettingDB` is thrown after imported and restarted. IMAP folders
        // will be downloaded automatically, better than a broken account.
        this._logger.debug(`Copying ${sourceDir.path} to ${targetDir.path}`);
        sourceDir.copyTo(targetDir.parent, targetDir.leafName);
      }
      branch.setCharPref("directory", targetDir.path);
      // .directory-rel may be outdated, it will be created when first needed.
      branch.clearUserPref("directory-rel");

      if (type == "nntp") {
        // Use .file-rel instead of .file because .file is an absolute path
        // which may not exists.
        let fileRel = branch.getCharPref("newsrc.file-rel", "");
        if (!fileRel.startsWith("[ProfD]")) {
          continue;
        }
        fileRel = fileRel.slice("[ProfD]".length);
        let sourceNewsrc = this._sourceProfileDir.clone();
        for (let part of fileRel.split("/")) {
          sourceNewsrc.append(part);
        }
        let targetNewsrc = Services.dirsvc.get("ProfD", Ci.nsIFile);
        targetNewsrc.append("News");
        targetNewsrc.append(`newsrc-${hostname}`);
        targetNewsrc.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
        this._logger.debug(
          `Copying ${sourceNewsrc.path} to ${targetNewsrc.path}`
        );
        sourceNewsrc.copyTo(targetNewsrc.parent, targetNewsrc.leafName);
        branch.setCharPref("newsrc.file", targetNewsrc.path);
        // .file-rel may be outdated, it will be created when first needed.
        branch.clearUserPref("newsrc.file-rel");
      }
    }
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
    let accountKeyMap = new Map();
    let branch = Services.prefs.getBranch(MAIL_ACCOUNT);
    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      if (key == "lastKey") {
        continue;
      }
      let newAccountKey = accountKeyMap.get(key);
      if (!newAccountKey) {
        // For every account, create a new one to avoid conflicts.
        newAccountKey = MailServices.accounts.getUniqueAccountKey();
        accountKeyMap.set(key, newAccountKey);
      }

      let newName = `${newAccountKey}${name.slice(key.length)}`;
      let newValue = value;
      if (name.endsWith(".identities")) {
        newValue = identityKeyMap.get(value);
      } else if (name.endsWith(".server")) {
        newValue = incomingServerKeyMap.get(value);
      }
      branch[`set${type}Pref`](newName, newValue || value);
    }

    // Append newly create accounts to mail.accountmanager.accounts.
    let accounts = Services.prefs
      .getCharPref("mail.accountmanager.accounts", "")
      .split(",");
    if (accounts.length == 1 && accounts[0] == "") {
      accounts.length = 0;
    }
    if (sourceAccounts) {
      for (let sourceAccountKey of sourceAccounts.split(",")) {
        accounts.push(accountKeyMap.get(sourceAccountKey));
      }
      Services.prefs.setCharPref(
        "mail.accountmanager.accounts",
        accounts.join(",")
      );
    }

    // Set defaultaccount if it doesn't already exist.
    let defaultAccount = Services.prefs.getCharPref(
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
   * Import address books.
   *
   * @param {PrefItem[]} prefs - All source prefs in the ADDRESS_BOOK branch.
   * @param {object} ldapAutoComplete - Pref values of LDAP_AUTO_COMPLETE branch.
   * @param {boolean} ldapAutoComplete.useDirectory
   * @param {string} ldapAutoComplete.directoryServer
   */
  _importAddressBooks(prefs, ldapAutoComplete) {
    let keyMap = new Map();
    let branch = Services.prefs.getBranch(ADDRESS_BOOK);
    for (let [type, name, value] of prefs) {
      let key = name.split(".")[0];
      if (["pab", "history"].includes(key)) {
        continue;
      }
      let newKey = keyMap.get(key);
      if (!newKey) {
        // For every address book, create a new one to avoid conflicts.
        let uniqueCount = 0;
        newKey = key;
        while (true) {
          if (!branch.getCharPref(`${newKey}.filename`, "")) {
            break;
          }
          newKey = `${key}${++uniqueCount}`;
        }
        keyMap.set(key, newKey);
      }

      let newName = `${newKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }

    // Transform the value of ldap_2.autoComplete.directoryServer if needed.
    if (
      ldapAutoComplete.useDirectory &&
      ldapAutoComplete.directoryServer &&
      !Services.prefs.getBoolPref(`${LDAP_AUTO_COMPLETE}useDirectory`, false)
    ) {
      let key = ldapAutoComplete.directoryServer.split("/").slice(-1)[0];
      let newKey = keyMap.get(key);
      if (newKey) {
        Services.prefs.setBoolPref(`${LDAP_AUTO_COMPLETE}useDirectory`, true);
        Services.prefs.setCharPref(
          `${LDAP_AUTO_COMPLETE}directoryServer`,
          `ldap_2.servers.${newKey}`
        );
      }
    }

    this._copyAddressBookDatabases(keyMap);
  }

  /**
   * Copy sqlite files from this._sourceProfileDir to the current profile dir.
   *
   * @param {Map<string, string>} keyMap - A map from the source address
   *   book key to new address book key.
   */
  _copyAddressBookDatabases(keyMap) {
    // Copy user created address books.
    for (let key of keyMap.values()) {
      let branch = Services.prefs.getBranch(`${ADDRESS_BOOK}${key}.`);
      let filename = branch.getCharPref("filename", "");
      if (!filename) {
        continue;
      }
      let sourceFile = this._sourceProfileDir.clone();
      sourceFile.append(filename);
      if (!sourceFile.exists()) {
        this._logger.debug(
          `Ignoring non-existing address boook file ${sourceFile.path}`
        );
        continue;
      }

      let targetFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      targetFile.append(sourceFile.leafName);
      targetFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
      this._logger.debug(`Copying ${sourceFile.path} to ${targetFile.path}`);
      sourceFile.copyTo(targetFile.parent, targetFile.leafName);

      branch.setCharPref("filename", targetFile.leafName);
    }

    // Copy or import Personal Address Book.
    this._importAddressBookDatabase("abook.sqlite");
    // Copy or import Collected Addresses.
    this._importAddressBookDatabase("history.sqlite");
  }

  /**
   * Copy a sqlite file from this._sourceProfileDir to the current profile dir.
   *
   * @param {string} filename - The name of the sqlite file.
   */
  _importAddressBookDatabase(filename) {
    let sourceFile = this._sourceProfileDir.clone();
    sourceFile.append(filename);
    let targetFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
    targetFile.append(filename);

    if (!sourceFile.exists()) {
      return;
    }

    if (!targetFile.exists()) {
      sourceFile.copyTo(targetFile.parent, "");
      return;
    }

    let dirId = MailServices.ab.newAddressBook(
      "tmp",
      "",
      Ci.nsIAbManager.JS_DIRECTORY_TYPE
    );
    let tmpDirectory = MailServices.ab.getDirectoryFromId(dirId);
    sourceFile.copyTo(targetFile.parent, tmpDirectory.fileName);

    let targetDirectory = MailServices.ab.getDirectory(
      `jsaddrbook://${filename}`
    );
    for (let card of tmpDirectory.childCards) {
      targetDirectory.addCard(card);
    }

    MailServices.ab.deleteAddressBook(tmpDirectory.URI);
  }

  /**
   * Import logins.json and key4.db.
   */
  _importPasswords() {
    let sourceLoginsJson = this._sourceProfileDir.clone();
    sourceLoginsJson.append("logins.json");
    let sourceKeyDb = this._sourceProfileDir.clone();
    sourceKeyDb.append("key4.db");
    let targetLoginsJson = Services.dirsvc.get("ProfD", Ci.nsIFile);
    targetLoginsJson.append("logins.json");

    if (
      sourceLoginsJson.exists() &&
      sourceKeyDb.exists() &&
      !targetLoginsJson.exists()
    ) {
      // Only copy if logins.json doesn't exist in the current profile.
      sourceLoginsJson.copyTo(targetLoginsJson.parent, "");
      sourceKeyDb.copyTo(targetLoginsJson.parent, "");
    }
  }

  /**
   * Import a pref from source only when this pref has no user value in the
   * current profile.
   *
   * @param {PrefItem[]} prefs - All source prefs to try to import.
   */
  _importOtherPrefs(prefs) {
    for (let [type, name, value] of prefs) {
      if (!Services.prefs.prefHasUserValue(name)) {
        Services.prefs[`set${type}Pref`](name, value);
      }
    }
  }

  /**
   * Import calendars.
   *
   * For storage calendars, we need to import everything from the source
   * local.sqlite to the target local.sqlite, which is not implemented yet, see
   * bug 1719582.
   *
   * @param {PrefItem[]} prefs - All source prefs in the CALENDAR branch.
   */
  _importCalendars(prefs) {
    let branch = Services.prefs.getBranch(CALENDAR);
    for (let [type, name, value] of prefs) {
      branch[`set${type}Pref`](name, value);
    }
  }
}
