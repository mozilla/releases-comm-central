/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/components/calendar/content/calendar-dialog-toggleable-row.mjs";
import "mail/themes/shared/mail/calendar/calendarDialog.css";

export default {
  title: "Widgets/Calendar/Toggleable Dialog Row",
  component: "calendar-dialog-toggleable-row",
  tags: ["autodocs"],
};

const calendarDialogToggleableRowTemplate = html`
  <template
    id="calendarDialogToggleableRowTemplate"
    xmlns="http://www.w3.org/1999/xhtml"
  >
    <div class="row">
      <slot name="icon"></slot>
      <label class="toggle-label">
        <slot name="label"></slot>
        <input class="toggle-checkbox" type="checkbox" />
      </label>
      <slot name="content"></slot>
    </div>
  </template>
`;

const uncheckedTemplate = () => html`
  ${calendarDialogToggleableRowTemplate}
  <calendar-dialog-toggleable-row>
    <img slot="icon" class="icon-location" src="" alt="" />
    <span slot="label" class="row-label">Location</span>
    <div slot="content">Location details</div>
  </calendar-dialog-toggleable-row>
`;

const checkedTemplate = () => html`
  ${calendarDialogToggleableRowTemplate}
  <calendar-dialog-toggleable-row checked>
    <img slot="icon" class="icon-location" src="" alt="" />
    <span slot="label" class="row-label">Location</span>
    <div slot="content">Location details</div>
  </calendar-dialog-toggleable-row>
`;

export const Unchecked = uncheckedTemplate.bind({});
export const Checked = checkedTemplate.bind({});
