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
const { scriptError } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const { Loader, Require, Module } = ChromeUtils.import(
  "resource://devtools/shared/base-loader.js"
);

Cu.importGlobalProperties(["crypto"]);

const EXPORTED_SYMBOLS = [
  "MatrixSDK",
  "getHttpUriForMxc",
  "EventTimeline",
  "EventType",
  "MsgType",
];

// Set-up loading so require works properly in CommonJS modules.
//
// These are organized in a somewhat funky way:
// * First they're ordered by module.
// * Then they're ordered alphabetically by the destination file (e.g. this
//   keeps all references to utils.js next to each other).
// * They're then ordered by source, with the bare name first, then prefixed by
//   ., then prefixed by .., etc.
let matrixPath = "resource:///modules/matrix/";

// Load olm library in a browser-like environment. This allows it to load its
// wasm module, do crypto operations and log errors.
let olmScope = {
  get window() {
    return olmScope;
  },
  crypto,
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
};
Services.scriptloader.loadSubScript(matrixPath + "olm/olm.js", olmScope);

let loader = Loader({
  paths: {
    // Matrix SDK files.
    "": matrixPath + "matrix_sdk/",
    matrix: matrixPath + "matrix_sdk/matrix.js",
    "../content-repo": matrixPath + "matrix_sdk/content-repo.js",
    "../../errors": matrixPath + "matrix_sdk/errors.js",
    "../errors": matrixPath + "matrix_sdk/errors.js",
    "../indexeddb-helpers": matrixPath + "matrix_sdk/indexeddb-helpers.js",
    "../../indexeddb-helpers": matrixPath + "matrix_sdk/indexeddb-helpers.js",
    "../http-api": matrixPath + "matrix_sdk/http-api.js",
    "../logger": matrixPath + "matrix_sdk/logger.js",
    "../../logger": matrixPath + "matrix_sdk/logger.js",
    "../randomstring": matrixPath + "matrix_sdk/randomstring.js",
    "../ReEmitter": matrixPath + "matrix_sdk/ReEmitter.js",
    "../sync-accumulator": matrixPath + "matrix_sdk/sync-accumulator.js",
    "../utils": matrixPath + "matrix_sdk/utils.js",
    "../utils.js": matrixPath + "matrix_sdk/utils.js",
    "../../utils": matrixPath + "matrix_sdk/utils.js",

    // @types
    "@types/event": matrixPath + "matrix_sdk/types/event.js",

    // crypto
    deviceinfo: matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    "../deviceinfo": matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    DeviceList: matrixPath + "matrix_sdk/crypto/DeviceList.js",
    "../DeviceList": matrixPath + "matrix_sdk/crypto/DeviceList.js",
    crypto: matrixPath + "matrix_sdk/crypto/index.js",
    olmlib: matrixPath + "matrix_sdk/crypto/olmlib.js",
    "../olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    "crypto/olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    OlmDevice: matrixPath + "matrix_sdk/crypto/OlmDevice.js",
    "../OlmDevice": matrixPath + "matrix_sdk/crypto/OlmDevice.js",
    "crypto/recoverykey": matrixPath + "matrix_sdk/crypto/recoverykey.js",
    recoverykey: matrixPath + "matrix_sdk/crypto/recoverykey.js",
    OutgoingRoomKeyRequestManager:
      matrixPath + "matrix_sdk/crypto/OutgoingRoomKeyRequestManager.js",
    "crypto/RoomList": matrixPath + "matrix_sdk/crypto/RoomList.js",
    "crypto/CrossSigning": matrixPath + "matrix_sdk/crypto/CrossSigning.js",
    CrossSigning: matrixPath + "matrix_sdk/crypto/CrossSigning.js",
    EncryptionSetup: matrixPath + "matrix_sdk/crypto/EncryptionSetup.js",
    SecretStorage: matrixPath + "matrix_sdk/crypto/SecretStorage.js",
    aes: matrixPath + "matrix_sdk/crypto/aes.js",
    dehydration: matrixPath + "matrix_sdk/crypto/dehydration.js",
    "crypto/dehydration": matrixPath + "matrix_sdk/crypto/dehydration.js",
    key_passphrase: matrixPath + "matrix_sdk/crypto/key_passphrase.js",
    "crypto/key_passphrase": matrixPath + "matrix_sdk/crypto/key_passphrase.js",

    // crypto/algorithms
    base: matrixPath + "matrix_sdk/crypto/algorithms/base.js",
    algorithms: matrixPath + "matrix_sdk/crypto/algorithms/index.js",
    megolm: matrixPath + "matrix_sdk/crypto/algorithms/megolm.js",
    olm: matrixPath + "matrix_sdk/crypto/algorithms/olm.js",

    // crypto/store
    "store/indexeddb-crypto-store":
      matrixPath + "matrix_sdk/crypto/store/indexeddb-crypto-store.js",
    "crypto/store/indexeddb-crypto-store":
      matrixPath + "matrix_sdk/crypto/store/indexeddb-crypto-store.js",
    "../crypto/store/indexeddb-crypto-store":
      matrixPath + "matrix_sdk/crypto/store/indexeddb-crypto-store.js",
    "crypto/store/indexeddb-crypto-store-backend":
      matrixPath + "matrix_sdk/crypto/store/indexeddb-crypto-store-backend.js",
    "crypto/store/localStorage-crypto-store":
      matrixPath + "matrix_sdk/crypto/store/localStorage-crypto-store.js",
    "crypto/store/memory-crypto-store":
      matrixPath + "matrix_sdk/crypto/store/memory-crypto-store.js",

    // crypto/verification
    Base: matrixPath + "matrix_sdk/crypto/verification/Base.js",
    Error: matrixPath + "matrix_sdk/crypto/verification/Error.js",
    "verification/Base": matrixPath + "matrix_sdk/crypto/verification/Base.js",
    "verification/Error":
      matrixPath + "matrix_sdk/crypto/verification/Error.js",
    "verification/QRCode":
      matrixPath + "matrix_sdk/crypto/verification/QRCode.js",
    "verification/SAS": matrixPath + "matrix_sdk/crypto/verification/SAS.js",
    "verification/IllegalMethod":
      matrixPath + "matrix_sdk/crypto/verification/IllegalMethod.js",

    // crypto/verification/request
    "verification/request/InRoomChannel":
      matrixPath + "matrix_sdk/crypto/verification/request/InRoomChannel.js",
    "verification/request/ToDeviceChannel":
      matrixPath + "matrix_sdk/crypto/verification/request/ToDeviceChannel.js",
    "verification/request/VerificationRequest":
      matrixPath +
      "matrix_sdk/crypto/verification/request/VerificationRequest.js",

    // models
    "../models/event": matrixPath + "matrix_sdk/models/event.js",
    "../../models/event": matrixPath + "matrix_sdk/models/event.js",
    "../lib/models/event": matrixPath + "matrix_sdk/models/event.js",
    "../../lib/models/event": matrixPath + "matrix_sdk/models/event.js",
    "../models/user": matrixPath + "matrix_sdk/models/user.js",

    // Simple (one-file) dependencies.
    "another-json": matrixPath + "another-json.js",
    "base-x": matrixPath + "base_x/index.js",
    "browser-request": matrixPath + "browser_request/index.js",
    bs58: matrixPath + "bs58/index.js",
    "content-type": matrixPath + "content_type/index.js",
    qs: matrixPath + "qs.js",

    // unhomoglyph
    unhomoglyph: matrixPath + "unhomoglyph/index.js",
    "data.json": matrixPath + "unhomoglyph/data.json",

    // Packages that are not included, but an alternate implementation is given.
    events: matrixPath + "events.js",
    loglevel: matrixPath + "loglevel.js",
    "safe-buffer": matrixPath + "safe-buffer.js",
    url: matrixPath + "url.js",
  },
  globals: {
    global: {
      setInterval,
      clearInterval,
      setTimeout,
      clearTimeout,
      Olm: olmScope.Olm,
    },
    console,
    XMLHttpRequest,
    setTimeout,
    clearTimeout,
    location: { href: "" }, // workaround for browser-request's is_crossDomain

    // Necessary for interacting with the logging framework.
    scriptError,
    imIDebugMessage: Ci.imIDebugMessage,
    URL,
  },
});

let requirer = Module("matrix-module", "");
let require = Require(loader, requirer);

// The main entry point into the Matrix client.
let MatrixSDK = require("browser-index.js");

// Helper functions.
let getHttpUriForMxc = require("../content-repo").getHttpUriForMxc;

let EventTimeline = require("./models/event-timeline.js").EventTimeline;

let { EventType, MsgType } = require("@types/event");
