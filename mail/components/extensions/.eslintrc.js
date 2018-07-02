"use strict";

module.exports = { // eslint-disable-line no-undef
  "globals": {
    // These are defined in the WebExtension script scopes by ExtensionCommon.jsm.
    // From toolkit/components/extensions/.eslintrc.js.
    "Cc": true,
    "Ci": true,
    "Cr": true,
    "Cu": true,
    "AppConstants": true,
    "ExtensionAPI": true,
    "ExtensionCommon": true,
    "ExtensionUtils": true,
    "extensions": true,
    "global": true,
    "require": false,
    "Services": true,
    "XPCOMUtils": true,
  },
};
