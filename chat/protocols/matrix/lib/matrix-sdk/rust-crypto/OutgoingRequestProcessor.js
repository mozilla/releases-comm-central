"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OutgoingRequestProcessor = void 0;
var _matrixSdkCryptoWasm = require("@matrix-org/matrix-sdk-crypto-wasm");
var _logger = require("../logger");
var _httpApi = require("../http-api");
var _utils = require("../utils");
var _event = require("../@types/event");
var _DehydratedDeviceManager = require("./DehydratedDeviceManager");
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
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
/**
 * Common interface for all the request types returned by `OlmMachine.outgoingRequests`.
 *
 * @internal
 */

/**
 * OutgoingRequestManager: turns `OutgoingRequest`s from the rust sdk into HTTP requests
 *
 * We have one of these per `RustCrypto` (and hence per `MatrixClient`), not that it does anything terribly complicated.
 * It's responsible for:
 *
 *   * holding the reference to the `MatrixHttpApi`
 *   * turning `OutgoingRequest`s from the rust backend into HTTP requests, and sending them
 *   * sending the results of such requests back to the rust backend.
 *
 * @internal
 */
class OutgoingRequestProcessor {
  constructor(olmMachine, http) {
    this.olmMachine = olmMachine;
    this.http = http;
  }
  async makeOutgoingRequest(msg, uiaCallback) {
    let resp;

    /* refer https://docs.rs/matrix-sdk-crypto/0.6.0/matrix_sdk_crypto/requests/enum.OutgoingRequests.html
     * for the complete list of request types
     */
    if (msg instanceof _matrixSdkCryptoWasm.KeysUploadRequest) {
      resp = await this.requestWithRetry(_httpApi.Method.Post, "/_matrix/client/v3/keys/upload", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.KeysQueryRequest) {
      resp = await this.requestWithRetry(_httpApi.Method.Post, "/_matrix/client/v3/keys/query", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.KeysClaimRequest) {
      resp = await this.requestWithRetry(_httpApi.Method.Post, "/_matrix/client/v3/keys/claim", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.SignatureUploadRequest) {
      resp = await this.requestWithRetry(_httpApi.Method.Post, "/_matrix/client/v3/keys/signatures/upload", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.KeysBackupRequest) {
      resp = await this.requestWithRetry(_httpApi.Method.Put, "/_matrix/client/v3/room_keys/keys", {
        version: msg.version
      }, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.ToDeviceRequest) {
      resp = await this.sendToDeviceRequest(msg);
    } else if (msg instanceof _matrixSdkCryptoWasm.RoomMessageRequest) {
      const path = `/_matrix/client/v3/rooms/${encodeURIComponent(msg.room_id)}/send/` + `${encodeURIComponent(msg.event_type)}/${encodeURIComponent(msg.txn_id)}`;
      resp = await this.requestWithRetry(_httpApi.Method.Put, path, {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoWasm.UploadSigningKeysRequest) {
      await this.makeRequestWithUIA(_httpApi.Method.Post, "/_matrix/client/v3/keys/device_signing/upload", {}, msg.body, uiaCallback);
      // SigningKeysUploadRequest does not implement OutgoingRequest and does not need to be marked as sent.
      return;
    } else if (msg instanceof _matrixSdkCryptoWasm.PutDehydratedDeviceRequest) {
      const path = _DehydratedDeviceManager.UnstablePrefix + "/dehydrated_device";
      await this.rawJsonRequest(_httpApi.Method.Put, path, {}, msg.body);
      // PutDehydratedDeviceRequest does not implement OutgoingRequest and does not need to be marked as sent.
      return;
    } else {
      _logger.logger.warn("Unsupported outgoing message", Object.getPrototypeOf(msg));
      resp = "";
    }
    if (msg.id) {
      try {
        await (0, _utils.logDuration)(_logger.logger, `Mark Request as sent ${msg.type}`, async () => {
          await this.olmMachine.markRequestAsSent(msg.id, msg.type, resp);
        });
      } catch (e) {
        // Ignore errors which are caused by the olmMachine having been freed. The exact error message depends
        // on whether we are using a release or develop build of rust-sdk-crypto-wasm.
        if (e instanceof Error && (e.message === "Attempt to use a moved value" || e.message === "null pointer passed to rust")) {
          _logger.logger.log(`Ignoring error '${e.message}': client is likely shutting down`);
        } else {
          throw e;
        }
      }
    } else {
      _logger.logger.trace(`Outgoing request type:${msg.type} does not have an ID`);
    }
  }

  /**
   * Send the HTTP request for a `ToDeviceRequest`
   *
   * @param request - request to send
   * @returns JSON-serialized body of the response, if successful
   */
  async sendToDeviceRequest(request) {
    // a bit of extra logging, to help trace to-device messages through the system
    const parsedBody = JSON.parse(request.body);
    const messageList = [];
    for (const [userId, perUserMessages] of Object.entries(parsedBody.messages)) {
      for (const [deviceId, message] of Object.entries(perUserMessages)) {
        messageList.push(`${userId}/${deviceId} (msgid ${message[_event.ToDeviceMessageId]})`);
      }
    }
    _logger.logger.info(`Sending batch of to-device messages. type=${request.event_type} txnid=${request.txn_id}`, messageList);
    const path = `/_matrix/client/v3/sendToDevice/${encodeURIComponent(request.event_type)}/` + encodeURIComponent(request.txn_id);
    return await this.requestWithRetry(_httpApi.Method.Put, path, {}, request.body);
  }
  async makeRequestWithUIA(method, path, queryParams, body, uiaCallback) {
    if (!uiaCallback) {
      return await this.requestWithRetry(method, path, queryParams, body);
    }
    const parsedBody = JSON.parse(body);
    const makeRequest = async auth => {
      const newBody = _objectSpread({}, parsedBody);
      if (auth !== null) {
        newBody.auth = auth;
      }
      const resp = await this.requestWithRetry(method, path, queryParams, JSON.stringify(newBody));
      return JSON.parse(resp);
    };
    const resp = await uiaCallback(makeRequest);
    return JSON.stringify(resp);
  }
  async requestWithRetry(method, path, queryParams, body) {
    let currentRetryCount = 0;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await this.rawJsonRequest(method, path, queryParams, body);
      } catch (e) {
        currentRetryCount++;
        const backoff = (0, _httpApi.calculateRetryBackoff)(e, currentRetryCount, true);
        if (backoff < 0) {
          // Max number of retries reached, or error is not retryable. rethrow the error
          throw e;
        }
        // wait for the specified time and then retry the request
        await (0, _utils.sleep)(backoff);
      }
    }
  }
  async rawJsonRequest(method, path, queryParams, body) {
    const opts = {
      // inhibit the JSON stringification and parsing within HttpApi.
      json: false,
      // nevertheless, we are sending, and accept, JSON.
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      // we use the full prefix
      prefix: ""
    };
    return await this.http.authedRequest(method, path, queryParams, body, opts);
  }
}
exports.OutgoingRequestProcessor = OutgoingRequestProcessor;