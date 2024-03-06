"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OidcError = void 0;
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
 * Errors expected to be encountered during OIDC discovery, client registration, and authentication.
 * Not intended to be displayed directly to the user.
 */
let OidcError = exports.OidcError = /*#__PURE__*/function (OidcError) {
  OidcError["NotSupported"] = "OIDC authentication not supported";
  OidcError["Misconfigured"] = "OIDC is misconfigured";
  OidcError["General"] = "Something went wrong with OIDC discovery";
  OidcError["OpSupport"] = "Configured OIDC OP does not support required functions";
  OidcError["DynamicRegistrationNotSupported"] = "Dynamic registration not supported";
  OidcError["DynamicRegistrationFailed"] = "Dynamic registration failed";
  OidcError["DynamicRegistrationInvalid"] = "Dynamic registration invalid response";
  OidcError["CodeExchangeFailed"] = "Failed to exchange code for token";
  OidcError["InvalidBearerTokenResponse"] = "Invalid bearer token response";
  OidcError["InvalidIdToken"] = "Invalid ID token";
  OidcError["MissingOrInvalidStoredState"] = "State required to finish logging in is not found in storage.";
  return OidcError;
}({});