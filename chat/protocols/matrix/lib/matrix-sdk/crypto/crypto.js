"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.crypto = exports.TextEncoder = void 0;
exports.setCrypto = setCrypto;
exports.setTextEncoder = setTextEncoder;
exports.subtleCrypto = void 0;
var _logger = require("../logger");
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

let crypto = exports.crypto = globalThis.window?.crypto;
let subtleCrypto = exports.subtleCrypto = globalThis.window?.crypto?.subtle ?? global.window?.crypto?.webkitSubtle;
let TextEncoder = exports.TextEncoder = globalThis.window?.TextEncoder;

/* eslint-disable @typescript-eslint/no-var-requires */
if (!crypto) {
  try {
    exports.crypto = crypto = require("crypto").webcrypto;
  } catch (e) {
    _logger.logger.error("Failed to load webcrypto", e);
  }
}
if (!subtleCrypto) {
  exports.subtleCrypto = subtleCrypto = crypto?.subtle;
}
if (!TextEncoder) {
  try {
    exports.TextEncoder = TextEncoder = require("util").TextEncoder;
  } catch (e) {
    _logger.logger.error("Failed to load TextEncoder util", e);
  }
}
/* eslint-enable @typescript-eslint/no-var-requires */

function setCrypto(_crypto) {
  exports.crypto = crypto = _crypto;
  exports.subtleCrypto = subtleCrypto = _crypto.subtle ?? _crypto.webkitSubtle;
}
function setTextEncoder(_TextEncoder) {
  exports.TextEncoder = TextEncoder = _TextEncoder;
}