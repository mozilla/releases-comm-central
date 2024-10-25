/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/components/inappnotifications/content/in-app-notification.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/In App Notifications/Notification",
  component: "in-app-notification",
  tags: ["autodocs"],
};

export const InAppNotification = {
  render({ setData }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `
<template id="inAppNotificationCloseButtonTemplate" xmlns="http://www.w3.org/1999/xhtml">
  <img src="" data-l10n-id="in-app-notification-close-image" />
</template>

<template id="inAppNotificationContainerTemplate" xmlns="http://www.w3.org/1999/xhtml">
  <div
    class="in-app-notification-container in-app-notification-donation"
    tabindex="0"
  >
    <button is="in-app-notification-close-button"></button>
    <img src="" alt="" class="icon" />
    <div class="in-app-notification-content">
      <h1 class="in-app-notification-heading"></h1>
      <div class="in-app-notification-description-wrapper">
        <p class="in-app-notification-description">
        </p>
      </div>
      <a is="in-app-notification-button">
        <span class="in-app-notification-cta"></span>
      </a>
    </div>
  </div>
  <span class="in-app-notification-instructions" data-l10n-id="in-app-notification-instructions"></span>
</template>

<template id="inAppNotificationTemplate" xmlns="http://www.w3.org/1999/xhtml">
  <in-app-notification-container></in-app-notification-container>
</template>
`
    );
    if (setData) {
      const component = container.querySelector("in-app-notification");
      component.setNotificationData({
        id: "test-notification",
        title: "Test",
        description: "Notification text",
        CTA: "Click here",
        URL: "https://example.com",
        type: "donation",
        severity: 4,
      });
    }
    return container;
  },
  args: {
    setData: false,
  },
};
