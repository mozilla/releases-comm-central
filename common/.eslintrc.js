"use strict";

module.exports = {
  "rules": {
    // Don't Disallow Undeclared Variables (for now).
    // The linter does not see many globals from imported files
    // and .xul linked .js files, so there are too many false positives.
    "no-undef": "off",
  },
};
