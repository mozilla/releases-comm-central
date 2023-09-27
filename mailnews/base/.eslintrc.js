"use strict";

module.exports = {
  extends: ["plugin:mozilla/valid-jsdoc"],
  rules: {
    // Enforce using `let` only when variables are reassigned.
    "prefer-const": ["error", { destructuring: "all" }],
  },
};
