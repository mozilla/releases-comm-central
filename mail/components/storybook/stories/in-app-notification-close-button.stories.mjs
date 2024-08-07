/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/components/inappnotifications/content/in-app-notification-close-button.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/In App Notifications/Close Button",
  component: "in-app-notification-close-button",
  tags: ["autodocs"],
};

const template = () => html`
  <template id="inAppNotificationCloseButtonTemplate">
    <img src="" data-l10n-id="in-app-notification-close-image" />
  </template>
  <button is="in-app-notification-close-button"></button>
`;

export const InAppNotificationCloseButton = template.bind({});
