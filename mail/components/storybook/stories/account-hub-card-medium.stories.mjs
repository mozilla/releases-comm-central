/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/spacings.css";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/variables.css";
import "mail/themes/shared/mail/widgets.css";
import "mail/components/accountcreation/content/widgets/account-hub-radio-card-large.mjs";

export default {
  title: "Widgets/Account Hub/Radio Card Large",
  component: "account-hub-radio-card-large",
  tags: ["autodocs"],
};

const AccountHubCardMediumTemplate = ({ title, description, tag }) => html`
  <style>
    fieldset {
      display: grid;
      gap: var(--space-base);
      grid-template: 1fr / 1fr 1fr;
    }
  </style>
  <template id="accountHubRadioCardLargeTemplate">
    <label>
      <div class="title-line">
        <slot name="title" class="title"></slot>
        <slot name="tag"></slot>
      </div>
      <slot name="description" class="description"></slot>
    </label>
  </template>
  <form>
    <fieldset role="radiogroup">
      <account-hub-radio-card-large value="a" aria-checked="true">
        <span slot="title">${title}</span>
        <span slot="tag" class="badge" role="presentation">${tag}</span>
        <span slot="description">${description}</span>
      </account-hub-radio-card-large>
      <account-hub-radio-card-large value="b">
        <span slot="title">${title}</span>
        <span slot="tag">${tag}</span>
        <span slot="description">${description}</span>
      </account-hub-radio-card-large>
    </fieldset>
  </form>
`;

export const AccountHubCardMedium = AccountHubCardMediumTemplate.bind({});
AccountHubCardMedium.args = {
  title: "Title",
  description: "Description",
  tag: "Recommended",
};
