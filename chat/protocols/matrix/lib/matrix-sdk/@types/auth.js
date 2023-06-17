"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SSOAction = exports.IdentityProviderBrand = exports.DELEGATED_OIDC_COMPATIBILITY = void 0;
var _NamespacedValue = require("../NamespacedValue");
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

const DELEGATED_OIDC_COMPATIBILITY = new _NamespacedValue.UnstableValue("delegated_oidc_compatibility", "org.matrix.msc3824.delegated_oidc_compatibility");

/**
 * Representation of SSO flow as per https://spec.matrix.org/v1.3/client-server-api/#client-login-via-sso
 */
exports.DELEGATED_OIDC_COMPATIBILITY = DELEGATED_OIDC_COMPATIBILITY;
let IdentityProviderBrand = /*#__PURE__*/function (IdentityProviderBrand) {
  IdentityProviderBrand["Gitlab"] = "gitlab";
  IdentityProviderBrand["Github"] = "github";
  IdentityProviderBrand["Apple"] = "apple";
  IdentityProviderBrand["Google"] = "google";
  IdentityProviderBrand["Facebook"] = "facebook";
  IdentityProviderBrand["Twitter"] = "twitter";
  return IdentityProviderBrand;
}({});
/**
 * Parameters to login request as per https://spec.matrix.org/v1.3/client-server-api/#login
 */
/* eslint-disable camelcase */
exports.IdentityProviderBrand = IdentityProviderBrand;
/* eslint-enable camelcase */
let SSOAction = /*#__PURE__*/function (SSOAction) {
  SSOAction["LOGIN"] = "login";
  SSOAction["REGISTER"] = "register";
  return SSOAction;
}({});
/**
 * The result of a successful [MSC3882](https://github.com/matrix-org/matrix-spec-proposals/pull/3882)
 * `m.login.token` issuance request.
 * Note that this is UNSTABLE and subject to breaking changes without notice.
 */
exports.SSOAction = SSOAction;