/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { makeWidgetId } = ExtensionCommon;

function getSessionData(tabId, extension) {
  const nativeTab = tabTracker.getTab(tabId);
  const widgetId = makeWidgetId(extension.id);

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
          const sessionData = getSessionData(tabId, context.extension);
          sessionData[key] = value;
        },
        getTabValue(tabId, key) {
          const sessionData = getSessionData(tabId, context.extension);
          return sessionData[key];
        },
        removeTabValue(tabId, key) {
          const sessionData = getSessionData(tabId, context.extension);
          delete sessionData[key];
        },
      },
    };
  }

  static onUninstall(extensionId) {
    // Remove session data.
    const widgetId = makeWidgetId(extensionId);
    for (const window of Services.wm.getEnumerator("mail:3pane")) {
      for (const tabInfo of window.gTabmail.tabInfo) {
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
