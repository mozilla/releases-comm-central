"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SSOAction = exports.IdentityProviderBrand = exports.DELEGATED_OIDC_COMPATIBILITY = void 0;
var _NamespacedValue = require("../NamespacedValue.js");
/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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

// disable lint because these are wire responses
/* eslint-disable camelcase */

/**
 * Represents a response to the CSAPI `/refresh` endpoint.
 */

/* eslint-enable camelcase */

/**
 * Response to GET login flows as per https://spec.matrix.org/v1.3/client-server-api/#get_matrixclientv3login
 */

const DELEGATED_OIDC_COMPATIBILITY = exports.DELEGATED_OIDC_COMPATIBILITY = new _NamespacedValue.UnstableValue("delegated_oidc_compatibility", "org.matrix.msc3824.delegated_oidc_compatibility");

/**
 * Representation of SSO flow as per https://spec.matrix.org/v1.3/client-server-api/#client-login-via-sso
 */
let IdentityProviderBrand = exports.IdentityProviderBrand = /*#__PURE__*/function (IdentityProviderBrand) {
  IdentityProviderBrand["Gitlab"] = "gitlab";
  IdentityProviderBrand["Github"] = "github";
  IdentityProviderBrand["Apple"] = "apple";
  IdentityProviderBrand["Google"] = "google";
  IdentityProviderBrand["Facebook"] = "facebook";
  IdentityProviderBrand["Twitter"] = "twitter";
  return IdentityProviderBrand;
}({});
let SSOAction = exports.SSOAction = /*#__PURE__*/function (SSOAction) {
  SSOAction["LOGIN"] = "login";
  SSOAction["REGISTER"] = "register";
  return SSOAction;
}({});
/**
 * A client can identify a user using their Matrix ID.
 * This can either be the fully qualified Matrix user ID, or just the localpart of the user ID.
 * @see https://spec.matrix.org/v1.7/client-server-api/#matrix-user-id
 */
/**
 * A client can identify a user using a 3PID associated with the user’s account on the homeserver,
 * where the 3PID was previously associated using the /account/3pid API.
 * See the 3PID Types Appendix for a list of Third-party ID media.
 * @see https://spec.matrix.org/v1.7/client-server-api/#third-party-id
 */
/**
 * A client can identify a user using a phone number associated with the user’s account,
 * where the phone number was previously associated using the /account/3pid API.
 * The phone number can be passed in as entered by the user; the homeserver will be responsible for canonicalising it.
 * If the client wishes to canonicalise the phone number,
 * then it can use the m.id.thirdparty identifier type with a medium of msisdn instead.
 *
 * The country is the two-letter uppercase ISO-3166-1 alpha-2 country code that the number in phone should be parsed as if it were dialled from.
 *
 * @see https://spec.matrix.org/v1.7/client-server-api/#phone-number
 */
/**
 * User Identifiers usable for login & user-interactive authentication.
 *
 * Extensibly allows more than Matrix specified identifiers.
 */
/**
 * Request body for POST /login request
 * @see https://spec.matrix.org/v1.7/client-server-api/#post_matrixclientv3login
 */
// Export for backwards compatibility
/**
 * Response body for POST /login request
 * @see https://spec.matrix.org/v1.7/client-server-api/#post_matrixclientv3login
 */
/**
 * The result of a successful `m.login.token` issuance request as per https://spec.matrix.org/v1.7/client-server-api/#post_matrixclientv1loginget_token
 */