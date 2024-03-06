"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MatrixError = exports.HTTPError = exports.ConnectionError = void 0;
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : String(i); }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
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
 * @param msg - The error message to include.
 * @param httpStatus - The HTTP response status code.
 */
class HTTPError extends Error {
  constructor(msg, httpStatus) {
    super(msg);
    this.httpStatus = httpStatus;
  }
}
exports.HTTPError = HTTPError;
class MatrixError extends HTTPError {
  /**
   * Construct a Matrix error. This is a JavaScript Error with additional
   * information specific to the standard Matrix error response.
   * @param errorJson - The Matrix error JSON returned from the homeserver.
   * @param httpStatus - The numeric HTTP status code given
   */
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
    // The Matrix 'errcode' value, e.g. "M_FORBIDDEN".
    _defineProperty(this, "errcode", void 0);
    // The raw Matrix error JSON used to construct this object.
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