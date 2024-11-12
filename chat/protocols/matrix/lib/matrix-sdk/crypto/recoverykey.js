"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _recoveryKey = require("../crypto-api/recovery-key.js");
Object.keys(_recoveryKey).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _recoveryKey[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _recoveryKey[key];
    }
  });
});