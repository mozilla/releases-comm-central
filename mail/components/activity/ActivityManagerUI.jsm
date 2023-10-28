/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["ActivityManagerUI"];

const ACTIVITY_MANAGER_URL = "chrome://messenger/content/activity.xhtml";

function ActivityManagerUI() {}

ActivityManagerUI.prototype = {
  show(aWindowContext, aID) {
    // First we see if it is already visible
    const window = this.recentWindow;
    if (window) {
      window.focus();
      return;
    }

    let parent = null;
    try {
      if (aWindowContext) {
        parent = aWindowContext.docShell.domWindow;
      }
    } catch (e) {
      /* it's OK to not have a parent window */
    }

    Services.ww.openWindow(
      parent,
      ACTIVITY_MANAGER_URL,
      "ActivityManager",
      "chrome,dialog=no,resizable",
      {}
    );
  },

  get visible() {
    return null != this.recentWindow;
  },

  get recentWindow() {
    return Services.wm.getMostRecentWindow("Activity:Manager");
  },

  QueryInterface: ChromeUtils.generateQI(["nsIActivityManagerUI"]),
};
