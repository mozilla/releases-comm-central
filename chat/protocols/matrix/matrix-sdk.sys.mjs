/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { console } from "resource://gre/modules/Console.sys.mjs";
import {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} from "resource://gre/modules/Timer.sys.mjs";
import { scriptError } from "resource:///modules/imXPCOMUtils.sys.mjs";

const { Loader, Require } = ChromeUtils.import(
  "resource://devtools/shared/loader/base-loader.js"
);

/**
 * Set of packages that have a top level index.js. This makes it so we don't
 * even try to require them as a js file directly and just fall through to the
 * index.js logic. These are paths without matrixPath in front.
 *
 * @type {Set<string>}
 */
const KNOWN_INDEX_JS = new Set([
  "matrix_events_sdk",
  "p_retry",
  "retry",
  "unhomoglyph",
  "matrix_sdk/crypto",
  "matrix_sdk/crypto/algorithms",
  "matrix_sdk/http_api",
  "matrix_sdk/rendezvous",
  "matrix_sdk/rendezvous/channels",
  "matrix_sdk/rendezvous/transports",
]);

// Set-up loading so require works properly in CommonJS modules.

let matrixPath = "resource:///modules/matrix/";

let globals = {
  atob,
  btoa,
  crypto,
  console,
  fetch,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  IDBKeyRange,
  get window() {
    return globals;
  },

  // Necessary for interacting with the logging framework.
  scriptError,
  imIDebugMessage: Ci.imIDebugMessage,
};
let loaderGlobal = {
  get window() {
    return globals;
  },
  get global() {
    return globals;
  },
  ...globals,
};
let loader = Loader({
  paths: {
    // Matrix SDK files.
    "matrix-sdk": matrixPath + "matrix_sdk",
    "matrix-sdk/@types": matrixPath + "matrix_sdk/types",
    "matrix-sdk/@types/requests": matrixPath + "empty.js",
    "matrix-sdk/http-api": matrixPath + "matrix_sdk/http_api",

    // Simple (one-file) dependencies.
    "another-json": matrixPath + "another-json.js",
    "base-x": matrixPath + "base_x/index.js",
    bs58: matrixPath + "bs58/index.js",
    "content-type": matrixPath + "content_type/index.js",
    qs: matrixPath + "qs.js",

    // unhomoglyph
    unhomoglyph: matrixPath + "unhomoglyph",

    // p-retry
    "p-retry": matrixPath + "p_retry",
    retry: matrixPath + "retry",

    // matrix-events-sdk
    "matrix-events-sdk": matrixPath + "matrix_events_sdk",
    "matrix-events-sdk/IPartialEvent": matrixPath + "empty.js",

    // Packages that are not included, but an alternate implementation is given.
    events: matrixPath + "events.js",
    loglevel: matrixPath + "loglevel.js",
    "safe-buffer": matrixPath + "safe-buffer.js",
  },
  globals: loaderGlobal,
  sandboxName: "Matrix SDK",
  // Custom require hook to support loading */index.js without explicitly
  // including it in the require path.
  requireHook: (id, require) => {
    try {
      // Get resolved path without matrixPath prefix and .js extension.
      const resolved = require.resolve(id).slice(matrixPath.length, -3);
      if (KNOWN_INDEX_JS.has(resolved)) {
        throw new Error("Must require index.js for module " + id);
      }
      return require(id);
    } catch (error) {
      // Make sure we only try to look for index.js on the initial failure and
      // not in requires earlier in the tree.
      if (!error.rethrown && !id.endsWith("/index.js")) {
        try {
          return require(id + "/index.js");
        } catch (indexError) {
          indexError.rethrown = true;
          throw indexError;
        }
      }
      error.rethrown = true;
      throw error;
    }
  },
});

// Load olm library in a browser-like environment. This allows it to load its
// wasm module, do crypto operations and log errors.
// Create the global in the commonJS loader context, so they share the same
// Uint8Array constructor.
let olmScope = Cu.createObjectIn(loader.sharedGlobal);
Object.assign(olmScope, {
  crypto,
  fetch,
  XMLHttpRequest,
  console,
  location: {
    href: matrixPath + "olm",
  },
  document: {
    currentScript: {
      src: matrixPath + "olm/olm.js",
    },
  },
});
Object.defineProperty(olmScope, "window", {
  get() {
    return olmScope;
  },
});
Services.scriptloader.loadSubScript(matrixPath + "olm/olm.js", olmScope);
olmScope.Olm.init().catch(console.error);
loader.globals.Olm = olmScope.Olm;
globals.Olm = olmScope.Olm;

let require = Require(loader, { id: "matrix-module" });

// Load the buffer shim into the global commonJS scope
loader.globals.Buffer = require("safe-buffer").Buffer;

globals.Buffer = loader.globals.Buffer;

// The main entry point into the Matrix client.
export let MatrixSDK = require("matrix-sdk/browser-index.js");

// Helper enums not exposed on MatrixSDK.
export let MatrixCrypto = require("matrix-sdk/crypto");
export let { SyncState } = require("matrix-sdk/sync");
export let OlmLib = require("matrix-sdk/crypto/olmlib");
export let { SasEvent } = require("matrix-sdk/crypto/verification/SAS");
export let { ReceiptType } = require("matrix-sdk/@types/read_receipts");
