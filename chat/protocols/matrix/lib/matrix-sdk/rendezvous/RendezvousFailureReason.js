"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.RendezvousFailureReason = void 0;
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
let RendezvousFailureReason = exports.RendezvousFailureReason = /*#__PURE__*/function (RendezvousFailureReason) {
  RendezvousFailureReason["UserDeclined"] = "user_declined";
  RendezvousFailureReason["OtherDeviceNotSignedIn"] = "other_device_not_signed_in";
  RendezvousFailureReason["OtherDeviceAlreadySignedIn"] = "other_device_already_signed_in";
  RendezvousFailureReason["Unknown"] = "unknown";
  RendezvousFailureReason["Expired"] = "expired";
  RendezvousFailureReason["UserCancelled"] = "user_cancelled";
  RendezvousFailureReason["InvalidCode"] = "invalid_code";
  RendezvousFailureReason["UnsupportedAlgorithm"] = "unsupported_algorithm";
  RendezvousFailureReason["DataMismatch"] = "data_mismatch";
  RendezvousFailureReason["UnsupportedTransport"] = "unsupported_transport";
  RendezvousFailureReason["HomeserverLacksSupport"] = "homeserver_lacks_support";
  return RendezvousFailureReason;
}({});