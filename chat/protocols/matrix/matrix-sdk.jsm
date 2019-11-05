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
    "../content-repo": matrixPath + "matrix_sdk/content-repo.js",
    "../../errors": matrixPath + "matrix_sdk/errors.js",
    "../indexeddb-helpers": matrixPath + "matrix_sdk/indexeddb-helpers.js",
    "../../indexeddb-helpers": matrixPath + "matrix_sdk/indexeddb-helpers.js",
    "../logger": matrixPath + "matrix_sdk/logger.js",
    "../../logger": matrixPath + "matrix_sdk/logger.js",
    "../randomstring": matrixPath + "matrix_sdk/randomstring.js",
    "../ReEmitter": matrixPath + "matrix_sdk/ReEmitter.js",
    "../sync-accumulator": matrixPath + "matrix_sdk/sync-accumulator.js",
    "../utils": matrixPath + "matrix_sdk/utils.js",
    "../utils.js": matrixPath + "matrix_sdk/utils.js",
    "../../utils": matrixPath + "matrix_sdk/utils.js",

    // crypto
    "crypto/backup_password":
      matrixPath + "matrix_sdk/crypto/backup_password.js",
    deviceinfo: matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    "../deviceinfo": matrixPath + "matrix_sdk/crypto/deviceinfo.js",
    DeviceList: matrixPath + "matrix_sdk/crypto/DeviceList.js",
    "../DeviceList": matrixPath + "matrix_sdk/crypto/DeviceList.js",
    crypto: matrixPath + "matrix_sdk/crypto/index.js",
    olmlib: matrixPath + "matrix_sdk/crypto/olmlib.js",
    "../olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    "crypto/olmlib": matrixPath + "matrix_sdk/crypto/olmlib.js",
    OlmDevice: matrixPath + "matrix_sdk/crypto/OlmDevice.js",
    "crypto/recoverykey": matrixPath + "matrix_sdk/crypto/recoverykey.js",
    OutgoingRoomKeyRequestManager:
      matrixPath + "matrix_sdk/crypto/OutgoingRoomKeyRequestManager.js",
    "crypto/RoomList": matrixPath + "matrix_sdk/crypto/RoomList.js",

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

    // models
    "../models/event": matrixPath + "matrix_sdk/models/event.js",
    "../../models/event": matrixPath + "matrix_sdk/models/event.js",
    "../lib/models/event": matrixPath + "matrix_sdk/models/event.js",
    "../../lib/models/event": matrixPath + "matrix_sdk/models/event.js",
    "../models/user": matrixPath + "matrix_sdk/models/user.js",

    // Simple (one-file) dependencies.
    "another-json": matrixPath + "another-json.js",
    "base-x": matrixPath + "base_x/index.js",
    bluebird: matrixPath + "bluebird.js",
    "browser-request": matrixPath + "browser_request/index.js",
    bs58: matrixPath + "bs58/index.js",
    "content-type": matrixPath + "content_type/index.js",
    events: matrixPath + "events.js",

    // unhomoglyph
    unhomoglyph: matrixPath + "unhomoglyph/index.js",
    "data.json": matrixPath + "unhomoglyph/data.json",

    // Packages that are not included, but an alternate implementation is given.
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
    },
    console,
    XMLHttpRequest,
    setTimeout,
    clearTimeout,
    location: { href: "" }, // workaround for browser-request's is_crossDomain

    // Necessary for interacting with the logging framework.
    scriptError,
    imIDebugMessage: Ci.imIDebugMessage,
  },
});

let requirer = Module("matrix-module", "");
let require = Require(loader, requirer);
let MatrixSDK = require("matrix.js");
MatrixSDK.request(require("browser-request"));
