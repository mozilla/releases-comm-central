/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["cloudFileAccounts"];

var ACCOUNT_ROOT = "mail.cloud_files.accounts.";

var { EventEmitter } = ChromeUtils.importESModule(
  "resource://gre/modules/EventEmitter.sys.mjs"
);

var cloudFileAccounts = new (class extends EventEmitter {
  get constants() {
    return {
      offlineErr: 0x80550014, // NS_MSG_ERROR_OFFLINE
      authErr: 0x8055001e, // NS_MSG_USER_NOT_AUTHENTICATED
      uploadErr: 0x8055311a, // NS_MSG_ERROR_ATTACHING_FILE
      uploadWouldExceedQuota: 0x8055311b,
      uploadExceedsFileLimit: 0x8055311c,
      uploadCancelled: 0x8055311d,
      uploadErrWithCustomMessage: 0x8055311f,
      renameErr: 0x80553120,
      renameErrWithCustomMessage: 0x80553121,
      renameNotSupported: 0x80553122,
      deleteErr: 0x80553123,
      attachmentErr: 0x80553124,
      accountErr: 0x80553125,
    };
  }

  constructor() {
    super();
    this._providers = new Map();
    this._accounts = new Map();
    this._highestOrdinal = 0;
  }

  get _accountKeys() {
    const accountKeySet = new Set();
    const branch = Services.prefs.getBranch(ACCOUNT_ROOT);
    const children = branch.getChildList("");
    for (const child of children) {
      const subbranch = child.substr(0, child.indexOf("."));
      accountKeySet.add(subbranch);

      const match = /^account(\d+)$/.exec(subbranch);
      if (match) {
        const ordinal = parseInt(match[1], 10);
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
   * @returns the account key
   */
  _ensureKey(aKeyOrAccount) {
    if (typeof aKeyOrAccount == "string") {
      return aKeyOrAccount;
    }
    if ("accountKey" in aKeyOrAccount) {
      return aKeyOrAccount.accountKey;
    }
    throw new Error("String or cloud file account expected");
  }

  /**
   * Register a cloudfile provider, e.g. from an extension.
   *
   * @param {object} The implementation to register
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
   * @param {string} aType - The provider type to unregister
   */
  unregisterProvider(aType) {
    if (!this._providers.has(aType)) {
      throw new Error(`Cloudfile provider ${aType} is not registered`);
    }

    for (const account of this.getAccountsForType(aType)) {
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

  createAccount(aType) {
    this._highestOrdinal++;
    const key = "account" + this._highestOrdinal;

    try {
      const provider = this.getProviderForType(aType);
      const account = provider.initAccount(key);

      Services.prefs.setCharPref(ACCOUNT_ROOT + key + ".type", aType);
      Services.prefs.setCharPref(
        ACCOUNT_ROOT + key + ".displayName",
        account.displayName
      );

      this._accounts.set(key, account);
      this.emit("accountAdded", account);
      return account;
    } catch (e) {
      for (const prefName of Services.prefs.getChildList(
        `${ACCOUNT_ROOT}${key}.`
      )) {
        Services.prefs.clearUserPref(prefName);
      }
      throw e;
    }
  }

  removeAccount(aKeyOrAccount) {
    const key = this._ensureKey(aKeyOrAccount);
    const type = Services.prefs.getCharPref(ACCOUNT_ROOT + key + ".type");

    this._accounts.delete(key);
    for (const prefName of Services.prefs.getChildList(
      `${ACCOUNT_ROOT}${key}.`
    )) {
      Services.prefs.clearUserPref(prefName);
    }

    this.emit("accountDeleted", key, type);
  }

  get accounts() {
    const arr = [];
    for (const key of this._accountKeys) {
      const account = this.getAccount(key);
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

    const type = Services.prefs.getCharPref(ACCOUNT_ROOT + aKey + ".type", "");
    if (type) {
      const provider = this.getProviderForType(type);
      if (provider) {
        const account = provider.initAccount(aKey);
        this._accounts.set(aKey, account);
        return account;
      }
    }
    return null;
  }

  getAccountsForType(aType) {
    const result = [];

    for (const accountKey of this._accountKeys) {
      const type = Services.prefs.getCharPref(
        ACCOUNT_ROOT + accountKey + ".type"
      );
      if (type === aType) {
        result.push(this.getAccount(accountKey));
      }
    }

    return result;
  }

  getDisplayName(aKeyOrAccount) {
    // If no display name has been set, we return the empty string.
    const key = this._ensureKey(aKeyOrAccount);
    return Services.prefs.getCharPref(ACCOUNT_ROOT + key + ".displayName", "");
  }

  setDisplayName(aKeyOrAccount, aDisplayName) {
    const key = this._ensureKey(aKeyOrAccount);
    Services.prefs.setCharPref(
      ACCOUNT_ROOT + key + ".displayName",
      aDisplayName
    );
  }
})();
