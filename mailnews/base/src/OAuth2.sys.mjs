/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Provides OAuth 2.0 authentication.
 *
 * @see RFC 6749
 */
import { CryptoUtils } from "moz-src:///services/crypto/modules/utils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";
import { openLinkExternally } from "resource:///modules/LinkHelper.sys.mjs";

const lazy = {};
ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["messenger/messenger.ftl"], true)
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "useExternalBrowser",
  "mailnews.oauth.useExternalBrowser"
);

const log = console.createInstance({
  prefix: "mailnews.oauth",
  maxLogLevel: "Warn",
  maxLogLevelPref: "mailnews.oauth.loglevel",
});

// Only allow one connecting window per endpoint.
var gConnecting = {};

/**
 * @param {string} base64 - Data encoded in base64.
 * @returns {string} - The same encoded data, but with standard substitutions
 *   for URL safety.
 */
function toBase64URL(base64) {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

/**
 * @param {number} byteLength - Length of the token in bytes.
 * @returns {string} - Returns a URL-valid base64 endcoding of the token.
 */
function generateRandomURLToken(byteLength) {
  const bytes = CryptoUtils.generateRandomBytes(byteLength);
  return ChromeUtils.base64URLEncode(bytes, { pad: false });
}

/**
 * @param {string} redirectURI
 * @returns {boolean}
 */
function isLoopbackHttpRedirect(redirectURI) {
  try {
    const uri = Services.io.newURI(redirectURI);
    if (!uri.schemeIs("http")) {
      return false;
    }

    const principal = Services.scriptSecurityManager.createContentPrincipal(
      uri,
      {}
    );
    return principal.isLoopbackHost;
  } catch (e) {
    return false;
  }
}

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

  if (issuerDetails.builtIn) {
    this.telemetryData.issuer = issuerDetails.name;
  }
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
  request: null,

  telemetryData: {},

  _isRetrying: false,
  _authorizationState: null,
  _requestRedirectURI: null,

  /**
   * Obtain an access token for this endpoint. If an access token has already
   * been obtained, it will be reused unless `aRefresh` is true.
   *
   * @param {boolean} aWithUI - If UI can be shown to the user for logging in.
   * @param {boolean} aRefresh - If any existing access token should be
   *   ignored and a new one obtained.
   * @returns {Promise} - Resolves when authorization is complete and an
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
      this.telemetryData.reason = aRefresh ? "refresh" : "no refresh token";
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
    const authEndpointURL = new URL(this.authorizationEndpoint);

    authEndpointURL.searchParams.append("response_type", "code");
    authEndpointURL.searchParams.append("client_id", this.clientId);

    // The scope is optional.
    if (this.scope) {
      authEndpointURL.searchParams.append("scope", this.scope);
    }

    this._authorizationState = generateRandomURLToken(32);
    authEndpointURL.searchParams.append("state", this._authorizationState);

    // See rfc7636
    if (this.usePKCE) {
      authEndpointURL.searchParams.append("code_challenge_method", "S256");

      // rfc7636#section-4.1
      //  code_verifier = high-entropy cryptographic random STRING ... with a minimum
      //  length of 43 characters and a maximum length of 128 characters.
      const code_verifier = generateRandomURLToken(64);
      this.codeVerifier = code_verifier;

      // rfc7636#section-4.2
      //  code_challenge = BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))
      const code_challenge = toBase64URL(
        CryptoUtils.sha256Base64(code_verifier)
      );
      authEndpointURL.searchParams.append("code_challenge", code_challenge);
    }

    for (const [name, value] of this.extraAuthParams) {
      if (value) {
        authEndpointURL.searchParams.append(name, value);
      }
    }

    log.info(
      "Interacting with the resource owner to obtain an authorization grant " +
        "from the authorization endpoint: " +
        authEndpointURL.toString()
    );

    if (
      lazy.useExternalBrowser &&
      isLoopbackHttpRedirect(this.redirectionEndpoint)
    ) {
      this.telemetryData.where = "external";
      this.request = new ExternalRequest(this);
      if (!this.request.startLoopbackRedirectListener()) {
        this.finishAuthorizationRequest();
        this.onAuthorizationFailed(
          Cr.NS_ERROR_FAILURE,
          '{ "error": "invalid_redirect" }',
          "localhost listener init failed"
        );
        return;
      }
    } else {
      this.telemetryData.where = "internal";
      this.request = new InternalRequest(this);
    }
    this._requestRedirectURI = this.request.redirectURI;
    authEndpointURL.searchParams.append(
      "redirect_uri",
      this.request.redirectURI
    );

    if (!this.request.start(authEndpointURL)) {
      this.finishAuthorizationRequest();
      // Only the ExternalRequest construction is fallible here.
      this.onAuthorizationFailed(
        Cr.NS_ERROR_FAILURE,
        '{ "error": "external_browser_launch_failed" }',
        "external browser launch failure"
      );
    }
  },
  finishAuthorizationRequest() {
    gConnecting[this.authorizationEndpoint] = false;
    if (this.request) {
      this.request.close();
      this.request = null;
    }
  },

  /**
   * @param {string} aURL - Redirection URI with additional parameters.
   */
  onAuthorizationReceived(aURL) {
    log.info("OAuth2 authorization response received: url=" + aURL);
    const url = new URL(aURL);
    // Check the state param matches the value we created earlier.
    const expectedState = this._authorizationState;
    this._authorizationState = null;
    if (expectedState && url.searchParams.get("state") !== expectedState) {
      this.onAuthorizationFailed(
        Cr.NS_ERROR_FAILURE,
        '{ "error": "invalid_state" }',
        "state mismatch"
      );
      return;
    }
    if (url.searchParams.has("code")) {
      // @see RFC 6749 section 4.1.2: Authorization Response
      this.requestAccessToken(url.searchParams.get("code"), false);
    } else {
      // @see RFC 6749 section 4.1.2.1: Error Response
      let reason = "authorization failed";
      if (url.searchParams.has("error")) {
        const error = url.searchParams.get("error");
        let errorDescription = url.searchParams.get("error_description") || "";
        if (error == "invalid_scope") {
          errorDescription += ` Invalid scope: ${this.scope}.`;
          reason = "invalid scope";
        }
        if (url.searchParams.has("error_uri")) {
          errorDescription += ` See ${url.searchParams.get("error_uri")}.`;
        }
        log.error(`Authorization error [${error}]: ${errorDescription}`);
      }
      this.onAuthorizationFailed(null, aURL, reason);
    }
  },

  onAuthorizationFailed(aError, aData, aTelemetryReason) {
    this.recordTelemetry(aTelemetryReason);
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
      log.info(
        `Making a refresh request to the token endpoint: ${this.tokenEndpoint}`
      );
      data.append("grant_type", "refresh_token");
      data.append("refresh_token", aCode);
    } else {
      log.info(
        `Making access token request to the token endpoint: ${this.tokenEndpoint}`
      );
      data.append("grant_type", "authorization_code");
      data.append("code", aCode);
      data.append(
        "redirect_uri",
        this._requestRedirectURI || this.redirectionEndpoint
      );
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
          log.warn(`Error response from the authorization server: ${err}`);
          log.info(`Error response details: ${resultStr}`);

          // Typically in production this would be {"error": "invalid_grant"}.
          // That is, the token expired or was revoked (user changed password?).
          this.accessToken = null;
          this.refreshToken = null;
          if (result.error == "invalid_grant" && !this._isRetrying) {
            // Retry the auth flow once, otherwise give up. "invalid_grant"
            // typically (but not always) means the refresh token was bad.
            this.telemetryData.reason = "invalid grant";
            this._isRetrying = true;
            this.requestAuthorization();
          } else {
            this.recordTelemetry(
              this._isRetrying ? "failed after retrying" : "failed"
            );
            this._isRetrying = false;
            this._reject(err);
          }
          return;
        }

        this._isRetrying = false;

        // RFC 6749 section 5.1. Successful Response
        log.info(
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
          const returnedScopes = result.scope.split(" ");

          // If we are dealing with Microsoft, and offline_access is missing, add it to the check
          if (
            this.tokenEndpoint.startsWith(
              "https://login.microsoftonline.com/"
            ) &&
            !returnedScopes.includes("offline_access")
          ) {
            returnedScopes.push("offline_access");
          }
          const deltaScope = this.scope
            .split(" ")
            .some(s => !returnedScopes.includes(s));
          if (deltaScope) {
            log.warn(
              `Scope "${this.scope}" was requested, but "${result.scope}" was granted.`
            );
          }
          this.scope = returnedScopes.join(" ");
        }

        this.recordTelemetry("succeeded");
        this._resolve();
      })
      .catch(err => {
        this.recordTelemetry("connection failed");
        log.info(`Connection to authorization server failed: ${err}`);
        this._reject(err);
      });
  },

  /**
   * Record opening the authentication window in telemetry.
   *
   * @param {string} result - If this authentication succeeded, or why it failed.
   */
  recordTelemetry(result) {
    // If there is no value for the issuer (i.e. it isn't from the data in
    // OAuth2Providers), or no reason given (we didn't open the window),
    // nothing is recorded.
    if (this.telemetryData.issuer && this.telemetryData.reason) {
      Glean.mail.oauth2Authentication.record({ ...this.telemetryData, result });
      delete this.telemetryData.reason;
    }
  },
};

class InternalRequest {
  /**
   * Constructor for internal requests using Thunderbird's browser.
   *
   * @param {OAuth2} oauth
   */
  constructor(oauth) {
    this.oauth = oauth;
    this.url = "";
    this.redirectURI = oauth.redirectionEndpoint;
    this.iconURI = "";
    this._active = true;
    this._listener = null;
  }

  /**
   * @param {URL} authEndpointURL - Authorization endpoint, with params.
   * @returns {boolean}
   */
  start(authEndpointURL) {
    this.url = authEndpointURL.href;
    gConnecting[this.oauth.authorizationEndpoint] = true;

    const windowPrivacy = Services.prefs.getBoolPref(
      "mailnews.oauth.usePrivateBrowser",
      false
    )
      ? "private"
      : "non-private";
    const windowFeatures = `${this.oauth.requestWindowFeatures},${windowPrivacy}`;

    Services.ww.openWindow(
      null,
      this.oauth.requestWindowURI,
      null,
      windowFeatures,
      { wrappedJSObject: this }
    );
    return true;
  }

  /**
   * The request has completed and can be closed.
   */
  close() {
    this._active = false;
    this._listener?._cleanUp();
  }

  /**
   * The request was cancelled, finish and abort.
   */
  cancelled() {
    if (!this._active) {
      return;
    }

    this.oauth.finishAuthorizationRequest();
    this.oauth.onAuthorizationFailed(
      Cr.NS_ERROR_ABORT,
      '{ "error": "cancelled" }',
      "cancelled"
    );
  }

  /**
   * The auth endpoint URL loaded in the window, start listening for redirects.
   *
   * @param {Window} aWindow
   * @param {nsIWebProgress} aWebProgress
   */
  loaded(aWindow, aWebProgress) {
    if (!this._active) {
      return;
    }

    this._listener = {
      window: aWindow,
      webProgress: aWebProgress,
      _oauth: this.oauth,
      redirectURI: this.redirectURI,

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
        if (!url.startsWith(this.redirectURI)) {
          return;
        }

        this._oauth.finishAuthorizationRequest();
        this._oauth.onAuthorizationReceived(url);
      },

      onStateChange(webProgress, aRequest, aStateFlags) {
        if (
          aStateFlags &
          (Ci.nsIWebProgressListener.STATE_START |
            Ci.nsIWebProgressListener.STATE_IS_NETWORK)
        ) {
          const channel = aRequest.QueryInterface(Ci.nsIChannel);
          this._checkForRedirect(channel.URI.spec);
        }
      },
      onLocationChange(webProgress, aRequest, aLocation) {
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
    aWindow.document.title = this.oauth.requestWindowTitle;
  }
}

class ExternalRequest {
  /**
   * Constructor for external requests using the system web browser. The object
   * should not be used until `startLoopbackRedirectListener` is called.
   *
   * @param {OAuth2} oauth
   */
  constructor(oauth) {
    this.oauth = oauth;
    this.redirectURI = oauth.redirectionEndpoint;
    this._loopbackRedirectListener = null;
    this._active = true;
  }

  /**
   * @param {URL} authEndpointURL - Authorization endpoint, with params.
   * @returns {boolean} - True on success, false if the browser fails to launch.
   */
  start(authEndpointURL) {
    const authURI = Services.io.newURI(authEndpointURL.href);
    openLinkExternally(authURI, { addToHistory: false });

    // Normally, we'd do the following:
    // gConnecting[this.oauth.authorizationEndpoint] = true;
    // But because we can't tell if the tab closes with no interaction, doing
    // so could lock out any future OAuth requests.
    return true;
  }

  /**
   * The request has completed and can be closed.
   */
  close() {
    this._active = false;
    this.closeLoopbackRedirectListener();
  }

  /**
   * Close and clear the current loopback listener, if any.
   */
  closeLoopbackRedirectListener() {
    if (this._loopbackRedirectListener) {
      this._loopbackRedirectListener.close();
      this._loopbackRedirectListener = null;
    }
  }

  /**
   * Start a localhost loopback listener and update this request's redirect URI.
   *
   * @returns {boolean} - True on success, false if the URI is bad or a socket
   *   can't be created.
   */
  startLoopbackRedirectListener() {
    this.closeLoopbackRedirectListener();
    let baseURI;
    try {
      baseURI = new URL(this.oauth.redirectionEndpoint);
    } catch (e) {
      return false;
    }

    let socket;
    try {
      socket = Cc["@mozilla.org/network/server-socket;1"].createInstance(
        Ci.nsIServerSocket
      );
      socket.init(-1, true, -1);
    } catch (e) {
      return false;
    }

    baseURI.port = socket.port;
    const callbackPrefix = baseURI.toString();
    const listener = {
      QueryInterface: ChromeUtils.generateQI([
        "nsIServerSocketListener",
        "nsIInputStreamCallback",
      ]),
      _oauth: this.oauth,
      _closed: false,
      _receivedRequest: false,
      _inputStream: null,
      _outputStream: null,
      _transport: null,
      _buffer: "",

      close() {
        if (this._closed) {
          return;
        }
        this._closed = true;
        if (this._inputStream) {
          this._inputStream.close();
          this._inputStream = null;
        }
        if (socket) {
          socket.close();
          socket = null;
        }

        if (this._receivedRequest) {
          // The response stream was closed in _respond().
          this._transport = null;
          return;
        }

        if (this._outputStream) {
          this._outputStream.close();
          this._outputStream = null;
        }
        if (this._transport) {
          this._transport.close(Cr.NS_OK);
          this._transport = null;
        }
      },

      _respond(statusLine, body) {
        if (!this._outputStream) {
          return;
        }
        const response =
          `HTTP/1.1 ${statusLine}\r\n` +
          "Content-Type: text/html; charset=utf-8\r\n" +
          "Cache-Control: no-store\r\n" +
          "Connection: close\r\n\r\n" +
          body;
        this._outputStream.write(response, response.length);

        // Cleanly close after the first response to ensure it's fully flushed.
        this._outputStream.close();
        this._outputStream = null;
      },

      _completeWithURL(url) {
        if (this._receivedRequest) {
          return;
        }
        this._receivedRequest = true;
        this._respond(
          "200 OK",
          `<!doctype html><html><body>${lazy.l10n.formatValueSync(
            "oauth2-loopback-success"
          )}</body></html>`
        );
        Services.tm.dispatchToMainThread(() => {
          this._oauth.finishAuthorizationRequest();
          this._oauth.onAuthorizationReceived(url);
        });
      },

      _fail() {
        if (this._receivedRequest) {
          return;
        }
        this._receivedRequest = true;
        this._respond(
          "400 Bad Request",
          `<!doctype html><html><body>${lazy.l10n.formatValueSync(
            "oauth2-loopback-failure"
          )}</body></html>`
        );
        Services.tm.dispatchToMainThread(() => {
          this._oauth.finishAuthorizationRequest();
          this._oauth.onAuthorizationFailed(
            Cr.NS_ERROR_FAILURE,
            '{ "error": "authorization_failed" }',
            "authorization failed"
          );
        });
      },

      onSocketAccepted(_socket, transport) {
        if (this._closed || this._transport) {
          transport.close(Cr.NS_ERROR_ABORT);
          return;
        }

        this._transport = transport;
        this._inputStream = transport
          .openInputStream(0, 0, 0)
          .QueryInterface(Ci.nsIAsyncInputStream);
        this._outputStream = transport.openOutputStream(0, 0, 0);
        this._inputStream.asyncWait(this, 0, 0, Services.tm.mainThread);
      },

      onStopListening() {},

      onInputStreamReady(stream) {
        const MAX_REQUEST_LINE_BYTES = 8192;

        if (this._closed || this._receivedRequest) {
          return;
        }

        let available;
        try {
          available = stream.available();
        } catch (e) {
          this._fail();
          return;
        }

        if (available <= 0) {
          stream.asyncWait(this, 0, 0, Services.tm.mainThread);
          return;
        }

        const scriptableStream = Cc[
          "@mozilla.org/scriptableinputstream;1"
        ].createInstance(Ci.nsIScriptableInputStream);
        scriptableStream.init(stream);
        this._buffer += scriptableStream.read(available);

        const requestLineEnd = this._buffer.indexOf("\r\n");
        if (requestLineEnd < 0) {
          if (this._buffer.length > MAX_REQUEST_LINE_BYTES) {
            this._fail();
            return;
          }
          stream.asyncWait(this, 0, 0, Services.tm.mainThread);
          return;
        }

        const requestLine = this._buffer.substring(0, requestLineEnd);
        const match = /^GET\s+(\S+)(?:\s|$)/.exec(requestLine);
        if (!match) {
          this._fail();
          return;
        }

        try {
          const url = new URL(match[1], callbackPrefix).toString();
          this._completeWithURL(url);
        } catch (e) {
          this._fail();
        }
      },
    };

    socket.asyncListen(listener);
    this._loopbackRedirectListener = listener;
    this.redirectURI = callbackPrefix;
    return true;
  }
}
