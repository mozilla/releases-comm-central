/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
/* eslint-disable import/no-unassigned-import */
import "mail/components/inappnotifications/content/in-app-notification-container.mjs";
import "mail/themes/shared/mail/icons.css";
/* eslint-enable import/no-unassigned-import */

export default {
  title: "Widgets/In App Notifications/Container",
  component: "in-app-notification-container",
  tags: ["autodocs"],
};

const template = ({ cta, description, heading, url }) => html`
  <template id="inAppNotificationCloseButtonTemplate">
    <img src="" data-l10n-id="in-app-notification-close-image" />
  </template>
  <template id="inAppNotificationContainerTemplate">
    <div class="in-app-notification-container in-app-notification-donation">
      <button is="in-app-notification-close-button"></button>
      <img src="" alt="" class="icon" />
      <div class="in-app-notification-content">
        <h1 class="in-app-notification-heading"></h1>
        <div class="in-app-notification-description-wrapper">
          <p class="in-app-notification-description"></p>
        </div>
        <a is="in-app-notification-button">
          <span class="in-app-notification-cta"></span>
        </a>
      </div>
    </div>
  </template>
  <in-app-notification-container
    cta="${cta}"
    description="${description}"
    heading="${heading}"
    url="${url}"
  ></in-app-notification-container>
`;

export const InAppNotificationContainer = template.bind({});

InAppNotificationContainer.args = {
  cta: "Click Here",
  description: "Give us your money pretty please!",
  heading: "We really need your money...",
  url: "https://example.com/money",
};
