"use strict";

module.exports = {
  "extends": "plugin:mozilla/xpcshell-test",

  "rules": {
    "func-names": "off",
    "mozilla/import-headjs-globals": "error",
    "no-unused-vars": ["error", {
      "args": "none",
      "vars": "all",
    }],
  },
};
