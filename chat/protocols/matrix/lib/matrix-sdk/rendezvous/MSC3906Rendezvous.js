"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC3906Rendezvous = void 0;
var _matrixEventsSdk = require("matrix-events-sdk");
var _ = require(".");
var _client = require("../client");
var _feature = require("../feature");
var _logger = require("../logger");
var _utils = require("../utils");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
var PayloadType = /*#__PURE__*/function (PayloadType) {
  PayloadType["Start"] = "m.login.start";
  PayloadType["Finish"] = "m.login.finish";
  PayloadType["Progress"] = "m.login.progress";
  return PayloadType;
}(PayloadType || {});
var Outcome = /*#__PURE__*/function (Outcome) {
  Outcome["Success"] = "success";
  Outcome["Failure"] = "failure";
  Outcome["Verified"] = "verified";
  Outcome["Declined"] = "declined";
  Outcome["Unsupported"] = "unsupported";
  return Outcome;
}(Outcome || {});
const LOGIN_TOKEN_PROTOCOL = new _matrixEventsSdk.UnstableValue("login_token", "org.matrix.msc3906.login_token");

/**
 * Implements MSC3906 to allow a user to sign in on a new device using QR code.
 * This implementation only supports generating a QR code on a device that is already signed in.
 * Note that this is UNSTABLE and may have breaking changes without notice.
 */
class MSC3906Rendezvous {
  /**
   * @param channel - The secure channel used for communication
   * @param client - The Matrix client in used on the device already logged in
   * @param onFailure - Callback for when the rendezvous fails
   */
  constructor(channel, client, onFailure) {
    this.channel = channel;
    this.client = client;
    this.onFailure = onFailure;
    _defineProperty(this, "newDeviceId", void 0);
    _defineProperty(this, "newDeviceKey", void 0);
    _defineProperty(this, "ourIntent", _.RendezvousIntent.RECIPROCATE_LOGIN_ON_EXISTING_DEVICE);
    _defineProperty(this, "_code", void 0);
  }

  /**
   * Returns the code representing the rendezvous suitable for rendering in a QR code or undefined if not generated yet.
   */
  get code() {
    return this._code;
  }

  /**
   * Generate the code including doing partial set up of the channel where required.
   */
  async generateCode() {
    if (this._code) {
      return;
    }
    this._code = JSON.stringify(await this.channel.generateCode(this.ourIntent));
  }
  async startAfterShowingCode() {
    const checksum = await this.channel.connect();
    _logger.logger.info(`Connected to secure channel with checksum: ${checksum} our intent is ${this.ourIntent}`);

    // in r1 of MSC3882 the availability is exposed as a capability
    const capabilities = await this.client.getCapabilities();
    // in r0 of MSC3882 the availability is exposed as a feature flag
    const features = await (0, _feature.buildFeatureSupportMap)(await this.client.getVersions());
    const capability = _client.UNSTABLE_MSC3882_CAPABILITY.findIn(capabilities);

    // determine available protocols
    if (!capability?.enabled && features.get(_feature.Feature.LoginTokenRequest) === _feature.ServerSupport.Unsupported) {
      _logger.logger.info("Server doesn't support MSC3882");
      await this.send({
        type: PayloadType.Finish,
        outcome: Outcome.Unsupported
      });
      await this.cancel(_.RendezvousFailureReason.HomeserverLacksSupport);
      return undefined;
    }
    await this.send({
      type: PayloadType.Progress,
      protocols: [LOGIN_TOKEN_PROTOCOL.name]
    });
    _logger.logger.info("Waiting for other device to chose protocol");
    const {
      type,
      protocol,
      outcome
    } = await this.receive();
    if (type === PayloadType.Finish) {
      // new device decided not to complete
      switch (outcome ?? "") {
        case "unsupported":
          await this.cancel(_.RendezvousFailureReason.UnsupportedAlgorithm);
          break;
        default:
          await this.cancel(_.RendezvousFailureReason.Unknown);
      }
      return undefined;
    }
    if (type !== PayloadType.Progress) {
      await this.cancel(_.RendezvousFailureReason.Unknown);
      return undefined;
    }
    if (!protocol || !LOGIN_TOKEN_PROTOCOL.matches(protocol)) {
      await this.cancel(_.RendezvousFailureReason.UnsupportedAlgorithm);
      return undefined;
    }
    return checksum;
  }
  async receive() {
    return await this.channel.receive();
  }
  async send(payload) {
    await this.channel.send(payload);
  }
  async declineLoginOnExistingDevice() {
    _logger.logger.info("User declined sign in");
    await this.send({
      type: PayloadType.Finish,
      outcome: Outcome.Declined
    });
  }
  async approveLoginOnExistingDevice(loginToken) {
    // eslint-disable-next-line camelcase
    await this.send({
      type: PayloadType.Progress,
      login_token: loginToken,
      homeserver: this.client.baseUrl
    });
    _logger.logger.info("Waiting for outcome");
    const res = await this.receive();
    if (!res) {
      return undefined;
    }
    const {
      outcome,
      device_id: deviceId,
      device_key: deviceKey
    } = res;
    if (outcome !== "success") {
      throw new Error("Linking failed");
    }
    this.newDeviceId = deviceId;
    this.newDeviceKey = deviceKey;
    return deviceId;
  }
  async verifyAndCrossSignDevice(deviceInfo) {
    if (!this.client.crypto) {
      throw new Error("Crypto not available on client");
    }
    if (!this.newDeviceId) {
      throw new Error("No new device ID set");
    }

    // check that keys received from the server for the new device match those received from the device itself
    if (deviceInfo.getFingerprint() !== this.newDeviceKey) {
      throw new Error(`New device has different keys than expected: ${this.newDeviceKey} vs ${deviceInfo.getFingerprint()}`);
    }
    const userId = this.client.getUserId();
    if (!userId) {
      throw new Error("No user ID set");
    }
    // mark the device as verified locally + cross sign
    _logger.logger.info(`Marking device ${this.newDeviceId} as verified`);
    const info = await this.client.crypto.setDeviceVerification(userId, this.newDeviceId, true, false, true);
    const masterPublicKey = this.client.crypto.crossSigningInfo.getId("master");
    await this.send({
      type: PayloadType.Finish,
      outcome: Outcome.Verified,
      verifying_device_id: this.client.getDeviceId(),
      verifying_device_key: this.client.getDeviceEd25519Key(),
      master_key: masterPublicKey
    });
    return info;
  }

  /**
   * Verify the device and cross-sign it.
   * @param timeout - time in milliseconds to wait for device to come online
   * @returns the new device info if the device was verified
   */
  async verifyNewDeviceOnExistingDevice(timeout = 10 * 1000) {
    if (!this.newDeviceId) {
      throw new Error("No new device to sign");
    }
    if (!this.newDeviceKey) {
      _logger.logger.info("No new device key to sign");
      return undefined;
    }
    if (!this.client.crypto) {
      throw new Error("Crypto not available on client");
    }
    const userId = this.client.getUserId();
    if (!userId) {
      throw new Error("No user ID set");
    }
    let deviceInfo = this.client.crypto.getStoredDevice(userId, this.newDeviceId);
    if (!deviceInfo) {
      _logger.logger.info("Going to wait for new device to be online");
      await (0, _utils.sleep)(timeout);
      deviceInfo = this.client.crypto.getStoredDevice(userId, this.newDeviceId);
    }
    if (deviceInfo) {
      return await this.verifyAndCrossSignDevice(deviceInfo);
    }
    throw new Error("Device not online within timeout");
  }
  async cancel(reason) {
    this.onFailure?.(reason);
    await this.channel.cancel(reason);
  }
  async close() {
    await this.channel.close();
  }
}
exports.MSC3906Rendezvous = MSC3906Rendezvous;