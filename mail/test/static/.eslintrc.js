"use strict";

const browserTestConfig = require("eslint-plugin-mozilla/lib/configs/browser-test.js");

module.exports = {
  ...browserTestConfig,
  rules: {
    ...browserTestConfig.rules,
    "func-names": "off",
  },
};
