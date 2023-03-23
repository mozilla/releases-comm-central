"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.anySignal = anySignal;
exports.parseErrorResponse = parseErrorResponse;
exports.retryNetworkOperation = retryNetworkOperation;
exports.timeoutSignal = timeoutSignal;
var _contentType = require("content-type");
var _logger = require("../logger");
var _utils = require("../utils");
var _errors = require("./errors");
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

// Ponyfill for https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout
function timeoutSignal(ms) {
  const controller = new AbortController();
  setTimeout(() => {
    controller.abort();
  }, ms);
  return controller.signal;
}
function anySignal(signals) {
  const controller = new AbortController();
  function cleanup() {
    for (const signal of signals) {
      signal.removeEventListener("abort", onAbort);
    }
  }
  function onAbort() {
    controller.abort();
    cleanup();
  }
  for (const signal of signals) {
    if (signal.aborted) {
      onAbort();
      break;
    }
    signal.addEventListener("abort", onAbort);
  }
  return {
    signal: controller.signal,
    cleanup
  };
}

/**
 * Attempt to turn an HTTP error response into a Javascript Error.
 *
 * If it is a JSON response, we will parse it into a MatrixError. Otherwise
 * we return a generic Error.
 *
 * @param response - response object
 * @param body - raw body of the response
 * @returns
 */
function parseErrorResponse(response, body) {
  let contentType;
  try {
    contentType = getResponseContentType(response);
  } catch (e) {
    return e;
  }
  if (contentType?.type === "application/json" && body) {
    return new _errors.MatrixError(JSON.parse(body), response.status, isXhr(response) ? response.responseURL : response.url);
  }
  if (contentType?.type === "text/plain") {
    return new _errors.HTTPError(`Server returned ${response.status} error: ${body}`, response.status);
  }
  return new _errors.HTTPError(`Server returned ${response.status} error`, response.status);
}
function isXhr(response) {
  return "getResponseHeader" in response;
}

/**
 * extract the Content-Type header from the response object, and
 * parse it to a `{type, parameters}` object.
 *
 * returns null if no content-type header could be found.
 *
 * @param response - response object
 * @returns parsed content-type header, or null if not found
 */
function getResponseContentType(response) {
  let contentType;
  if (isXhr(response)) {
    contentType = response.getResponseHeader("Content-Type");
  } else {
    contentType = response.headers.get("Content-Type");
  }
  if (!contentType) return null;
  try {
    return (0, _contentType.parse)(contentType);
  } catch (e) {
    throw new Error(`Error parsing Content-Type '${contentType}': ${e}`);
  }
}

/**
 * Retries a network operation run in a callback.
 * @param maxAttempts - maximum attempts to try
 * @param callback - callback that returns a promise of the network operation. If rejected with ConnectionError, it will be retried by calling the callback again.
 * @returns the result of the network operation
 * @throws {@link ConnectionError} If after maxAttempts the callback still throws ConnectionError
 */
async function retryNetworkOperation(maxAttempts, callback) {
  let attempts = 0;
  let lastConnectionError = null;
  while (attempts < maxAttempts) {
    try {
      if (attempts > 0) {
        const timeout = 1000 * Math.pow(2, attempts);
        _logger.logger.log(`network operation failed ${attempts} times, retrying in ${timeout}ms...`);
        await (0, _utils.sleep)(timeout);
      }
      return await callback();
    } catch (err) {
      if (err instanceof _errors.ConnectionError) {
        attempts += 1;
        lastConnectionError = err;
      } else {
        throw err;
      }
    }
  }
  throw lastConnectionError;
}