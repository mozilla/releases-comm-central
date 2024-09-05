/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "@storybook/addon-actions";
import "mail/components/inappnotifications/content/in-app-notification-button.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/In App Notifications/CTA Button",
  component: "in-app-notification-button",
  tags: ["autodocs"],
  argTypes: {
    label: "string",
  },
};

const template = ({ label }) => html`
  <a
    is="in-app-notification-button"
    href="https://example.com"
    @ctaclick="${action("ctaclick")}"
    >${label}</a
  >
`;

export const InAppNotificationButton = template.bind({});
InAppNotificationButton.args = {
  label: "CTA",
};
