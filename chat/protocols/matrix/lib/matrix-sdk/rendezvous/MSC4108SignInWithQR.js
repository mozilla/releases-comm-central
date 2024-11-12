"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.PayloadType = exports.MSC4108SignInWithQR = void 0;
var _matrixSdkCryptoWasm = require("@matrix-org/matrix-sdk-crypto-wasm");
var _index = require("./index.js");
var _logger = require("../logger.js");
var _index2 = require("../http-api/index.js");
var _utils = require("../utils.js");
var _index3 = require("../oidc/index.js");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
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
/**
 * Enum representing the payload types transmissible over [MSC4108](https://github.com/matrix-org/matrix-spec-proposals/pull/4108)
 * secure channels.
 * @experimental Note that this is UNSTABLE and may have breaking changes without notice.
 */
let PayloadType = exports.PayloadType = /*#__PURE__*/function (PayloadType) {
  PayloadType["Protocols"] = "m.login.protocols";
  PayloadType["Protocol"] = "m.login.protocol";
  PayloadType["Failure"] = "m.login.failure";
  PayloadType["Success"] = "m.login.success";
  PayloadType["Secrets"] = "m.login.secrets";
  PayloadType["ProtocolAccepted"] = "m.login.protocol_accepted";
  PayloadType["Declined"] = "m.login.declined";
  return PayloadType;
}({});
/**
 * Type representing the base payload format for [MSC4108](https://github.com/matrix-org/matrix-spec-proposals/pull/4108)
 * messages sent over the secure channel.
 * @experimental Note that this is UNSTABLE and may have breaking changes without notice.
 */
function isDeviceAuthorizationGrantProtocolPayload(payload) {
  return payload.protocol === "device_authorization_grant";
}
/**
 * Prototype of the unstable [MSC4108](https://github.com/matrix-org/matrix-spec-proposals/pull/4108)
 * sign in with QR + OIDC flow.
 * @experimental Note that this is UNSTABLE and may have breaking changes without notice.
 */
class MSC4108SignInWithQR {
  /**
   * Returns the check code for the secure channel or undefined if not generated yet.
   */
  get checkCode() {
    return this.channel?.getCheckCode();
  }

  /**
   * @param channel - The secure channel used for communication
   * @param client - The Matrix client in used on the device already logged in
   * @param didScanCode - Whether this side of the channel scanned the QR code from the other party
   * @param onFailure - Callback for when the rendezvous fails
   */
  constructor(channel, didScanCode, client, onFailure) {
    this.channel = channel;
    this.didScanCode = didScanCode;
    this.client = client;
    this.onFailure = onFailure;
    _defineProperty(this, "ourIntent", void 0);
    _defineProperty(this, "_code", void 0);
    _defineProperty(this, "expectingNewDeviceId", void 0);
    this.ourIntent = client ? _matrixSdkCryptoWasm.QrCodeMode.Reciprocate : _matrixSdkCryptoWasm.QrCodeMode.Login;
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
    if (this.ourIntent === _matrixSdkCryptoWasm.QrCodeMode.Reciprocate && this.client) {
      this._code = await this.channel.generateCode(this.ourIntent, this.client.getDomain());
    } else if (this.ourIntent === _matrixSdkCryptoWasm.QrCodeMode.Login) {
      this._code = await this.channel.generateCode(this.ourIntent);
    }
  }

  /**
   * Returns true if the device is the already logged in device reciprocating a new login on the other side of the channel.
   */
  get isExistingDevice() {
    return this.ourIntent === _matrixSdkCryptoWasm.QrCodeMode.Reciprocate;
  }

  /**
   * Returns true if the device is the new device logging in being reciprocated by the device on the other side of the channel.
   */
  get isNewDevice() {
    return !this.isExistingDevice;
  }

  /**
   * The first step in the OIDC QR login process.
   * To be called after the QR code has been rendered or scanned.
   * The scanning device has to discover the homeserver details, if they scanned the code then they already have it.
   * If the new device is the one rendering the QR code then it has to wait be sent the homeserver details via the rendezvous channel.
   */
  async negotiateProtocols() {
    _logger.logger.info(`negotiateProtocols(isNewDevice=${this.isNewDevice} didScanCode=${this.didScanCode})`);
    await this.channel.connect();
    if (this.didScanCode) {
      // Secure Channel step 6 completed, we trust the channel

      if (this.isNewDevice) {
        // MSC4108-Flow: ExistingScanned - take homeserver from QR code which should already be set
      } else {
        // MSC4108-Flow: NewScanned -send protocols message
        let oidcClientConfig;
        try {
          const {
            issuer
          } = await this.client.getAuthIssuer();
          oidcClientConfig = await (0, _index3.discoverAndValidateOIDCIssuerWellKnown)(issuer);
        } catch (e) {
          _logger.logger.error("Failed to discover OIDC metadata", e);
        }
        if (oidcClientConfig?.metadata.grant_types_supported.includes(_index3.DEVICE_CODE_SCOPE)) {
          await this.send({
            type: PayloadType.Protocols,
            protocols: ["device_authorization_grant"],
            homeserver: this.client.getDomain()
          });
        } else {
          await this.send({
            type: PayloadType.Failure,
            reason: _index.MSC4108FailureReason.UnsupportedProtocol
          });
          throw new _index.RendezvousError("Device code grant unsupported", _index.MSC4108FailureReason.UnsupportedProtocol);
        }
      }
    } else if (this.isNewDevice) {
      // MSC4108-Flow: ExistingScanned - wait for protocols message
      _logger.logger.info("Waiting for protocols message");
      const payload = await this.receive();
      if (payload?.type === PayloadType.Failure) {
        throw new _index.RendezvousError("Failed", payload.reason);
      }
      if (payload?.type !== PayloadType.Protocols) {
        await this.send({
          type: PayloadType.Failure,
          reason: _index.MSC4108FailureReason.UnexpectedMessageReceived
        });
        throw new _index.RendezvousError("Unexpected message received", _index.MSC4108FailureReason.UnexpectedMessageReceived);
      }
      return {
        serverName: payload.homeserver
      };
    } else {
      // MSC4108-Flow: NewScanned - nothing to do
    }
    return {};
  }

  /**
   * The second & third step in the OIDC QR login process.
   * To be called after `negotiateProtocols` for the existing device.
   * To be called after OIDC negotiation for the new device. (Currently unsupported)
   */
  async deviceAuthorizationGrant() {
    if (this.isNewDevice) {
      throw new Error("New device flows around OIDC are not yet implemented");
    } else {
      // The user needs to do step 7 for the out-of-band confirmation
      // but, first we receive the protocol chosen by the other device so that
      // the confirmation_uri is ready to go
      _logger.logger.info("Waiting for protocol message");
      const payload = await this.receive();
      if (payload?.type === PayloadType.Failure) {
        throw new _index.RendezvousError("Failed", payload.reason);
      }
      if (payload?.type !== PayloadType.Protocol) {
        await this.send({
          type: PayloadType.Failure,
          reason: _index.MSC4108FailureReason.UnexpectedMessageReceived
        });
        throw new _index.RendezvousError("Unexpected message received", _index.MSC4108FailureReason.UnexpectedMessageReceived);
      }
      if (isDeviceAuthorizationGrantProtocolPayload(payload)) {
        const {
          device_authorization_grant: dag,
          device_id: expectingNewDeviceId
        } = payload;
        const {
          verification_uri: verificationUri,
          verification_uri_complete: verificationUriComplete
        } = dag;
        let deviceAlreadyExists = true;
        try {
          await this.client?.getDevice(expectingNewDeviceId);
        } catch (err) {
          if (err instanceof _index2.MatrixError && err.httpStatus === 404) {
            deviceAlreadyExists = false;
          }
        }
        if (deviceAlreadyExists) {
          await this.send({
            type: PayloadType.Failure,
            reason: _index.MSC4108FailureReason.DeviceAlreadyExists
          });
          throw new _index.RendezvousError("Specified device ID already exists", _index.MSC4108FailureReason.DeviceAlreadyExists);
        }
        this.expectingNewDeviceId = expectingNewDeviceId;
        return {
          verificationUri: verificationUriComplete ?? verificationUri
        };
      }
      await this.send({
        type: PayloadType.Failure,
        reason: _index.MSC4108FailureReason.UnsupportedProtocol
      });
      throw new _index.RendezvousError("Received a request for an unsupported protocol", _index.MSC4108FailureReason.UnsupportedProtocol);
    }
  }

  /**
   * The fifth (and final) step in the OIDC QR login process.
   * To be called after the new device has completed authentication.
   */
  async shareSecrets() {
    if (this.isNewDevice) {
      await this.send({
        type: PayloadType.Success
      });
      // then wait for secrets
      _logger.logger.info("Waiting for secrets message");
      const payload = await this.receive();
      if (payload?.type === PayloadType.Failure) {
        throw new _index.RendezvousError("Failed", payload.reason);
      }
      if (payload?.type !== PayloadType.Secrets) {
        await this.send({
          type: PayloadType.Failure,
          reason: _index.MSC4108FailureReason.UnexpectedMessageReceived
        });
        throw new _index.RendezvousError("Unexpected message received", _index.MSC4108FailureReason.UnexpectedMessageReceived);
      }
      return {
        secrets: payload
      };
      // then done?
    } else {
      if (!this.expectingNewDeviceId) {
        throw new Error("No new device ID expected");
      }
      await this.send({
        type: PayloadType.ProtocolAccepted
      });
      _logger.logger.info("Waiting for outcome message");
      const payload = await this.receive();
      if (payload?.type === PayloadType.Failure) {
        throw new _index.RendezvousError("Failed", payload.reason);
      }
      if (payload?.type === PayloadType.Declined) {
        throw new _index.RendezvousError("User declined", _index.ClientRendezvousFailureReason.UserDeclined);
      }
      if (payload?.type !== PayloadType.Success) {
        await this.send({
          type: PayloadType.Failure,
          reason: _index.MSC4108FailureReason.UnexpectedMessageReceived
        });
        throw new _index.RendezvousError("Unexpected message", _index.MSC4108FailureReason.UnexpectedMessageReceived);
      }
      const timeout = Date.now() + 10000; // wait up to 10 seconds
      do {
        // is the device visible via the Homeserver?
        try {
          const device = await this.client?.getDevice(this.expectingNewDeviceId);
          if (device) {
            // if so, return the secrets
            const secretsBundle = await this.client.getCrypto().exportSecretsBundle();
            if (this.channel.cancelled) {
              throw new _index.RendezvousError("User cancelled", _index.MSC4108FailureReason.UserCancelled);
            }
            // send secrets
            await this.send(_objectSpread({
              type: PayloadType.Secrets
            }, secretsBundle));
            return {
              secrets: secretsBundle
            };
            // let the other side close the rendezvous session
          }
        } catch (err) {
          if (err instanceof _index2.MatrixError && err.httpStatus === 404) {
            // not found, so keep waiting until timeout
          } else {
            throw err;
          }
        }
        await (0, _utils.sleep)(1000);
      } while (Date.now() < timeout);
      await this.send({
        type: PayloadType.Failure,
        reason: _index.MSC4108FailureReason.DeviceNotFound
      });
      throw new _index.RendezvousError("New device not found", _index.MSC4108FailureReason.DeviceNotFound);
    }
  }
  async receive() {
    return await this.channel.secureReceive();
  }
  async send(payload) {
    await this.channel.secureSend(payload);
  }

  /**
   * Decline the login on the existing device.
   */
  async declineLoginOnExistingDevice() {
    if (!this.isExistingDevice) {
      throw new Error("Can only decline login on existing device");
    }
    await this.send({
      type: PayloadType.Failure,
      reason: _index.MSC4108FailureReason.UserCancelled
    });
  }

  /**
   * Cancels the rendezvous session.
   * @param reason the reason for the cancellation
   */
  async cancel(reason) {
    this.onFailure?.(reason);
    await this.channel.cancel(reason);
  }

  /**
   * Closes the rendezvous session.
   */
  async close() {
    await this.channel.close();
  }
}
exports.MSC4108SignInWithQR = MSC4108SignInWithQR;