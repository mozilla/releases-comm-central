"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
var _authorize = require("./authorize");
Object.keys(_authorize).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _authorize[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _authorize[key];
    }
  });
});
var _discovery = require("./discovery");
Object.keys(_discovery).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _discovery[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _discovery[key];
    }
  });
});
var _error = require("./error");
Object.keys(_error).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _error[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _error[key];
    }
  });
});
var _register = require("./register");
Object.keys(_register).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _register[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _register[key];
    }
  });
});
var _tokenRefresher = require("./tokenRefresher");
Object.keys(_tokenRefresher).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _tokenRefresher[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _tokenRefresher[key];
    }
  });
});
var _validate = require("./validate");
Object.keys(_validate).forEach(function (key) {
  if (key === "default" || key === "__esModule") return;
  if (key in exports && exports[key] === _validate[key]) return;
  Object.defineProperty(exports, key, {
    enumerable: true,
    get: function () {
      return _validate[key];
    }
  });
});