"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC4108FailureReason = exports.LegacyRendezvousFailureReason = exports.ClientRendezvousFailureReason = void 0;
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
let LegacyRendezvousFailureReason = exports.LegacyRendezvousFailureReason = /*#__PURE__*/function (LegacyRendezvousFailureReason) {
  LegacyRendezvousFailureReason["UserDeclined"] = "user_declined";
  LegacyRendezvousFailureReason["Unknown"] = "unknown";
  LegacyRendezvousFailureReason["Expired"] = "expired";
  LegacyRendezvousFailureReason["UserCancelled"] = "user_cancelled";
  LegacyRendezvousFailureReason["UnsupportedAlgorithm"] = "unsupported_algorithm";
  LegacyRendezvousFailureReason["UnsupportedProtocol"] = "unsupported_protocol";
  LegacyRendezvousFailureReason["HomeserverLacksSupport"] = "homeserver_lacks_support";
  return LegacyRendezvousFailureReason;
}({});
let MSC4108FailureReason = exports.MSC4108FailureReason = /*#__PURE__*/function (MSC4108FailureReason) {
  MSC4108FailureReason["AuthorizationExpired"] = "authorization_expired";
  MSC4108FailureReason["DeviceAlreadyExists"] = "device_already_exists";
  MSC4108FailureReason["DeviceNotFound"] = "device_not_found";
  MSC4108FailureReason["UnexpectedMessageReceived"] = "unexpected_message_received";
  MSC4108FailureReason["UnsupportedProtocol"] = "unsupported_protocol";
  MSC4108FailureReason["UserCancelled"] = "user_cancelled";
  return MSC4108FailureReason;
}({});
let ClientRendezvousFailureReason = exports.ClientRendezvousFailureReason = /*#__PURE__*/function (ClientRendezvousFailureReason) {
  ClientRendezvousFailureReason["Expired"] = "expired";
  ClientRendezvousFailureReason["HomeserverLacksSupport"] = "homeserver_lacks_support";
  ClientRendezvousFailureReason["InsecureChannelDetected"] = "insecure_channel_detected";
  ClientRendezvousFailureReason["InvalidCode"] = "invalid_code";
  ClientRendezvousFailureReason["OtherDeviceNotSignedIn"] = "other_device_not_signed_in";
  ClientRendezvousFailureReason["OtherDeviceAlreadySignedIn"] = "other_device_already_signed_in";
  ClientRendezvousFailureReason["Unknown"] = "unknown";
  ClientRendezvousFailureReason["UserDeclined"] = "user_declined";
  ClientRendezvousFailureReason["ETagMissing"] = "etag_missing";
  return ClientRendezvousFailureReason;
}({});