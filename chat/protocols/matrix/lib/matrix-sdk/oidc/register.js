"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.registerOidcClient = exports.DEVICE_CODE_SCOPE = void 0;
var _error = require("./error.js");
var _index = require("../http-api/index.js");
var _logger = require("../logger.js");
/*
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
 * Client metadata passed to registration endpoint
 */

/**
 * Request body for dynamic registration as defined by https://github.com/matrix-org/matrix-spec-proposals/pull/2966
 */

const DEVICE_CODE_SCOPE = exports.DEVICE_CODE_SCOPE = "urn:ietf:params:oauth:grant-type:device_code";

/**
 * Attempts dynamic registration against the configured registration endpoint
 * @param delegatedAuthConfig - Auth config from {@link discoverAndValidateOIDCIssuerWellKnown}
 * @param clientMetadata - The metadata for the client which to register
 * @returns Promise<string> resolved with registered clientId
 * @throws when registration is not supported, on failed request or invalid response
 */
const registerOidcClient = async (delegatedAuthConfig, clientMetadata) => {
  if (!delegatedAuthConfig.registrationEndpoint) {
    throw new Error(_error.OidcError.DynamicRegistrationNotSupported);
  }
  const grantTypes = ["authorization_code", "refresh_token"];
  if (grantTypes.some(scope => !delegatedAuthConfig.metadata.grant_types_supported.includes(scope))) {
    throw new Error(_error.OidcError.DynamicRegistrationNotSupported);
  }

  // https://openid.net/specs/openid-connect-registration-1_0.html
  const metadata = {
    client_name: clientMetadata.clientName,
    client_uri: clientMetadata.clientUri,
    response_types: ["code"],
    grant_types: grantTypes,
    redirect_uris: clientMetadata.redirectUris,
    id_token_signed_response_alg: "RS256",
    token_endpoint_auth_method: "none",
    application_type: clientMetadata.applicationType,
    logo_uri: clientMetadata.logoUri,
    contacts: clientMetadata.contacts,
    policy_uri: clientMetadata.policyUri,
    tos_uri: clientMetadata.tosUri
  };
  const headers = {
    "Accept": "application/json",
    "Content-Type": "application/json"
  };
  try {
    const response = await fetch(delegatedAuthConfig.registrationEndpoint, {
      method: _index.Method.Post,
      headers,
      body: JSON.stringify(metadata)
    });
    if (response.status >= 400) {
      throw new Error(_error.OidcError.DynamicRegistrationFailed);
    }
    const body = await response.json();
    const clientId = body["client_id"];
    if (!clientId || typeof clientId !== "string") {
      throw new Error(_error.OidcError.DynamicRegistrationInvalid);
    }
    return clientId;
  } catch (error) {
    if (Object.values(_error.OidcError).includes(error.message)) {
      throw error;
    } else {
      _logger.logger.error("Dynamic registration request failed", error);
      throw new Error(_error.OidcError.DynamicRegistrationFailed);
    }
  }
};
exports.registerOidcClient = registerOidcClient;