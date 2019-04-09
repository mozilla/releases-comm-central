"use strict";

module.exports = {
  overrides: [{
    files: [
      "imconv.xml",
      "imconversation.xml",
    ],
    globals: {
      AppConstants: true,
      chatHandler: true,
      fixIterator: true,
      gChatTab: true,
      Services: true,

      // chat/modules/imStatusUtils.jsm
      Status: true,

      // chat/modules/imTextboxUtils.jsm
      MessageFormat: true,
      TextboxSize: true,
    },
  }],
};
