"use strict";

module.exports = {
  "rules": {
    // Don't Disallow Undeclared Variables (for now).
    // The linter does not see many globals from imported files
    // and .xul linked .js files, so there are too many false positives.
    "no-undef": "off",

    // Require spaces around operators, except for a|0.
    // Disabled for now given eslint doesn't support default args yet
    // "space-infix-ops": [2, { "int32Hint": true }],
    "space-infix-ops": 0,
  },
};
