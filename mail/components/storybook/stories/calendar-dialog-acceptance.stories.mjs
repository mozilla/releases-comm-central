/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import "mail/themes/shared/mail/calendar/calendarDialog.css";
import "mail/themes/shared/mail/calendar/calendarDialogAcceptance.css";
import "mail/themes/shared/mail/colors.css";

export default {
  title: "Widgets/Calendar/Acceptance",
  component: "calendar-dialog-acceptance",
  tags: ["autodocs"],
};

const AcceptanceTemplate = () => html`
  <div id="attendance-widget">
    <input id="going" type="radio" name="attendance" value="ACCEPTED" />
    <label for="going" class="option">
      <span class="icon"></span
      ><span data-l10n-id="calendar-dialog-accept"></span>
    </label>
    <input
      id="maybe"
      type="radio"
      name="attendance"
      value="TENTATIVE"
      checked="checked"
    />
    <label for="maybe" class="option">
      <span class="icon"></span
      ><span data-l10n-id="calendar-dialog-accept-tentative"></span>
    </label>
    <input id="not-going" type="radio" name="attendance" value="DECLINED" />
    <label for="not-going" class="option">
      <span class="icon"></span
      ><span data-l10n-id="calendar-dialog-decline"></span>
    </label>
    <div class="toggle"></div>
  </div>
`;

export const CalendarDialogAcceptance = AcceptanceTemplate.bind({});
