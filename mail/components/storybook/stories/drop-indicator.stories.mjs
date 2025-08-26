/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/base/content/widgets/drop-indicator.mjs";
import "mail/themes/shared/mail/variables.css";
import "mail/themes/shared/mail/widgets.css";

export default {
  title: "Widgets/Drop Indicator",
  component: "drop-indicator",
  tags: ["autodocs"],
  argTypes: {
    horizontal: {
      control: "boolean",
    },
  },
};

const Template = ({ horizontal }) => html`
  <style>
    .wrapper {
      position: relative;
    }
    [is="drop-indicator"] {
      display: block;
      inset-inline-start: 10px;
      inset-block-start: -10px;
    }
  </style>
  <div class="wrapper">
    <img is="drop-indicator" ?horizontal=${horizontal} />
  </div>
`;
export const DropIndicator = Template.bind({});
DropIndicator.args = {
  horizontal: false,
};
