"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.generateScope = exports.generateOidcAuthorizationUrl = exports.generateAuthorizationUrl = exports.generateAuthorizationParams = exports.completeAuthorizationCodeGrant = void 0;
var _oidcClientTs = require("oidc-client-ts");
var _crypto = require("../crypto/crypto");
var _logger = require("../logger");
var _randomstring = require("../randomstring");
var _error = require("./error");
var _validate = require("./validate");
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
// reexport for backwards compatibility

/**
 * Authorization parameters which are used in the authentication request of an OIDC auth code flow.
 *
 * See https://openid.net/specs/openid-connect-basic-1_0.html#RequestParameters.
 */

/**
 * @experimental
 * Generate the scope used in authorization request with OIDC OP
 * @returns scope
 */
const generateScope = deviceId => {
  const safeDeviceId = deviceId ?? (0, _randomstring.randomString)(10);
  return `openid urn:matrix:org.matrix.msc2967.client:api:* urn:matrix:org.matrix.msc2967.client:device:${safeDeviceId}`;
};

// https://www.rfc-editor.org/rfc/rfc7636
exports.generateScope = generateScope;
const generateCodeChallenge = async codeVerifier => {
  if (!_crypto.subtleCrypto) {
    // @TODO(kerrya) should this be allowed? configurable?
    _logger.logger.warn("A secure context is required to generate code challenge. Using plain text code challenge");
    return codeVerifier;
  }
  const utf8 = new _crypto.TextEncoder().encode(codeVerifier);
  const digest = await _crypto.subtleCrypto.digest("SHA-256", utf8);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
};

/**
 * Generate authorization params to pass to {@link generateAuthorizationUrl}.
 *
 * Used as part of an authorization code OIDC flow: see https://openid.net/specs/openid-connect-basic-1_0.html#CodeFlow.
 *
 * @param redirectUri - absolute url for OP to redirect to after authorization
 * @returns AuthorizationParams
 */
const generateAuthorizationParams = ({
  redirectUri
}) => ({
  scope: generateScope(),
  redirectUri,
  state: (0, _randomstring.randomString)(8),
  nonce: (0, _randomstring.randomString)(8),
  codeVerifier: (0, _randomstring.randomString)(64) // https://tools.ietf.org/html/rfc7636#section-4.1 length needs to be 43-128 characters
});

/**
 * @deprecated use generateOidcAuthorizationUrl
 * Generate a URL to attempt authorization with the OP
 * See https://openid.net/specs/openid-connect-basic-1_0.html#CodeRequest
 * @param authorizationUrl - endpoint to attempt authorization with the OP
 * @param clientId - id of this client as registered with the OP
 * @param authorizationParams - params to be used in the url
 * @returns a Promise with the url as a string
 */
exports.generateAuthorizationParams = generateAuthorizationParams;
const generateAuthorizationUrl = async (authorizationUrl, clientId, {
  scope,
  redirectUri,
  state,
  nonce,
  codeVerifier
}) => {
  const url = new URL(authorizationUrl);
  url.searchParams.append("response_mode", "query");
  url.searchParams.append("response_type", "code");
  url.searchParams.append("redirect_uri", redirectUri);
  url.searchParams.append("client_id", clientId);
  url.searchParams.append("state", state);
  url.searchParams.append("scope", scope);
  url.searchParams.append("nonce", nonce);
  url.searchParams.append("code_challenge_method", "S256");
  url.searchParams.append("code_challenge", await generateCodeChallenge(codeVerifier));
  return url.toString();
};

/**
 * @experimental
 * Generate a URL to attempt authorization with the OP
 * See https://openid.net/specs/openid-connect-basic-1_0.html#CodeRequest
 * @param metadata - validated metadata from OP discovery
 * @param clientId - this client's id as registered with the OP
 * @param homeserverUrl - used to establish the session on return from the OP
 * @param identityServerUrl - used to establish the session on return from the OP
 * @param nonce - state
 * @param prompt - indicates to the OP which flow the user should see - eg login or registration
 *          See https://openid.net/specs/openid-connect-prompt-create-1_0.html#name-prompt-parameter
 * @param urlState - value to append to the opaque state identifier to uniquely identify the callback
 * @returns a Promise with the url as a string
 */
exports.generateAuthorizationUrl = generateAuthorizationUrl;
const generateOidcAuthorizationUrl = async ({
  metadata,
  redirectUri,
  clientId,
  homeserverUrl,
  identityServerUrl,
  nonce,
  prompt,
  urlState
}) => {
  const scope = generateScope();
  const oidcClient = new _oidcClientTs.OidcClient(_objectSpread(_objectSpread({}, metadata), {}, {
    client_id: clientId,
    redirect_uri: redirectUri,
    authority: metadata.issuer,
    response_mode: "query",
    response_type: "code",
    scope,
    stateStore: new _oidcClientTs.WebStorageStateStore({
      prefix: "mx_oidc_",
      store: window.sessionStorage
    })
  }));
  const userState = {
    homeserverUrl,
    nonce,
    identityServerUrl
  };
  const request = await oidcClient.createSigninRequest({
    state: userState,
    nonce,
    prompt,
    url_state: urlState
  });
  return request.url;
};

/**
 * Normalize token_type to use capital case to make consuming the token response easier
 * token_type is case insensitive, and it is spec-compliant for OPs to return token_type: "bearer"
 * Later, when used in auth headers it is case sensitive and must be Bearer
 * See: https://datatracker.ietf.org/doc/html/rfc6749#section-4.1.4
 *
 * @param response - validated token response
 * @returns response with token_type set to 'Bearer'
 */
exports.generateOidcAuthorizationUrl = generateOidcAuthorizationUrl;
const normalizeBearerTokenResponseTokenType = response => ({
  id_token: response.id_token,
  scope: response.scope,
  expires_at: response.expires_at,
  refresh_token: response.refresh_token,
  access_token: response.access_token,
  token_type: "Bearer"
});

/**
 * @experimental
 * Attempt to exchange authorization code for bearer token.
 *
 * Takes the authorization code returned by the OpenID Provider via the authorization URL, and makes a
 * request to the Token Endpoint, to obtain the access token, refresh token, etc.
 *
 * @param code - authorization code as returned by OP during authorization
 * @param storedAuthorizationParams - stored params from start of oidc login flow
 * @returns valid bearer token response
 * @throws An `Error` with `message` set to an entry in {@link OidcError},
 *      when the request fails, or the returned token response is invalid.
 */
const completeAuthorizationCodeGrant = async (code, state) => {
  /**
   * Element Web strips and changes the url on starting the app
   * Use the code and state from query params to rebuild a url
   * so that oidc-client can parse it
   */
  const reconstructedUrl = new URL(window.location.origin);
  reconstructedUrl.searchParams.append("code", code);
  reconstructedUrl.searchParams.append("state", state);

  // set oidc-client to use our logger
  _oidcClientTs.Log.setLogger(_logger.logger);
  try {
    const response = new _oidcClientTs.SigninResponse(reconstructedUrl.searchParams);
    const stateStore = new _oidcClientTs.WebStorageStateStore({
      prefix: "mx_oidc_",
      store: window.sessionStorage
    });

    // retrieve the state we put in storage at the start of oidc auth flow
    const stateString = await stateStore.get(response.state);
    if (!stateString) {
      throw new Error(_error.OidcError.MissingOrInvalidStoredState);
    }

    // hydrate the sign in state and create a client
    // the stored sign in state includes oidc configuration we set at the start of the oidc login flow
    const signInState = await _oidcClientTs.SigninState.fromStorageString(stateString);
    const client = new _oidcClientTs.OidcClient(_objectSpread(_objectSpread({}, signInState), {}, {
      stateStore
    }));

    // validate the code and state, and attempt to swap the code for tokens
    const signinResponse = await client.processSigninResponse(reconstructedUrl.href);

    // extra values we stored at the start of the login flow
    // used to complete login in the client
    const userState = signinResponse.userState;
    (0, _validate.validateStoredUserState)(userState);

    // throws when response is invalid
    (0, _validate.validateBearerTokenResponse)(signinResponse);
    // throws when token is invalid
    (0, _validate.validateIdToken)(signinResponse.id_token, client.settings.authority, client.settings.client_id, userState.nonce);
    const normalizedTokenResponse = normalizeBearerTokenResponseTokenType(signinResponse);
    return {
      oidcClientSettings: {
        clientId: client.settings.client_id,
        issuer: client.settings.authority
      },
      tokenResponse: normalizedTokenResponse,
      homeserverUrl: userState.homeserverUrl,
      identityServerUrl: userState.identityServerUrl,
      idTokenClaims: signinResponse.profile
    };
  } catch (error) {
    _logger.logger.error("Oidc login failed", error);
    const errorType = error.message;

    // rethrow errors that we recognise
    if (Object.values(_error.OidcError).includes(errorType)) {
      throw error;
    }
    throw new Error(_error.OidcError.CodeExchangeFailed);
  }
};
exports.completeAuthorizationCodeGrant = completeAuthorizationCodeGrant;