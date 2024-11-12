"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.MSC4108RendezvousSession = void 0;
var _logger = require("../../logger.js");
var _utils = require("../../utils.js");
var _index = require("../index.js");
var _matrix = require("../../matrix.js");
var _index2 = require("../../http-api/index.js");
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
 * Prototype of the unstable [MSC4108](https://github.com/matrix-org/matrix-spec-proposals/pull/4108)
 * insecure rendezvous session protocol.
 * @experimental Note that this is UNSTABLE and may have breaking changes without notice.
 */
class MSC4108RendezvousSession {
  constructor({
    fetchFn,
    onFailure,
    url,
    client,
    fallbackRzServer
  }) {
    _defineProperty(this, "url", void 0);
    _defineProperty(this, "client", void 0);
    _defineProperty(this, "fallbackRzServer", void 0);
    _defineProperty(this, "fetchFn", void 0);
    _defineProperty(this, "onFailure", void 0);
    _defineProperty(this, "etag", void 0);
    _defineProperty(this, "expiresAt", void 0);
    _defineProperty(this, "expiresTimer", void 0);
    _defineProperty(this, "_cancelled", false);
    _defineProperty(this, "_ready", false);
    this.fetchFn = fetchFn;
    this.onFailure = onFailure;
    this.client = client;
    this.fallbackRzServer = fallbackRzServer;
    this.url = url;
  }

  /**
   * Returns whether the channel is ready to be used.
   */
  get ready() {
    return this._ready;
  }

  /**
   * Returns whether the channel has been cancelled.
   */
  get cancelled() {
    return this._cancelled;
  }
  fetch(resource, options) {
    if (this.fetchFn) {
      return this.fetchFn(resource, options);
    }
    return global.fetch(resource, options);
  }
  async getPostEndpoint() {
    if (this.client) {
      try {
        if (await this.client.doesServerSupportUnstableFeature("org.matrix.msc4108")) {
          return this.client.http.getUrl("/org.matrix.msc4108/rendezvous", undefined, _index2.ClientPrefix.Unstable).toString();
        }
      } catch (err) {
        _logger.logger.warn("Failed to get unstable features", err);
      }
    }
    return this.fallbackRzServer;
  }

  /**
   * Sends data via the rendezvous channel.
   * @param data the payload to send
   */
  async send(data) {
    if (this._cancelled) {
      return;
    }
    const method = this.url ? _matrix.Method.Put : _matrix.Method.Post;
    const uri = this.url ?? (await this.getPostEndpoint());
    if (!uri) {
      throw new Error("Invalid rendezvous URI");
    }
    const headers = {
      "content-type": "text/plain"
    };

    // if we didn't create the rendezvous channel, we need to fetch the first etag if needed
    if (!this.etag && this.url) {
      await this.receive();
    }
    if (this.etag) {
      headers["if-match"] = this.etag;
    }
    _logger.logger.info(`=> ${method} ${uri} with ${data} if-match: ${this.etag}`);
    const res = await this.fetch(uri, {
      method,
      headers,
      body: data,
      redirect: "follow"
    });
    if (res.status === 404) {
      return this.cancel(_index.ClientRendezvousFailureReason.Unknown);
    }
    this.etag = res.headers.get("etag") ?? undefined;
    _logger.logger.info(`Received etag: ${this.etag}`);
    if (method === _matrix.Method.Post) {
      const expires = res.headers.get("expires");
      if (expires) {
        if (this.expiresTimer) {
          clearTimeout(this.expiresTimer);
          this.expiresTimer = undefined;
        }
        this.expiresAt = new Date(expires);
        this.expiresTimer = setTimeout(() => {
          this.expiresTimer = undefined;
          this.cancel(_index.ClientRendezvousFailureReason.Expired);
        }, this.expiresAt.getTime() - Date.now());
      }
      // MSC4108: we expect a JSON response with a rendezvous URL
      const json = await res.json();
      if (typeof json.url !== "string") {
        throw new Error("No rendezvous URL given");
      }
      this.url = json.url;
      this._ready = true;
    }
  }

  /**
   * Receives data from the rendezvous channel.
   * @return the returned promise won't resolve until new data is acquired or the channel is closed either by the server or the other party.
   */
  async receive() {
    if (!this.url) {
      throw new Error("Rendezvous not set up");
    }
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this._cancelled) {
        return undefined;
      }
      const headers = {};
      if (this.etag) {
        headers["if-none-match"] = this.etag;
      }
      _logger.logger.info(`=> GET ${this.url} if-none-match: ${this.etag}`);
      const poll = await this.fetch(this.url, {
        method: _matrix.Method.Get,
        headers
      });
      if (poll.status === 404) {
        await this.cancel(_index.ClientRendezvousFailureReason.Unknown);
        return undefined;
      }

      // rely on server expiring the channel rather than checking ourselves

      const etag = poll.headers.get("etag") ?? undefined;
      if (poll.headers.get("content-type") !== "text/plain") {
        this.etag = etag;
      } else if (poll.status === 200) {
        if (!etag) {
          // Some browsers & extensions block the ETag header for anti-tracking purposes
          // We try and detect this so the client can give the user a somewhat helpful message
          await this.cancel(_index.ClientRendezvousFailureReason.ETagMissing);
          return undefined;
        }
        this.etag = etag;
        const text = await poll.text();
        _logger.logger.info(`Received: ${text} with etag ${this.etag}`);
        return text;
      }
      await (0, _utils.sleep)(1000);
    }
  }

  /**
   * Cancels the rendezvous channel.
   * If the reason is user_declined or user_cancelled then the channel will also be closed.
   * @param reason the reason to cancel with
   */
  async cancel(reason) {
    if (this._cancelled) return;
    if (this.expiresTimer) {
      clearTimeout(this.expiresTimer);
      this.expiresTimer = undefined;
    }
    if (reason === _index.ClientRendezvousFailureReason.Unknown && this.expiresAt && this.expiresAt.getTime() < Date.now()) {
      reason = _index.ClientRendezvousFailureReason.Expired;
    }
    this._cancelled = true;
    this._ready = false;
    this.onFailure?.(reason);
    if (reason === _index.ClientRendezvousFailureReason.UserDeclined || reason === _index.MSC4108FailureReason.UserCancelled) {
      await this.close();
    }
  }

  /**
   * Closes the rendezvous channel.
   */
  async close() {
    if (this.expiresTimer) {
      clearTimeout(this.expiresTimer);
      this.expiresTimer = undefined;
    }
    if (!this.url) return;
    try {
      await this.fetch(this.url, {
        method: _matrix.Method.Delete
      });
    } catch (e) {
      _logger.logger.warn(e);
    }
  }
}
exports.MSC4108RendezvousSession = MSC4108RendezvousSession;