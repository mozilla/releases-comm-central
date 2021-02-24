"use strict";

module.exports = {
  globals: {
    Feed: true,
    FeedEnclosure: true,
    FeedItem: true,
    FeedParser: true,
    FeedUtils: true,
    GetNumSelectedMessages: true,
    MailServices: true,
    MsgHdrToMimeMessage: true,
    ReloadMessage: true,
    Services: true,
    gDBView: true,
    gMessageNotificationBar: true,
    getBrowser: true,
    onCheckItem: true,
    openContentTab: true,
  },

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
