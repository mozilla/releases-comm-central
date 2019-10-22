/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { console } = ChromeUtils.import("resource://gre/modules/Console.jsm");
const {
  clearInterval,
  clearTimeout,
  setInterval,
  setTimeout,
} = ChromeUtils.import("resource://gre/modules/Timer.jsm");

const { Loader, Require, Module } = ChromeUtils.import(
  "resource://devtools/shared/base-loader.js"
);

this.EXPORTED_SYMBOLS = ["MatrixSDK"];

// Set-up loading so require works properly in CommonJS modules.
//
// These are organized in a somewhat funky way:
// * First they're ordered by module.
// * Then they're ordered alphabetically by the destination file (e.g. this
//   keeps all references to utils.js next to each other).
// * They're then ordered by source, with the bare name first, then prefixed by
//   ., then prefixed by .., etc.
let matrixPath = "resource:///modules/matrix/";
let loader = Loader({
  paths: {
    // Matrix SDK files.
    "": matrixPath + "matrix_sdk/",
    "./base-apis": matrixPath + "matrix_sdk/base-apis.js",
    "./client": matrixPath + "matrix_sdk/client.js",
    "./content-repo": matrixPath + "matrix_sdk/content-repo.js",
    "../content-repo": matrixPath + "matrix_sdk/content-repo.js",
    "./filter": matrixPath + "matrix_sdk/filter.js",
    "./filter-component": matrixPath + "matrix_sdk/filter-component.js",
    "./http-api": matrixPath + "matrix_sdk/http-api.js",
    "./interactive-auth": matrixPath + "matrix_sdk/interactive-auth.js",
    "./pushprocessor": matrixPath + "matrix_sdk/pushprocessor.js",
    "./realtime-callbacks": matrixPath + "matrix_sdk/realtime-callbacks.js",
    "./scheduler": matrixPath + "matrix_sdk/scheduler.js",
    "./sync": matrixPath + "matrix_sdk/sync.js",
    "./timeline-window": matrixPath + "matrix_sdk/timeline-window.js",
    "./utils": matrixPath + "matrix_sdk/utils.js",
    "../utils": matrixPath + "matrix_sdk/utils.js",
    "../../utils": matrixPath + "matrix_sdk/utils.js",
    "./../../utils": matrixPath + "matrix_sdk/utils.js",

    // crypto
    base: matrixPath + "matrix_sdk/crypto/algorithms/base.js",
    "./base": matrixPath + "matrix_sdk/crypto/algorithms/base.js",
    algorithms: matrixPath + "matrix_sdk/crypto/algorithms/index.js",
    "./algorithms": matrixPath + "matrix_sdk/crypto/algorithms/index.js",
    megolm: matrixPath + "matrix_sdk/crypto/algorithms/megolm.js",
    "./megolm": matrixPath + "matrix_sdk/crypto/algorithms/megolm.js",
    olm: matrixPath + "matrix_sdk/crypto/algorithms/olm.js",
    "./olm": matrixPath + "matrix_sdk/crypto/algorithms/olm.js",
    deviceinfo: matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    "./deviceinfo": matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    "../deviceinfo": matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    crypto: matrixPath + "matrix_sdk/crypto/index.js",
    "./crypto": matrixPath + "matrix_sdk/crypto/index.js",
    olmlib: matrixPath + "matrix_sdk/crypto/olmlib.js",
    "./olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    "../olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    OlmDevice: matrixPath + "matrix_sdk/crypto/OlmDevice.js",
    "./OlmDevice": matrixPath + "matrix_sdk/crypto/OlmDevice.js",

    // models
    "./event": matrixPath + "matrix_sdk/models/event.js",
    "./models/event": matrixPath + "matrix_sdk/models/event.js",
    "../models/event": matrixPath + "matrix_sdk/models/event.js",
    "./event-context": matrixPath + "matrix_sdk/models/event-content.js",
    "./event-timeline": matrixPath + "matrix_sdk/models/event-timeline.js",
    "./models/event-timeline": matrixPath + "matrix_sdk/models/event-timeline.js",
    "./event-timeline-set": matrixPath + "matrix_sdk/models/event-timeline-set.js",
    "./models/event-timeline-set": matrixPath + "matrix_sdk/models/event-timeline-set.js",
    "./models/room": matrixPath + "matrix_sdk/models/room.js",
    "../models/room": matrixPath + "matrix_sdk/models/room.js",
    "./room-member": matrixPath + "matrix_sdk/models/room-member.js",
    "./models/room-member": matrixPath + "matrix_sdk/models/room-member.js",
    "./room-state": matrixPath + "matrix_sdk/models/room-state.js",
    "./models/room-state": matrixPath + "matrix_sdk/models/room-state.js",
    "./room-summary": matrixPath + "matrix_sdk/models/room-summary.js",
    "./models/search-result": matrixPath + "matrix_sdk/models/search-result.js",
    "./models/user": matrixPath + "matrix_sdk/models/user.js",
    "../models/user": matrixPath + "matrix_sdk/models/user.js",

    // store
    "./store/memory": matrixPath + "matrix_sdk/store/memory.js",
    "./store/session/webstorage": matrixPath + "matrix_sdk/store/session/webstorage.js",
    "./store/stub": matrixPath + "matrix_sdk/store/stub.js",
    "./store/webstorage": matrixPath + "matrix_sdk/store/webstorage.js",

    // webrtc
    "./webrtc/call": matrixPath + "matrix_sdk/webrtc/call.js",

    // Simple (one-file) dependencies.
    "another-json": matrixPath + "another-json.js",
    events: matrixPath + "events.js",
    punycode: matrixPath + "punycode.js",
    url: matrixPath + "url.js",

    // Browser Request.
    "browser-request": matrixPath + "browser_request/index.js",

    // q
    q: matrixPath + "q/q.js",
    "./q": matrixPath + "q/q.js",

    // querystring
    decode: matrixPath + "querystring/decode.js",
    "./decode": matrixPath + "querystring/decode.js",
    encode: matrixPath + "querystring/encode.js",
    "./encode": matrixPath + "querystring/encode.js",
    querystring: matrixPath + "querystring/index.js",
  },
  globals: {
    global: {
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
    },
    console,
    XMLHttpRequest,
    setTimeout,
    clearTimeout,
    location: { href: "" }, // workaround for browser-request's is_crossDomain
  },
});

let requirer = Module("matrix-module", "");
let require = Require(loader, requirer);
let MatrixSDK = require("matrix.js");
MatrixSDK.request(require("browser-request"));
