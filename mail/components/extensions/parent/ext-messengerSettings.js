/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionPreferencesManager } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionPreferencesManager.sys.mjs"
);

var { getSettingsAPI } = ExtensionPreferencesManager;

// Add settings objects for supported APIs to the preferences manager.
ExtensionPreferencesManager.addSetting("messagePlainTextFlowedOutputEnabled", {
  permission: "messengerSettings",
  prefNames: ["mailnews.send_plaintext_flowed"],
  getCallback() {
    return Services.prefs.getBoolPref("mailnews.send_plaintext_flowed");
  },
});

ExtensionPreferencesManager.addSetting("messageLineLengthLimit", {
  permission: "messengerSettings",
  prefNames: ["mailnews.wraplength"],
  getCallback() {
    return Services.prefs.getIntPref("mailnews.wraplength", 72);
  },
});

this.messengerSettings = class extends ExtensionAPI {
  getAPI(context) {
    function makeSettingsAPI(options) {
      if (!options.name) {
        // Should not happen, throw.
        throw new Error("Missing name for settings API");
      }
      return getSettingsAPI({
        context,
        module: "messengerSettings",
        name: options.name,
        readOnly: options?.readOnly ?? false,
      });
    }

    return {
      messengerSettings: {
        messageLineLengthLimit: makeSettingsAPI({
          name: "messageLineLengthLimit",
          readOnly: true,
        }),
        messagePlainTextFlowedOutputEnabled: makeSettingsAPI({
          name: "messagePlainTextFlowedOutputEnabled",
          readOnly: true,
        }),
      },
    };
  }
};
