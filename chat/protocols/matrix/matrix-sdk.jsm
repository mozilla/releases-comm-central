/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var {classes: Cc, interfaces: Ci, utils: Cu} = Components;

Cu.import("resource://gre/modules/Console.jsm");
Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/Timer.jsm");
Cu.importGlobalProperties(["XMLHttpRequest"]);

const { Loader, Require, Module } = Cu.import("resource://gre/modules/commonjs/toolkit/loader.js", {});

this.EXPORTED_SYMBOLS = ["MatrixSDK"];

// Set-up loading so require works properly in CommonJS modules.
let matrixPath = "resource:///modules/matrix/";
let loader = Loader({
  paths: {
      "": matrixPath,
      "../../utils": matrixPath + "utils.js",
      "../content-repo": matrixPath + "content-repo.js",
      "../deviceinfo": matrixPath + "crypto/deviceinfo.js",
      "../models/event": matrixPath + "models/event.js",
      "../models/room": matrixPath + "models/room.js",
      "../models/user": matrixPath + "models/user.js",
      "../olmlib": matrixPath + "crypto/olmlib.js",
      "../utils": matrixPath + "utils.js",
      "./../../utils": matrixPath + "utils.js",
      "./OlmDevice": matrixPath + "crypto/OlmDevice.js",
      "./algorithms": matrixPath + "crypto/algorithms/index.js",
      "./base": matrixPath + "crypto/algorithms/base.js",
      "./base-apis": matrixPath + "base-apis.js",
      "./client": matrixPath + "client.js",
      "./content-repo": matrixPath + "content-repo.js",
      "./crypto": matrixPath + "crypto/index.js",
      "./decode": matrixPath + "browserify/querystring/decode.js",
      "./deviceinfo": matrixPath + "crypto/deviceinfo.js",
      "./encode": matrixPath + "browserify/querystring/encode.js",
      "./event": matrixPath + "models/event.js",
      "./event-context": matrixPath + "models/event-content.js",
      "./event-timeline": matrixPath + "models/event-timeline.js",
      "./event-timeline-set": matrixPath + "models/event-timeline-set.js",
      "./filter": matrixPath + "filter.js",
      "./filter-component": matrixPath + "filter-component.js",
      "./http-api": matrixPath + "http-api.js",
      "./interactive-auth": matrixPath + "interactive-auth.js",
      "./megolm": matrixPath + "crypto/algorithms/megolm.js",
      "./models/event": matrixPath + "models/event.js",
      "./models/event-timeline": matrixPath + "models/event-timeline.js",
      "./models/event-timeline-set": matrixPath + "models/event-timeline-set.js",
      "./models/room": matrixPath + "models/room.js",
      "./models/room-member": matrixPath + "models/room-member.js",
      "./models/room-state": matrixPath + "models/room-state.js",
      "./models/search-result": matrixPath + "models/search-result.js",
      "./models/user": matrixPath + "models/user.js",
      "./olm": matrixPath + "crypto/algorithms/olm.js",
      "./olmlib": matrixPath + "crypto/olmlib.js",
      "./pushprocessor": matrixPath + "pushprocessor.js",
      "./q": matrixPath + "q/q.js",
      "./realtime-callbacks": matrixPath + "realtime-callbacks.js",
      "./room-member": matrixPath + "models/room-member.js",
      "./room-state": matrixPath + "models/room-state.js",
      "./room-summary": matrixPath + "models/room-summary.js",
      "./scheduler": matrixPath + "scheduler.js",
      "./store/memory": matrixPath + "store/memory.js",
      "./store/session/webstorage": matrixPath + "store/session/webstorage.js",
      "./store/stub": matrixPath + "store/stub.js",
      "./store/webstorage": matrixPath + "store/webstorage.js",
      "./sync": matrixPath + "sync.js",
      "./timeline-window": matrixPath + "timeline-window.js",
      "./utils": matrixPath + "utils.js",
      "./webrtc/call": matrixPath + "webrtc/call.js",
      "OlmDevice": matrixPath + "crypto/OlmDevice.js",
      "algorithms": matrixPath + "crypto/algorithms/index.js",
      "another-json": matrixPath + "another_json/another-json.js",
      "base": matrixPath + "crypto/algorithms/base.js",
      "browser-request": matrixPath + "browser_request/index.js",
      "crypto": matrixPath + "crypto/index.js",
      "decode": matrixPath + "browserify/querystring/decode.js",
      "deviceinfo": matrixPath + "crypto/deviceinfo.js",
      "encode": matrixPath + "browserify/querystring/encode.js",
      "events": matrixPath + "browserify/events.js",
      "megolm": matrixPath + "crypto/algorithms/megolm.js",
      "olm": matrixPath + "crypto/algorithms/olm.js",
      "olmlib": matrixPath + "crypto/olmlib.js",
      "punycode": matrixPath + "browserify/punycode.js",
      "q": matrixPath + "q/q.js",
      "querystring": matrixPath + "browserify/querystring/index.js",
      "url": matrixPath + "browserify/url.js",
  },
  globals: {
    global: {
      setInterval: setInterval,
      clearInterval: clearInterval,
      setTimeout: setTimeout,
      clearTimeout: clearTimeout,
    },
    console: console,
    XMLHttpRequest: XMLHttpRequest,
    setTimeout: setTimeout,
    clearTimeout: clearTimeout,
    location: { href: "" }, // workaround for browser-request's is_crossDomain
  }
})

let requirer = Module("matrix-module", "");
let require = Require(loader, requirer);
MatrixSDK = require("matrix.js");
MatrixSDK.request(require("browser-request"));
