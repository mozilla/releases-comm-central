/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/components/inappnotifications/content/in-app-notification.mjs";
import "mail/themes/shared/mail/icons.css";

export default {
  title: "Widgets/In App Notifications/Notification",
  component: "in-app-notification",
  tags: ["autodocs"],
};

export const InAppNotification = {
  render({ setData, title, description, CTA, type }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `
<in-app-notification></in-app-notification>
`
    );
    if (setData) {
      const component = container.querySelector("in-app-notification");
      component.setNotificationData({
        id: "test-notification",
        title,
        description,
        CTA,
        URL: "https://example.com",
        type,
        severity: 4,
      });
    }
    return container;
  },
  args: {
    setData: true,
    type: "donation",
    title: "Test",
    description: "Notification text",
    CTA: "Click here",
  },
};
