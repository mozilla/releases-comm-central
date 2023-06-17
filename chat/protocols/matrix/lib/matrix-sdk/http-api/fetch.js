"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.FetchHttpApi = void 0;
var _utils = require("../utils");
var _method = require("./method");
var _errors = require("./errors");
var _interface = require("./interface");
var _utils2 = require("./utils");
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); } /*
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
                                                                                                                                                                                                                                                                                                                                                                                          */ /**
                                                                                                                                                                                                                                                                                                                                                                                              * This is an internal module. See {@link MatrixHttpApi} for the public class.
                                                                                                                                                                                                                                                                                                                                                                                              */
class FetchHttpApi {
  constructor(eventEmitter, opts) {
    this.eventEmitter = eventEmitter;
    this.opts = opts;
    _defineProperty(this, "abortController", new AbortController());
    (0, _utils.checkObjectHasKeys)(opts, ["baseUrl", "prefix"]);
    opts.onlyData = !!opts.onlyData;
    opts.useAuthorizationHeader = opts.useAuthorizationHeader ?? true;
  }
  abort() {
    this.abortController.abort();
    this.abortController = new AbortController();
  }
  fetch(resource, options) {
    if (this.opts.fetchFn) {
      return this.opts.fetchFn(resource, options);
    }
    return global.fetch(resource, options);
  }

  /**
   * Sets the base URL for the identity server
   * @param url - The new base url
   */
  setIdBaseUrl(url) {
    this.opts.idBaseUrl = url;
  }
  idServerRequest(method, path, params, prefix, accessToken) {
    if (!this.opts.idBaseUrl) {
      throw new Error("No identity server base URL set");
    }
    let queryParams = undefined;
    let body = undefined;
    if (method === _method.Method.Get) {
      queryParams = params;
    } else {
      body = params;
    }
    const fullUri = this.getUrl(path, queryParams, prefix, this.opts.idBaseUrl);
    const opts = {
      json: true,
      headers: {}
    };
    if (accessToken) {
      opts.headers.Authorization = `Bearer ${accessToken}`;
    }
    return this.requestOtherUrl(method, fullUri, body, opts);
  }

  /**
   * Perform an authorised request to the homeserver.
   * @param method - The HTTP method e.g. "GET".
   * @param path - The HTTP path <b>after</b> the supplied prefix e.g.
   * "/createRoom".
   *
   * @param queryParams - A dict of query params (these will NOT be
   * urlencoded). If unspecified, there will be no query params.
   *
   * @param body - The HTTP JSON body.
   *
   * @param opts - additional options. If a number is specified,
   * this is treated as `opts.localTimeoutMs`.
   *
   * @returns Promise which resolves to
   * ```
   * {
   *     data: {Object},
   *     headers: {Object},
   *     code: {Number},
   * }
   * ```
   * If `onlyData` is set, this will resolve to the `data` object only.
   * @returns Rejects with an error if a problem occurred.
   * This includes network problems and Matrix-specific error JSON.
   */
  authedRequest(method, path, queryParams, body, opts = {}) {
    if (!queryParams) queryParams = {};
    if (this.opts.accessToken) {
      if (this.opts.useAuthorizationHeader) {
        if (!opts.headers) {
          opts.headers = {};
        }
        if (!opts.headers.Authorization) {
          opts.headers.Authorization = "Bearer " + this.opts.accessToken;
        }
        if (queryParams.access_token) {
          delete queryParams.access_token;
        }
      } else if (!queryParams.access_token) {
        queryParams.access_token = this.opts.accessToken;
      }
    }
    const requestPromise = this.request(method, path, queryParams, body, opts);
    requestPromise.catch(err => {
      if (err.errcode == "M_UNKNOWN_TOKEN" && !opts?.inhibitLogoutEmit) {
        this.eventEmitter.emit(_interface.HttpApiEvent.SessionLoggedOut, err);
      } else if (err.errcode == "M_CONSENT_NOT_GIVEN") {
        this.eventEmitter.emit(_interface.HttpApiEvent.NoConsent, err.message, err.data.consent_uri);
      }
    });

    // return the original promise, otherwise tests break due to it having to
    // go around the event loop one more time to process the result of the request
    return requestPromise;
  }

  /**
   * Perform a request to the homeserver without any credentials.
   * @param method - The HTTP method e.g. "GET".
   * @param path - The HTTP path <b>after</b> the supplied prefix e.g.
   * "/createRoom".
   *
   * @param queryParams - A dict of query params (these will NOT be
   * urlencoded). If unspecified, there will be no query params.
   *
   * @param body - The HTTP JSON body.
   *
   * @param opts - additional options
   *
   * @returns Promise which resolves to
   * ```
   * {
   *  data: {Object},
   *  headers: {Object},
   *  code: {Number},
   * }
   * ```
   * If `onlyData</code> is set, this will resolve to the <code>data`
   * object only.
   * @returns Rejects with an error if a problem
   * occurred. This includes network problems and Matrix-specific error JSON.
   */
  request(method, path, queryParams, body, opts) {
    const fullUri = this.getUrl(path, queryParams, opts?.prefix, opts?.baseUrl);
    return this.requestOtherUrl(method, fullUri, body, opts);
  }

  /**
   * Perform a request to an arbitrary URL.
   * @param method - The HTTP method e.g. "GET".
   * @param url - The HTTP URL object.
   *
   * @param body - The HTTP JSON body.
   *
   * @param opts - additional options
   *
   * @returns Promise which resolves to data unless `onlyData` is specified as false,
   * where the resolved value will be a fetch Response object.
   * @returns Rejects with an error if a problem
   * occurred. This includes network problems and Matrix-specific error JSON.
   */
  async requestOtherUrl(method, url, body, opts = {}) {
    const headers = Object.assign({}, opts.headers || {});
    const json = opts.json ?? true;
    // We can't use getPrototypeOf here as objects made in other contexts e.g. over postMessage won't have same ref
    const jsonBody = json && body?.constructor?.name === Object.name;
    if (json) {
      if (jsonBody && !headers["Content-Type"]) {
        headers["Content-Type"] = "application/json";
      }
      if (!headers["Accept"]) {
        headers["Accept"] = "application/json";
      }
    }
    const timeout = opts.localTimeoutMs ?? this.opts.localTimeoutMs;
    const keepAlive = opts.keepAlive ?? false;
    const signals = [this.abortController.signal];
    if (timeout !== undefined) {
      signals.push((0, _utils2.timeoutSignal)(timeout));
    }
    if (opts.abortSignal) {
      signals.push(opts.abortSignal);
    }
    let data;
    if (jsonBody) {
      data = JSON.stringify(body);
    } else {
      data = body;
    }
    const {
      signal,
      cleanup
    } = (0, _utils2.anySignal)(signals);
    let res;
    try {
      res = await this.fetch(url, {
        signal,
        method,
        body: data,
        headers,
        mode: "cors",
        redirect: "follow",
        referrer: "",
        referrerPolicy: "no-referrer",
        cache: "no-cache",
        credentials: "omit",
        // we send credentials via headers
        keepalive: keepAlive
      });
    } catch (e) {
      if (e.name === "AbortError") {
        throw e;
      }
      throw new _errors.ConnectionError("fetch failed", e);
    } finally {
      cleanup();
    }
    if (!res.ok) {
      throw (0, _utils2.parseErrorResponse)(res, await res.text());
    }
    if (this.opts.onlyData) {
      return json ? res.json() : res.text();
    }
    return res;
  }

  /**
   * Form and return a homeserver request URL based on the given path params and prefix.
   * @param path - The HTTP path <b>after</b> the supplied prefix e.g. "/createRoom".
   * @param queryParams - A dict of query params (these will NOT be urlencoded).
   * @param prefix - The full prefix to use e.g. "/_matrix/client/v2_alpha", defaulting to this.opts.prefix.
   * @param baseUrl - The baseUrl to use e.g. "https://matrix.org", defaulting to this.opts.baseUrl.
   * @returns URL
   */
  getUrl(path, queryParams, prefix, baseUrl) {
    const baseUrlWithFallback = baseUrl ?? this.opts.baseUrl;
    const baseUrlWithoutTrailingSlash = baseUrlWithFallback.endsWith("/") ? baseUrlWithFallback.slice(0, -1) : baseUrlWithFallback;
    const url = new URL(baseUrlWithoutTrailingSlash + (prefix ?? this.opts.prefix) + path);
    if (queryParams) {
      (0, _utils.encodeParams)(queryParams, url.searchParams);
    }
    return url;
  }
}
exports.FetchHttpApi = FetchHttpApi;