"use strict";

module.exports = { // eslint-disable-line no-undef
  "globals": {
    "Log4Moz": true,
    "MailServices": true,
    "MsgHdrToMimeMessage": true,
    "ReloadMessage": true,
    "Services": true,
    "gDBView": true,
    "getBrowser": true,
  },

  "rules": {
    // Require trailing commas for easy list extension and consistent style.
    "comma-dangle": ["error", "always-multiline"],

    // Require braces around blocks that start a new line.
    "curly": ["error", "multi-line"],

    // Enforce valid JSDoc comments.
    "valid-jsdoc": ["error", {
      prefer: { return: "returns" },
      preferType: {
        "boolean": "Boolean",
        "string": "String",
        "number": "Number",
        "object": "Object",
        "function": "Function",
        "map": "Map",
        "set": "Set",
        "date": "Date",
      },
    }],
  },
};
