/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/calendar/calendarDialog.css"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Calendar/Join Button",
  component: "calendar-dialog-row-join-button",
  tags: ["autodocs"],
};

const JoinButtonTemplate = () => html`
  <button
    type="button"
    class="button button-primary join-button"
  >
    Join Meeting
  </button>
`;

export const CalendarJoinButton = JoinButtonTemplate.bind({});
