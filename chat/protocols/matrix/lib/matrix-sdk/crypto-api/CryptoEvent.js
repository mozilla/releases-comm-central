"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CryptoEvent = void 0;
/*
 * Copyright 2024 The Matrix.org Foundation C.I.C.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * Events emitted by the {@link CryptoApi}
 */
let CryptoEvent = exports.CryptoEvent = /*#__PURE__*/function (CryptoEvent) {
  CryptoEvent["UserTrustStatusChanged"] = "userTrustStatusChanged";
  CryptoEvent["KeyBackupStatus"] = "crypto.keyBackupStatus";
  CryptoEvent["KeyBackupFailed"] = "crypto.keyBackupFailed";
  CryptoEvent["KeyBackupSessionsRemaining"] = "crypto.keyBackupSessionsRemaining";
  CryptoEvent["KeyBackupDecryptionKeyCached"] = "crypto.keyBackupDecryptionKeyCached";
  CryptoEvent["VerificationRequestReceived"] = "crypto.verificationRequestReceived";
  CryptoEvent["WillUpdateDevices"] = "crypto.willUpdateDevices";
  CryptoEvent["DevicesUpdated"] = "crypto.devicesUpdated";
  CryptoEvent["KeysChanged"] = "crossSigning.keysChanged";
  CryptoEvent["LegacyCryptoStoreMigrationProgress"] = "crypto.legacyCryptoStoreMigrationProgress";
  return CryptoEvent;
}({});