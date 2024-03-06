"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.HttpApiEvent = void 0;
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
/**
 * @experimental
 * Unencrypted access and (optional) refresh token
 */
/**
 * @experimental
 * Function that performs token refresh using the given refreshToken.
 * Returns a promise that resolves to the refreshed access and (optional) refresh tokens.
 *
 * Can be passed to HttpApi instance as {@link IHttpOpts.tokenRefreshFunction} during client creation {@link ICreateClientOpts}
 */
let HttpApiEvent = exports.HttpApiEvent = /*#__PURE__*/function (HttpApiEvent) {
  HttpApiEvent["SessionLoggedOut"] = "Session.logged_out";
  HttpApiEvent["NoConsent"] = "no_consent";
  return HttpApiEvent;
}({});