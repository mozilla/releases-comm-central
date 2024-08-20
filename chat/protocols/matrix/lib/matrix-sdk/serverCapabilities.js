"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ServerCapabilities = exports.RoomVersionStability = void 0;
var _httpApi = require("./http-api");
var _logger = require("./logger");
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
// How often we update the server capabilities.
// 6 hours - an arbitrary value, but they should change very infrequently.
const CAPABILITIES_CACHE_MS = 6 * 60 * 60 * 1000;

// How long we want before retrying if we couldn't fetch
const CAPABILITIES_RETRY_MS = 30 * 1000;
let RoomVersionStability = exports.RoomVersionStability = /*#__PURE__*/function (RoomVersionStability) {
  RoomVersionStability["Stable"] = "stable";
  RoomVersionStability["Unstable"] = "unstable";
  return RoomVersionStability;
}({});
/**
 * A representation of the capabilities advertised by a homeserver as defined by
 * [Capabilities negotiation](https://spec.matrix.org/v1.6/client-server-api/#get_matrixclientv3capabilities).
 */
/**
 * Manages storing and periodically refreshing the server capabilities.
 */
class ServerCapabilities {
  constructor(http) {
    this.http = http;
    _defineProperty(this, "capabilities", void 0);
    _defineProperty(this, "retryTimeout", void 0);
    _defineProperty(this, "refreshTimeout", void 0);
    /**
     * Fetches the latest server capabilities from the homeserver and returns them, or rejects
     * on failure.
     */
    _defineProperty(this, "fetchCapabilities", async () => {
      const resp = await this.http.authedRequest(_httpApi.Method.Get, "/capabilities");
      this.capabilities = resp["capabilities"];
      return this.capabilities;
    });
    _defineProperty(this, "poll", async () => {
      try {
        await this.fetchCapabilities();
        this.clearTimeouts();
        this.refreshTimeout = setTimeout(this.poll, CAPABILITIES_CACHE_MS);
        _logger.logger.debug("Fetched new server capabilities");
      } catch (e) {
        this.clearTimeouts();
        const howLong = Math.floor(CAPABILITIES_RETRY_MS + Math.random() * 5000);
        this.retryTimeout = setTimeout(this.poll, howLong);
        _logger.logger.warn(`Failed to refresh capabilities: retrying in ${howLong}ms`, e);
      }
    });
  }

  /**
   * Starts periodically fetching the server capabilities.
   */
  start() {
    this.poll().then();
  }

  /**
   * Stops the service
   */
  stop() {
    this.clearTimeouts();
  }

  /**
   * Returns the cached capabilities, or undefined if none are cached.
   * @returns the current capabilities, if any.
   */
  getCachedCapabilities() {
    return this.capabilities;
  }
  clearTimeouts() {
    if (this.refreshTimeout) {
      clearInterval(this.refreshTimeout);
      this.refreshTimeout = undefined;
    }
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }
}
exports.ServerCapabilities = ServerCapabilities;