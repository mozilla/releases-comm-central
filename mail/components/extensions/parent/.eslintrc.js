"use strict";

module.exports = {
  globals: {
    // These are defined in the WebExtension script scopes by ExtensionCommon.sys.mjs.
    // From toolkit/components/extensions/.eslintrc.js.
    ExtensionAPI: true,
    ExtensionAPIPersistent: true,
    ExtensionCommon: true,
    ExtensionUtils: true,
    extensions: true,
    global: true,
    Services: true,

    // From toolkit/components/extensions/parent/.eslintrc.js.
    CONTAINER_STORE: true,
    DEFAULT_STORE: true,
    EventEmitter: true,
    EventManager: true,
    InputEventManager: true,
    PRIVATE_STORE: true,
    TabBase: true,
    TabManagerBase: true,
    TabTrackerBase: true,
    WindowBase: true,
    WindowManagerBase: true,
    WindowTrackerBase: true,
    getContainerForCookieStoreId: true,
    getUserContextIdForCookieStoreId: true,
    getCookieStoreIdForOriginAttributes: true,
    getCookieStoreIdForContainer: true,
    getCookieStoreIdForTab: true,
    isContainerCookieStoreId: true,
    isDefaultCookieStoreId: true,
    isPrivateCookieStoreId: true,
    isValidCookieStoreId: true,

    // These are defined in ext-mail.js.
    ADDRESS_BOOK_WINDOW_URI: true,
    COMPOSE_WINDOW_URI: true,
    MAIN_WINDOW_URI: true,
    MESSAGE_WINDOW_URI: true,
    MESSAGE_PROTOCOLS: true,
    NOTIFICATION_COLLAPSE_TIME: true,
    ExtensionError: true,
    Tab: true,
    TabmailTab: true,
    Window: true,
    TabmailWindow: true,
    clickModifiersFromEvent: true,
    getNormalWindowReady: true,
    getRealFileForFile: true,
    getTabBrowser: true,
    getTabTabmail: true,
    getTabWindow: true,
    messageListTracker: true,
    messageTracker: true,
    spaceTracker: true,
    tabTracker: true,
    waitForMailTabReady: true,
    windowTracker: true,

    // ext-browserAction.js
    browserActionFor: true,
  },
  rules: {
    // From toolkit/components/extensions/.eslintrc.js.
    // Disable reject-importGlobalProperties because we don't want to include
    // these in the sandbox directly as that would potentially mean the
    // imported properties would be instantiated up-front rather than lazily.
    "mozilla/reject-importGlobalProperties": "off",
  },
};
