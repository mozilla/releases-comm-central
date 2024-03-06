"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _exportNames = {
  MatrixHttpApi: true
};
exports.MatrixHttpApi = void 0;
var _fetch = require("./fetch");
var _prefix = require("./prefix");
Object.keys(_prefix).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _prefix[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _prefix[key];
    }
  });
});
var _utils = require("../utils");
var callbacks = _interopRequireWildcard(require("../realtime-callbacks"));
var _method = require("./method");
Object.keys(_method).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _method[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _method[key];
    }
  });
});
var _errors = require("./errors");
Object.keys(_errors).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _errors[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _errors[key];
    }
  });
});
var _utils2 = require("./utils");
Object.keys(_utils2).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _utils2[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _utils2[key];
    }
  });
});
var _interface = require("./interface");
Object.keys(_interface).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (Object.prototype.hasOwnProperty.call(_exportNames, key)) return;
  if (key in exports && exports[key] === _interface[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _interface[key];
    }
  });
});
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && Object.prototype.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
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
class MatrixHttpApi extends _fetch.FetchHttpApi {
  constructor(...args) {
    super(...args);
    _defineProperty(this, "uploads", []);
  }
  /**
   * Upload content to the homeserver
   *
   * @param file - The object to upload. On a browser, something that
   *   can be sent to XMLHttpRequest.send (typically a File).  Under node.js,
   *   a Buffer, String or ReadStream.
   *
   * @param opts - options object
   *
   * @returns Promise which resolves to response object, as
   *    determined by this.opts.onlyData, opts.rawResponse, and
   *    opts.onlyContentUri.  Rejects with an error (usually a MatrixError).
   */
  uploadContent(file, opts = {}) {
    const includeFilename = opts.includeFilename ?? true;
    const abortController = opts.abortController ?? new AbortController();

    // If the file doesn't have a mime type, use a default since the HS errors if we don't supply one.
    const contentType = (opts.type ?? file.type) || "application/octet-stream";
    const fileName = opts.name ?? file.name;
    const upload = {
      loaded: 0,
      total: 0,
      abortController
    };
    const deferred = (0, _utils.defer)();
    if (global.XMLHttpRequest) {
      const xhr = new global.XMLHttpRequest();
      const timeoutFn = function () {
        xhr.abort();
        deferred.reject(new Error("Timeout"));
      };

      // set an initial timeout of 30s; we'll advance it each time we get a progress notification
      let timeoutTimer = callbacks.setTimeout(timeoutFn, 30000);
      xhr.onreadystatechange = function () {
        switch (xhr.readyState) {
          case global.XMLHttpRequest.DONE:
            callbacks.clearTimeout(timeoutTimer);
            try {
              if (xhr.status === 0) {
                throw new DOMException(xhr.statusText, "AbortError"); // mimic fetch API
              }
              if (!xhr.responseText) {
                throw new Error("No response body.");
              }
              if (xhr.status >= 400) {
                deferred.reject((0, _utils2.parseErrorResponse)(xhr, xhr.responseText));
              } else {
                deferred.resolve(JSON.parse(xhr.responseText));
              }
            } catch (err) {
              if (err.name === "AbortError") {
                deferred.reject(err);
                return;
              }
              deferred.reject(new _errors.ConnectionError("request failed", err));
            }
            break;
        }
      };
      xhr.upload.onprogress = ev => {
        callbacks.clearTimeout(timeoutTimer);
        upload.loaded = ev.loaded;
        upload.total = ev.total;
        timeoutTimer = callbacks.setTimeout(timeoutFn, 30000);
        opts.progressHandler?.({
          loaded: ev.loaded,
          total: ev.total
        });
      };
      const url = this.getUrl("/upload", undefined, _prefix.MediaPrefix.V3);
      if (includeFilename && fileName) {
        url.searchParams.set("filename", encodeURIComponent(fileName));
      }
      if (!this.opts.useAuthorizationHeader && this.opts.accessToken) {
        url.searchParams.set("access_token", encodeURIComponent(this.opts.accessToken));
      }
      xhr.open(_method.Method.Post, url.href);
      if (this.opts.useAuthorizationHeader && this.opts.accessToken) {
        xhr.setRequestHeader("Authorization", "Bearer " + this.opts.accessToken);
      }
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.send(file);
      abortController.signal.addEventListener("abort", () => {
        xhr.abort();
      });
    } else {
      const queryParams = {};
      if (includeFilename && fileName) {
        queryParams.filename = fileName;
      }
      const headers = {
        "Content-Type": contentType
      };
      this.authedRequest(_method.Method.Post, "/upload", queryParams, file, {
        prefix: _prefix.MediaPrefix.V3,
        headers,
        abortSignal: abortController.signal
      }).then(response => {
        return this.opts.onlyData ? response : response.json();
      }).then(deferred.resolve, deferred.reject);
    }

    // remove the upload from the list on completion
    upload.promise = deferred.promise.finally(() => {
      (0, _utils.removeElement)(this.uploads, elem => elem === upload);
    });
    abortController.signal.addEventListener("abort", () => {
      (0, _utils.removeElement)(this.uploads, elem => elem === upload);
      deferred.reject(new DOMException("Aborted", "AbortError"));
    });
    this.uploads.push(upload);
    return upload.promise;
  }
  cancelUpload(promise) {
    const upload = this.uploads.find(u => u.promise === promise);
    if (upload) {
      upload.abortController.abort();
      return true;
    }
    return false;
  }
  getCurrentUploads() {
    return this.uploads;
  }

  /**
   * Get the content repository url with query parameters.
   * @returns An object with a 'base', 'path' and 'params' for base URL,
   *          path and query parameters respectively.
   */
  getContentUri() {
    return {
      base: this.opts.baseUrl,
      path: _prefix.MediaPrefix.V3 + "/upload",
      params: {
        access_token: this.opts.accessToken
      }
    };
  }
}
exports.MatrixHttpApi = MatrixHttpApi;