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
var {XPCOMUtils} = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");
var { fixIterator } = ChromeUtils.import("resource:///modules/iteratorUtils.jsm");
var {EventEmitter} = ChromeUtils.import("resource://gre/modules/EventEmitter.jsm");

var cloudFileAccounts = new class extends EventEmitter {
  constructor() {
    super();
    this._providers = new Map();
  }

  get kTokenRealm() {
    return PWDMGR_REALM;
  }

  get _accountKeys() {
    let accountKeySet = {};
    let branch = Services.prefs.getBranch(ACCOUNT_ROOT);
    let children = branch.getChildList("", {});
    for (let child of children) {
      let subbranch = child.substr(0, child.indexOf("."));
      accountKeySet[subbranch] = 1;
    }

    // TODO: sort by ordinal
    return Object.keys(accountKeySet);
  }

  _getInitedProviderForType(aAccountKey, aType) {
    let provider = this.getProviderForType(aType);
    if (provider) {
      try {
        provider.init(aAccountKey);
      } catch (e) {
        Cu.reportError(e);
        provider = null;
      }
    }
    return provider;
  }

  _createUniqueAccountKey() {
    // Pick a unique account key (TODO: this is a dumb way to do it, probably)
    let existingKeys = this._accountKeys;
    for (let n = 1; ; n++) {
      if (!existingKeys.includes("account" + n))
        return "account" + n;
    }
  }

  /**
   * Ensure that we have the account key for an account. If we already have the
   * key, just return it. If we have the nsIMsgCloudFileProvider, get the key
   * from it.
   *
   * @param aKeyOrAccount the key or the account object
   * @return the account key
   */
  _ensureKey(aKeyOrAccount) {
    if (typeof aKeyOrAccount == "string")
      return aKeyOrAccount;
    if ("accountKey" in aKeyOrAccount)
      return aKeyOrAccount.accountKey;
    throw new Error("string or nsIMsgCloudFileProvider expected");
  }

  /**
   * Register a cloudfile provider, e.g. from a bootstrapped add-on. Registering can be done in two
   * ways, either implicitly through using the "cloud-files" XPCOM category, or explicitly using
   * this function.
   *
   * @param {nsIMsgCloudFileProvider} The implementation to register
   */
  registerProvider(aProvider) {
    let type = aProvider.type;
    let hasXPCOM = false;

    try {
      Services.catMan.getCategoryEntry(CATEGORY, type);
      hasXPCOM = true;
    } catch (ex) {
    }

    if (this._providers.has(type)) {
      throw new Error(`Cloudfile provider ${type} is already registered`);
    } else if (hasXPCOM) {
      throw new Error(`Cloudfile provider ${type} is already registered as an XPCOM component`);
    }
    this._providers.set(aProvider.type, aProvider);
    this.emit("providerRegistered", aProvider);
  }

  /**
   * Unregister a cloudfile provider. This function will only unregister those providers registered
   * through #registerProvider. XPCOM providers cannot be unregistered here.
   *
   * @param {String} aType                  The provider type to unregister
   */
  unregisterProvider(aType) {
    if (!this._providers.has(aType)) {
      throw new Error(`Cloudfile provider ${aType} is not registered`);
    }

    this._providers.delete(aType);
    this.emit("providerUnregistered", aType);
  }

  getProviderForType(aType) {
    if (this._providers.has(aType)) {
      return this._providers.get(aType);
    }

    try {
      let className = Services.catMan.getCategoryEntry(CATEGORY, aType);
      let provider = Cc[className].createInstance(Ci.nsIMsgCloudFileProvider);
      return provider;
    } catch (e) {
      if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
        // If a provider is not available we swallow the error message.
        // Otherwise at least notify, so developers can fix things.
        Cu.reportError("Getting provider for type=" + aType + " FAILED; " + e);
      }
    }

    return null;
  }

  // aExtraPrefs are prefs specific to an account provider.
  createAccount(aType, aRequestObserver, aExtraPrefs) {
    let key = this._createUniqueAccountKey();

    try {
      Services.prefs
              .setCharPref(ACCOUNT_ROOT + key + ".type", aType);

      if (aExtraPrefs !== undefined)
        this._processExtraPrefs(key, aExtraPrefs);

      let provider = this._getInitedProviderForType(key, aType);
      if (provider) {
        provider.createExistingAccount(aRequestObserver);
        this.emit("accountAdded", provider);
      }

      return provider;
    } catch (e) {
      Services.prefs.deleteBranch(ACCOUNT_ROOT + key);
      throw e;
    }
  }

  // Set provider-specific prefs
  _processExtraPrefs(aAccountKey, aExtraPrefs) {
    const kFuncMap = {
      "int": "setIntPref",
      "bool": "setBoolPref",
      "char": "setCharPref",
    };

    for (let prefKey in aExtraPrefs) {
      let type = aExtraPrefs[prefKey].type;
      let value = aExtraPrefs[prefKey].value;

      if (!(type in kFuncMap)) {
        Cu.reportError("Did not recognize type: " + type);
        continue;
      }

      let func = kFuncMap[type];
      Services.prefs[func](ACCOUNT_ROOT + aAccountKey + "." + prefKey,
                           value);
    }
  }

  * enumerateProviders() {
    for (let [type, provider] of this._providers.entries()) {
      yield [type, provider];
    }

    for (let {data} of Services.catMan.enumerateCategory(CATEGORY)) {
      let provider = this.getProviderForType(data);
      yield [data, provider];
    }
  }

  getAccount(aKey) {
    let type = Services.prefs.getCharPref(ACCOUNT_ROOT + aKey + ".type");
    return this._getInitedProviderForType(aKey, type);
  }

  removeAccount(aKeyOrAccount) {
    let key = this._ensureKey(aKeyOrAccount);
    let type = Services.prefs.getCharPref(ACCOUNT_ROOT + key + ".type");

    Services.prefs.deleteBranch(ACCOUNT_ROOT + key);

    // Destroy any secret tokens for this accountKey.
    let logins = Services.logins
                         .findLogins({}, PWDMGR_HOST, null, "");
    for (let login of logins) {
      if (login.username == key)
        Services.logins.removeLogin(login);
    }

    this.emit("accountDeleted", key, type);
  }

  get accounts() {
    return this._accountKeys.filter(key => this.getAccount(key) != null).
      map(key => this.getAccount(key));
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

  addAccountDialog() {
    let params = {accountKey: null};
    Services.wm
            .getMostRecentWindow(null)
            .openDialog("chrome://messenger/content/cloudfile/"
                        + "addAccountDialog.xul",
                        "", "chrome, dialog, modal, resizable=yes",
                        params).focus();
    return params.accountKey;
  }

  getDisplayName(aKeyOrAccount) {
    try {
      let key = this._ensureKey(aKeyOrAccount);
      return Services.prefs.getCharPref(ACCOUNT_ROOT +
                                        key + ".displayName");
    } catch (e) {
      // If no display name has been set, we return the empty string.
      Cu.reportError(e);
      return "";
    }
  }

  setDisplayName(aKeyOrAccount, aDisplayName) {
    let key = this._ensureKey(aKeyOrAccount);
    Services.prefs.setCharPref(ACCOUNT_ROOT + key +
                               ".displayName", aDisplayName);
  }

  /**
   * Retrieve a secret value, like an authorization token, for an account.
   *
   * @param aKeyOrAccount an nsIMsgCloudFileProvider, or an accountKey
   *                      for a provider.
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
   * @param aKeyOrAccount an nsIMsgCloudFileProvider, or an accountKey
   *                      for a provider.
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
   * @param aKey a key for an nsIMsgCloudFileProvider that we're searching
   *             for login info for.
   * @param aRealm the realm that the login info was stored under.
   */
  _getLoginInfoForKey(aKey, aRealm) {
    let logins = Services.logins
                         .findLogins({}, PWDMGR_HOST, null, aRealm);
    for (let login of logins) {
      if (login.username == aKey)
        return login;
    }
    return null;
  }
};
