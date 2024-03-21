/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { clearTimeout, setTimeout } from "resource://gre/modules/Timer.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import {
  ClassInfo,
  executeSoon,
  l10nHelper,
} from "resource:///modules/imXPCOMUtils.sys.mjs";

import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { IMServices } from "resource:///modules/IMServices.sys.mjs";
import {
  GenericAccountPrototype,
  GenericAccountBuddyPrototype,
} from "resource:///modules/jsProtoHelper.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(lazy, "_", () =>
  l10nHelper("chrome://chat/locale/accounts.properties")
);
ChromeUtils.defineLazyGetter(lazy, "_maxDebugMessages", () =>
  Services.prefs.getIntPref("messenger.accounts.maxDebugMessages")
);
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "HttpProtocolHandler",
  "@mozilla.org/network/protocol;1?name=http",
  "nsIHttpProtocolHandler"
);

var kPrefAutologinPending = "messenger.accounts.autoLoginPending";
const kPrefAccountOrder = "mail.accountmanager.accounts";
var kPrefAccountPrefix = "messenger.account.";
var kAccountKeyPrefix = "account";
var kAccountOptionPrefPrefix = "options.";
var kPrefAccountName = "name";
var kPrefAccountPrpl = "prpl";
var kPrefAccountAutoLogin = "autoLogin";
var kPrefAccountAutoJoin = "autoJoin";
var kPrefAccountAlias = "alias";
var kPrefAccountFirstConnectionState = "firstConnectionState";

var gUserCanceledPrimaryPasswordPrompt = false;

var SavePrefTimer = {
  saveNow() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    Services.prefs.savePrefFile(null);
  },
  _timer: null,
  unInitTimer() {
    if (this._timer) {
      this.saveNow();
    }
  },
  initTimer() {
    if (!this._timer) {
      this._timer = setTimeout(this.saveNow.bind(this), 5000);
    }
  },
};

var AutoLoginCounter = {
  _count: 0,
  startAutoLogin() {
    ++this._count;
    if (this._count != 1) {
      return;
    }
    Services.prefs.setIntPref(kPrefAutologinPending, Date.now() / 1000);
    SavePrefTimer.saveNow();
  },
  finishedAutoLogin() {
    --this._count;
    if (this._count != 0) {
      return;
    }
    Services.prefs.clearUserPref(kPrefAutologinPending);
    SavePrefTimer.initTimer();
  },
};

function UnknownProtocol(aPrplId) {
  this.id = aPrplId;
}
UnknownProtocol.prototype = {
  __proto__: ClassInfo("prplIProtocol", "Unknown protocol"),
  get name() {
    return "";
  },
  get normalizedName() {
    // Use the ID, but remove the 'prpl-' prefix.
    return this.id.replace(/^prpl-/, "");
  },
  get iconBaseURI() {
    return "chrome://chat/skin/prpl-unknown/";
  },
  getOptions() {
    return [];
  },
  get usernamePrefix() {
    return "";
  },
  getUsernameSplit() {
    return [];
  },
  get usernameEmptyText() {
    return "";
  },

  getAccount(aKey, aName) {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  accountExists() {
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },

  // false seems an acceptable default for all options
  // (they should never be called anyway).
  get chatHasTopic() {
    return false;
  },
  get noPassword() {
    return false;
  },
  get passwordOptional() {
    return true;
  },
  get slashCommandsNative() {
    return false;
  },
  get canEncrypt() {
    return false;
  },
};

// An unknown prplIAccount.
function UnknownAccount(aAccount) {
  this._init(aAccount.protocol, aAccount);
}
UnknownAccount.prototype = GenericAccountPrototype;

function UnknownAccountBuddy(aAccount, aBuddy, aTag) {
  this._init(new UnknownAccount(aAccount), aBuddy, aTag);
}
UnknownAccountBuddy.prototype = GenericAccountBuddyPrototype;

/**
 * @param {string} aKey - Account key for preferences.
 * @param {string} [aName] - Name of the account if it is new. Will be stored
 *  in account preferences. If not provided, the value from the account
 *  preferences is used instead.
 * @param {string} [aPrplId] - Protocol ID for this account if it is new. Will
 *  be stored in account preferences. If not provided, the value from the
 *  account preferences is used instead.
 */
function imAccount(aKey, aName, aPrplId) {
  if (!aKey.startsWith(kAccountKeyPrefix)) {
    throw Components.Exception(`Invalid key: ${aKey}`, Cr.NS_ERROR_INVALID_ARG);
  }

  this.id = aKey;
  this.numericId = parseInt(aKey.substr(kAccountKeyPrefix.length));
  gAccountsService._keepAccount(this);
  this.prefBranch = Services.prefs.getBranch(kPrefAccountPrefix + aKey + ".");

  if (aName) {
    this.name = aName;
    this.prefBranch.setStringPref(kPrefAccountName, aName);

    this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_UNKNOWN;
  } else {
    this.name = this.prefBranch.getStringPref(kPrefAccountName);
  }

  let prplId = aPrplId;
  if (prplId) {
    this.prefBranch.setCharPref(kPrefAccountPrpl, prplId);
  } else {
    prplId = this.prefBranch.getCharPref(kPrefAccountPrpl);
  }

  // Get the protocol plugin, or fallback to an UnknownProtocol instance.
  this.protocol = IMServices.core.getProtocolById(prplId);
  if (!this.protocol) {
    this.protocol = new UnknownProtocol(prplId);
    this._connectionErrorReason = Ci.imIAccount.ERROR_UNKNOWN_PRPL;
    return;
  }

  // Ensure the account is correctly stored in blist.sqlite.
  IMServices.contacts.storeAccount(this.numericId, this.name, prplId);

  // Get the prplIAccount from the protocol plugin.
  this.prplAccount = this.protocol.getAccount(this);

  // Send status change notifications to the account.
  this.observedStatusInfo = null; // (To execute the setter).

  // If we have never finished the first connection attempt for this account,
  // mark the account as having caused a crash.
  if (this.firstConnectionState == Ci.imIAccount.FIRST_CONNECTION_PENDING) {
    this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_CRASHED;
  }

  Services.logins.initializationPromise.then(() => {
    // If protocol is falsy remove() was called on this instance while waiting
    // for the promise to resolve. Since the instance was disposed there is
    // nothing to do.
    if (!this.protocol) {
      return;
    }

    // Check for errors that should prevent connection attempts.
    if (this._passwordRequired && !this.password) {
      this._connectionErrorReason = Ci.imIAccount.ERROR_MISSING_PASSWORD;
    } else if (
      this.firstConnectionState == Ci.imIAccount.FIRST_CONNECTION_CRASHED
    ) {
      this._connectionErrorReason = Ci.imIAccount.ERROR_CRASHED;
    }
  });
}

imAccount.prototype = {
  __proto__: ClassInfo(["imIAccount", "prplIAccount"], "im account object"),

  name: "",
  id: "",
  numericId: 0,
  protocol: null,
  prplAccount: null,
  connectionState: Ci.imIAccount.STATE_DISCONNECTED,
  connectionStateMsg: "",
  connectionErrorMessage: "",
  _connectionErrorReason: Ci.prplIAccount.NO_ERROR,
  get connectionErrorReason() {
    if (
      this._connectionErrorReason != Ci.prplIAccount.NO_ERROR &&
      (this._connectionErrorReason != Ci.imIAccount.ERROR_MISSING_PASSWORD ||
        !this._password)
    ) {
      return this._connectionErrorReason;
    }
    return this.prplAccount.connectionErrorReason;
  },

  observe(aSubject, aTopic, aData) {
    if (aTopic == "account-connect-progress") {
      this.connectionStateMsg = aData;
    } else if (aTopic == "account-connecting") {
      if (this.prplAccount.connectionErrorReason != Ci.prplIAccount.NO_ERROR) {
        delete this.connectionErrorMessage;
        if (this.timeOfNextReconnect - Date.now() > 1000) {
          // This is a manual reconnection, reset the auto-reconnect stuff
          this.timeOfLastConnect = 0;
          this._cancelReconnection();
        }
      }
      if (this.firstConnectionState != Ci.imIAccount.FIRST_CONNECTION_OK) {
        this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_PENDING;
      }
      this.connectionState = Ci.imIAccount.STATE_CONNECTING;
    } else if (aTopic == "account-connected") {
      this.connectionState = Ci.imIAccount.STATE_CONNECTED;
      this._finishedAutoLogin();
      this.timeOfLastConnect = Date.now();
      if (this.firstConnectionState != Ci.imIAccount.FIRST_CONNECTION_OK) {
        this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_OK;
      }
      delete this.connectionStateMsg;

      if (
        this.canJoinChat &&
        this.prefBranch.prefHasUserValue(kPrefAccountAutoJoin)
      ) {
        const autojoin = this.prefBranch.getStringPref(kPrefAccountAutoJoin);
        if (autojoin) {
          for (const room of autojoin.trim().split(/,\s*/)) {
            if (room) {
              this.joinChat(this.getChatRoomDefaultFieldValues(room));
            }
          }
        }
      }
    } else if (aTopic == "account-disconnecting") {
      this.connectionState = Ci.imIAccount.STATE_DISCONNECTING;
      this.connectionErrorMessage = aData;
      delete this.connectionStateMsg;
      this._finishedAutoLogin();

      const firstConnectionState = this.firstConnectionState;
      if (
        firstConnectionState != Ci.imIAccount.FIRST_CONNECTION_OK &&
        firstConnectionState != Ci.imIAccount.FIRST_CONNECTION_CRASHED
      ) {
        this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_UNKNOWN;
      }

      const connectionErrorReason = this.prplAccount.connectionErrorReason;
      if (connectionErrorReason != Ci.prplIAccount.NO_ERROR) {
        if (
          connectionErrorReason == Ci.prplIAccount.ERROR_NETWORK_ERROR ||
          connectionErrorReason == Ci.prplIAccount.ERROR_ENCRYPTION_ERROR
        ) {
          this._startReconnectTimer();
        }
        this._sendNotification("account-connect-error");
      }
    } else if (aTopic == "account-disconnected") {
      this.connectionState = Ci.imIAccount.STATE_DISCONNECTED;
      const connectionErrorReason = this.prplAccount.connectionErrorReason;
      if (connectionErrorReason != Ci.prplIAccount.NO_ERROR) {
        // If the account was disconnected with an error, save the debug messages.
        this._omittedDebugMessagesBeforeError += this._omittedDebugMessages;
        if (this._debugMessagesBeforeError) {
          this._omittedDebugMessagesBeforeError +=
            this._debugMessagesBeforeError.length;
        }
        this._debugMessagesBeforeError = this._debugMessages;
      } else {
        // After a clean disconnection, drop the debug messages that
        // could have been left by a previous error.
        delete this._omittedDebugMessagesBeforeError;
        delete this._debugMessagesBeforeError;
      }
      delete this._omittedDebugMessages;
      delete this._debugMessages;
      if (
        this._statusObserver &&
        connectionErrorReason == Ci.prplIAccount.NO_ERROR &&
        this.statusInfo.statusType > Ci.imIStatusInfo.STATUS_OFFLINE
      ) {
        // If the status changed back to online while an account was still
        // disconnecting, it was not reconnected automatically at that point,
        // so we must do it now. (This happens for protocols like IRC where
        // disconnection is not immediate.)
        this._sendNotification(aTopic, aData);
        this.connect();
        return;
      }
    } else {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }
    this._sendNotification(aTopic, aData);
  },

  _debugMessages: null,
  _omittedDebugMessages: 0,
  _debugMessagesBeforeError: null,
  _omittedDebugMessagesBeforeError: 0,
  logDebugMessage(aMessage, aLevel) {
    if (!this._debugMessages) {
      this._debugMessages = [];
    }
    if (
      lazy._maxDebugMessages &&
      this._debugMessages.length >= lazy._maxDebugMessages
    ) {
      this._debugMessages.shift();
      ++this._omittedDebugMessages;
    }
    this._debugMessages.push({ logLevel: aLevel, message: aMessage });
  },
  _createDebugMessage(aMessage) {
    const scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
      Ci.nsIScriptError
    );
    scriptError.init(
      aMessage,
      "",
      "",
      0,
      null,
      Ci.nsIScriptError.warningFlag,
      "component javascript"
    );
    return { logLevel: 0, message: scriptError };
  },
  getDebugMessages() {
    let messages = [];
    if (this._omittedDebugMessagesBeforeError) {
      const text = this._omittedDebugMessagesBeforeError + " messages omitted";
      messages.push(this._createDebugMessage(text));
    }
    if (this._debugMessagesBeforeError) {
      messages = messages.concat(this._debugMessagesBeforeError);
    }
    if (this._omittedDebugMessages) {
      const text = this._omittedDebugMessages + " messages omitted";
      messages.push(this._createDebugMessage(text));
    }
    if (this._debugMessages) {
      messages = messages.concat(this._debugMessages);
    }
    if (messages.length) {
      const appInfo = Services.appinfo;
      const header =
        `${appInfo.name} ${appInfo.version} (${appInfo.appBuildID}), ` +
        `Gecko ${appInfo.platformVersion} (${appInfo.platformBuildID}) ` +
        `on ${lazy.HttpProtocolHandler.oscpu}`;
      messages.unshift(this._createDebugMessage(header));
    }

    return messages;
  },

  _observedStatusInfo: null,
  get observedStatusInfo() {
    return this._observedStatusInfo;
  },
  _statusObserver: null,
  set observedStatusInfo(aUserStatusInfo) {
    if (!this.prplAccount) {
      return;
    }
    if (this._statusObserver) {
      this.statusInfo.removeObserver(this._statusObserver);
    }
    this._observedStatusInfo = aUserStatusInfo;
    if (this._statusObserver) {
      this.statusInfo.addObserver(this._statusObserver);
    }
  },
  _removeStatusObserver() {
    if (this._statusObserver) {
      this.statusInfo.removeObserver(this._statusObserver);
      delete this._statusObserver;
    }
  },
  get statusInfo() {
    return this._observedStatusInfo || IMServices.core.globalUserStatus;
  },

  reconnectAttempt: 0,
  timeOfLastConnect: 0,
  timeOfNextReconnect: 0,
  _reconnectTimer: null,
  _startReconnectTimer() {
    if (Services.io.offline) {
      console.error("_startReconnectTimer called while offline");
      return;
    }

    /* If the last successful connection is older than 10 seconds, reset the
       number of reconnection attempts. */
    const kTimeBeforeSuccessfulConnection = 10;
    if (
      this.timeOfLastConnect &&
      this.timeOfLastConnect + kTimeBeforeSuccessfulConnection * 1000 <
        Date.now()
    ) {
      delete this.reconnectAttempt;
      delete this.timeOfLastConnect;
    }

    const timers = Services.prefs
      .getCharPref("messenger.accounts.reconnectTimer")
      .split(",");
    const delay = timers[Math.min(this.reconnectAttempt, timers.length - 1)];
    const msDelay = parseInt(delay) * 1000;
    ++this.reconnectAttempt;
    this.timeOfNextReconnect = Date.now() + msDelay;
    this._reconnectTimer = setTimeout(this.connect.bind(this), msDelay);
  },

  _sendNotification(aTopic, aData) {
    Services.obs.notifyObservers(this, aTopic, aData);
  },

  get firstConnectionState() {
    try {
      return this.prefBranch.getIntPref(kPrefAccountFirstConnectionState);
    } catch (e) {
      return Ci.imIAccount.FIRST_CONNECTION_OK;
    }
  },
  set firstConnectionState(aState) {
    if (aState == Ci.imIAccount.FIRST_CONNECTION_OK) {
      this.prefBranch.clearUserPref(kPrefAccountFirstConnectionState);
    } else {
      this.prefBranch.setIntPref(kPrefAccountFirstConnectionState, aState);
      // We want to save this pref immediately when trying to connect.
      if (aState == Ci.imIAccount.FIRST_CONNECTION_PENDING) {
        SavePrefTimer.saveNow();
      } else {
        SavePrefTimer.initTimer();
      }
    }
  },

  _pendingReconnectForConnectionInfoChange: false,
  _connectionInfoChanged() {
    // The next connection will be the first connection with these parameters.
    this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_UNKNOWN;

    // We want to attempt to reconnect with the new settings only if a
    // previous attempt failed or a connection attempt is currently
    // pending (so we can return early if the account is currently
    // connected or disconnected without error).
    // The code doing the reconnection attempt is wrapped within an
    // executeSoon call so that when multiple settings are changed at
    // once we don't attempt to reconnect until they are all saved.
    // If a reconnect attempt is already scheduled, we can also return early.
    if (
      this._pendingReconnectForConnectionInfoChange ||
      this.connected ||
      (this.disconnected &&
        this.connectionErrorReason == Ci.prplIAccount.NO_ERROR)
    ) {
      return;
    }

    this._pendingReconnectForConnectionInfoChange = true;
    executeSoon(
      function () {
        delete this._pendingReconnectForConnectionInfoChange;
        // If the connection parameters have changed while we were
        // trying to connect, cancel the ongoing connection attempt and
        // try again with the new parameters.
        if (this.connecting) {
          this.disconnect();
          this.connect();
          return;
        }
        // If the account was disconnected because of a non-fatal
        // connection error, retry now that we have new parameters.
        const errorReason = this.connectionErrorReason;
        if (
          this.disconnected &&
          errorReason != Ci.prplIAccount.NO_ERROR &&
          errorReason != Ci.imIAccount.ERROR_MISSING_PASSWORD &&
          errorReason != Ci.imIAccount.ERROR_CRASHED &&
          errorReason != Ci.imIAccount.ERROR_UNKNOWN_PRPL
        ) {
          this.connect();
        }
      }.bind(this)
    );
  },

  // If the protocol plugin is missing, we can't access the normalizedName,
  // but in lots of cases this.name is equivalent.
  get normalizedName() {
    return this.prplAccount ? this.prplAccount.normalizedName : this.name;
  },
  normalize(aName) {
    return this.prplAccount ? this.prplAccount.normalize(aName) : aName;
  },

  _sendUpdateNotification() {
    this._sendNotification("account-updated");
  },

  set alias(val) {
    if (val) {
      this.prefBranch.setStringPref(kPrefAccountAlias, val);
    } else {
      this.prefBranch.clearUserPref(kPrefAccountAlias);
    }
    this._sendUpdateNotification();
  },
  get alias() {
    try {
      return this.prefBranch.getStringPref(kPrefAccountAlias);
    } catch (e) {
      return "";
    }
  },

  _password: "",
  get password() {
    if (this._password) {
      return this._password;
    }

    // Avoid prompting the user for the primary password more than once at startup.
    if (gUserCanceledPrimaryPasswordPrompt) {
      return "";
    }

    const passwordURI = "im://" + this.protocol.id;
    let logins;
    try {
      logins = Services.logins.findLogins(passwordURI, null, passwordURI);
    } catch (e) {
      this._handlePrimaryPasswordException(e);
      return "";
    }
    const normalizedName = this.normalizedName;
    for (const login of logins) {
      if (login.username == normalizedName) {
        this._password = login.password;
        if (
          this._connectionErrorReason == Ci.imIAccount.ERROR_MISSING_PASSWORD
        ) {
          // We have found a password for an account marked as missing password,
          // re-check all others accounts missing a password. But first,
          // remove the error on our own account to avoid re-checking it.
          delete this._connectionErrorReason;
          gAccountsService._checkIfPasswordStillMissing();
        }
        return this._password;
      }
    }
    return "";
  },
  _checkIfPasswordStillMissing() {
    if (
      this._connectionErrorReason != Ci.imIAccount.ERROR_MISSING_PASSWORD ||
      !this.password
    ) {
      return;
    }

    delete this._connectionErrorReason;
    this._sendUpdateNotification();
  },
  get _passwordRequired() {
    return !this.protocol.noPassword && !this.protocol.passwordOptional;
  },
  set password(aPassword) {
    this._setPassword(aPassword);
  },
  async _setPassword(password) {
    this._password = password;
    if (gUserCanceledPrimaryPasswordPrompt) {
      return;
    }
    const newLogin = Cc[
      "@mozilla.org/login-manager/loginInfo;1"
    ].createInstance(Ci.nsILoginInfo);
    const passwordURI = "im://" + this.protocol.id;
    newLogin.init(
      passwordURI,
      null,
      passwordURI,
      this.normalizedName,
      password,
      "",
      ""
    );
    try {
      const logins = Services.logins.findLogins(passwordURI, null, passwordURI);
      let saved = false;
      for (const login of logins) {
        if (newLogin.matches(login, true)) {
          if (password) {
            Services.logins.modifyLogin(login, newLogin);
          } else {
            Services.logins.removeLogin(login);
          }
          saved = true;
          break;
        }
      }
      if (!saved && password) {
        await Services.logins.addLoginAsync(newLogin);
      }
    } catch (e) {
      this._handlePrimaryPasswordException(e);
    }

    this._connectionInfoChanged();
    if (
      password &&
      this._connectionErrorReason == Ci.imIAccount.ERROR_MISSING_PASSWORD
    ) {
      this._connectionErrorReason = Ci.imIAccount.NO_ERROR;
    } else if (!password && this._passwordRequired) {
      this._connectionErrorReason = Ci.imIAccount.ERROR_MISSING_PASSWORD;
    }
    this._sendUpdateNotification();
  },
  _handlePrimaryPasswordException(aException) {
    if (aException.result != Cr.NS_ERROR_ABORT) {
      throw aException;
    }

    gUserCanceledPrimaryPasswordPrompt = true;
    executeSoon(function () {
      gUserCanceledPrimaryPasswordPrompt = false;
    });
  },

  get autoLogin() {
    return this.prefBranch.getBoolPref(kPrefAccountAutoLogin, true);
  },
  set autoLogin(val) {
    this.prefBranch.setBoolPref(kPrefAccountAutoLogin, val);
    SavePrefTimer.initTimer();
    this._sendUpdateNotification();
  },
  _autoLoginPending: false,
  checkAutoLogin() {
    // No auto-login if: the account has an error at the imIAccount level
    // (unknown protocol, missing password, first connection crashed),
    // the account is already connected or connecting, or autoLogin is off.
    if (
      this._connectionErrorReason != Ci.prplIAccount.NO_ERROR ||
      this.connecting ||
      this.connected ||
      !this.autoLogin
    ) {
      return;
    }

    this._autoLoginPending = true;
    AutoLoginCounter.startAutoLogin();
    try {
      this.connect();
    } catch (e) {
      console.error(e);
      this._finishedAutoLogin();
    }
  },
  _finishedAutoLogin() {
    if (!this.hasOwnProperty("_autoLoginPending")) {
      return;
    }
    delete this._autoLoginPending;
    AutoLoginCounter.finishedAutoLogin();
  },

  // Delete the account (from the preferences, mozStorage, and call unInit).
  remove() {
    const login = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
      Ci.nsILoginInfo
    );
    const passwordURI = "im://" + this.protocol.id;
    // Note: the normalizedName may not be exactly right if the
    // protocol plugin is missing.
    login.init(passwordURI, null, passwordURI, this.normalizedName, "", "", "");
    const logins = Services.logins.findLogins(passwordURI, null, passwordURI);
    for (const l of logins) {
      if (login.matches(l, true)) {
        Services.logins.removeLogin(l);
        break;
      }
    }
    if (this.connected || this.connecting) {
      this.disconnect();
    }
    if (this.prplAccount) {
      this.prplAccount.remove();
    }
    this.unInit();
    IMServices.contacts.forgetAccount(this.numericId);
    for (const prefName of this.prefBranch.getChildList("")) {
      this.prefBranch.clearUserPref(prefName);
    }
  },
  unInit() {
    // remove any pending reconnection timer.
    this._cancelReconnection();

    // Keeping a status observer could cause an immediate reconnection.
    this._removeStatusObserver();

    // remove any pending autologin preference used for crash detection.
    this._finishedAutoLogin();

    // If the first connection was pending on quit, we set it back to unknown.
    if (this.firstConnectionState == Ci.imIAccount.FIRST_CONNECTION_PENDING) {
      this.firstConnectionState = Ci.imIAccount.FIRST_CONNECTION_UNKNOWN;
    }

    // and make sure we cleanup the save pref timer.
    SavePrefTimer.unInitTimer();

    if (this.prplAccount) {
      this.prplAccount.unInit();
    }

    delete this.protocol;
    delete this.prplAccount;
  },

  get _ensurePrplAccount() {
    if (this.prplAccount) {
      return this.prplAccount;
    }
    throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
  },
  connect() {
    if (!this.prplAccount) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_IMPLEMENTED);
    }

    if (this._passwordRequired) {
      // If the previous connection attempt failed because we have a wrong password,
      // clear the passwor cache so that if there's no password in the password
      // manager the user gets prompted again.
      if (
        this.connectionErrorReason ==
        Ci.prplIAccount.ERROR_AUTHENTICATION_FAILED
      ) {
        delete this._password;
      }

      let password = this.password;
      if (!password) {
        const prompts = Services.prompt;
        const shouldSave = { value: false };
        password = { value: "" };
        if (
          !prompts.promptPassword(
            null,
            lazy._("passwordPromptTitle", this.name),
            lazy._("passwordPromptText", this.name),
            password,
            lazy._("passwordPromptSaveCheckbox"),
            shouldSave
          )
        ) {
          return;
        }

        if (shouldSave.value) {
          this.password = password.value;
        } else {
          this._password = password.value;
        }
      }
    }

    if (!this._statusObserver) {
      this._statusObserver = {
        observe: function (aSubject, aTopic, aData) {
          // Disconnect or reconnect the account automatically, otherwise notify
          // the prplAccount instance.
          const statusType = aSubject.statusType;
          const connectionErrorReason = this.connectionErrorReason;
          if (statusType == Ci.imIStatusInfo.STATUS_OFFLINE) {
            if (this.connected || this.connecting) {
              this.prplAccount.disconnect();
            }
            this._cancelReconnection();
          } else if (
            statusType > Ci.imIStatusInfo.STATUS_OFFLINE &&
            this.disconnected &&
            (connectionErrorReason == Ci.prplIAccount.NO_ERROR ||
              connectionErrorReason == Ci.prplIAccount.ERROR_NETWORK_ERROR ||
              connectionErrorReason == Ci.prplIAccount.ERROR_ENCRYPTION_ERROR)
          ) {
            this.prplAccount.connect();
          } else if (this.connected) {
            this.prplAccount.observe(aSubject, aTopic, aData);
          }
        }.bind(this),
      };

      this.statusInfo.addObserver(this._statusObserver);
    }

    if (
      !Services.io.offline &&
      this.statusInfo.statusType > Ci.imIStatusInfo.STATUS_OFFLINE &&
      this.disconnected
    ) {
      this.prplAccount.connect();
    }
  },
  disconnect() {
    this._removeStatusObserver();
    if (!this.disconnected) {
      this._ensurePrplAccount.disconnect();
    }
  },

  get disconnected() {
    return this.connectionState == Ci.imIAccount.STATE_DISCONNECTED;
  },
  get connected() {
    return this.connectionState == Ci.imIAccount.STATE_CONNECTED;
  },
  get connecting() {
    return this.connectionState == Ci.imIAccount.STATE_CONNECTING;
  },
  get disconnecting() {
    return this.connectionState == Ci.imIAccount.STATE_DISCONNECTING;
  },

  _cancelReconnection() {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      delete this._reconnectTimer;
    }
    delete this.reconnectAttempt;
    delete this.timeOfNextReconnect;
  },
  cancelReconnection() {
    if (!this.disconnected) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }

    // Ensure we don't keep a status observer that could re-enable the
    // auto-reconnect timers.
    this.disconnect();

    this._cancelReconnection();
  },
  createConversation(aName) {
    return this._ensurePrplAccount.createConversation(aName);
  },
  addBuddy(aTag, aName) {
    this._ensurePrplAccount.addBuddy(aTag, aName);
  },
  loadBuddy(aBuddy, aTag) {
    if (this.prplAccount) {
      return this.prplAccount.loadBuddy(aBuddy, aTag);
    }
    // Generate dummy account buddies for unknown protocols.
    return new UnknownAccountBuddy(this, aBuddy, aTag);
  },
  requestBuddyInfo(aBuddyName) {
    this._ensurePrplAccount.requestBuddyInfo(aBuddyName);
  },
  getChatRoomFields() {
    return this._ensurePrplAccount.getChatRoomFields();
  },
  getChatRoomDefaultFieldValues(aDefaultChatName) {
    return this._ensurePrplAccount.getChatRoomDefaultFieldValues(
      aDefaultChatName
    );
  },
  get canJoinChat() {
    return this.prplAccount ? this.prplAccount.canJoinChat : false;
  },
  joinChat(aComponents) {
    this._ensurePrplAccount.joinChat(aComponents);
  },
  setBool(aName, aVal) {
    this.prefBranch.setBoolPref(kAccountOptionPrefPrefix + aName, aVal);
    this._connectionInfoChanged();
    if (this.prplAccount) {
      this.prplAccount.setBool(aName, aVal);
    }
    SavePrefTimer.initTimer();
  },
  setInt(aName, aVal) {
    this.prefBranch.setIntPref(kAccountOptionPrefPrefix + aName, aVal);
    this._connectionInfoChanged();
    if (this.prplAccount) {
      this.prplAccount.setInt(aName, aVal);
    }
    SavePrefTimer.initTimer();
  },
  setString(aName, aVal) {
    this.prefBranch.setStringPref(kAccountOptionPrefPrefix + aName, aVal);
    this._connectionInfoChanged();
    if (this.prplAccount) {
      this.prplAccount.setString(aName, aVal);
    }
    SavePrefTimer.initTimer();
  },
  save() {
    SavePrefTimer.saveNow();
  },

  getSessions() {
    return this._ensurePrplAccount.getSessions();
  },
  get encryptionStatus() {
    return this._ensurePrplAccount.encryptionStatus;
  },
};

var gAccountsService = null;

/**
 * account related notifications sent to nsIObserverService:
 * - account-added: a new account has been created
 * - account-removed: the account has been deleted
 * - account-connecting: the account is being connected
 * - account-connected: the account is now connected
 * - account-connect-error: the account is disconnect with an error.
 *   (before account-disconnecting)
 * - account-disconnecting: the account is being disconnected
 * - account-disconnected: the account is now disconnected
 * - account-updated: when some settings have changed
 * - account-list-updated: when the list of account is reordered.
 * These events can be watched using an nsIObserver.
 * The associated imIAccount will be given as a parameter
 * (except for account-list-updated).
 *
 * @implements {nsIObserver}
 */
class AccountsService {
  QueryInterface = ChromeUtils.generateQI(["nsIObserver"]);

  AUTOLOGIN = Object.freeze({
    ENABLED: 0,
    USER_DISABLED: 1,
    SAFE_MODE: 2,
    CRASH: 3,
    START_OFFLINE: 4,
  });

  initAccounts() {
    this._initAutoLoginStatus();
    this._accounts = [];
    this._accountsById = {};
    gAccountsService = this;
    const accountIdArray = MailServices.accounts.accounts
      .map(account => account.incomingServer.getCharValue("imAccount"))
      .filter(accountKey => accountKey?.startsWith(kAccountKeyPrefix));
    for (const account of accountIdArray) {
      new imAccount(account);
    }

    this._prefObserver = this.observe.bind(this);
    Services.prefs.addObserver(kPrefAccountOrder, this._prefObserver);
  }

  _prefObserver = null;
  observe(aSubject, aTopic, aData) {
    if (aTopic != "nsPref:changed" || aData != kPrefAccountOrder) {
      return;
    }

    const imAccounts = MailServices.accounts.accounts
      .map(account => account.incomingServer.getCharValue("imAccount"))
      .filter(k => k?.startsWith(kAccountKeyPrefix))
      .map(k =>
        this.getAccountByNumericId(parseInt(k.substr(kAccountKeyPrefix.length)))
      )
      .filter(a => a);

    // Only update _accounts if it's a reorder operation
    if (imAccounts.length == this._accounts.length) {
      this._accounts = imAccounts;
      Services.obs.notifyObservers(null, "account-list-updated");
    }
  }

  unInitAccounts() {
    for (const account of this._accounts) {
      account.unInit();
    }
    gAccountsService = null;
    delete this._accounts;
    delete this._accountsById;
    Services.prefs.removeObserver(kPrefAccountOrder, this._prefObserver);
    delete this._prefObserver;
  }

  /**
   * This attribute is set to AUTOLOGIN.ENABLED by default. It can be set to
   * any other value before the initialization of this service to prevent
   * accounts with autoLogin enabled from being connected when libpurple is
   * initialized.
   * Any value other than the ones listed in AccountsService.AUTOLOGIN will
   * disable autoLogin and display a generic message in the Account Manager.
   *
   * @type {number}
   */
  autoLoginStatus = this.AUTOLOGIN.ENABLED;
  _initAutoLoginStatus() {
    /* If auto-login is already disabled, do nothing */
    if (this.autoLoginStatus != this.AUTOLOGIN.ENABLED) {
      return;
    }

    if (!Services.prefs.getIntPref("messenger.startup.action")) {
      // the value 0 means that we start without connecting the accounts
      this.autoLoginStatus = this.AUTOLOGIN.USER_DISABLED;
      return;
    }

    /* Disable auto-login if we are running in safe mode */
    if (Services.appinfo.inSafeMode) {
      this.autoLoginStatus = this.AUTOLOGIN.SAFE_MODE;
      return;
    }

    /* Check if we crashed at the last startup during autologin */
    let autoLoginPending;
    if (
      Services.prefs.getPrefType(kPrefAutologinPending) ==
        Services.prefs.PREF_INVALID ||
      !(autoLoginPending = Services.prefs.getIntPref(kPrefAutologinPending))
    ) {
      // if the pref isn't set, then we haven't crashed: keep autologin enabled
      return;
    }

    // Last autologin hasn't finished properly.
    // For now, assume it's because of a crash.
    this.autoLoginStatus = this.AUTOLOGIN.CRASH;
    Services.prefs.deleteBranch(kPrefAutologinPending);

    // If the crash reporter isn't built, we can't know anything more.
    if (!("nsICrashReporter" in Ci)) {
      return;
    }

    try {
      // Try to get more info with breakpad
      let lastCrashTime = 0;

      /* Locate the LastCrash file */
      const lastCrash = Services.dirsvc.get("UAppData", Ci.nsIFile);
      lastCrash.append("Crash Reports");
      lastCrash.append("LastCrash");
      if (lastCrash.exists()) {
        /* Ok, the file exists, now let's try to read it */
        const is = Cc[
          "@mozilla.org/network/file-input-stream;1"
        ].createInstance(Ci.nsIFileInputStream);
        const sis = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
          Ci.nsIScriptableInputStream
        );
        is.init(lastCrash, -1, 0, 0);
        sis.init(sis);

        lastCrashTime = parseInt(sis.read(lastCrash.fileSize));

        sis.close();
      }
      // The file not existing is totally acceptable, it just means that
      // either we never crashed or breakpad is not enabled.
      // In this case, lastCrashTime will keep its 0 initialization value.

      /* dump("autoLoginPending = " + autoLoginPending +
              ", lastCrash = " + lastCrashTime +
              ", difference = " + lastCrashTime - autoLoginPending + "\n");*/

      if (lastCrashTime < autoLoginPending) {
        // the last crash caught by breakpad is older than our last autologin
        // attempt.
        // If breakpad is currently enabled, we can be confident that
        // autologin was interrupted for an exterior reason
        // (application killed by the user, power outage, ...)
        try {
          Services.appinfo
            .QueryInterface(Ci.nsICrashReporter)
            .annotateCrashReport("=", "");
        } catch (e) {
          // This should fail with NS_ERROR_INVALID_ARG if breakpad is enabled,
          // and NS_ERROR_NOT_INITIALIZED if it is not.
          if (e.result != Cr.NS_ERROR_NOT_INITIALIZED) {
            this.autoLoginStatus = this.AUTOLOGIN.ENABLED;
          }
        }
      }
    } catch (e) {
      // if we failed to get the last crash time, then keep the
      // AUTOLOGIN_CRASH value in mAutoLoginStatus and return.
    }
  }

  /**
   * The method should be used to connect all accounts with autoLogin enabled.
   * Some use cases:
   *   - if the autologin was disabled at startup
   *   - after a loss of internet connectivity that disconnected all accounts.
   */
  processAutoLogin() {
    if (!this._accounts) {
      // if we're already shutting down
      return;
    }

    for (const account of this._accounts) {
      account.checkAutoLogin();
    }

    // Make sure autologin is now enabled, so that we don't display a
    // message stating that it is disabled and asking the user if it
    // should be processed now.
    this.autoLoginStatus = this.AUTOLOGIN.ENABLED;

    // Notify observers so that any message stating that autologin is
    // disabled can be removed
    Services.obs.notifyObservers(null, "autologin-processed");
  }

  _checkingIfPasswordStillMissing = false;
  _checkIfPasswordStillMissing() {
    // Avoid recursion.
    if (this._checkingIfPasswordStillMissing) {
      return;
    }

    this._checkingIfPasswordStillMissing = true;
    for (const account of this._accounts) {
      account._checkIfPasswordStillMissing();
    }
    delete this._checkingIfPasswordStillMissing;
  }

  /**
   * @param {string} aAccountId
   * @returns {imIAccount}
   */
  getAccountById(aAccountId) {
    if (!aAccountId.startsWith(kAccountKeyPrefix)) {
      throw Components.Exception(
        `Invalid id: ${aAccountId}`,
        Cr.NS_ERROR_INVALID_ARG
      );
    }

    const id = parseInt(aAccountId.substr(kAccountKeyPrefix.length));
    return this.getAccountByNumericId(id);
  }

  _keepAccount(aAccount) {
    this._accounts.push(aAccount);
    this._accountsById[aAccount.numericId] = aAccount;
  }
  /**
   * @param {number} aAccountId
   * @returns {imIAccount}
   */
  getAccountByNumericId(aAccountId) {
    return this._accountsById[aAccountId];
  }
  /**
   * @returns {imIAccount[]}
   */
  getAccounts() {
    return this._accounts;
  }

  /**
   * Will fire the event account-added.
   *
   * @param {string} aName
   * @param {string} aPrpl
   * @returns {imIAccount}
   */
  createAccount(aName, aPrpl) {
    // Ensure an account with the same name and protocol doesn't already exist.
    const prpl = IMServices.core.getProtocolById(aPrpl);
    if (!prpl) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }
    if (prpl.accountExists(aName)) {
      console.error("Attempted to create a duplicate account!");
      throw Components.Exception("", Cr.NS_ERROR_ALREADY_INITIALIZED);
    }

    /* First get a unique id for the new account. */
    let id;
    for (id = 1; ; ++id) {
      if (this._accountsById.hasOwnProperty(id)) {
        continue;
      }

      /* id isn't used by a known account, double check it isn't
       already used in the sqlite database. This should never
       happen, except if we have a corrupted profile. */
      if (!IMServices.contacts.accountIdExists(id)) {
        break;
      }
      Services.console.logStringMessage(
        "No account " +
          id +
          " but there is some data in the buddy list for an account with this number. Your profile may be corrupted."
      );
    }

    /* Actually create the new account. */
    const key = kAccountKeyPrefix + id;
    const account = new imAccount(key, aName, aPrpl);

    Services.obs.notifyObservers(account, "account-added");
    return account;
  }

  /**
   * Will fire the event account-removed.
   *
   * @param {string} aAccountId
   */
  deleteAccount(aAccountId) {
    const account = this.getAccountById(aAccountId);
    if (!account) {
      throw Components.Exception("", Cr.NS_ERROR_INVALID_ARG);
    }

    const index = this._accounts.indexOf(account);
    if (index == -1) {
      throw Components.Exception("", Cr.NS_ERROR_UNEXPECTED);
    }

    const id = account.numericId;
    account.remove();
    this._accounts.splice(index, 1);
    delete this._accountsById[id];
    Services.obs.notifyObservers(account, "account-removed");
  }
}

export const accounts = new AccountsService();
