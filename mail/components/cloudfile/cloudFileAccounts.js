/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["cloudFileAccounts"];

var CATEGORY = "cloud-files";
var PREF_ROOT = "mail.cloud_files.";
var ACCOUNT_ROOT = PREF_ROOT + "accounts.";

// The following constants are used to query and insert entries
// into the nsILoginManager.
var PWDMGR_HOST = "chrome://messenger/cloudfile";
var PWDMGR_REALM = "BigFiles Auth Token";

var {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var {EventEmitter} = ChromeUtils.import("resource://gre/modules/EventEmitter.jsm");

var cloudFileAccounts = new class extends EventEmitter {
  get constants() {
    return {
      offlineErr: 0x80550014, // NS_MSG_ERROR_OFFLINE
      authErr: 0x8055001e, // NS_MSG_USER_NOT_AUTHENTICATED
      uploadErr: 0x8055311a, // NS_MSG_ERROR_ATTACHING_FILE
      uploadWouldExceedQuota: 0x8055311b,
      uploadExceedsFileLimit: 0x8055311c,
      uploadCancelled: 0x8055311d,
      uploadExceedsFileNameLimit: 0x8055311e,
    };
  }

  constructor() {
    super();
    this._providers = new Map();
    this._accounts = new Map();
    this._highestOrdinal = 0;
  }

  get kTokenRealm() {
    return PWDMGR_REALM;
  }

  get _accountKeys() {
    let accountKeySet = new Set();
    let branch = Services.prefs.getBranch(ACCOUNT_ROOT);
    let children = branch.getChildList("", {});
    for (let child of children) {
      let subbranch = child.substr(0, child.indexOf("."));
      accountKeySet.add(subbranch);

      let match = /^account(\d+)$/.exec(subbranch);
      if (match) {
        let ordinal = parseInt(match[1], 10);
        this._highestOrdinal = Math.max(this._highestOrdinal, ordinal);
      }
    }

    // TODO: sort by ordinal
    return accountKeySet.keys();
  }

  /**
   * Ensure that we have the account key for an account. If we already have the
   * key, just return it. If we have the account, get the key from it.
   *
   * @param aKeyOrAccount the key or the account object
   * @return the account key
   */
  _ensureKey(aKeyOrAccount) {
    if (typeof aKeyOrAccount == "string")
      return aKeyOrAccount;
    if ("accountKey" in aKeyOrAccount)
      return aKeyOrAccount.accountKey;
    throw new Error("String or cloud file account expected");
  }

  /**
   * Register a cloudfile provider, e.g. from an extension.
   *
   * @param {Object} The implementation to register
   */
  registerProvider(aType, aProvider) {
    if (this._providers.has(aType)) {
      throw new Error(`Cloudfile provider ${aType} is already registered`);
    }
    this._providers.set(aType, aProvider);
    this.emit("providerRegistered", aProvider);
  }

  /**
   * Unregister a cloudfile provider.
   *
   * @param {String} aType                  The provider type to unregister
   */
  unregisterProvider(aType) {
    if (!this._providers.has(aType)) {
      throw new Error(`Cloudfile provider ${aType} is not registered`);
    }

    for (let account of this.getAccountsForType(aType)) {
      this._accounts.delete(account.accountKey);
    }

    this._providers.delete(aType);
    this.emit("providerUnregistered", aType);
  }

  get providers() {
    return [...this._providers.values()];
  }

  getProviderForType(aType) {
    return this._providers.get(aType);
  }

  // aExtraPrefs are prefs specific to an account provider.
  createAccount(aType) {
    this._highestOrdinal++;
    let key = "account" + this._highestOrdinal;

    try {
      let provider = this.getProviderForType(aType);
      let account = provider.initAccount(key);

      Services.prefs.setCharPref(ACCOUNT_ROOT + key + ".type", aType);
      Services.prefs.setCharPref(ACCOUNT_ROOT + key + ".displayName", account.displayName);

      this._accounts.set(key, account);
      this.emit("accountAdded", account);
      return account;
    } catch (e) {
      Services.prefs.deleteBranch(ACCOUNT_ROOT + key);
      throw e;
    }
  }

  removeAccount(aKeyOrAccount) {
    let key = this._ensureKey(aKeyOrAccount);
    let type = Services.prefs.getCharPref(ACCOUNT_ROOT + key + ".type");

    this._accounts.delete(key);
    Services.prefs.deleteBranch(ACCOUNT_ROOT + key);

    // Destroy any secret tokens for this accountKey.
    let logins = Services.logins.findLogins({}, PWDMGR_HOST, null, "");
    for (let login of logins) {
      if (login.username == key)
        Services.logins.removeLogin(login);
    }

    this.emit("accountDeleted", key, type);
  }

  get accounts() {
    let arr = [];
    for (let key of this._accountKeys) {
      let account = this.getAccount(key);
      if (account) {
        arr.push(account);
      }
    }
    return arr;
  }

  get configuredAccounts() {
    return this.accounts.filter(account => account.configured);
  }

  getAccount(aKey) {
    if (this._accounts.has(aKey)) {
      return this._accounts.get(aKey);
    }

    let type = Services.prefs.getCharPref(ACCOUNT_ROOT + aKey + ".type", "");
    if (type) {
      let provider = this.getProviderForType(type);
      if (provider) {
        let account = provider.initAccount(aKey);
        this._accounts.set(aKey, account);
        return account;
      }
    }
    return null;
  }

  getAccountsForType(aType) {
    let result = [];

    for (let accountKey of this._accountKeys) {
      let type = Services.prefs.getCharPref(ACCOUNT_ROOT + accountKey + ".type");
      if (type === aType)
        result.push(this.getAccount(accountKey));
    }

    return result;
  }

  getDisplayName(aKeyOrAccount) {
    try {
      let key = this._ensureKey(aKeyOrAccount);
      return Services.prefs.getCharPref(ACCOUNT_ROOT + key + ".displayName");
    } catch (e) {
      // If no display name has been set, we return the empty string.
      Cu.reportError(e);
      return "";
    }
  }

  setDisplayName(aKeyOrAccount, aDisplayName) {
    let key = this._ensureKey(aKeyOrAccount);
    Services.prefs.setCharPref(ACCOUNT_ROOT + key + ".displayName", aDisplayName);
  }

  /**
   * Retrieve a secret value, like an authorization token, for an account.
   *
   * @param aKeyOrAccount an account, or an accountKey for an account.
   * @param aRealm a human-readable string describing what exactly
   *               was being stored. Should match the realm used when setting
   *               the value.
   */
  getSecretValue(aKeyOrAccount, aRealm) {
    let key = this._ensureKey(aKeyOrAccount);

    let loginInfo = this._getLoginInfoForKey(key, aRealm);

    if (loginInfo)
      return loginInfo.password;

    return null;
  }

  /**
   * Store a secret value, like an authorization token, for an account
   * in nsILoginManager.
   *
   * @param aKeyOrAccount an account, or an accountKey for an account.
   * @param aRealm a human-readable string describing what exactly
   *               is being stored here. To reduce magic strings, you can use
   *               cloudFileAccounts.kTokenRealm for simple auth tokens, and
   *               anything else for custom secret values.
   * @param aToken The token to be saved.  If this is set to null or the
   *               empty string, then the entry for this key will be removed.
   */
  setSecretValue(aKeyOrAccount, aRealm, aToken) {
    let key = this._ensureKey(aKeyOrAccount);
    let loginInfo = this._getLoginInfoForKey(key, aRealm);

    if (!aToken) {
      if (!loginInfo)
        return;

      Services.logins.removeLogin(loginInfo);
      return;
    }

    let newLoginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"]
                       .createInstance(Ci.nsILoginInfo);
    newLoginInfo.init(PWDMGR_HOST, null, aRealm, key,
                      aToken, "", "");

    if (loginInfo)
      Services.logins.modifyLogin(loginInfo, newLoginInfo);
    else
      Services.logins.addLogin(newLoginInfo);
  }

  /**
   * Searches the nsILoginManager for an nsILoginInfo for BigFiles with
   * the username set to aKey, and the realm set to aRealm.
   *
   * @param aKey a key for an account that we're searching for login info for.
   * @param aRealm the realm that the login info was stored under.
   */
  _getLoginInfoForKey(aKey, aRealm) {
    let logins = Services.logins.findLogins({}, PWDMGR_HOST, null, aRealm);
    for (let login of logins) {
      if (login.username == aKey)
        return login;
    }
    return null;
  }
};

// These modules define and register the Box and Hightail providers. They export nothing.
ChromeUtils.import("chrome://messenger/content/cloudfile/Box/box.jsm");
ChromeUtils.import("chrome://messenger/content/cloudfile/Hightail/hightail.jsm");
