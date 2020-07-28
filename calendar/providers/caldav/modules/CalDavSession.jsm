/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { setTimeout } = ChromeUtils.import("resource://gre/modules/Timer.jsm");

var { OAuth2 } = ChromeUtils.import("resource:///modules/OAuth2.jsm");

var { cal } = ChromeUtils.import("resource:///modules/calendar/calUtils.jsm");

/**
 * Session and authentication tools for the caldav provider
 */

const EXPORTED_SYMBOLS = ["CalDavSession"]; /* exported CalDavSession */

const OAUTH_GRACE_TIME = 30 * 1000;

/**
 * Authentication provider for Google's OAuth.
 */
class CalDavGoogleOAuth extends OAuth2 {
  /**
   * Constructs a new Google OAuth authentication provider
   *
   * @param {String} sessionId    The session id, used in the password manager
   * @param {String} name         The user-readable description of this session
   */
  constructor(sessionId, name) {
    /* eslint-disable no-undef */
    super(
      OAUTH_BASE_URI + "oauth2/auth",
      OAUTH_BASE_URI + "oauth2/token",
      OAUTH_SCOPE,
      OAUTH_CLIENT_ID,
      OAUTH_HASH
    );
    /*  eslint-enable no-undef */

    this.id = sessionId;
    this.pwMgrId = "Google CalDAV v2";
    this.requestWindowTitle = cal.l10n.getAnyString(
      "global",
      "commonDialogs",
      "EnterUserPasswordFor2",
      [name]
    );

    this.requestWindowFeatures = "chrome,private,centerscreen,width=430,height=600";
  }

  /**
   * Returns true if the token has expired, or will expire within the grace time.
   */
  get tokenExpired() {
    let now = new Date().getTime();
    return this.tokenExpires - OAUTH_GRACE_TIME < now;
  }

  /**
   * Retrieves the refresh token from the password manager. The token is cached.
   */
  get refreshToken() {
    if (!this._refreshToken) {
      let pass = { value: null };
      try {
        let origin = "oauth:" + this.id;
        cal.auth.passwordManagerGet(this.id, pass, origin, this.pwMgrId);
      } catch (e) {
        // User might have cancelled the master password prompt, that's ok
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
   * @param {String} aVal   The value to set
   */
  set refreshToken(aVal) {
    try {
      let origin = "oauth:" + this.id;
      if (aVal) {
        cal.auth.passwordManagerSave(this.id, aVal, origin, this.pwMgrId);
      } else {
        cal.auth.passwordManagerRemove(this.id, origin, this.pwMgrId);
      }
    } catch (e) {
      // User might have cancelled the master password prompt, that's ok
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
   * @return {Promise}    A promise resolved without value when the window is loaded
   */
  waitForCalendarWindow() {
    return new Promise(resolve => {
      // eslint-disable-next-line func-names, require-jsdoc
      function postpone() {
        let win = cal.window.getCalendarWindow();
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
   * @param {Boolean} aWithUI       If UI should be shown for authentication
   * @param {Boolean} aRefresh      Force refresh the token TODO default false
   * @return {Promise}              A promise resolved when the OAuth process is completed
   */
  promiseConnect(aWithUI = true, aRefresh = true) {
    return this.waitForCalendarWindow().then(() => {
      return new Promise((resolve, reject) => {
        let self = this;
        let asyncprompter = Cc["@mozilla.org/messenger/msgAsyncPrompter;1"].getService(
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
   * @param {nsIChannel} aChannel     The channel to prepare
   */
  async prepareRequest(aChannel) {
    if (!this.accessToken || this.tokenExpired) {
      // The token has expired, we need to reauthenticate first
      cal.LOG("CalDAV: OAuth token expired or empty, refreshing");
      await this.promiseConnect();
    }

    let hdr = "Bearer " + this.accessToken;
    aChannel.setRequestHeader("Authorization", hdr, false);
  }

  /**
   * Prepare the redirect, copying the auth header to the new channel
   *
   * @param {nsIChannel} aOldChannel      The old channel that is being redirected
   * @param {nsIChannel} aNewChannel      The new channel to prepare
   */
  async prepareRedirect(aOldChannel, aNewChannel) {
    try {
      let hdrValue = aOldChannel.getRequestHeader("WWW-Authenticate");
      if (hdrValue) {
        aNewChannel.setRequestHeader("WWW-Authenticate", hdrValue, false);
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
   * @param {CalDavResponseBase} aResponse    The response to inspect for completion
   * @return {Promise}                        A promise resolved when complete, with
   *                                            CalDavSession.RESTART_REQUEST or null
   */
  async completeRequest(aResponse) {
    // Check for OAuth errors
    let wwwauth = aResponse.getHeader("WWW-Authenticate");
    if (this.oauth && wwwauth && wwwauth.startsWith("Bearer") && wwwauth.includes("error=")) {
      this.oauth.accessToken = null;

      return CalDavSession.RESTART_REQUEST;
    }
    return null;
  }
}

/**
 * A session for the caldav provider. Two or more calendars can share a session if they have the
 * same auth credentials.
 */
class CalDavSession {
  QueryInterface(aIID) {
    return cal.generateClassQI(this, aIID, [Ci.nsIInterfaceRequestor]);
  }

  /**
   * Constant returned by |completeRequest| when the request should be restarted
   * @return {Number}    The constant
   */
  static get RESTART_REQUEST() {
    return 1;
  }

  /**
   * Creates a new caldav session
   *
   * @param {String} aSessionId    The session id, used in the password manager
   * @param {String} aName         The user-readable description of this session
   */
  constructor(aSessionId, aName) {
    this.id = aSessionId;
    this.name = aName;

    // There is only one right now, but for better separation this is ready for more oauth hosts
    this.authAdapters = {
      "apidata.googleusercontent.com": new CalDavGoogleOAuth(aSessionId, aName),
    };
  }

  /**
   * Implement nsIInterfaceRequestor. The base class has no extra interfaces, but a subclass of
   * the session may.
   *
   * @param {nsIIDRef} aIID       The IID of the interface being requested
   * @return {?*}                 Either this object QI'd to the IID, or null.
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
   * @param {String} aHost        The host to check the auth adapter for
   * @param {String} aMethod      The method to call
   * @param {...*} aArgs          Remaining args specific to the adapted method
   * @return {*}                  Return value specific to the adapter method
   */
  async _callAdapter(aHost, aMethod, ...aArgs) {
    let adapter = this.authAdapters[aHost] || null;
    if (adapter) {
      return adapter[aMethod](...aArgs);
    }
    return null;
  }

  /**
   * Prepare the channel for a request, e.g. setting custom authentication headers
   *
   * @param {nsIChannel} aChannel     The channel to prepare
   * @return {Promise}                A promise resolved when the preparations are complete
   */
  async prepareRequest(aChannel) {
    return this._callAdapter(aChannel.URI.host, "prepareRequest", aChannel);
  }

  /**
   * Prepare the given new channel for a redirect, e.g. copying headers.
   *
   * @param {nsIChannel} aOldChannel      The old channel that is being redirected
   * @param {nsIChannel} aNewChannel      The new channel to prepare
   * @return {Promise}                    A promise resolved when the preparations are complete
   */
  async prepareRedirect(aOldChannel, aNewChannel) {
    return this._callAdapter(aNewChannel.URI.host, "prepareRedirect", aOldChannel, aNewChannel);
  }

  /**
   * Complete the request based on the results from the response. Allows restarting the session if
   * |CalDavSession.RESTART_REQUEST| is returned.
   *
   * @param {CalDavResponseBase} aResponse    The response to inspect for completion
   * @return {Promise}                        A promise resolved when complete, with
   *                                            CalDavSession.RESTART_REQUEST or null
   */
  async completeRequest(aResponse) {
    return this._callAdapter(aResponse.request.uri.host, "completeRequest", aResponse);
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
