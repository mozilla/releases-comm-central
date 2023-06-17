"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.OutgoingRequestProcessor = void 0;
var _matrixSdkCryptoJs = require("@matrix-org/matrix-sdk-crypto-js");
var _logger = require("../logger");
var _httpApi = require("../http-api");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
  async makeOutgoingRequest(msg, uiaCallback) {
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
    } else if (msg instanceof _matrixSdkCryptoJs.SigningKeysUploadRequest) {
      resp = await this.makeRequestWithUIA(_httpApi.Method.Post, "/_matrix/client/v3/keys/device_signing/upload", {}, msg.body, uiaCallback);
    } else {
      _logger.logger.warn("Unsupported outgoing message", Object.getPrototypeOf(msg));
      resp = "";
    }
    if (msg.id) {
      await this.olmMachine.markRequestAsSent(msg.id, msg.type, resp);
    }
  }
  async makeRequestWithUIA(method, path, queryParams, body, uiaCallback) {
    if (!uiaCallback) {
      return await this.rawJsonRequest(method, path, queryParams, body);
    }
    const parsedBody = JSON.parse(body);
    const makeRequest = async auth => {
      const newBody = _objectSpread(_objectSpread({}, parsedBody), {}, {
        auth
      });
      const resp = await this.rawJsonRequest(method, path, queryParams, JSON.stringify(newBody));
      return JSON.parse(resp);
    };
    const resp = await uiaCallback(makeRequest);
    return JSON.stringify(resp);
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