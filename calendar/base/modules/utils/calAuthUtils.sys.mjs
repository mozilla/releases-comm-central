/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Authentication tools and prompts, mostly for providers
 */

// NOTE: This module should not be loaded directly, it is available when including
// calUtils.jsm under the cal.auth namespace.

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  cal: "resource:///modules/calendar/calUtils.sys.mjs",
  setTimeout: "resource://gre/modules/Timer.sys.mjs",
});

XPCOMUtils.defineLazyModuleGetters(lazy, {
  MsgAuthPrompt: "resource:///modules/MsgAsyncPrompter.jsm",
});

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
   * @param {number} min - The lower range limit of userContextIds to be
   *                            used.
   * @param {number} max - The upper range limit of userContextIds to be
   *                            used.
   * @param {?object} iterable - Optional parameter which is passed to the
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
   * @param {string} username - The username to be added.
   * @returns {number} The userContextId assigned to the given username.
   */
  _add(username) {
    let nextUserContextId;
    if (this.full) {
      const oldestUsernameEntry = this.order.shift();
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
   * @param {string} username - The username for which the userContextId
   *                                 is to be looked up.
   * @returns {number} The userContextId which is assigned to
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
   * @param {number} userContextId - The userContextId for which the
   *                                      username is to be to looked up.
   * @returns {string} The username mapped to the given
   *                                      userContextId.
   */
  getUsernameForUserContextId(userContextId) {
    if (this.inverted.hasOwnProperty(userContextId)) {
      return this.inverted[userContextId];
    }
    return "";
  }
}

export var auth = {
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
      this.mWindow = lazy.cal.window.getCalendarWindow();
      this.mReturnedLogins = {};
      this.mProvider = null;
    }

    /**
     * @typedef {object} PasswordInfo
     * @property {boolean} found        True, if the password was found
     * @property {?string} username     The found username
     * @property {?string} password     The found password
     */

    /**
     * Retrieve password information from the login manager
     *
     * @param {string} aPasswordRealm - The realm to retrieve password info for
     * @param {string} aRequestedUser - The username to look up.
     * @returns {PasswordInfo} The retrieved password information
     */
    getPasswordInfo(aPasswordRealm, aRequestedUser) {
      // Prefill aRequestedUser, so it will be used in the prompter.
      let username = aRequestedUser;
      let password;
      let found = false;

      const logins = Services.logins.findLogins(aPasswordRealm.prePath, null, aPasswordRealm.realm);
      for (const login of logins) {
        if (!aRequestedUser || aRequestedUser == login.username) {
          username = login.username;
          password = login.password;
          found = true;
          break;
        }
      }
      if (found) {
        const keyStr = aPasswordRealm.prePath + ":" + aPasswordRealm.realm + ":" + aRequestedUser;
        const now = new Date();
        // Remove the saved password if it was already returned less
        // than 60 seconds ago. The reason for the timestamp check is that
        // nsIHttpChannel can call the nsIAuthPrompt2 interface
        // again in some situation. ie: When using Digest auth token
        // expires.
        if (
          this.mReturnedLogins[keyStr] &&
          now.getTime() - this.mReturnedLogins[keyStr].getTime() < 60000
        ) {
          lazy.cal.LOG(
            "Credentials removed for: user=" +
              username +
              ", host=" +
              aPasswordRealm.prePath +
              ", realm=" +
              aPasswordRealm.realm
          );

          delete this.mReturnedLogins[keyStr];
          auth.passwordManagerRemove(username, aPasswordRealm.prePath, aPasswordRealm.realm);
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
      const hostRealm = {};
      hostRealm.prePath = aChannel.URI.prePath;
      hostRealm.realm = aAuthInfo.realm;
      let port = aChannel.URI.port;
      if (port == -1) {
        const handler = Services.io
          .getProtocolHandler(aChannel.URI.scheme)
          .QueryInterface(Ci.nsIProtocolHandler);
        port = handler.defaultPort;
      }
      hostRealm.passwordRealm = aChannel.URI.host + ":" + port + " (" + aAuthInfo.realm + ")";

      const requestedUser = lazy.cal.auth.containerMap.getUsernameForUserContextId(
        aChannel.loadInfo.originAttributes.userContextId
      );
      const pwInfo = this.getPasswordInfo(hostRealm, requestedUser);
      aAuthInfo.username = pwInfo.username;
      if (pwInfo && pwInfo.found) {
        aAuthInfo.password = pwInfo.password;
        return true;
      }
      let savePasswordLabel = null;
      if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
        savePasswordLabel = lazy.MsgAuthPrompt.l10n.formatValueSync(
          "remember-password-checkbox-label"
        );
      }
      const savePassword = {};
      const returnValue = new lazy.MsgAuthPrompt().promptAuth(
        aChannel,
        aLevel,
        aAuthInfo,
        savePasswordLabel,
        savePassword
      );
      if (savePassword.value) {
        auth.passwordManagerSave(
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
      const self = this;
      const promptlistener = {
        onPromptStartAsync(callback) {
          callback.onAuthResult(this.onPromptStart());
        },

        onPromptStart() {
          const res = self.promptAuth(aChannel, aLevel, aAuthInfo);
          if (res) {
            gAuthCache.setAuthInfo(hostKey, aAuthInfo);
            this.onPromptAuthAvailable();
            return true;
          }

          this.onPromptCanceled();
          return false;
        },

        onPromptAuthAvailable() {
          const authInfo = gAuthCache.retrieveAuthInfo(hostKey);
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

      const requestedUser = lazy.cal.auth.containerMap.getUsernameForUserContextId(
        aChannel.loadInfo.originAttributes.userContextId
      );
      const hostKey = aChannel.URI.prePath + ":" + aAuthInfo.realm + ":" + requestedUser;
      gAuthCache.planForAuthInfo(hostKey);

      const queuePrompt = function () {
        const asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
          Ci.nsIMsgAsyncPrompter
        );
        asyncprompter.queueAsyncAuthPrompt(hostKey, false, promptlistener);
      };

      const finalSteps = function () {
        // the prompt will fail if we are too early
        if (self.mWindow.document.readyState == "complete") {
          queuePrompt();
        } else {
          self.mWindow.addEventListener("load", queuePrompt, true);
        }
      };

      const tryUntilReady = function () {
        self.mWindow = lazy.cal.window.getCalendarWindow();
        if (!self.mWindow) {
          lazy.setTimeout(tryUntilReady, 1000);
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
   * @param {string} aTitle - The dialog title.
   * @param {string} aCalendarName - The calendar name or url to look up. Can be null.
   * @param {{value: string}} aUsername        The username that belongs to the calendar.
   * @param {{value: string}} aPassword        The password that belongs to the calendar.
   * @param {{value: string}} aSavePassword    Should the password be saved?
   * @param {boolean} aFixedUsername - Whether the user name is fixed or editable
   * @returns {boolean} Could a password be retrieved?
   */
  getCredentials(aTitle, aCalendarName, aUsername, aPassword, aSavePassword, aFixedUsername) {
    if (
      typeof aUsername != "object" ||
      typeof aPassword != "object" ||
      typeof aSavePassword != "object"
    ) {
      throw new Components.Exception("", Cr.NS_ERROR_XPC_NEED_OUT_OBJECT);
    }

    // Only show the save password box if we are supposed to.
    let savepassword = null;
    if (Services.prefs.getBoolPref("signon.rememberSignons", true)) {
      savepassword = lazy.MsgAuthPrompt.l10n.formatValueSync("remember-password-checkbox-label");
    }

    let aText;
    if (aFixedUsername) {
      aText = lazy.cal.l10n.getAnyString("global", "commonDialogs", "EnterPasswordFor", [
        aUsername.value,
        aCalendarName,
      ]);
      return new lazy.MsgAuthPrompt().promptPassword(
        aTitle,
        aText,
        aPassword,
        savepassword,
        aSavePassword
      );
    }
    aText = lazy.cal.l10n.getAnyString("global", "commonDialogs", "EnterUserPasswordFor2", [
      aCalendarName,
    ]);
    return new lazy.MsgAuthPrompt().promptUsernameAndPassword(
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
   * @param {string} aOrigin - The hostname or origin to check
   * @returns {string} The origin uri
   */
  _ensureOrigin(aOrigin) {
    try {
      const { prePath, spec } = Services.io.newURI(aOrigin);
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
   * @param {string} aUsername - The username to insert
   * @param {string} aPassword - The corresponding password
   * @param {string} aOrigin - The corresponding origin
   * @param {string} aRealm - The password realm (unused on branch)
   */
  async passwordManagerSave(aUsername, aPassword, aOrigin, aRealm) {
    lazy.cal.ASSERT(aUsername);
    lazy.cal.ASSERT(aPassword);

    const origin = this._ensureOrigin(aOrigin);

    if (!Services.logins.getLoginSavingEnabled(origin)) {
      throw new Components.Exception(
        "Password saving is disabled for " + origin,
        Cr.NS_ERROR_NOT_AVAILABLE
      );
    }

    try {
      const logins = Services.logins.findLogins(origin, null, aRealm);

      const newLoginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
        Ci.nsILoginInfo
      );
      newLoginInfo.init(origin, null, aRealm, aUsername, aPassword, "", "");
      for (const login of logins) {
        if (aUsername == login.username) {
          Services.logins.modifyLogin(login, newLoginInfo);
          return;
        }
      }
      await Services.logins.addLoginAsync(newLoginInfo);
    } catch (exc) {
      // Only show the message if its not an abort, which can happen if
      // the user canceled the primary password dialog
      lazy.cal.ASSERT(exc.result == Cr.NS_ERROR_ABORT, exc);
    }
  },

  /**
   * Helper to retrieve an entry from the password manager.
   *
   * @param {string} aUsername - The username to search
   * @param {string} aPassword - The corresponding password
   * @param {string} aOrigin - The corresponding origin
   * @param {string} aRealm - The password realm (unused on branch)
   * @returns {boolean} True, if an entry exists in the password manager
   */
  passwordManagerGet(aUsername, aPassword, aOrigin, aRealm) {
    lazy.cal.ASSERT(aUsername);

    if (typeof aPassword != "object") {
      throw new Components.Exception("", Cr.NS_ERROR_XPC_NEED_OUT_OBJECT);
    }

    const origin = this._ensureOrigin(aOrigin);

    try {
      const logins = Services.logins.findLogins(origin, null, "");
      for (const loginInfo of logins) {
        if (
          loginInfo.username == aUsername &&
          (loginInfo.httpRealm == aRealm || loginInfo.httpRealm.split(" ").includes(aRealm))
        ) {
          aPassword.value = loginInfo.password;
          return true;
        }
      }
    } catch (exc) {
      lazy.cal.ASSERT(false, exc);
    }
    return false;
  },

  /**
   * Helper to remove an entry from the password manager
   *
   * @param {string} aUsername - The username to remove
   * @param {string} aOrigin - The corresponding origin
   * @param {string} aRealm - The password realm (unused on branch)
   * @returns {boolean} Could the user be removed?
   */
  passwordManagerRemove(aUsername, aOrigin, aRealm) {
    lazy.cal.ASSERT(aUsername);

    const origin = this._ensureOrigin(aOrigin);

    try {
      const logins = Services.logins.findLogins(origin, null, aRealm);
      for (const loginInfo of logins) {
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
   * @param {number} min - The lower range limit of userContextIds to be
   *                            used.
   * @param {number} max - The upper range limit of userContextIds to be
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
    const authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.refCnt++;
    } else {
      this._authInfoCache.set(hostKey, { refCnt: 1 });
    }
  },

  setAuthInfo(hostKey, aAuthInfo) {
    const authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.username = aAuthInfo.username;
      authInfo.password = aAuthInfo.password;
    }
  },

  retrieveAuthInfo(hostKey) {
    const authInfo = this._authInfoCache.get(hostKey);
    if (authInfo) {
      authInfo.refCnt--;

      if (authInfo.refCnt == 0) {
        this._authInfoCache.delete(hostKey);
      }
    }
    return authInfo;
  },
};
