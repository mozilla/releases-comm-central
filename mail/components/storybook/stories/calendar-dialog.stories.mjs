/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/components/calendar/content/calendar-dialog.mjs"; //eslint-disable-line import/no-unassigned-import

export default {
  title: "Widgets/Calendar/Dialog",
  component: "calendar-dialog",
  tags: ["autodocs"],
};

export const calendarDialog = {
  render({ opened, title, eventLocation }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `
  <template id="calendarDialogRowTemplate">
    <div class="calendar-dialog-row">
      <slot name="icon"></slot>
      <slot name="label"></slot>
      <slot name="content"></slot>
    </div>
  </template>
  <template id="calendarDialogDateRowTemplate">
    <calendar-dialog-row>
      <img
        slot="icon"
        class="icon-date-time"
        data-l10n-id="calendar-dialog-date-row-icon"
      />
      <div slot="label">
        <span class="date-label"></span>
        <img
          class="icon-recurrence repeats"
          data-l10n-id="calendar-dialog-date-row-recurring-icon"
          hidden="hidden"
        />
      </div>
    </calendar-dialog-row>
  </template>
  <template id="calendarDialogTemplate">
    <div class="titlebar">
      <button
        class="button icon-button icon-only button-flat back-button"
        data-l10n-id="calendar-dialog-back-button"
      ></button>
      <h2 class="calendar-dialog-title"></h2>
      <button class="button icon-button icon-only button-flat close-button"
              data-l10n-id="calendar-dialog-close-button">
    </div>
    <div class="content">
      <calendar-dialog-subview-manager
        default-subview="calendarDialogMainSubview"
      >
        <div id="calendarDialogMainSubview" hidden="hidden">
          <calendar-dialog-date-row
            start-date="2020-02-02T19:00:00Z"
            end-date="2021-04-31T06:00:00Z"
            repeats="Repeats once every blue moon"
          ></calendar-dialog-date-row>
          <calendar-dialog-row id="locationRow">
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
                href=""
                hidden="hidden"
              ></a>
              <span id="locationText" hidden="hidden"></span>
            </div>
          </calendar-dialog-row>
        </div>
      </calendar-dialog-subview-manager>
    </div>
    <div class="footer"></div>
  </template>
  <dialog is="calendar-dialog"></dialog>
`
    );

    const dialog = container.querySelector("dialog");
    dialog[opened ? "show" : "close"]();
    dialog.updateDialogData({ title, eventLocation });
    return container;
  },
  args: {
    opened: true,
    title: "Event Title",
    eventLocation: "https://www.thunderbird.net/",
  },
};
