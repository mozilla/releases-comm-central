"use strict";

module.exports = {
  rules: {
    // Enforce valid JSDoc comments.
    "valid-jsdoc": [
      "error",
      {
        prefer: { return: "returns" },
        preferType: {
          map: "Map",
          set: "Set",
          date: "Date",
        },
      },
    ],
  },
};
