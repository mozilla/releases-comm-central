"use strict";

module.exports = { // eslint-disable-line no-undef
  "globals": {
    "Feed": true,
    "FeedEnclosure": true,
    "FeedItem": true,
    "FeedParser": true,
    "FeedUtils": true,
    "GetNumSelectedMessages": true,
    "gMessageNotificationBar": true,
    "onCheckItem": true,
    "openContentTab": true,
  },

  "rules": {
    // Warn about cyclomatic complexity in functions.
    "complexity": ["error", 70],
  },
};
