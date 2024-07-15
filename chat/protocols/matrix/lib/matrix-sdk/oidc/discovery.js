"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.discoverAndValidateOIDCIssuerWellKnown = void 0;
var _oidcClientTs = require("oidc-client-ts");
var _validate = require("./validate");
var _httpApi = require("../http-api");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
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
 * Discover and validate delegated auth configuration
 * - delegated auth issuer openid-configuration is reachable
 * - delegated auth issuer openid-configuration is configured correctly for us
 * Fetches https://oidc-issuer.example.com/.well-known/openid-configuration and other files linked therein.
 * When successful, validated metadata is returned
 * @param issuer - the OIDC issuer as returned by the /auth_issuer API
 * @returns validated authentication metadata and optionally signing keys
 * @throws when delegated auth config is invalid or unreachable
 */
const discoverAndValidateOIDCIssuerWellKnown = async issuer => {
  const issuerOpenIdConfigUrl = new URL(".well-known/openid-configuration", issuer);
  const issuerWellKnownResponse = await fetch(issuerOpenIdConfigUrl, {
    method: _httpApi.Method.Get,
    signal: (0, _httpApi.timeoutSignal)(5000)
  });
  const issuerWellKnown = await issuerWellKnownResponse.json();
  const validatedIssuerConfig = (0, _validate.validateOIDCIssuerWellKnown)(issuerWellKnown);

  // create a temporary settings store, so we can use metadata service for discovery
  const settings = new _oidcClientTs.OidcClientSettingsStore({
    authority: issuer,
    redirect_uri: "",
    // Not known yet, this is here to make the type checker happy
    client_id: "" // Not known yet, this is here to make the type checker happy
  });
  const metadataService = new _oidcClientTs.MetadataService(settings);
  const metadata = await metadataService.getMetadata();
  const signingKeys = (await metadataService.getSigningKeys()) ?? undefined;
  (0, _validate.isValidatedIssuerMetadata)(metadata);
  return _objectSpread(_objectSpread({}, validatedIssuerConfig), {}, {
    metadata,
    signingKeys
  });
};
exports.discoverAndValidateOIDCIssuerWellKnown = discoverAndValidateOIDCIssuerWellKnown;