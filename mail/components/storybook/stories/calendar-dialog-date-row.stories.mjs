/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/components/calendar/content/calendar-dialog-date-row.mjs";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/icons.css";
import "mail/themes/shared/mail/calendar/calendarDialog.css";

window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

export default {
  title: "Widgets/Calendar/Dialog Date Row",
  component: "calendar-dialog-date-row",
  tags: ["autodocs"],
};

const Template = ({
  "start-date": startDate,
  "end-date": endDate,
  repeats,
}) => html`
  <template id="calendarDialogRowTemplate">
    <div class="row">
      <slot name="icon"></slot>
      <slot name="label"></slot>
      <slot name="content"></slot>
    </div>
  </template>
  <template id="calendarDialogDateRowTemplate">
    <calendar-dialog-row>
      <img
        src=""
        slot="icon"
        class="icon-date-time"
        data-l10n-id="calendar-dialog-date-row-icon"
      />
      <div slot="label">
        <span class="date-label"></span>
        <img
          src=""
          class="icon-recurrence repeats"
          data-l10n-id="calendar-dialog-date-row-recurring-icon"
          hidden="hidden"
        />
      </div>
    </calendar-dialog-row>
  </template>
  <calendar-dialog-date-row
    start-date="${startDate}"
    end-date="${endDate}"
    repeats="${repeats}"
  ></calendar-dialog-date-row>
`;

export const CalendarDialogDateRow = Template.bind({});
CalendarDialogDateRow.args = {
  "start-date": "2020-01-02T03:04:05Z",
  "end-date": "2134-03-02T01:00:00Z",
  repeats: "Once in a blue moon",
};
