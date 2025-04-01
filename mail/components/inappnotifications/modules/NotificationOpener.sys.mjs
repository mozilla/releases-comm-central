/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  NotificationScheduler: "resource:///modules/NotificationScheduler.sys.mjs",
  openLinkExternally: "resource:///modules/LinkHelper.sys.mjs",
});

export const NotificationOpener = {
  /**
   * Opens a link either in a browser or tab from an in-app-notification.
   *
   * @param {object} notification - An in app notification.
   * @param {boolean} wait - If the notification should be delayed until the user
   *   is active.
   */
  async openLink(notification, wait) {
    const tab = notification.type === "donation_tab";
    const formattedURL = Services.urlFormatter.formatURL(notification.URL);

    if (wait) {
      try {
        await lazy.NotificationScheduler.waitForActive({
          id: notification.id,
        });
      } catch {
        // Do nothing, this means the notification was dismissed.
      }
    }
    const currentWindow = Services.wm.getMostRecentWindow("mail:3pane");
    const tabmail = tab && currentWindow?.document.getElementById("tabmail");

    // Fall back to opening a browser window if we don't have a tabmail.
    if (!tab || !tabmail) {
      lazy.openLinkExternally(formattedURL);
    } else {
      tabmail.openTab("contentTab", {
        url: formattedURL,
        background: false,
        linkHandler: "single-page",
      });
      tabmail.ownerGlobal.focus();
    }
  },
};
