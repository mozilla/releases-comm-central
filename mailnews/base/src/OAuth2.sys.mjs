/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides OAuth 2.0 authentication.
 *
 * @see RFC 6749
 */
import { CryptoUtils } from "resource://services-crypto/utils.sys.mjs";

// Only allow one connecting window per endpoint.
var gConnecting = {};

/**
 * Constructor for the OAuth2 object.
 *
 * @class
 * @param {?string} scope - The scope as specified by RFC 6749 Section 3.3.
 *   Will not be included in the requests if falsy.
 * @param {object} issuerDetails
 * @param {string} issuerDetails.authorizationEndpoint - The authorization
 *   endpoint as defined by RFC 6749 Section 3.1.
 * @param {string} issuerDetails.clientId - The client_id as specified by RFC
 *   6749 Section 2.3.1.
 * @param {string} issuerDetails.clientSecret - The client_secret as specified
 *   in RFC 6749 section 2.3.1. Will not be included in the requests if null.
 * @param {boolean} issuerDetails.usePKCE - Whether to use PKCE as specified
 *   in RFC 7636 during the oauth registration process
 * @param {string} issuerDetails.redirectionEndpoint - The redirect_uri as
 *   specified by RFC 6749 section 3.1.2.
 * @param {string} issuerDetails.tokenEndpoint - The token endpoint as defined
 *   by RFC 6749 Section 3.2.
 */
export function OAuth2(scope, issuerDetails) {
  this.scope = scope;
  this.authorizationEndpoint = issuerDetails.authorizationEndpoint;
  this.clientId = issuerDetails.clientId;
  this.consumerSecret = issuerDetails.clientSecret || null;
  this.usePKCE = issuerDetails.usePKCE;
  this.redirectionEndpoint =
    issuerDetails.redirectionEndpoint || "http://localhost";
  this.tokenEndpoint = issuerDetails.tokenEndpoint;

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
  requestWindowURI: "chrome://messenger/content/browserRequest.xhtml",
  requestWindowFeatures: "chrome,centerscreen,width=980,height=750",
  requestWindowTitle: "",
  scope: null,
  usePKCE: false,
  codeChallenge: null,

  accessToken: null,
  refreshToken: null,
  tokenExpires: 0,

  _isRetrying: false,

  /**
   * Obtain an access token for this endpoint. If an access token has already
   * been obtained, it will be reused unless `aRefresh` is true.
   *
   * @param {boolean} aWithUI - If UI can be shown to the user for logging in.
   * @param {boolean} aRefresh - If any existing access token should be
   *   ignored and a new one obtained.
   * @returns {Promise} - Resolves when authorisation is complete and an
   *   access token is available.
   */
  connect(aWithUI, aRefresh) {
    if (this.accessToken && !this.tokenExpired && !aRefresh) {
      return this._promise;
    }

    const { promise, resolve, reject } = Promise.withResolvers();
    this._promise = promise;
    this._resolve = resolve;
    this._reject = reject;

    if (this.refreshToken) {
      this.requestAccessToken(this.refreshToken, true);
    } else if (!aWithUI) {
      this._reject('{ "error": "auth_noui" }');
    } else if (gConnecting[this.authorizationEndpoint]) {
      this._reject("Window already open");
    } else {
      this.requestAuthorization();
    }

    return this._promise;
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
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectionEndpoint,
    });

    // The scope is optional.
    if (this.scope) {
      params.append("scope", this.scope);
    }

    // See rfc7636
    if (this.usePKCE) {
      // Convert base64 to base64url (rfc4648#section-5)
      const to_b64url = b =>
        b.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

      params.append("code_challenge_method", "S256");

      // rfc7636#section-4.1
      //  code_verifier = high-entropy cryptographic random STRING ... with a minimum
      //  length of 43 characters and a maximum length of 128 characters.
      const code_verifier = to_b64url(
        btoa(CryptoUtils.generateRandomBytesLegacy(64))
      );
      this.codeVerifier = code_verifier;

      // rfc7636#section-4.2
      //  code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
      const code_challenge = to_b64url(CryptoUtils.sha256Base64(code_verifier));
      params.append("code_challenge", code_challenge);
    }

    for (const [name, value] of this.extraAuthParams) {
      if (value) {
        params.append(name, value);
      }
    }

    const authEndpointURI =
      this.authorizationEndpoint + "?" + params.toString();
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

          onStateChange(aWebProgress, aRequest, aStateFlags) {
            const wpl = Ci.nsIWebProgressListener;
            if (aStateFlags & (wpl.STATE_START | wpl.STATE_IS_NETWORK)) {
              const channel = aRequest.QueryInterface(Ci.nsIChannel);
              this._checkForRedirect(channel.URI.spec);
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

    const windowPrivacy = Services.prefs.getBoolPref(
      "mailnews.oauth.usePrivateBrowser",
      false
    )
      ? "private"
      : "non-private";
    const windowFeatures = `${this.requestWindowFeatures},${windowPrivacy}`;

    this.wrappedJSObject = this._browserRequest;
    gConnecting[this.authorizationEndpoint] = true;
    Services.ww.openWindow(
      null,
      this.requestWindowURI,
      null,
      windowFeatures,
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

  /**
   * @param {string} aURL - Redirection URI with additional parameters.
   */
  onAuthorizationReceived(aURL) {
    this.log.info("OAuth2 authorization response received: url=" + aURL);
    const url = new URL(aURL);
    if (url.searchParams.has("code")) {
      // @see RFC 6749 section 4.1.2: Authorization Response
      this.requestAccessToken(url.searchParams.get("code"), false);
    } else {
      // @see RFC 6749 section 4.1.2.1: Error Response
      if (url.searchParams.has("error")) {
        const error = url.searchParams.get("error");
        let errorDescription = url.searchParams.get("error_description") || "";
        if (error == "invalid_scope") {
          errorDescription += ` Invalid scope: ${this.scope}.`;
        }
        if (url.searchParams.has("error_uri")) {
          errorDescription += ` See ${url.searchParams.get("error_uri")}.`;
        }
        this.log.error(`Authorization error [${error}]: ${errorDescription}`);
      }
      this.onAuthorizationFailed(null, aURL);
    }
  },

  onAuthorizationFailed(aError, aData) {
    this._reject(aData);
  },

  /**
   * Request a new access token, or refresh an existing one.
   *
   * @param {string} aCode - The token issued to the client.
   * @param {boolean} aRefresh - Whether it's a refresh of a token or not.
   */
  requestAccessToken(aCode, aRefresh) {
    // @see RFC 6749 section 4.1.3. Access Token Request
    // @see RFC 6749 section 6. Refreshing an Access Token

    const data = new URLSearchParams();
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
      if (this.usePKCE) {
        data.append("code_verifier", this.codeVerifier);
      }
    }

    fetch(this.tokenEndpoint, {
      method: "POST",
      cache: "no-cache",
      body: data,
    })
      .then(response => response.json())
      .then(result => {
        const resultStr = JSON.stringify(result);
        if ("error" in result) {
          // RFC 6749 section 5.2. Error Response
          let err = result.error;
          if ("error_description" in result) {
            err += "; " + result.error_description;
          }
          if ("error_uri" in result) {
            err += "; " + result.error_uri;
          }
          this.log.warn(`Error response from the authorization server: ${err}`);
          this.log.info(`Error response details: ${resultStr}`);

          // Typically in production this would be {"error": "invalid_grant"}.
          // That is, the token expired or was revoked (user changed password?).
          this.accessToken = null;
          this.refreshToken = null;
          if (result.error == "invalid_grant" && !this._isRetrying) {
            // Retry the auth flow once, otherwise give up.
            this._isRetrying = true;
            this.requestAuthorization();
          } else {
            this._isRetrying = false;
            this._reject(err);
          }
          return;
        }

        this._isRetrying = false;

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
        if ("scope" in result && this.scope != result.scope) {
          const deltaScope = this.scope
            .split(" ")
            .some(s => !result.scope.includes(s));
          if (deltaScope) {
            this.log.warn(
              `Scope "${this.scope}" was requested, but "${result.scope}" was granted`
            );
          }
          this.scope = result.scope;
        }
        this._resolve();
      })
      .catch(err => {
        this.log.info(`Connection to authorization server failed: ${err}`);
        this._reject(err);
      });
  },
};
