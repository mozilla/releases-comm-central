/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { makeWidgetId } = ExtensionCommon;

function getSessionData(tabId, extension) {
  let nativeTab = tabTracker.getTab(tabId);
  let widgetId = makeWidgetId(extension.id);

  if (!nativeTab._ext.extensionSession) {
    nativeTab._ext.extensionSession = {};
  }
  if (!nativeTab._ext.extensionSession[`${widgetId}`]) {
    nativeTab._ext.extensionSession[`${widgetId}`] = {};
  }
  return nativeTab._ext.extensionSession[`${widgetId}`];
}

this.sessions = class extends ExtensionAPI {
  getAPI(context) {
    return {
      sessions: {
        setTabValue(tabId, key, value) {
          let sessionData = getSessionData(tabId, context.extension);
          sessionData[key] = value;
        },
        getTabValue(tabId, key) {
          let sessionData = getSessionData(tabId, context.extension);
          return sessionData[key];
        },
        removeTabValue(tabId, key) {
          let sessionData = getSessionData(tabId, context.extension);
          delete sessionData[key];
        },
      },
    };
  }

  static onUninstall(extensionId) {
    // Remove session data.
    let widgetId = makeWidgetId(extensionId);
    for (let window of Services.wm.getEnumerator("mail:3pane")) {
      for (let tabInfo of window.gTabmail.tabInfo) {
        if (
          tabInfo._ext.extensionSession &&
          tabInfo._ext.extensionSession[`${widgetId}`]
        ) {
          delete tabInfo._ext.extensionSession[`${widgetId}`];
        }
      }
    }
  }
};
