"use strict";

module.exports = {
  globals: {
    // These are defined in the WebExtension script scopes by ExtensionCommon.jsm.
    // From toolkit/components/extensions/.eslintrc.js.
    ExtensionAPI: true,
    ExtensionCommon: true,
    extensions: true,
    ExtensionUtils: true,

    // From toolkit/components/extensions/child/.eslintrc.js.
    EventManager: true,
  },
};
