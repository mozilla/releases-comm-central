"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OutgoingRequestProcessor = void 0;
var _matrixSdkCryptoJs = require("@matrix-org/matrix-sdk-crypto-js");
var _logger = require("../logger");
var _httpApi = require("../http-api");
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

/**
 * OutgoingRequestManager: turns `OutgoingRequest`s from the rust sdk into HTTP requests
 *
 * We have one of these per `RustCrypto` (and hence per `MatrixClient`), not that it does anything terribly complicated.
 * It's responsible for:
 *
 *   * holding the reference to the `MatrixHttpApi`
 *   * turning `OutgoingRequest`s from the rust backend into HTTP requests, and sending them
 *   * sending the results of such requests back to the rust backend.
 */
class OutgoingRequestProcessor {
  constructor(olmMachine, http) {
    this.olmMachine = olmMachine;
    this.http = http;
  }
  async makeOutgoingRequest(msg) {
    let resp;

    /* refer https://docs.rs/matrix-sdk-crypto/0.6.0/matrix_sdk_crypto/requests/enum.OutgoingRequests.html
     * for the complete list of request types
     */
    if (msg instanceof _matrixSdkCryptoJs.KeysUploadRequest) {
      resp = await this.rawJsonRequest(_httpApi.Method.Post, "/_matrix/client/v3/keys/upload", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.KeysQueryRequest) {
      resp = await this.rawJsonRequest(_httpApi.Method.Post, "/_matrix/client/v3/keys/query", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.KeysClaimRequest) {
      resp = await this.rawJsonRequest(_httpApi.Method.Post, "/_matrix/client/v3/keys/claim", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.SignatureUploadRequest) {
      resp = await this.rawJsonRequest(_httpApi.Method.Post, "/_matrix/client/v3/keys/signatures/upload", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.KeysBackupRequest) {
      resp = await this.rawJsonRequest(_httpApi.Method.Put, "/_matrix/client/v3/room_keys/keys", {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.ToDeviceRequest) {
      const path = `/_matrix/client/v3/sendToDevice/${encodeURIComponent(msg.event_type)}/` + encodeURIComponent(msg.txn_id);
      resp = await this.rawJsonRequest(_httpApi.Method.Put, path, {}, msg.body);
    } else if (msg instanceof _matrixSdkCryptoJs.RoomMessageRequest) {
      const path = `/_matrix/client/v3/room/${encodeURIComponent(msg.room_id)}/send/` + `${encodeURIComponent(msg.event_type)}/${encodeURIComponent(msg.txn_id)}`;
      resp = await this.rawJsonRequest(_httpApi.Method.Put, path, {}, msg.body);
    } else {
      _logger.logger.warn("Unsupported outgoing message", Object.getPrototypeOf(msg));
      resp = "";
    }
    if (msg.id) {
      await this.olmMachine.markRequestAsSent(msg.id, msg.type, resp);
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
    try {
      const response = await this.http.authedRequest(method, path, queryParams, body, opts);
      _logger.logger.info(`rust-crypto: successfully made HTTP request: ${method} ${path}`);
      return response;
    } catch (e) {
      _logger.logger.warn(`rust-crypto: error making HTTP request: ${method} ${path}: ${e}`);
      throw e;
    }
  }
}
exports.OutgoingRequestProcessor = OutgoingRequestProcessor;