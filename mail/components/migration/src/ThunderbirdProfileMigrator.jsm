/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["ThunderbirdProfileMigrator"];

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
XPCOMUtils.defineLazyGetter(
  this,
  "l10n",
  () => new Localization(["messenger/importDialog.ftl"])
);

// Pref branches that need special handling.
const MAIL_IDENTITY = "mail.identity.";
const MAIL_SERVER = "mail.server.";
const MAIL_ACCOUNT = "mail.account.";
const SMTP_SERVER = "mail.smtpserver.";
const ADDRESS_BOOK = "ldap_2.servers.";

/**
 * A pref is represented as [type, name, value].
 * @typedef {["Bool"|"Char"|"Int", string, number|string|boolean]} PrefItem
 *
 * A map from source smtp server key to target smtp server key.
 * @typedef {Map<string, string>} SmtpServerKeyMap
 *
 * A map from source identity key to target identity key.
 * @typedef {Map<string, string>} IdentityKeyMap
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
  async getProfileDir(window) {
    let filePicker = Cc["@mozilla.org/filepicker;1"].createInstance(
      Ci.nsIFilePicker
    );
    filePicker.init(
      window,
      await l10n.formatValue("import-select-profile-dir"),
      filePicker.modeGetFolder
    );
    filePicker.appendFilters(filePicker.filterAll);
    this._sourceProfileDir = await new Promise(resolve => {
      filePicker.open(rv => {
        if (rv != Ci.nsIFilePicker.returnOK || !filePicker.file) {
          resolve(null);
          return;
        }
        resolve(filePicker.file);
      });
    });
  }

  getMigrateData() {
    return (
      Ci.nsIMailProfileMigrator.ACCOUNT_SETTINGS |
      Ci.nsIMailProfileMigrator.MAILDATA |
      Ci.nsIMailProfileMigrator.NEWSDATA |
      Ci.nsIMailProfileMigrator.ADDRESSBOOK_DATA
    );
  }

  migrate(items, startup, profile) {
    this._migrate();
  }

  async _migrate() {
    Services.obs.notifyObservers(null, "Migration:Started");
    try {
      await this._importPreferences();
    } catch (e) {
      throw Components.Exception(e.message, Cr.NS_ERROR_FAILURE, e.stack);
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
      [SMTP_SERVER, []],
      [ADDRESS_BOOK, []],
    ]);
    let defaultAccount;

    let sourcePrefsFile = this._sourceProfileDir.clone();
    sourcePrefsFile.append("prefs.js");
    let sourcePrefsBuffer = await IOUtils.read(sourcePrefsFile.path);

    let savePref = (type, name, value) => {
      for (let [branchName, branchPrefs] of branchPrefsMap) {
        if (name.startsWith(branchName)) {
          branchPrefs.push([type, name.slice(branchName.length), value]);
          return;
        }
        if (name == "mail.accountmanager.defaultaccount") {
          defaultAccount = value;
        }
      }
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
    // Import SMTP servers first, the importing order is important.
    let smtpServerKeyMap = this._importSmtpServers(
      branchPrefsMap.get(SMTP_SERVER)
    );
    // mail.identity.idN.smtpServer depends on transformed smtp server key.
    let identityKeyMap = this._importIdentities(
      branchPrefsMap.get(MAIL_IDENTITY),
      smtpServerKeyMap
    );
    let incomingServerKeyMap = await this._importIncomingServers(
      branchPrefsMap.get(MAIL_SERVER)
    );
    // mail.account.accountN.{identities, server} depends on previous steps.
    this._importAccounts(
      branchPrefsMap.get(MAIL_ACCOUNT),
      defaultAccount,
      identityKeyMap,
      incomingServerKeyMap
    );
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.ACCOUNT_SETTINGS
    );
    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.MAILDATA
    );
    this._copyMailFolders(incomingServerKeyMap);
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.MAILDATA
    );
    Services.obs.notifyObservers(
      null,
      "Migration:ItemBeforeMigrate",
      Ci.nsIMailProfileMigrator.ADDRESS_BOOK
    );
    this._importAddressBooks(branchPrefsMap.get(ADDRESS_BOOK));
    Services.obs.notifyObservers(
      null,
      "Migration:ItemAfterMigrate",
      Ci.nsIMailProfileMigrator.ADDRESS_BOOK
    );
  }

  /**
   * Import SMTP servers.
   * @param {PrefItem[]} prefs - All source prefs in the SMTP_SERVER branch.
   * @returns {smtpServerKeyMap} A map from source server key to new server key.
   */
  _importSmtpServers(prefs) {
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
      }

      let newName = `${newServerKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }
    return smtpServerKeyMap;
  }

  /**
   * Import mail identites.
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
   * Import incoming servers.
   * @param {PrefItem[]} prefs - All source prefs in the MAIL_SERVER branch.
   * @returns {IncomingServerKeyMap} A map from the source server key to new
   *   server key.
   */
  async _importIncomingServers(prefs) {
    let incomingServerKeyMap = new Map();
    let branch = Services.prefs.getBranch(MAIL_SERVER);

    async function _getUniqueIncomingServerKey() {
      // Since updating prefs.js is batched, getUniqueServerKey may return the
      // previous key.
      let key = MailServices.accounts.getUniqueServerKey();
      if (incomingServerKeyMap.has(key)) {
        return new Promise(resolve =>
          // As a workaround, delay 500ms and try again.
          setTimeout(() => resolve(_getUniqueIncomingServerKey()), 500)
        );
      }
      return key;
    }

    for (let [type, name, value] of prefs) {
      if (name.endsWith(".directory-rel") || name.endsWith(".file-rel")) {
        // Will be created when first needed.
        continue;
      }
      let key = name.split(".")[0];
      let newServerKey = incomingServerKeyMap.get(key);
      if (!newServerKey) {
        // For every incoming server, create a new one to avoid conflicts.
        newServerKey = await _getUniqueIncomingServerKey();
        incomingServerKeyMap.set(key, newServerKey);
      }

      let newName = `${newServerKey}${name.slice(key.length)}`;
      branch[`set${type}Pref`](newName, value);
    }
    return incomingServerKeyMap;
  }

  /**
   * Copy mail folders from this._sourceProfileDir to the current profile dir.
   * @param {PrefKeyMap} incomingServerKeyMap - A map from the source server key
   *   to new server key.
   */
  async _copyMailFolders(incomingServerKeyMap) {
    for (let key of incomingServerKeyMap.values()) {
      let branch = Services.prefs.getBranch(`${MAIL_SERVER}${key}.`);
      let type = branch.getCharPref("type");
      let hostname = branch.getCharPref("hostname");
      let directory = branch.getCharPref("directory", "");

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

      let sourceDir = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      sourceDir.initWithPath(directory);
      sourceDir.copyTo(targetDir.parent, targetDir.leafName);
      branch.setCharPref("directory", targetDir.path);

      if (type == "nntp") {
        // Copy the newsrc.file for NNTP server.
        let sourceNewsrc = Cc["@mozilla.org/file/local;1"].createInstance(
          Ci.nsIFile
        );
        sourceNewsrc.initWithPath(branch.getCharPref("newsrc.file"));
        let targetNewsrc = Services.dirsvc.get("ProfD", Ci.nsIFile);
        targetNewsrc.append("News");
        targetNewsrc.append(`newsrc-${hostname}`);
        targetNewsrc.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
        sourceNewsrc.copyTo(targetNewsrc.parent, targetNewsrc.leafName);
        branch.setCharPref("newsrc.file", targetNewsrc.path);
      }
    }
  }

  /**
   * Import mail accounts.
   * @param {PrefItem[]} prefs - All source prefs in the MAIL_ACCOUNT branch.
   * @param {string} sourceDefaultAccount - The value of
   *   mail.accountmanager.defaultaccount in the source profile.
   * @param {IdentityKeyMap} identityKeyMap - A map from the source identity key
   *   to new identity key.
   * @param {IncomingServerKeyMap} incomingServerKeyMap - A map from the source
   *   server key to new server key.
   */
  _importAccounts(
    prefs,
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
    let accounts = Services.prefs.getCharPref(
      "mail.accountmanager.accounts",
      ""
    );
    if (accounts && accountKeyMap.size) {
      accounts += ",";
    }
    accounts += [...accountKeyMap.values()].join(",");
    Services.prefs.setCharPref("mail.accountmanager.accounts", accounts);

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
   * @param {Array<[string, string, number|string|boolean]>} prefs - All source
   *   prefs in the ADDRESS_BOOK branch.
   */
  _importAddressBooks(prefs) {
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

    this._copyAddressBookDatabases(keyMap);
  }

  /**
   * Copy sqlite files from this._sourceProfileDir to the current profile dir.
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

      let targetFile = Services.dirsvc.get("ProfD", Ci.nsIFile);
      targetFile.append(sourceFile.leafName);
      targetFile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o644);
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
      sourceFile.copyTo(targetFile.parent);
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
}
