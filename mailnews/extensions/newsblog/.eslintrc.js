"use strict";

module.exports = {
  rules: {
    // Enforce valid JSDoc comments.
    "valid-jsdoc": [
      "error",
      {
        prefer: { return: "returns" },
        preferType: {
          boolean: "Boolean",
          string: "String",
          number: "Number",
          object: "Object",
          function: "Function",
          map: "Map",
          set: "Set",
          date: "Date",
        },
      },
    ],
  },
};
