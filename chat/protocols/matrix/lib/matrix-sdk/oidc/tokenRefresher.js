"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OidcTokenRefresher = void 0;
var _oidcClientTs = require("oidc-client-ts");
var _authorize = require("./authorize");
var _discovery = require("./discovery");
var _logger = require("../logger");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2023 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/**
 * @experimental
 * Class responsible for refreshing OIDC access tokens
 *
 * Client implementations will likely want to override {@link persistTokens} to persist tokens after successful refresh
 *
 */
class OidcTokenRefresher {
  constructor(
  /**
   * Delegated auth config as found in matrix client .well-known
   */
  authConfig,
  /**
   * id of this client as registered with the OP
   */
  clientId,
  /**
   * redirectUri as registered with OP
   */
  redirectUri,
  /**
   * Device ID of current session
   */
  deviceId,
  /**
   * idTokenClaims as returned from authorization grant
   * used to validate tokens
   */
  idTokenClaims) {
    this.idTokenClaims = idTokenClaims;
    /**
     * Promise which will complete once the OidcClient has been initialised
     * and is ready to start refreshing tokens.
     *
     * Will reject if the client initialisation fails.
     */
    _defineProperty(this, "oidcClientReady", void 0);
    _defineProperty(this, "oidcClient", void 0);
    _defineProperty(this, "inflightRefreshRequest", void 0);
    this.oidcClientReady = this.initialiseOidcClient(authConfig, clientId, deviceId, redirectUri);
  }
  async initialiseOidcClient(authConfig, clientId, deviceId, redirectUri) {
    try {
      const config = await (0, _discovery.discoverAndValidateAuthenticationConfig)(authConfig);
      const scope = (0, _authorize.generateScope)(deviceId);
      this.oidcClient = new _oidcClientTs.OidcClient(_objectSpread(_objectSpread({}, config.metadata), {}, {
        client_id: clientId,
        scope,
        redirect_uri: redirectUri,
        authority: config.metadata.issuer,
        stateStore: new _oidcClientTs.WebStorageStateStore({
          prefix: "mx_oidc_",
          store: window.sessionStorage
        })
      }));
    } catch (error) {
      _logger.logger.error("Failed to initialise OIDC client.", error);
      throw new Error("Failed to initialise OIDC client.");
    }
  }

  /**
   * Attempt token refresh using given refresh token
   * @param refreshToken - refresh token to use in request with token issuer
   * @returns tokens - Promise that resolves with new access and refresh tokens
   * @throws when token refresh fails
   */
  async doRefreshAccessToken(refreshToken) {
    if (!this.inflightRefreshRequest) {
      this.inflightRefreshRequest = this.getNewTokens(refreshToken);
    }
    try {
      const tokens = await this.inflightRefreshRequest;
      return tokens;
    } finally {
      this.inflightRefreshRequest = undefined;
    }
  }

  /**
   * Persist the new tokens, called after tokens are successfully refreshed.
   *
   * This function is intended to be overriden by the consumer when persistence is necessary.
   *
   * @param accessToken - new access token
   * @param refreshToken - OPTIONAL new refresh token
   */
  async persistTokens(_tokens) {
    // NOOP
  }
  async getNewTokens(refreshToken) {
    if (!this.oidcClient) {
      throw new Error("Cannot get new token before OIDC client is initialised.");
    }
    const refreshTokenState = {
      refresh_token: refreshToken,
      session_state: "test",
      data: undefined,
      profile: this.idTokenClaims
    };
    const response = await this.oidcClient.useRefreshToken({
      state: refreshTokenState,
      timeoutInSeconds: 300
    });
    const tokens = {
      accessToken: response.access_token,
      refreshToken: response.refresh_token
    };
    await this.persistTokens(tokens);
    return tokens;
  }
}
exports.OidcTokenRefresher = OidcTokenRefresher;