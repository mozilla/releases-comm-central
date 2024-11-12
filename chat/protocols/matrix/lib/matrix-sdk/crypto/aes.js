"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
Object.defineProperty(exports, "calculateKeyCheck", {
  enumerable: true,
  get: function () {
    return _secretStorage.calculateKeyCheck;
  }
});
Object.defineProperty(exports, "decryptAES", {
  enumerable: true,
  get: function () {
    return _decryptAESSecretStorageItem.default;
  }
});
Object.defineProperty(exports, "encryptAES", {
  enumerable: true,
  get: function () {
    return _encryptAESSecretStorageItem.default;
  }
});
var _encryptAESSecretStorageItem = _interopRequireDefault(require("../utils/encryptAESSecretStorageItem.js"));
var _decryptAESSecretStorageItem = _interopRequireDefault(require("../utils/decryptAESSecretStorageItem.js"));
var _secretStorage = require("../secret-storage.js");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }