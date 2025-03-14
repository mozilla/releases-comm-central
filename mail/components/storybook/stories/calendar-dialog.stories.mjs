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
  render({ opened, title }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `
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
        <div id="calendarDialogMainSubview" hidden="hidden"></div>
      </calendar-dialog-subview-manager>
    </div>
    <div class="footer"></div>
  </template>
  <dialog is="calendar-dialog"></dialog>
`
    );

    const dialog = container.querySelector("dialog");
    dialog[opened ? "show" : "close"]();
    dialog.updateDialogData({ title });
    return container;
  },
  args: {
    opened: true,
    title: "Event Title",
  },
};
