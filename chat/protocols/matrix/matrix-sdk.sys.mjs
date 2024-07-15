/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} from "resource://gre/modules/Timer.sys.mjs";
import { scriptError } from "resource:///modules/imXPCOMUtils.sys.mjs";
import {
  Loader,
  Require,
} from "resource://devtools/shared/loader/base-loader.sys.mjs";

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
  "sdp_transform",
  "unhomoglyph",
  "matrix_sdk/crypto",
  "matrix_sdk/crypto/algorithms",
  "matrix_sdk/http_api",
  "matrix_sdk/oidc",
  "matrix_sdk/rendezvous",
  "matrix_sdk/rendezvous/channels",
  "matrix_sdk/rendezvous/transports",
  "matrix_widget_api",
]);

// Set-up loading so require works properly in CommonJS modules.

const matrixPath = "resource:///modules/matrix/";

const globals = {
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
const loaderGlobal = {
  get window() {
    return globals;
  },
  get global() {
    return globals;
  },
  ...globals,
};
const loader = Loader({
  // Custom path maps, add things here if:
  //
  // * The path has hyphens (map them to underscores).
  // * The path should be mapped to the "empty" file.
  paths: {
    // Matrix SDK files.
    "matrix-sdk": matrixPath + "matrix_sdk",
    "matrix-sdk/@types": matrixPath + "matrix_sdk/types",
    "matrix-sdk/@types/common": matrixPath + "empty.js",
    "matrix-sdk/@types/crypto": matrixPath + "empty.js",
    "matrix-sdk/@types/IIdentityServerProvider": matrixPath + "empty.js",
    "matrix-sdk/@types/local_notifications": matrixPath + "empty.js",
    "matrix-sdk/@types/registration": matrixPath + "empty.js",
    "matrix-sdk/@types/requests": matrixPath + "empty.js",
    "matrix-sdk/@types/uia": matrixPath + "empty.js",
    "matrix-sdk/common-crypto": matrixPath + "matrix_sdk/common_crypto",
    // The entire directory can't be mapped from crypto-api to crypto_api since
    // there's also a matrix-sdk/crypto-api.js.
    "matrix-sdk/crypto-api/verification":
      matrixPath + "matrix_sdk/crypto_api/verification.js",
    "matrix-sdk/crypto-api/keybackup": matrixPath + "empty.js",
    "matrix-sdk/http-api": matrixPath + "matrix_sdk/http_api",
    "matrix-sdk/rust-crypto": matrixPath + "matrix_sdk/rust_crypto",

    // Simple (one-file) dependencies.
    "another-json": matrixPath + "another-json.js",
    "base-x": matrixPath + "base_x/index.js",
    bs58: matrixPath + "bs58/index.js",
    "content-type": matrixPath + "content_type/index.js",
    "jwt-decode": matrixPath + "jwt_decode/index.js",
    "oidc-client-ts": matrixPath + "oidc-client-ts.js",

    // unhomoglyph
    unhomoglyph: matrixPath + "unhomoglyph",

    // p-retry
    "p-retry": matrixPath + "p_retry",
    retry: matrixPath + "retry",

    // matrix-events-sdk
    "matrix-events-sdk": matrixPath + "matrix_events_sdk",
    "matrix-events-sdk/IPartialEvent": matrixPath + "empty.js",

    // matrix-widget-api
    "matrix-widget-api": matrixPath + "matrix_widget_api",
    "matrix-widget-api/interfaces/CapabilitiesAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/ContentLoadedAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/GetMediaConfigAction":
      matrixPath + "empty.js",
    "matrix-widget-api/interfaces/ICustomWidgetData": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IJitsiWidgetData": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IRoomAccountData": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IRoomEvent": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IStickerpickerWidgetData":
      matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IWidget": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IWidgetApiRequest": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/IWidgetApiResponse": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/NavigateAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/OpenIDCredentialsAction":
      matrixPath + "empty.js",
    "matrix-widget-api/interfaces/ReadEventAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/ReadRelationsAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/ScreenshotAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/SetModalButtonEnabledAction":
      matrixPath + "empty.js",
    "matrix-widget-api/interfaces/SendAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/SendEventAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/SendToDeviceAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/StickerAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/StickyAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/SupportedVersionsAction":
      matrixPath + "empty.js",
    "matrix-widget-api/interfaces/TurnServerActions": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/UploadFileAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/VisibilityAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/WidgetAction": matrixPath + "empty.js",
    "matrix-widget-api/interfaces/WidgetConfigAction": matrixPath + "empty.js",
    "matrix-widget-api/transport/ITransport": matrixPath + "empty.js",

    // sdp-transform
    "sdp-transform": matrixPath + "sdp_transform",

    // Packages that are not included, but an alternate implementation is given.
    events: matrixPath + "events.js",
    loglevel: matrixPath + "loglevel.js",
    "safe-buffer": matrixPath + "safe-buffer.js",
    uuid: matrixPath + "uuid.js",
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
const olmScope = Cu.createObjectIn(loader.sharedGlobal);
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

const require = Require(loader, { id: "matrix-module" });

// Load the buffer shim into the global commonJS scope
loader.globals.Buffer = require("safe-buffer").Buffer;

globals.Buffer = loader.globals.Buffer;

// The main entry point into the Matrix client.
export const MatrixSDK = require("matrix-sdk/browser-index.js");

// Helper enums not exposed on MatrixSDK.
export const OlmLib = require("matrix-sdk/crypto/olmlib");
export const { ReceiptType } = require("matrix-sdk/@types/read_receipts");
export const { VerificationMethod } = require("matrix-sdk/types");
