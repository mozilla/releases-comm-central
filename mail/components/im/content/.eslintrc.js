"use strict";

module.exports = {
  overrides: [
    {
      files: ["imconversation.xml"],
      globals: {
        AppConstants: true,
        chatHandler: true,
        gChatTab: true,
        Services: true,

        // chat/modules/imStatusUtils.jsm
        Status: true,

        // chat/modules/imTextboxUtils.jsm
        MessageFormat: true,
        TextboxSize: true,
      },
    },
  ],
};
