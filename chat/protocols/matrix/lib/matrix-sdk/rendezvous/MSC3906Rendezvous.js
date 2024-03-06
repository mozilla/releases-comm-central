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
var _cryptoApi = require("../crypto-api");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
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

    // in stable and unstable r1 the availability is exposed as a capability
    const capabilities = await this.client.getCapabilities();
    // in r0 of MSC3882 the availability is exposed as a feature flag
    const features = await (0, _feature.buildFeatureSupportMap)(await this.client.getVersions());
    const capability = _client.GET_LOGIN_TOKEN_CAPABILITY.findIn(capabilities);

    // determine available protocols
    if (!capability?.enabled && features.get(_feature.Feature.LoginTokenRequest) === _feature.ServerSupport.Unsupported) {
      _logger.logger.info("Server doesn't support get_login_token");
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
    _logger.logger.info("Waiting for other device to choose protocol");
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
    const crypto = this.client.getCrypto();
    if (!this.newDeviceId) {
      throw new Error("No new device ID set");
    }

    // check that keys received from the server for the new device match those received from the device itself
    if (deviceInfo.getFingerprint() !== this.newDeviceKey) {
      throw new Error(`New device has different keys than expected: ${this.newDeviceKey} vs ${deviceInfo.getFingerprint()}`);
    }
    const userId = this.client.getSafeUserId();

    // mark the device as verified locally + cross sign
    _logger.logger.info(`Marking device ${this.newDeviceId} as verified`);
    await crypto.setDeviceVerified(userId, this.newDeviceId, true);
    await crypto.crossSignDevice(this.newDeviceId);
    const masterPublicKey = (await crypto.getCrossSigningKeyId(_cryptoApi.CrossSigningKey.Master)) ?? undefined;
    const ourDeviceId = this.client.getDeviceId();
    const ourDeviceKey = (await crypto.getOwnDeviceKeys()).ed25519;
    await this.send({
      type: PayloadType.Finish,
      outcome: Outcome.Verified,
      verifying_device_id: ourDeviceId,
      verifying_device_key: ourDeviceKey,
      master_key: masterPublicKey
    });
  }

  /**
   * Verify the device and cross-sign it.
   * @param timeout - time in milliseconds to wait for device to come online
   */
  async verifyNewDeviceOnExistingDevice(timeout = 10 * 1000) {
    if (!this.newDeviceId) {
      throw new Error("No new device to sign");
    }
    if (!this.newDeviceKey) {
      _logger.logger.info("No new device key to sign");
      return undefined;
    }
    const crypto = this.client.getCrypto();
    if (!crypto) {
      throw new Error("Crypto not available on client");
    }
    let deviceInfo = await this.getOwnDevice(this.newDeviceId);
    if (!deviceInfo) {
      _logger.logger.info("Going to wait for new device to be online");
      await (0, _utils.sleep)(timeout);
      deviceInfo = await this.getOwnDevice(this.newDeviceId);
    }
    if (deviceInfo) {
      await this.verifyAndCrossSignDevice(deviceInfo);
      return;
    }
    throw new Error("Device not online within timeout");
  }
  async getOwnDevice(deviceId) {
    const userId = this.client.getSafeUserId();
    const ownDeviceInfo = await this.client.getCrypto().getUserDeviceInfo([userId]);
    return ownDeviceInfo.get(userId)?.get(deviceId);
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