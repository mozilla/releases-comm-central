/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides OAuth 2.0 authentication.
 * @see RFC 6749
 */
var EXPORTED_SYMBOLS = ["OAuth2"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

Cu.importGlobalProperties(["fetch"]);

// Only allow one connecting window per endpoint.
var gConnecting = {};

/**
 * Constructor for the OAuth2 object.
 *
 * @constructor
 * @param {string} authorizationEndpoint - The authorization endpoint as
 *   defined by RFC 6749 Section 3.1.
 * @param {string} tokenEndpoint - The token endpoint as defined by
 *   RFC 6749 Section 3.2.
 * @param {?string} scope - The scope as specified by RFC 6749 Section 3.3.
 *   Will not be included in the requests if falsy.
 * @param {string} clientId - The client_id as specified by RFC 6749 Section
 *   2.3.1.
 * @param {string} [clientSecret=null] - The client_secret as specified in
 *    RFC 6749 section 2.3.1. Will not be included in the requests if null.
 */
function OAuth2(
  authorizationEndpoint,
  tokenEndpoint,
  scope,
  clientId,
  clientSecret = null
) {
  this.authorizationEndpoint = authorizationEndpoint;
  this.tokenEndpoint = tokenEndpoint;
  this.scope = scope;
  this.clientId = clientId;
  this.consumerSecret = clientSecret;

  this.extraAuthParams = [];

  this.log = console.createInstance({
    prefix: "mailnews.oauth",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.oauth.loglevel",
  });
}

OAuth2.prototype = {
  clientId: null,
  consumerSecret: null,
  redirectionEndpoint: "http://localhost",
  requestWindowURI: "chrome://messenger/content/browserRequest.xhtml",
  requestWindowFeatures: "chrome,private,centerscreen,width=980,height=750",
  requestWindowTitle: "",
  scope: null,

  accessToken: null,
  refreshToken: null,
  tokenExpires: 0,

  connect(aSuccess, aFailure, aWithUI, aRefresh) {
    this.connectSuccessCallback = aSuccess;
    this.connectFailureCallback = aFailure;

    if (this.accessToken && !this.tokenExpired && !aRefresh) {
      aSuccess();
    } else if (this.refreshToken) {
      this.requestAccessToken(this.refreshToken, true);
    } else {
      if (!aWithUI) {
        aFailure('{ "error": "auth_noui" }');
        return;
      }
      if (gConnecting[this.authorizationEndpoint]) {
        aFailure("Window already open");
        return;
      }
      this.requestAuthorization();
    }
  },

  /**
   * True if the token has expired, or will expire within the grace time.
   */
  get tokenExpired() {
    // 30 seconds to allow for network inefficiency, clock drift, etc.
    const OAUTH_GRACE_TIME_MS = 30 * 1000;
    return this.tokenExpires - OAUTH_GRACE_TIME_MS < Date.now();
  },

  requestAuthorization() {
    let params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectionEndpoint,
    });

    // The scope is optional.
    if (this.scope) {
      params.append("scope", this.scope);
    }

    for (let [name, value] of this.extraAuthParams) {
      params.append(name, value);
    }

    let authEndpointURI = this.authorizationEndpoint + "?" + params.toString();
    this.log.info(
      "Interacting with the resource owner to obtain an authorization grant " +
        "from the authorization endpoint: " +
        authEndpointURI
    );

    this._browserRequest = {
      account: this,
      url: authEndpointURI,
      _active: true,
      iconURI: "",
      cancelled() {
        if (!this._active) {
          return;
        }

        this.account.finishAuthorizationRequest();
        this.account.onAuthorizationFailed(
          Cr.NS_ERROR_ABORT,
          '{ "error": "cancelled"}'
        );
      },

      loaded(aWindow, aWebProgress) {
        if (!this._active) {
          return;
        }

        this._listener = {
          window: aWindow,
          webProgress: aWebProgress,
          _parent: this.account,

          QueryInterface: ChromeUtils.generateQI([
            "nsIWebProgressListener",
            "nsISupportsWeakReference",
          ]),

          _cleanUp() {
            this.webProgress.removeProgressListener(this);
            this.window.close();
            delete this.window;
          },

          _checkForRedirect(url) {
            if (!url.startsWith(this._parent.redirectionEndpoint)) {
              return;
            }

            this._parent.finishAuthorizationRequest();
            this._parent.onAuthorizationReceived(url);
          },

          onStateChange(aWebProgress, aRequest, aStateFlags, aStatus) {
            const wpl = Ci.nsIWebProgressListener;
            if (aStateFlags & (wpl.STATE_START | wpl.STATE_IS_NETWORK)) {
              this._checkForRedirect(aRequest.name);
            }
          },
          onLocationChange(aWebProgress, aRequest, aLocation) {
            this._checkForRedirect(aLocation.spec);
          },
          onProgressChange() {},
          onStatusChange() {},
          onSecurityChange() {},
        };
        aWebProgress.addProgressListener(
          this._listener,
          Ci.nsIWebProgress.NOTIFY_ALL
        );
        aWindow.document.title = this.account.requestWindowTitle;
      },
    };

    this.wrappedJSObject = this._browserRequest;
    gConnecting[this.authorizationEndpoint] = true;
    Services.ww.openWindow(
      null,
      this.requestWindowURI,
      null,
      this.requestWindowFeatures,
      this
    );
  },
  finishAuthorizationRequest() {
    gConnecting[this.authorizationEndpoint] = false;
    if (!("_browserRequest" in this)) {
      return;
    }

    this._browserRequest._active = false;
    if ("_listener" in this._browserRequest) {
      this._browserRequest._listener._cleanUp();
    }
    delete this._browserRequest;
  },

  // @see RFC 6749 section 4.1.2: Authorization Response
  onAuthorizationReceived(aURL) {
    this.log.info("OAuth2 authorization received: url=" + aURL);
    let params = new URLSearchParams(aURL.split("?", 2)[1]);
    if (params.has("code")) {
      this.requestAccessToken(params.get("code"), false);
    } else {
      this.onAuthorizationFailed(null, aURL);
    }
  },

  onAuthorizationFailed(aError, aData) {
    this.connectFailureCallback(aData);
  },

  /**
   * Request a new access token, or refresh an existing one.
   * @param {string} aCode - The token issued to the client.
   * @param {boolean} aRefresh - Whether it's a refresh of a token or not.
   */
  requestAccessToken(aCode, aRefresh) {
    // @see RFC 6749 section 4.1.3. Access Token Request
    // @see RFC 6749 section 6. Refreshing an Access Token

    let data = new URLSearchParams();
    data.append("client_id", this.clientId);
    if (this.consumerSecret !== null) {
      // Section 2.3.1. of RFC 6749 states that empty secrets MAY be omitted
      // by the client. This OAuth implementation delegates this decision to
      // the caller: If the secret is null, it will be omitted.
      data.append("client_secret", this.consumerSecret);
    }

    if (aRefresh) {
      this.log.info(
        `Making a refresh request to the token endpoint: ${this.tokenEndpoint}`
      );
      data.append("grant_type", "refresh_token");
      data.append("refresh_token", aCode);
    } else {
      this.log.info(
        `Making access token request to the token endpoint: ${this.tokenEndpoint}`
      );
      data.append("grant_type", "authorization_code");
      data.append("code", aCode);
      data.append("redirect_uri", this.redirectionEndpoint);
    }

    fetch(this.tokenEndpoint, {
      method: "POST",
      cache: "no-cache",
      body: data,
    })
      .then(response => response.json())
      .then(result => {
        let resultStr = JSON.stringify(result, null, 2);
        if ("error" in result) {
          // RFC 6749 section 5.2. Error Response
          this.log.info(
            `The authorization server returned an error response: ${resultStr}`
          );
          // Typically in production this would be {"error": "invalid_grant"}.
          // That is, the token expired or was revoked (user changed password?).
          // Reset the tokens we have and call success so that the auth flow
          // will be re-triggered.
          this.accessToken = null;
          this.refreshToken = null;
          this.connectSuccessCallback();
          return;
        }

        // RFC 6749 section 5.1. Successful Response
        this.log.info(
          `Successful response from the authorization server: ${resultStr}`
        );
        this.accessToken = result.access_token;
        if ("refresh_token" in result) {
          this.refreshToken = result.refresh_token;
        }
        if ("expires_in" in result) {
          this.tokenExpires = new Date().getTime() + result.expires_in * 1000;
        } else {
          this.tokenExpires = Number.MAX_VALUE;
        }
        this.connectSuccessCallback();
      })
      .catch(err => {
        this.log.info(`Connection to authorization server failed: ${err}`);
        this.connectFailureCallback(err);
      });
  },
};
