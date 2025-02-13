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
  render({ opened }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `
    <template id="calendarDialogTemplate">
      <div class="titlebar">
        <button class="close-button">
          <img src="" data-l10n-id="calendar-dialog-close-button" />
        </button>
      </div>
      <div class="content"></div>
      <div class="footer"></div>
    </template>
    <dialog is="calendar-dialog"></dialog>
`
    );

    container.querySelector("dialog")[opened ? "show" : "close"]();
    return container;
  },
  args: {
    opened: true,
  },
};
