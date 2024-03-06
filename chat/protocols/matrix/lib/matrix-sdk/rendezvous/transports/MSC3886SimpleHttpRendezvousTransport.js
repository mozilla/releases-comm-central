"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC3886SimpleHttpRendezvousTransport = void 0;
var _matrixEventsSdk = require("matrix-events-sdk");
var _logger = require("../../logger");
var _utils = require("../../utils");
var _ = require("..");
var _httpApi = require("../../http-api");
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
const TYPE = new _matrixEventsSdk.UnstableValue("http.v1", "org.matrix.msc3886.http.v1");
/**
 * Implementation of the unstable [MSC3886](https://github.com/matrix-org/matrix-spec-proposals/pull/3886)
 * simple HTTP rendezvous protocol.
 * Note that this is UNSTABLE and may have breaking changes without notice.
 */
class MSC3886SimpleHttpRendezvousTransport {
  constructor({
    onFailure,
    client,
    fallbackRzServer,
    fetchFn
  }) {
    _defineProperty(this, "uri", void 0);
    _defineProperty(this, "etag", void 0);
    _defineProperty(this, "expiresAt", void 0);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "fallbackRzServer", void 0);
    _defineProperty(this, "fetchFn", void 0);
    _defineProperty(this, "cancelled", false);
    _defineProperty(this, "_ready", false);
    _defineProperty(this, "onFailure", void 0);
    this.fetchFn = fetchFn;
    this.onFailure = onFailure;
    this.client = client;
    this.fallbackRzServer = fallbackRzServer;
  }
  get ready() {
    return this._ready;
  }
  async details() {
    if (!this.uri) {
      throw new Error("Rendezvous not set up");
    }
    return {
      type: TYPE.name,
      uri: this.uri
    };
  }
  fetch(resource, options) {
    if (this.fetchFn) {
      return this.fetchFn(resource, options);
    }
    return global.fetch(resource, options);
  }
  async getPostEndpoint() {
    try {
      if (await this.client.doesServerSupportUnstableFeature("org.matrix.msc3886")) {
        return `${this.client.baseUrl}${_httpApi.ClientPrefix.Unstable}/org.matrix.msc3886/rendezvous`;
      }
    } catch (err) {
      _logger.logger.warn("Failed to get unstable features", err);
    }
    return this.fallbackRzServer;
  }
  async send(data) {
    if (this.cancelled) {
      return;
    }
    const method = this.uri ? "PUT" : "POST";
    const uri = this.uri ?? (await this.getPostEndpoint());
    if (!uri) {
      throw new Error("Invalid rendezvous URI");
    }
    const headers = {
      "content-type": "application/json"
    };
    if (this.etag) {
      headers["if-match"] = this.etag;
    }
    const res = await this.fetch(uri, {
      method,
      headers,
      body: JSON.stringify(data)
    });
    if (res.status === 404) {
      return this.cancel(_.RendezvousFailureReason.Unknown);
    }
    this.etag = res.headers.get("etag") ?? undefined;
    if (method === "POST") {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error("No rendezvous URI given");
      }
      const expires = res.headers.get("expires");
      if (expires) {
        this.expiresAt = new Date(expires);
      }
      // we would usually expect the final `url` to be set by a proper fetch implementation.
      // however, if a polyfill based on XHR is used it won't be set, we we use existing URI as fallback
      const baseUrl = res.url ?? uri;
      // resolve location header which could be relative or absolute
      this.uri = new URL(location, `${baseUrl}${baseUrl.endsWith("/") ? "" : "/"}`).href;
      this._ready = true;
    }
  }
  async receive() {
    if (!this.uri) {
      throw new Error("Rendezvous not set up");
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.cancelled) {
        return undefined;
      }
      const headers = {};
      if (this.etag) {
        headers["if-none-match"] = this.etag;
      }
      const poll = await this.fetch(this.uri, {
        method: "GET",
        headers
      });
      if (poll.status === 404) {
        this.cancel(_.RendezvousFailureReason.Unknown);
        return undefined;
      }

      // rely on server expiring the channel rather than checking ourselves

      if (poll.headers.get("content-type") !== "application/json") {
        this.etag = poll.headers.get("etag") ?? undefined;
      } else if (poll.status === 200) {
        this.etag = poll.headers.get("etag") ?? undefined;
        return poll.json();
      }
      await (0, _utils.sleep)(1000);
    }
  }
  async cancel(reason) {
    if (reason === _.RendezvousFailureReason.Unknown && this.expiresAt && this.expiresAt.getTime() < Date.now()) {
      reason = _.RendezvousFailureReason.Expired;
    }
    this.cancelled = true;
    this._ready = false;
    this.onFailure?.(reason);
    if (this.uri && reason === _.RendezvousFailureReason.UserDeclined) {
      try {
        await this.fetch(this.uri, {
          method: "DELETE"
        });
      } catch (e) {
        _logger.logger.warn(e);
      }
    }
  }
}
exports.MSC3886SimpleHttpRendezvousTransport = MSC3886SimpleHttpRendezvousTransport;