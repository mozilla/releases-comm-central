/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { html } from "lit";
import { action } from "storybook/actions";
import "mail/themes/shared/mail/calendar/calendarDialog.css";
import "mail/themes/shared/mail/colors.css";
import "mail/components/calendar/content/calendar-dialog-acceptance.mjs";

export default {
  title: "Widgets/Calendar/Acceptance",
  component: "calendar-dialog-acceptance",
  tags: ["autodocs"],
  argTypes: {
    status: {
      options: ["NEEDS-ACTION", "TENTATIVE", "ACCEPTED", "DECLINED"],
      control: { type: "radio" },
    },
  },
};

// TODO chrome:// URIs for icons don't work here, however that's what the
// actual component implementation uses. Should maybe use CSS variables in the
// component directly.

export const Acceptance = ({ status: rsvpStatus }) => html`
  <template id="calendarDialogAcceptanceTemplate">
    <input id="going" type="radio" name="attendance" value="ACCEPTED" />
    <label for="going" class="option">
      <img
        src="chrome://messenger/skin/icons/sm/circle-check.svg"
        role="presentation"
        alt=""
      />
      <span data-l10n-id="calendar-dialog-accept"></span>
    </label>
    <input id="maybe" type="radio" name="attendance" value="TENTATIVE" />
    <label for="maybe" class="option">
      <img
        src="chrome://messenger/skin/icons/sm/circle-question.svg"
        role="presentation"
        alt=""
      />
      <span data-l10n-id="calendar-dialog-accept-tentative"></span>
    </label>
    <input id="notGoing" type="radio" name="attendance" value="DECLINED" />
    <label for="notGoing" class="option">
      <img
        src="chrome://messenger/skin/icons/sm/circle-close.svg"
        role="presentation"
        alt=""
      />
      <span data-l10n-id="calendar-dialog-decline"></span>
    </label>
    <div class="toggle"></div>
  </template>
  <calendar-dialog-acceptance
    status=${rsvpStatus}
    @setEventResponse=${action("setEventResponse")}
  ></calendar-dialog-acceptance>
`;
