/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { cal } from "resource:///modules/calendar/calUtils.sys.mjs";

import { OAuth2 } from "resource:///modules/OAuth2.sys.mjs";
import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  OAuth2Providers: "resource:///modules/OAuth2Providers.sys.mjs",
});

/**
 * Session and authentication tools for the CalDAV provider.
 */

const OAUTH_GRACE_TIME = 30 * 1000;

class CalDavOAuth extends OAuth2 {
  /**
   * Returns true if the token has expired, or will expire within the grace time.
   */
  get tokenExpired() {
    const now = new Date().getTime();
    return this.tokenExpires - OAUTH_GRACE_TIME < now;
  }

  /**
   * Retrieves the refresh token from the password manager. The token is cached.
   */
  get refreshToken() {
    cal.ASSERT(this.id, `This ${this.constructor.name} object has no id.`);
    if (!this._refreshToken) {
      const pass = { value: null };
      try {
        cal.auth.passwordManagerGet(this.id, pass, this.origin, this.pwMgrId);
      } catch (e) {
        // User might have cancelled the primary password prompt, that's ok
        if (e.result != Cr.NS_ERROR_ABORT) {
          throw e;
        }
      }
      this._refreshToken = pass.value;
    }
    return this._refreshToken;
  }

  /**
   * Saves the refresh token in the password manager
   *
   * @param {string} aVal - The value to set
   */
  set refreshToken(aVal) {
    try {
      if (aVal) {
        cal.auth.passwordManagerSave(this.id, aVal, this.origin, this.pwMgrId);
      } else {
        cal.auth.passwordManagerRemove(this.id, this.origin, this.pwMgrId);
      }
    } catch (e) {
      // User might have cancelled the primary password prompt, that's ok
      if (e.result != Cr.NS_ERROR_ABORT) {
        throw e;
      }
    }
    this._refreshToken = aVal;
  }

  /**
   * Wait for the calendar window to appear.
   *
   * This is a workaround for bug 901329: If the calendar window isn't loaded yet the master
   * password prompt will show just the buttons and possibly hang. If we postpone until the window
   * is loaded, all is well.
   *
   * @returns {Promise} A promise resolved without value when the window is loaded
   */
  waitForCalendarWindow() {
    return new Promise(resolve => {
      // eslint-disable-next-line func-names, require-jsdoc
      function postpone() {
        const win = cal.window.getCalendarWindow();
        if (!win || win.document.readyState != "complete") {
          setTimeout(postpone, 0);
        } else {
          resolve();
        }
      }
      setTimeout(postpone, 0);
    });
  }

  /**
   * Promisified version of |connect|, using all means necessary to gracefully display the
   * authentication prompt.
   *
   * @param {boolean} aWithUI - If UI should be shown for authentication
   * @param {boolean} aRefresh - Force refresh the token TODO default false
   * @returns {Promise} A promise resolved when the OAuth process is completed
   */
  promiseConnect(aWithUI = true, aRefresh = true) {
    return this.waitForCalendarWindow().then(() => {
      return new Promise((resolve, reject) => {
        const self = this;
        const asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
          Ci.nsIMsgAsyncPrompter
        );
        asyncprompter.queueAsyncAuthPrompt(this.id, false, {
          onPromptStartAsync(callback) {
            this.onPromptAuthAvailable(callback);
          },

          onPromptAuthAvailable(callback) {
            self.connect(aWithUI, aRefresh).then(
              () => {
                callback?.onAuthResult(true);
                resolve();
              },
              () => {
                callback?.onAuthResult(false);
                reject(Cr.NS_ERROR_ABORT);
              }
            );
          },
          onPromptCanceled: reject,
          onPromptStart() {},
        });
      });
    });
  }

  /**
   * Prepare the given channel for an OAuth request
   *
   * @param {nsIChannel} aChannel - The channel to prepare
   */
  async prepareRequest(aChannel) {
    if (!this.accessToken || this.tokenExpired) {
      // The token has expired, we need to reauthenticate first
      cal.LOG("CalDAV: OAuth token expired or empty, refreshing");
      await this.promiseConnect();
    }

    const hdr = "Bearer " + this.accessToken;
    aChannel.setRequestHeader("Authorization", hdr, false);
  }

  /**
   * Prepare the redirect, copying the auth header to the new channel
   *
   * @param {nsIChannel} aOldChannel - The old channel that is being redirected
   * @param {nsIChannel} aNewChannel - The new channel to prepare
   */
  async prepareRedirect(aOldChannel, aNewChannel) {
    try {
      const hdrValue = aOldChannel.getRequestHeader("Authorization");
      if (hdrValue) {
        aNewChannel.setRequestHeader("Authorization", hdrValue, false);
      }
    } catch (e) {
      if (e.result != Cr.NS_ERROR_NOT_AVAILABLE) {
        // The header could possibly not be available, ignore that
        // case but throw otherwise
        throw e;
      }
    }
  }

  /**
   * Check for OAuth auth errors and restart the request without a token if necessary
   *
   * @param {CalDavResponseBase} aResponse - The response to inspect for completion
   * @returns {Promise} A promise resolved when complete, with
   *                                            CalDavSession.RESTART_REQUEST or null
   */
  async completeRequest(aResponse) {
    // Check for OAuth errors
    const wwwauth = aResponse.getHeader("WWW-Authenticate");
    if (this.oauth && wwwauth && wwwauth.startsWith("Bearer") && wwwauth.includes("error=")) {
      this.oauth.accessToken = null;

      return CalDavSession.RESTART_REQUEST;
    }
    return null;
  }
}

/**
 * Authentication provider for Google's OAuth.
 */
class CalDavGoogleOAuth extends CalDavOAuth {
  /**
   * Constructs a new Google OAuth authentication provider
   *
   * @param {string} sessionId - The session id, used in the password manager
   * @param {string} username - The username associated with this session.
   */
  constructor(sessionId, username) {
    super("https://www.googleapis.com/auth/calendar", {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
      tokenEndpoint: "https://www.googleapis.com/oauth2/v3/token",
      clientId: "720563984538.apps.googleusercontent.com",
      clientSecret: "yUr6XUfxurafti6r7z0SSeIQ",
    });

    this.id = sessionId;
    this.origin = "oauth:" + sessionId;
    this.pwMgrId = "Google CalDAV v2";

    this._maybeUpgrade();

    this.requestWindowTitle = cal.l10n.getAnyString(
      "global",
      "commonDialogs",
      "EnterUserPasswordFor2",
      [username]
    );
    this.extraAuthParams = [["login_hint", username]];
  }

  /**
   * If no token is found for "Google CalDAV v2", this is either a new session (in which case
   * it should use Thunderbird's credentials) or it's already using Thunderbird's credentials.
   * Detect those situations and switch credentials if necessary.
   */
  _maybeUpgrade() {
    if (!this.refreshToken) {
      const issuerDetails = lazy.OAuth2Providers.getIssuerDetails("accounts.google.com");
      this.clientId = issuerDetails.clientId;
      this.consumerSecret = issuerDetails.clientSecret;

      this.origin = "oauth://accounts.google.com";
      this.pwMgrId = "https://www.googleapis.com/auth/calendar";
    }
  }
}

/**
 * Authentication provider for Fastmail's OAuth.
 */
class CalDavFastmailOAuth extends CalDavOAuth {
  /**
   * Constructs a new Fastmail OAuth authentication provider
   *
   * @param {string} sessionId - The session id, used in the password manager
   * @param {string} username - The username associated with this session.
   */
  constructor(sessionId, username) {
    const issuerDetails = lazy.OAuth2Providers.getIssuerDetails("www.fastmail.com");
    super("https://www.fastmail.com/dev/protocol-caldav", issuerDetails);

    this.id = sessionId;
    this.origin = "oauth://www.fastmail.com";
    this.pwMgrId = "https://www.fastmail.com/dev/protocol-caldav";

    this.requestWindowTitle = cal.l10n.getAnyString(
      "global",
      "commonDialogs",
      "EnterUserPasswordFor2",
      [username]
    );
    this.extraAuthParams = [["login_hint", username]];
  }
}

/**
 * A modified version of CalDavGoogleOAuth for testing. This class mimics the
 * real class as closely as possible.
 */
class CalDavTestOAuth extends CalDavGoogleOAuth {
  constructor(sessionId, username) {
    super(sessionId, username);

    // Override these values with test values.
    this.authorizationEndpoint = "https://oauth.test.test/form";
    this.tokenEndpoint = "https://oauth.test.test/token";
    this.scope = "test_scope";
    this.clientId = "test_client_id";
    this.consumerSecret = "test_secret";
    this.redirectionEndpoint = "https://localhost";
  }

  _maybeUpgrade() {
    if (!this.refreshToken) {
      const issuerDetails = lazy.OAuth2Providers.getIssuerDetails("test.test");
      this.clientId = issuerDetails.clientId;
      this.consumerSecret = issuerDetails.clientSecret;

      this.origin = "oauth://test.test";
      this.pwMgrId = "test_scope";
    }
  }
}

/**
 * A session for the caldav provider. Two or more calendars can share a session if they have the
 * same auth credentials.
 */
export class CalDavSession {
  QueryInterface = ChromeUtils.generateQI(["nsIInterfaceRequestor"]);

  /**
   * Dictionary of hostname => auth adapter. Before a request is made to a hostname
   * in the dictionary, the auth adapter will be called to modify the request.
   */
  authAdapters = {};

  /**
   * Constant returned by |completeRequest| when the request should be restarted
   *
   * @returns {number} The constant
   */
  static get RESTART_REQUEST() {
    return 1;
  }

  /**
   * Creates a new caldav session
   *
   * @param {string} aSessionId - The session id, used in the password manager
   * @param {string} aUserName - The username associated with this session.
   */
  constructor(aSessionId, aUserName) {
    this.id = aSessionId;
    this.username = aUserName;

    // Only create an auth adapter if we're going to use it.
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "apidata.googleusercontent.com",
      () => new CalDavGoogleOAuth(aSessionId, aUserName)
    );
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "caldav.fastmail.com",
      () => new CalDavFastmailOAuth(aSessionId, aUserName)
    );
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "mochi.test",
      () => new CalDavTestOAuth(aSessionId, aUserName)
    );
  }

  /**
   * Implement nsIInterfaceRequestor. The base class has no extra interfaces, but a subclass of
   * the session may.
   *
   * @param {nsIIDRef} aIID - The IID of the interface being requested
   * @returns {?*} Either this object QI'd to the IID, or null.
   *                                Components.returnCode is set accordingly.
   */
  getInterface(aIID) {
    try {
      // Try to query the this object for the requested interface but don't
      // throw if it fails since that borks the network code.
      return this.QueryInterface(aIID);
    } catch (e) {
      Components.returnCode = e;
    }

    return null;
  }

  /**
   * Calls the auth adapter for the given host in case it exists. This allows delegating auth
   * preparation based on the host, e.g. for OAuth.
   *
   * @param {string} aHost - The host to check the auth adapter for
   * @param {string} aMethod - The method to call
   * @param {...*} aArgs - Remaining args specific to the adapted method
   * @returns {*} Return value specific to the adapter method
   */
  async _callAdapter(aHost, aMethod, ...aArgs) {
    const adapter = this.authAdapters[aHost] || null;
    if (adapter) {
      return adapter[aMethod](...aArgs);
    }
    return null;
  }

  /**
   * Prepare the channel for a request, e.g. setting custom authentication headers
   *
   * @param {nsIChannel} aChannel - The channel to prepare
   * @returns {Promise} A promise resolved when the preparations are complete
   */
  async prepareRequest(aChannel) {
    return this._callAdapter(aChannel.URI.host, "prepareRequest", aChannel);
  }

  /**
   * Prepare the given new channel for a redirect, e.g. copying headers.
   *
   * @param {nsIChannel} aOldChannel - The old channel that is being redirected
   * @param {nsIChannel} aNewChannel - The new channel to prepare
   * @returns {Promise} A promise resolved when the preparations are complete
   */
  async prepareRedirect(aOldChannel, aNewChannel) {
    return this._callAdapter(aNewChannel.URI.host, "prepareRedirect", aOldChannel, aNewChannel);
  }

  /**
   * Complete the request based on the results from the response. Allows restarting the session if
   * |CalDavSession.RESTART_REQUEST| is returned.
   *
   * @param {CalDavResponseBase} aResponse - The response to inspect for completion
   * @returns {Promise} A promise resolved when complete, with
   *                                            CalDavSession.RESTART_REQUEST or null
   */
  async completeRequest(aResponse) {
    return this._callAdapter(aResponse.request.uri.host, "completeRequest", aResponse);
  }
}

/**
 * A session used to detect a caldav provider when subscribing to a network calendar.
 *
 * @implements {nsIAuthPrompt2}
 * @implements {nsIAuthPromptProvider}
 * @implements {nsIInterfaceRequestor}
 */
export class CalDavDetectionSession extends CalDavSession {
  QueryInterface = ChromeUtils.generateQI([
    Ci.nsIAuthPrompt2,
    Ci.nsIAuthPromptProvider,
    Ci.nsIInterfaceRequestor,
  ]);

  isDetectionSession = true;

  /**
   * Create a new caldav detection session.
   *
   * @param {string} aUserName - The username for the session.
   * @param {string} aPassword - The password for the session.
   * @param {boolean} aSavePassword - Whether to save the password.
   */
  constructor(aUserName, aPassword, aSavePassword) {
    super(aUserName, aUserName);
    this.password = aPassword;
    this.savePassword = aSavePassword;
  }

  /**
   * Returns a plain (non-autodect) caldav session based on this session.
   *
   * @returns {CalDavSession} A caldav session.
   */
  toBaseSession() {
    return new CalDavSession(this.id, this.username);
  }

  /**
   * @see {nsIAuthPromptProvider}
   */
  getAuthPrompt(aReason, aIID) {
    try {
      return this.QueryInterface(aIID);
    } catch (e) {
      throw Components.Exception("", Cr.NS_ERROR_NOT_AVAILABLE);
    }
  }

  /**
   * @see {nsIAuthPrompt2}
   */
  asyncPromptAuth(aChannel, aCallback, aContext, aLevel, aAuthInfo) {
    setTimeout(() => {
      if (this.promptAuth(aChannel, aLevel, aAuthInfo)) {
        aCallback.onAuthAvailable(aContext, aAuthInfo);
      } else {
        aCallback.onAuthCancelled(aContext, true);
      }
    });
  }

  /**
   * @see {nsIAuthPrompt2}
   */
  promptAuth(aChannel, aLevel, aAuthInfo) {
    if (!this.password) {
      return false;
    }

    if ((aAuthInfo.flags & aAuthInfo.PREVIOUS_FAILED) == 0) {
      aAuthInfo.username = this.username;
      aAuthInfo.password = this.password;

      if (this.savePassword) {
        cal.auth.passwordManagerSave(
          this.username,
          this.password,
          aChannel.URI.prePath,
          aAuthInfo.realm
        );
      }
      return true;
    }

    aAuthInfo.username = null;
    aAuthInfo.password = null;
    if (this.savePassword) {
      cal.auth.passwordManagerRemove(this.username, aChannel.URI.prePath, aAuthInfo.realm);
    }
    return false;
  }
}
