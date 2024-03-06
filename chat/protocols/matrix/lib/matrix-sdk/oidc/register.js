"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.registerOidcClient = void 0;
var _error = require("./error");
var _httpApi = require("../http-api");
var _logger = require("../logger");
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
 * Make the client registration request
 * @param registrationEndpoint - URL as returned from issuer ./well-known/openid-configuration
 * @param clientMetadata - registration metadata
 * @returns resolves to the registered client id when registration is successful
 * @throws An `Error` with `message` set to an entry in {@link OidcError},
 *      when the registration request fails, or the response is invalid.
 */
const doRegistration = async (registrationEndpoint, clientMetadata) => {
  // https://openid.net/specs/openid-connect-registration-1_0.html
  const metadata = {
    client_name: clientMetadata.clientName,
    client_uri: clientMetadata.clientUri,
    response_types: ["code"],
    grant_types: ["authorization_code", "refresh_token"],
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
    const response = await fetch(registrationEndpoint, {
      method: _httpApi.Method.Post,
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

/**
 * Attempts dynamic registration against the configured registration endpoint
 * @param delegatedAuthConfig - Auth config from ValidatedServerConfig
 * @param clientMetadata - The metadata for the client which to register
 * @returns Promise<string> resolved with registered clientId
 * @throws when registration is not supported, on failed request or invalid response
 */
const registerOidcClient = async (delegatedAuthConfig, clientMetadata) => {
  if (!delegatedAuthConfig.registrationEndpoint) {
    throw new Error(_error.OidcError.DynamicRegistrationNotSupported);
  }
  return doRegistration(delegatedAuthConfig.registrationEndpoint, clientMetadata);
};
exports.registerOidcClient = registerOidcClient;