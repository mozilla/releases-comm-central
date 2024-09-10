/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/components/inappnotifications/content/in-app-notification-manager.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/In App Notifications/Manager",
  component: "in-app-notification-manager",
  tags: ["autodocs"],
  argTypes: {
    showNotification: {
      control: { type: "boolean" },
    },
  },
};

export const InAppNotificationManager = {
  render: ({ showNotification }) => {
    const man = document.createElement("in-app-notification-manager");
    if (showNotification) {
      man.showNotification({
        id: "test-notification",
        title: "Test",
        description: "Notification text",
        CTA: "Click here",
        URL: "https://example.com",
        type: "donation",
        severity: 4,
      });
    } else {
      man.hideNotification();
    }
    return man;
  },
  args: {
    showNotification: false,
  },
};
