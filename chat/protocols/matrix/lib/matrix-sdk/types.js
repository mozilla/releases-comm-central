"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  VerificationMethod: true
};
exports.VerificationMethod = void 0;
var _membership = require("./@types/membership");
Object.keys(_membership).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _membership[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _membership[key];
    }
  });
});
/*
Copyright 2024 The Matrix.org Foundation C.I.C.

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
/*
 * This file is a secondary entrypoint for the js-sdk library, for use by Typescript projects.
 * It exposes low-level types and interfaces reflecting structures defined in the Matrix specification.
 *
 * Remember to only export *public* types from this file.
 */
/** The different methods for device and user verification */
let VerificationMethod = exports.VerificationMethod = /*#__PURE__*/function (VerificationMethod) {
  VerificationMethod["Sas"] = "m.sas.v1";
  VerificationMethod["ShowQrCode"] = "m.qr_code.show.v1";
  VerificationMethod["ScanQrCode"] = "m.qr_code.scan.v1";
  VerificationMethod["Reciprocate"] = "m.reciprocate.v1";
  return VerificationMethod;
}({});