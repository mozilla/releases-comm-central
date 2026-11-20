/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/components/inappnotifications/content/in-app-notification-container.mjs";
import "mail/themes/shared/mail/icons.css";

export default {
  title: "Widgets/In App Notifications/Container",
  component: "in-app-notification-container",
  tags: ["autodocs"],
  argTypes: {
    type: {
      options: ["donation", "message", "blog", "security"],
    },
  },
};

const template = ({ cta, description, heading, url, type }) => html`
  <in-app-notification-container
    cta="${cta}"
    description="${description}"
    heading="${heading}"
    url="${url}"
    type="${type}"
  ></in-app-notification-container>
`;

export const InAppNotificationContainer = template.bind({});

InAppNotificationContainer.args = {
  cta: "Click Here",
  description: "Give us your money pretty please!",
  heading: "We really need your money...",
  url: "https://example.com/money",
  type: "donation",
};
