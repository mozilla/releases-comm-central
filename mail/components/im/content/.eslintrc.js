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

        // chat/modules/imStatusUtils.sys.mjs
        Status: true,

        // chat/modules/imTextboxUtils.sys.mjs
        MessageFormat: true,
        TextboxSize: true,
      },
    },
  ],
};
