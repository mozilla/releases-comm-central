"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SSOAction = exports.IdentityProviderBrand = void 0;

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
 * Response to GET login flows as per https://spec.matrix.org/latest/client-server-api/#get_matrixclientv3login
 */

/**
 * Representation of SSO flow as per https://spec.matrix.org/latest/client-server-api/#client-login-via-sso
 */
let IdentityProviderBrand;
exports.IdentityProviderBrand = IdentityProviderBrand;

(function (IdentityProviderBrand) {
  IdentityProviderBrand["Gitlab"] = "gitlab";
  IdentityProviderBrand["Github"] = "github";
  IdentityProviderBrand["Apple"] = "apple";
  IdentityProviderBrand["Google"] = "google";
  IdentityProviderBrand["Facebook"] = "facebook";
  IdentityProviderBrand["Twitter"] = "twitter";
})(IdentityProviderBrand || (exports.IdentityProviderBrand = IdentityProviderBrand = {}));

/* eslint-enable camelcase */
let SSOAction;
exports.SSOAction = SSOAction;

(function (SSOAction) {
  SSOAction["LOGIN"] = "login";
  SSOAction["REGISTER"] = "register";
})(SSOAction || (exports.SSOAction = SSOAction = {}));