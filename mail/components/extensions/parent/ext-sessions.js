/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { makeWidgetId } = ExtensionCommon;

function getSessionData(tabId, extension) {
  const nativeTab = tabTracker.getTab(tabId);
  const widgetId = makeWidgetId(extension.id);

  // A mail tab always has an _ext property, which is restored on app restart.
  // The sessions API can also be used on popup or compose tabs/windows, which do
  // not support values to be restored (since these windows are not restored),
  // but we do support the same concept of tab-specific session data during their
  // lifetime. So we fake the _ext property for those tabs/windows here.
  if (!nativeTab._ext) {
    nativeTab._ext = {};
  }
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
          if (!context.extension.hasPermission("sessions")) {
            console.warn(
              "Following Firefox, Thunderbird will soon require the `sessions` permission in order to use sessions.setTabValue()."
            );
          }
          const sessionData = getSessionData(tabId, context.extension);
          sessionData[key] = value;
        },
        getTabValue(tabId, key) {
          if (!context.extension.hasPermission("sessions")) {
            console.warn(
              "Following Firefox, Thunderbird will soon require the `sessions` permission in order to use sessions.getTabValue()."
            );
          }
          const sessionData = getSessionData(tabId, context.extension);
          return sessionData[key];
        },
        removeTabValue(tabId, key) {
          if (!context.extension.hasPermission("sessions")) {
            console.warn(
              "Following Firefox, Thunderbird will soon require the `sessions` permission in order to use sessions.removeTabValue()."
            );
          }
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
