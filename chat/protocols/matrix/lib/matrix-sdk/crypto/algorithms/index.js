"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
require("./olm.js");
require("./megolm.js");
var _base = require("./base.js");
Object.keys(_base).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _base[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _base[key];
    }
  });
});