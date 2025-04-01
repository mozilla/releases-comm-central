/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
/* eslint-disable import/no-unassigned-import */
import "mail/components/calendar/content/calendar-dialog-row.mjs";
import "mail/themes/shared/mail/calendar/calendarDialog.css";
/* eslint-enable import/no-unassigned-import */

export default {
  title: "Widgets/Calendar/Dialog Row",
  component: "calendar-dialog-row",
  tags: ["autodocs"],
};

const RowTemplateDefault = () => html`
  <template id="calendarDialogRowTemplate" xmlns="http://www.w3.org/1999/xhtml">
    <div class="calendar-dialog-row">
      <slot name="icon"></slot>
      <slot name="label"></slot>
      <slot name="content"></slot>
    </div>
  </template>
  <calendar-dialog-row>
    <img
      slot="icon"
      class="icon-location"
      src=""
      data-l10n-id="calendar-dialog-location-row-icon"
    />
    <span slot="label" class="row-label">Test Label</span>
    <div slot="content">Test Content Description</div>
  </calendar-dialog-row>
`;

const RowTemplateLabelOnly = () => html`
  <template id="calendarDialogRowTemplate" xmlns="http://www.w3.org/1999/xhtml">
    <div class="calendar-dialog-row">
      <slot name="icon"></slot>
      <slot name="label"></slot>
      <slot name="content"></slot>
    </div>
  </template>
  <calendar-dialog-row>
    <img
      slot="icon"
      class="icon-reminder"
      src=""
      data-l10n-id="calendar-dialog-reminder-row-icon"
    />
    <span slot="label" class="row-label">10 minutes before event</span>
  </calendar-dialog-row>
`;

const RowTemplateLocationLink = () => html`
  <template id="calendarDialogRowTemplate" xmlns="http://www.w3.org/1999/xhtml">
    <div class="calendar-dialog-row">
      <slot name="icon"></slot>
      <slot name="label"></slot>
      <slot name="content"></slot>
    </div>
  </template>
  <calendar-dialog-row>
    <img
      slot="icon"
      class="icon-location"
      src=""
      data-l10n-id="calendar-dialog-location-row-icon"
    />
    <div slot="label">
      <a
        id="locationLink"
        class="text-link"
        href="https://www.thunderbird.net/"
      >
        https://www.thunderbird.net/
      </a>
    </div>
  </calendar-dialog-row>
`;

export const CalendarDialogRow = RowTemplateDefault.bind({});
export const CalendarDialogRowLabelOnly = RowTemplateLabelOnly.bind({});
export const CalendarDialogRowLocationLink = RowTemplateLocationLink.bind({});
