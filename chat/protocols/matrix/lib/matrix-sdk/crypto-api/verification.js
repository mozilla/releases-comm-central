"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VerifierEvent = void 0;
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
/** Events emitted by `Verifier`. */
let VerifierEvent = /*#__PURE__*/function (VerifierEvent) {
  VerifierEvent["Cancel"] = "cancel";
  VerifierEvent["ShowSas"] = "show_sas";
  VerifierEvent["ShowReciprocateQr"] = "show_reciprocate_qr";
  return VerifierEvent;
}({});
/** Listener type map for {@link VerifierEvent}s. */
/**
 * Callbacks for user actions while a QR code is displayed.
 *
 * This is exposed as the payload of a `VerifierEvent.ShowReciprocateQr` event, or can be retrieved directly from the
 * verifier as `reciprocateQREvent`.
 */
/**
 * Callbacks for user actions while a SAS is displayed.
 *
 * This is exposed as the payload of a `VerifierEvent.ShowSas` event, or directly from the verifier as `sasEvent`.
 */
/** A generated SAS to be shown to the user, in alternative formats */
/**
 * An emoji for the generated SAS. A tuple `[emoji, name]` where `emoji` is the emoji itself and `name` is the
 * English name.
 */
exports.VerifierEvent = VerifierEvent;