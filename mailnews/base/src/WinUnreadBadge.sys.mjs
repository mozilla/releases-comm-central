/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 *
 * Based on https://github.com/bstreiff/unread-badge.
 *
 * Copyright (c) 2013-2020 Brandon Streiff
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  taskbar: ["@mozilla.org/windows-taskbar;1", Ci.nsIWinTaskbar],
});

/**
 * A module to manage the unread badge icon on Windows.
 */
export var WinUnreadBadge = {
  /**
   * Keeping an instance of nsITaskbarOverlayIconController alive
   * to show a taskbar icon after the updateUnreadCount method exits.
   */
  _controller: null,

  /**
   * Update the unread badge.
   *
   * @param {number} unreadCount - Unread message count.
   * @param {number} unreadTooltip - Unread message count tooltip.
   * @param {imgIContainer} badgeImgContainer - The badge to be overlaid on the system tray icon when there's unread mail.
   */
  async updateUnreadCount(unreadCount, unreadTooltip, badgeImgContainer) {
    const window = Services.wm.getMostRecentBrowserWindow();
    if (!window) {
      return;
    }

    if (!this._controller) {
      this._controller = lazy.taskbar.getOverlayIconController(window.docShell);
    }

    // Somehow this is needed to prevent NS_ERROR_NOT_AVAILABLE error in
    // setOverlayIcon.
    await new Promise(resolve => window.setTimeout(resolve));

    if (
      unreadCount === 0 ||
      !Services.prefs.getBoolPref("mail.biff.show_badge", true)
    ) {
      // Remove the badge if no unread.
      this._controller.setOverlayIcon(null, "");
      return;
    }

    this._controller.setOverlayIcon(badgeImgContainer, unreadTooltip);
  },
};
