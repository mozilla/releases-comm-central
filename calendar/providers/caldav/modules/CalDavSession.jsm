/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { cal } = ChromeUtils.importESModule("resource:///modules/calendar/calUtils.sys.mjs");
var { OAuth2 } = ChromeUtils.import("resource:///modules/OAuth2.jsm");
var { setTimeout } = ChromeUtils.importESModule("resource://gre/modules/Timer.sys.mjs");

const lazy = {};

ChromeUtils.defineModuleGetter(lazy, "OAuth2Providers", "resource:///modules/OAuth2Providers.jsm");

/**
 * Session and authentication tools for the caldav provider
 */

const EXPORTED_SYMBOLS = ["CalDavDetectionSession", "CalDavSession"];
/* exported CalDavDetectionSession, CalDavSession */

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
            self.connect(
              () => {
                if (callback) {
                  callback.onAuthResult(true);
                }
                resolve();
              },
              () => {
                if (callback) {
                  callback.onAuthResult(false);
                }
                reject();
              },
              aWithUI,
              aRefresh
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
   * @param {string} name - The user-readable description of this session
   */
  constructor(sessionId, name) {
    /* eslint-disable no-undef */
    super("https://www.googleapis.com/auth/calendar", {
      authorizationEndpoint: "https://accounts.google.com/o/oauth2/auth",
      tokenEndpoint: "https://www.googleapis.com/oauth2/v3/token",
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_HASH,
    });
    /*  eslint-enable no-undef */

    this.id = sessionId;
    this.origin = "oauth:" + sessionId;
    this.pwMgrId = "Google CalDAV v2";

    this._maybeUpgrade(name);

    this.requestWindowTitle = cal.l10n.getAnyString(
      "global",
      "commonDialogs",
      "EnterUserPasswordFor2",
      [name]
    );
    this.extraAuthParams = [["login_hint", name]];
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
   * @param {string} name - The user-readable description of this session
   */
  constructor(sessionId, name) {
    /* eslint-disable no-undef */
    super("https://www.fastmail.com/dev/protocol-caldav", {
      authorizationEndpoint: "https://api.fastmail.com/oauth/authorize",
      tokenEndpoint: "https://api.fastmail.com/oauth/refresh",
      clientId: OAUTH_CLIENT_ID,
      clientSecret: OAUTH_HASH,
      usePKCE: true,
    });
    /*  eslint-enable no-undef */

    this.id = sessionId;
    this.origin = "oauth:" + sessionId;
    this.pwMgrId = "Fastmail CalDAV";

    this._maybeUpgrade(name);

    this.requestWindowTitle = cal.l10n.getAnyString(
      "global",
      "commonDialogs",
      "EnterUserPasswordFor2",
      [name]
    );
    this.extraAuthParams = [["login_hint", name]];
  }

  /**
   * If no token is found for "Fastmail CalDAV", this is either a new session (in which case
   * it should use Thunderbird's credentials) or it's already using Thunderbird's credentials.
   * Detect those situations and switch credentials if necessary.
   */
  _maybeUpgrade() {
    if (!this.refreshToken) {
      const issuerDetails = lazy.OAuth2Providers.getIssuerDetails("www.fastmail.com");
      this.clientId = issuerDetails.clientId;

      this.origin = "oauth://www.fastmail.com";
      this.pwMgrId = "https://www.fastmail.com/dev/protocol-caldav";
    }
  }
}

/**
 * A modified version of CalDavGoogleOAuth for testing. This class mimics the
 * real class as closely as possible.
 */
class CalDavTestOAuth extends CalDavGoogleOAuth {
  constructor(sessionId, name) {
    super(sessionId, name);

    // Override these values with test values.
    this.authorizationEndpoint =
      "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/data/redirect_auto.sjs";
    this.tokenEndpoint =
      "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/data/token.sjs";
    this.scope = "test_scope";
    this.clientId = "test_client_id";
    this.consumerSecret = "test_scope";

    // I don't know why, but tests refuse to work with a plain HTTP endpoint
    // (the request is redirected to HTTPS, which we're not listening to).
    // Just use an HTTPS endpoint.
    this.redirectionEndpoint = "https://localhost";
  }

  _maybeUpgrade() {
    if (!this.refreshToken) {
      const issuerDetails = lazy.OAuth2Providers.getIssuerDetails("mochi.test");
      this.clientId = issuerDetails.clientId;
      this.consumerSecret = issuerDetails.clientSecret;

      this.origin = "oauth://mochi.test";
      this.pwMgrId = "test_scope";
    }
  }
}

/**
 * A session for the caldav provider. Two or more calendars can share a session if they have the
 * same auth credentials.
 */
class CalDavSession {
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
   * @param {string} aName - The user-readable description of this session
   */
  constructor(aSessionId, aName) {
    this.id = aSessionId;
    this.name = aName;

    // Only create an auth adapter if we're going to use it.
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "apidata.googleusercontent.com",
      () => new CalDavGoogleOAuth(aSessionId, aName)
    );
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "caldav.fastmail.com",
      () => new CalDavFastmailOAuth(aSessionId, aName)
    );
    ChromeUtils.defineLazyGetter(
      this.authAdapters,
      "mochi.test",
      () => new CalDavTestOAuth(aSessionId, aName)
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
class CalDavDetectionSession extends CalDavSession {
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
    return new CalDavSession(this.id, this.name);
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
      aAuthInfo.username = this.name;
      aAuthInfo.password = this.password;

      if (this.savePassword) {
        cal.auth.passwordManagerSave(
          this.name,
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
      cal.auth.passwordManagerRemove(this.name, aChannel.URI.prePath, aAuthInfo.realm);
    }
    return false;
  }
}

// Before you spend time trying to find out what this means, please note that
// doing so and using the information WILL cause Google to revoke Lightning's
// privileges,  which means not one Lightning user will be able to connect to
// Google Calendar via CalDAV. This will cause unhappy users all around which
// means that the Lightning developers will have to spend more time with user
// support, which means less time for features, releases and bugfixes.  For a
// paid developer this would actually mean financial harm.
//
// Do you really want all of this to be your fault? Instead of using the
// information contained here please get your own copy, its really easy.
/* eslint-disable */
// prettier-ignore
(zqdx=>{zqdx["\x65\x76\x61\x6C"](zqdx["\x41\x72\x72\x61\x79"]["\x70\x72\x6F\x74"+
"\x6F\x74\x79\x70\x65"]["\x6D\x61\x70"]["\x63\x61\x6C\x6C"]("uijt/PBVUI`CBTF`VS"+
"J>#iuuqt;00bddpvout/hpphmf/dpn0p0#<uijt/PBVUI`TDPQF>#iuuqt;00xxx/hpphmfbqjt/dp"+
"n0bvui0dbmfoebs#<uijt/PBVUI`DMJFOU`JE>#831674:95649/bqqt/hpphmfvtfsdpoufou/dpn"+
"#<uijt/PBVUI`IBTI>#zVs7YVgyvsbguj7s8{1TTfJR#<",_=>zqdx["\x53\x74\x72\x69\x6E"+
"\x67"]["\x66\x72\x6F\x6D\x43\x68\x61\x72\x43\x6F\x64\x65"](_["\x63\x68\x61\x72"+
"\x43\x6F\x64\x65\x41\x74"](0)-1),this)[""+"\x6A\x6F\x69\x6E"](""))})["\x63\x61"+
"\x6C\x6C"]((this),Components["\x75\x74\x69\x6c\x73"]["\x67\x65\x74\x47\x6c\x6f"+
"\x62\x61\x6c\x46\x6f\x72\x4f\x62\x6a\x65\x63\x74"](this))
/* eslint-enable */
