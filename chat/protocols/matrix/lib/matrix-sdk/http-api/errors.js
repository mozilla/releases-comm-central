"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixError = exports.HTTPError = exports.ConnectionError = void 0;
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
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

/**
 * Construct a generic HTTP error. This is a JavaScript Error with additional information
 * specific to HTTP responses.
 * @constructor
 * @param {string} msg The error message to include.
 * @param {number} httpStatus The HTTP response status code.
 */
class HTTPError extends Error {
  constructor(msg, httpStatus) {
    super(msg);
    this.httpStatus = httpStatus;
  }
}

/**
 * Construct a Matrix error. This is a JavaScript Error with additional
 * information specific to the standard Matrix error response.
 * @constructor
 * @param {Object} errorJson The Matrix error JSON returned from the homeserver.
 * @prop {string} errcode The Matrix 'errcode' value, e.g. "M_FORBIDDEN".
 * @prop {string} name Same as MatrixError.errcode but with a default unknown string.
 * @prop {string} message The Matrix 'error' value, e.g. "Missing token."
 * @prop {Object} data The raw Matrix error JSON used to construct this object.
 * @prop {number} httpStatus The numeric HTTP status code given
 */
exports.HTTPError = HTTPError;
class MatrixError extends HTTPError {
  constructor(errorJson = {}, httpStatus, url, event) {
    let message = errorJson.error || "Unknown message";
    if (httpStatus) {
      message = `[${httpStatus}] ${message}`;
    }
    if (url) {
      message = `${message} (${url})`;
    }
    super(`MatrixError: ${message}`, httpStatus);
    this.httpStatus = httpStatus;
    this.url = url;
    this.event = event;
    _defineProperty(this, "errcode", void 0);
    _defineProperty(this, "data", void 0);
    this.errcode = errorJson.errcode;
    this.name = errorJson.errcode || "Unknown error code";
    this.data = errorJson;
  }
}

/**
 * Construct a ConnectionError. This is a JavaScript Error indicating
 * that a request failed because of some error with the connection, either
 * CORS was not correctly configured on the server, the server didn't response,
 * the request timed out, or the internet connection on the client side went down.
 * @constructor
 */
exports.MatrixError = MatrixError;
class ConnectionError extends Error {
  constructor(message, cause) {
    super(message + (cause ? `: ${cause.message}` : ""));
  }
  get name() {
    return "ConnectionError";
  }
}
exports.ConnectionError = ConnectionError;