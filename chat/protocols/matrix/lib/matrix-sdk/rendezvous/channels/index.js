"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _MSC4108SecureChannel = require("./MSC4108SecureChannel.js");
Object.keys(_MSC4108SecureChannel).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _MSC4108SecureChannel[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _MSC4108SecureChannel[key];
    }
  });
});