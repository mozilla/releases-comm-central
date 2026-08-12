/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/tb-banner.mjs";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/spacings.css";
import "mail/themes/shared/mail/variables.css";
import "mail/themes/shared/mail/layout.css";
import "mail/themes/shared/mail/widgets.css";
import "mail/themes/shared/mail/icons.css";

export default {
  title: "Widgets/Banner",
  component: "tb-banner",
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["info", "success", "warning", "danger"],
    },
    expanded: {
      control: "boolean",
    },
  },
};

const bannerTemplate = html`
  <!-- #include mail/base/content/widgets/tb-banner.inc.xhtml -->
  <template id="tbBannerTemplate">
    <details class="banner">
      <summary>
        <img id="icon" class="icon" alt="" />
        <div id="title" class="title">
          <slot name="title"></slot>
        </div>
        <span id="actionText" class="action-text" hidden="hidden"></span>
      </summary>
      <div id="description" class="description" hidden="hidden">
        <slot name="description"></slot>
      </div>
    </details>
  </template>
`;

const PlaygroundTemplate = ({
  variant,
  titleContent,
  descriptionContent,
  expanded,
}) => html`
  ${bannerTemplate}
  <tb-banner variant=${variant} ?expanded=${expanded}>
    <span slot="title">${titleContent}</span>
    <span slot="description">${descriptionContent}</span>
  </tb-banner>
`;

export const Playground = PlaygroundTemplate.bind({});
Playground.args = {
  variant: "info",
  titleContent: "Connection settings saved",
  descriptionContent: "Thunderbird will use these settings when checking mail.",
  expanded: false,
};

export const NoDescription = () => html`
  ${bannerTemplate}
  <tb-banner variant="success">
    <span slot="title">Connection settings saved</span>
  </tb-banner>
`;

export const HTMLDescriptionExpanded = () => html`
  ${bannerTemplate}
  <tb-banner variant="danger" expanded>
    <span slot="title">Please resolve the following errors:</span>
    <ul slot="description">
      <li>
        <a href="#">Hostname</a>, <a href="#">Hostname</a>, and
        <a href="#">Port</a>
      </li>
    </ul>
  </tb-banner>
`;
