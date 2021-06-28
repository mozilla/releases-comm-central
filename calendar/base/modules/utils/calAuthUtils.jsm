/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");

ChromeUtils.defineModuleGetter(this, "cal", "resource:///modules/calendar/calUtils.jsm");

/*
 * Authentication tools and prompts, mostly for providers
 */

// NOTE: This module should not be loaded directly, it is available when including
// calUtils.jsm under the cal.auth namespace.

const EXPORTED_SYMBOLS = ["calauth"]; /* exported calauth */

/**
 * The userContextId of nsIHttpChannel is currently implemented as a uint32, so
 * the ContainerMap defined below must not return Ids greater then the allowed
 * range of a uint32.
 */
const MAX_CONTAINER_ID = Math.pow(2, 32) - 1;

/**
 * A map that handles userContextIds and usernames and provides unique Ids for
 * different usernames.
 */
class ContainerMap extends Map {
  /**
   * Create a container map with a given range of userContextIds.
   *
   * @param {Number} min        The lower range limit of userContextIds to be
   *                            used.
   * @param {Number} max        The upper range limit of userContextIds to be
   *                            used.
   * @param {?Object} iterable  Optional parameter which is passed to the
   *                            constructor of Map. See definition of Map
   *                            for more details.
   */
  constructor(min = 0, max = MAX_CONTAINER_ID, iterable) {
    super(iterable);
    this.order = [];
    this.inverted = {};
    this.min = min;
    // The userConextId is a uint32, limit accordingly.
    this.max = Math.max(max, MAX_CONTAINER_ID);
    if (this.min > this.max) {
      throw new RangeError(
        "[ContainerMap] The provided min value " +
          "(" +
          this.min +
          ") must not be greater than the provided " +
          "max value (" +
          this.max +
          ")"
      );
    }
  }

  /**
   * Check if the allowed userContextId range is fully used.
   */
  get full() {
    return this.size > this.max - this.min;
  }

  /**
   * Add a new username to the map.
   *
   * @param {String} username - The username to be added.
   * @return {Number} The userContextId assigned to the given username.
   */
  _add(username) {
    let nextUserContextId;
    if (this.full) {
      let oldestUsernameEntry = this.order.shift();
      nextUserContextId = this.get(oldestUsernameEntry);
      this.delete(oldestUsernameEntry);
    } else {
      nextUserContextId = this.min + this.size;
    }

    Services.clearData.deleteDataFromOriginAttributesPattern({ userContextId: nextUserContextId });
    this.order.push(username);
    this.set(username, nextUserContextId);
    this.inverted[nextUserContextId] = username;
    return nextUserContextId;
  }

  /**
   * Look up the userContextId for the given username. Create a new one,
   * if the username is not yet known.
   *
   * @param {String} username        The username for which the userContextId
   *                                 is to be looked up.
   * @return {Number}                The userContextId which is assigned to
   *                                 the provided username.
   */
  getUserContextIdForUsername(username) {
    if (this.has(username)) {
      return this.get(username);
    }
    return this._add(username);
  }

  /**
   * Look up the username for the given userContextId. Return empty string
   * if not found.
   *
   * @param {Number} userContextId        The userContextId for which the
   *                                      username is to be to looked up.
   * @return {String}                     The username mapped to the given
   *                                      userContextId.
   */
  getUsernameForUserContextId(userContextId) {
    if (this.inverted.hasOwnProperty(userContextId)) {
      return this.inverted[userContextId];
    }
    return "";
  }
}

var calauth = {
  /**
   * Calendar Auth prompt implementation. This instance of the auth prompt should
   * be used by providers and other components that handle authentication using
   * nsIAuthPrompt2 and friends.
   *
   * This implementation guarantees there are no request loops when an invalid
   * password is stored in the login-manager.
   *
   * There is one instance of that object per calendar provider.
   */
  Prompt: class {
    constructor() {
      this.mWindow = cal.window.getCalendarWindow();
      this.mReturnedLogins = {};
      this.mProvider = null;
    }

    /**
     * @typedef {Object} PasswordInfo
     * @property {Boolean} found        True, if the password was found
     * @property {?String} username     The found username
     * @property {?String} password     The found password
     */

    /**
     * Retrieve password information from the login manager
     *
     * @param {String} aPasswordRealm       The realm to retrieve password info for
     * @param {String} aRequestedUser       The username to look up.
     * @return {PasswordInfo}               The retrieved password information
     */
    getPasswordInfo(aPasswordRealm, aRequestedUser) {
      // Prefill aRequestedUser, so it will be used in the prompter.
      let username = aRequestedUser;
      let password;
      let found = false;

      let logins = Services.logins.findLogins(aPasswordRealm.prePath, null, aPasswordRealm.realm);
      for (let login of logins) {
        if (!aRequestedUser || aRequestedUser == login.username) {
          username = login.username;
          password = login.password;
          found = true;
          break;
        }
      }
      if (found) {
        let keyStr = aPasswordRealm.prePath + ":" + aPasswordRealm.realm + ":" + aRequestedUser;
        let now = new Date();
        // Remove the saved password if it was already returned less
        // than 60 seconds ago. The reason for the timestamp check is that
        // nsIHttpChannel can call the nsIAuthPrompt2 interface
        // again in some situation. ie: When using Digest auth token
        // expires.
        if (
          this.mReturnedLogins[keyStr] &&
          now.getTime() - this.mReturnedLogins[keyStr].getTime() < 60000
        ) {
          cal.LOG(
            "Credentials removed for: user=" +
              username +
              ", host=" +
              aPasswordRealm.prePath +
              ", realm=" +
              aPasswordRealm.realm
          );

          delete this.mReturnedLogins[keyStr];
          calauth.passwordManagerRemove(username, aPasswordRealm.prePath, aPasswordRealm.realm);
          return { found: false, username };
        }
        this.mReturnedLogins[keyStr] = now;
      }
      return { found, username, password };
    }

    // boolean promptAuth(in nsIChannel aChannel,
    //                    in uint32_t level,
    //                    in nsIAuthInformation authInfo)
    promptAuth(aChannel, aLevel, aAuthInfo) {
      let hostRealm = {};
      hostRealm.prePath = aChannel.URI.prePath;
      hostRealm.realm = aAuthInfo.realm;
      let port = aChannel.URI.port;
      if (port == -1) {
        let handler = Services.io
          .getProtocolHandler(aChannel.URI.scheme)
          .QueryInterface(Ci.nsIProtocolHandler);
        port = handler.defaultPort;
      }
      hostRealm.passwordRealm = aChannel.URI.host + ":" + port + " (" + aAuthInfo.realm + ")";

      let requestedUser = cal.auth.containerMap.getUsernameForUserContextId(
        aChannel.loadInfo.originAttributes.userContextId
      );
      let pwInfo = this.getPasswordInfo(hostRealm, requestedUser);
      aAuthInfo.username = pwInfo.username;
      if (pwInfo && pwInfo.found) {
        aAuthInfo.password = pwInfo.password;
        return true;
      }
      let savePasswordLabel = null;
      if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
        savePasswordLabel = cal.l10n.getAnyString("passwordmgr", "passwordmgr", "rememberPassword");
      }
      let savePassword = {};
      let returnValue = Services.prompt.promptAuth(
        null,
        aChannel,
        aLevel,
        aAuthInfo,
        savePasswordLabel,
        savePassword
      );
      if (savePassword.value) {
        calauth.passwordManagerSave(
          aAuthInfo.username,
          aAuthInfo.password,
          hostRealm.prePath,
          aAuthInfo.realm
        );
      }
      return returnValue;
    }

    // nsICancelable asyncPromptAuth(in nsIChannel aChannel,
    //                               in nsIAuthPromptCallback aCallback,
    //                               in nsISupports aContext,
    //                               in uint32_t level,
    //                               in nsIAuthInformation authInfo);
    asyncPromptAuth(aChannel, aCallback, aContext, aLevel, aAuthInfo) {
      let self = this;
      let promptlistener = {
        onPromptStartAsync(callback) {
          callback.onAuthResult(this.onPromptStart());
        },

        onPromptStart() {
          let res = self.promptAuth(aChannel, aLevel, aAuthInfo);
          if (res) {
            gAuthCache.setAuthInfo(hostKey, aAuthInfo);
            this.onPromptAuthAvailable();
            return true;
          }

          this.onPromptCanceled();
          return false;
        },

        onPromptAuthAvailable() {
          let authInfo = gAuthCache.retrieveAuthInfo(hostKey);
          if (authInfo) {
            aAuthInfo.username = authInfo.username;
            aAuthInfo.password = authInfo.password;
          }
          aCallback.onAuthAvailable(aContext, aAuthInfo);
        },

        onPromptCanceled() {
          gAuthCache.retrieveAuthInfo(hostKey);
          aCallback.onAuthCancelled(aContext, true);
        },
      };

      let requestedUser = cal.auth.containerMap.getUsernameForUserContextId(
        aChannel.loadInfo.originAttributes.userContextId
      );
      let hostKey = aChannel.URI.prePath + ":" + aAuthInfo.realm + ":" + requestedUser;
      gAuthCache.planForAuthInfo(hostKey);

      let queuePrompt = function() {
        let asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
          Ci.nsIMsgAsyncPrompter
        );
        asyncprompter.queueAsyncAuthPrompt(hostKey, false, promptlistener);
      };

      let finalSteps = function() {
        // the prompt will fail if we are too early
        if (self.mWindow.document.readyState == "complete") {
          queuePrompt();
        } else {
          self.mWindow.addEventListener("load", queuePrompt, true);
        }
      };

      let tryUntilReady = function() {
        self.mWindow = cal.window.getCalendarWindow();
        if (!self.mWindow) {
          setTimeout(tryUntilReady, 1000);
          return;
        }

        finalSteps();
      };

      // We might reach this code when cal.window.getCalendarWindow()
      // returns null, which means the window obviously isn't yet
      // in readyState complete, and we also cannot yet queue a prompt.
      // It may happen if startup shows a blocking primary password
      // prompt, which delays starting up the application windows.
      // Use a timer to retry until we can access the calendar window.

      tryUntilReady();
    }
  },

  /**
   * Tries to get the username/password combination of a specific calendar name from the password
   * manager or asks the user.
   *
   * @param {String} aTitle                   The dialog title.
   * @param {String} aCalendarName            The calendar name or url to look up. Can be null.
   * @param {{value:String}} aUsername        The username that belongs to the calendar.
   * @param {{value:String}} aPassword        The password that belongs to the calendar.
   * @param {{value:String}} aSavePassword    Should the password be saved?
   * @param {Boolean} aFixedUsername          Whether the user name is fixed or editable
   * @return {Boolean}                        Could a password be retrieved?
   */
  getCredentials(aTitle, aCalendarName, aUsername, aPassword, aSavePassword, aFixedUsername) {
    if (
      typeof aUsername != "object" ||
      typeof aPassword != "object" ||
      typeof aSavePassword != "object"
    ) {
      throw new Components.Exception("", Cr.NS_ERROR_XPC_NEED_OUT_OBJECT);
    }

    let prompter = Services.ww.getNewPrompter(null);

    // Only show the save password box if we are supposed to.
    let savepassword = null;
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savepassword = cal.l10n.getAnyString("passwordmgr", "passwordmgr", "rememberPassword");
    }

    let aText;
    if (aFixedUsername) {
      aText = cal.l10n.getAnyString("global", "commonDialogs", "EnterPasswordFor", [
        aUsername.value,
        aCalendarName,
      ]);
      return prompter.promptPassword(aTitle, aText, aPassword, savepassword, aSavePassword);
    }
    aText = cal.l10n.getAnyString("global", "commonDialogs", "EnterUserPasswordFor2", [
      aCalendarName,
    ]);
    return prompter.promptUsernameAndPassword(
      aTitle,
      aText,
      aUsername,
      aPassword,
      savepassword,
      aSavePassword
    );
  },

  /**
   * Make sure the passed origin is actually an uri string, because password manager functions
   * require it. This is a fallback for compatibility only and should be removed a few versions
   * after Lightning 6.2
   *
   * @param {String} aOrigin      The hostname or origin to check
   * @return {String}             The origin uri
   */
  _ensureOrigin(aOrigin) {
    try {
      let { prePath, spec } = Services.io.newURI(aOrigin);
      if (prePath == "oauth:") {
        return spec;
      }
      return prePath;
    } catch (e) {
      return "https://" + aOrigin;
    }
  },

  /**
   * Helper to insert/update an entry to the password manager.
   *
   * @param {String} aUsername    The username to insert
   * @param {String} aPassword    The corresponding password
   * @param {String} aOrigin      The corresponding origin
   * @param {String} aRealm       The password realm (unused on branch)
   */
  passwordManagerSave(aUsername, aPassword, aOrigin, aRealm) {
    cal.ASSERT(aUsername);
    cal.ASSERT(aPassword);

    let origin = this._ensureOrigin(aOrigin);

    if (!Services.logins.getLoginSavingEnabled(origin)) {
      throw new Components.Exception(
        "Password saving is disabled for " + origin,
        Cr.NS_ERROR_NOT_AVAILABLE
      );
    }

    try {
      let logins = Services.logins.findLogins(origin, null, aRealm);

      let newLoginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
        Ci.nsILoginInfo
      );
      newLoginInfo.init(origin, null, aRealm, aUsername, aPassword, "", "");
      for (let login of logins) {
        if (aUsername == login.username) {
          Services.logins.modifyLogin(login, newLoginInfo);
          return;
        }
      }
      Services.logins.addLogin(newLoginInfo);
    } catch (exc) {
      // Only show the message if its not an abort, which can happen if
      // the user canceled the master password dialog
      cal.ASSERT(exc.result == Cr.NS_ERROR_ABORT, exc);
    }
  },

  /**
   * Helper to retrieve an entry from the password manager.
   *
   * @param {String} aUsername    The username to search
   * @param {String} aPassword    The corresponding password
   * @param {String} aOrigin      The corresponding origin
   * @param {String} aRealm       The password realm (unused on branch)
   * @return {Boolean}            True, if an entry exists in the password manager
   */
  passwordManagerGet(aUsername, aPassword, aOrigin, aRealm) {
    cal.ASSERT(aUsername);

    if (typeof aPassword != "object") {
      throw new Components.Exception("", Cr.NS_ERROR_XPC_NEED_OUT_OBJECT);
    }

    let origin = this._ensureOrigin(aOrigin);

    try {
      let logins = Services.logins.findLogins(origin, null, "");
      for (let loginInfo of logins) {
        if (
          loginInfo.username == aUsername &&
          (loginInfo.httpRealm == aRealm || loginInfo.httpRealm.split(" ").includes(aRealm))
        ) {
          aPassword.value = loginInfo.password;
          return true;
        }
      }
    } catch (exc) {
      cal.ASSERT(false, exc);
    }
    return false;
  },

  /**
   * Helper to remove an entry from the password manager
   *
   * @param {String} aUsername    The username to remove
   * @param {String} aOrigin      The corresponding origin
   * @param {String} aRealm       The password realm (unused on branch)
   * @return {Boolean}            Could the user be removed?
   */
  passwordManagerRemove(aUsername, aOrigin, aRealm) {
    cal.ASSERT(aUsername);

    let origin = this._ensureOrigin(aOrigin);

    try {
      let logins = Services.logins.findLogins(origin, null, aRealm);
      for (let loginInfo of logins) {
        if (loginInfo.username == aUsername) {
          Services.logins.removeLogin(loginInfo);
          return true;
        }
      }
    } catch (exc) {
      // If no logins are found, fall through to the return statement below.
    }
    return false;
  },

  /**
   * A map which maps usernames to userContextIds, reserving a range
   * of 20000 - 29999 for userContextIds to be used within calendar.
   *
   * @param {Number} min        The lower range limit of userContextIds to be
   *                            used.
   * @param {Number} max        The upper range limit of userContextIds to be
   *                            used.
   */
  containerMap: new ContainerMap(20000, 29999),
};

// Cache for authentication information since onAuthInformation in the prompt
// listener is called without further information. If the password is not
// saved, there is no way to retrieve it. We use ref counting to avoid keeping
// the password in memory longer than needed.
var gAuthCache = {
  _authInfoCache: new Map(),
  planForAuthInfo(hostKey) {
    let authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.refCnt++;
    } else {
      this._authInfoCache.set(hostKey, { refCnt: 1 });
    }
  },

  setAuthInfo(hostKey, aAuthInfo) {
    let authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.username = aAuthInfo.username;
      authInfo.password = aAuthInfo.password;
    }
  },

  retrieveAuthInfo(hostKey) {
    let authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.refCnt--;

      if (authInfo.refCnt == 0) {
        this._authInfoCache.delete(hostKey);
      }
    }
    return authInfo;
  },
};
