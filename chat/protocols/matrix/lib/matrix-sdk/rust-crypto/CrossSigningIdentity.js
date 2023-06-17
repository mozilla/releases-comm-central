"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.CrossSigningIdentity = void 0;
var _logger = require("../logger");
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

/** Manages the cross-signing keys for our own user.
 */
class CrossSigningIdentity {
  constructor(olmMachine, outgoingRequestProcessor) {
    this.olmMachine = olmMachine;
    this.outgoingRequestProcessor = outgoingRequestProcessor;
  }

  /**
   * Initialise our cross-signing keys by creating new keys if they do not exist, and uploading to the server
   */
  async bootstrapCrossSigning(opts) {
    if (opts.setupNewCrossSigning) {
      await this.resetCrossSigning(opts.authUploadDeviceSigningKeys);
      return;
    }
    const olmDeviceStatus = await this.olmMachine.crossSigningStatus();
    const privateKeysInSecretStorage = false; // TODO
    const olmDeviceHasKeys = olmDeviceStatus.hasMaster && olmDeviceStatus.hasUserSigning && olmDeviceStatus.hasSelfSigning;

    // Log all relevant state for easier parsing of debug logs.
    _logger.logger.log("bootStrapCrossSigning: starting", {
      setupNewCrossSigning: opts.setupNewCrossSigning,
      olmDeviceHasMaster: olmDeviceStatus.hasMaster,
      olmDeviceHasUserSigning: olmDeviceStatus.hasUserSigning,
      olmDeviceHasSelfSigning: olmDeviceStatus.hasSelfSigning,
      privateKeysInSecretStorage
    });
    if (!olmDeviceHasKeys && !privateKeysInSecretStorage) {
      _logger.logger.log("bootStrapCrossSigning: Cross-signing private keys not found locally or in secret storage, creating new keys");
      await this.resetCrossSigning(opts.authUploadDeviceSigningKeys);
    } else if (olmDeviceHasKeys) {
      _logger.logger.log("bootStrapCrossSigning: Olm device has private keys: exporting to secret storage");
      await this.exportCrossSigningKeysToStorage();
    } else if (privateKeysInSecretStorage) {
      _logger.logger.log("bootStrapCrossSigning: Cross-signing private keys not found locally, but they are available " + "in secret storage, reading storage and caching locally");
      throw new Error("TODO");
    }

    // TODO: we might previously have bootstrapped cross-signing but not completed uploading the keys to the
    //   server -- in which case we should call OlmDevice.bootstrap_cross_signing. How do we know?
    _logger.logger.log("bootStrapCrossSigning: complete");
  }

  /** Reset our cross-signing keys
   *
   * This method will:
   *   * Tell the OlmMachine to create new keys
   *   * Upload the new public keys and the device signature to the server
   *   * Upload the private keys to SSSS, if it is set up
   */
  async resetCrossSigning(authUploadDeviceSigningKeys) {
    const outgoingRequests = await this.olmMachine.bootstrapCrossSigning(true);
    _logger.logger.log("bootStrapCrossSigning: publishing keys to server");
    for (const req of outgoingRequests) {
      await this.outgoingRequestProcessor.makeOutgoingRequest(req, authUploadDeviceSigningKeys);
    }
    await this.exportCrossSigningKeysToStorage();
  }

  /**
   * Extract the cross-signing keys from the olm machine and save them to secret storage, if it is configured
   *
   * (If secret storage is *not* configured, we assume that the export will happen when it is set up)
   */
  async exportCrossSigningKeysToStorage() {
    // TODO
  }
}
exports.CrossSigningIdentity = CrossSigningIdentity;