/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import "mail/components/calendar/content/calendar-dialog-description-row.mjs";
import "mail/themes/shared/mail/colors.css";
import "mail/themes/shared/mail/icons.css";
import "mail/themes/shared/mail/calendar/calendarDialog.css";

export default {
  title: "Widgets/Calendar/Dialog Description Row",
  component: "calendar-dialog-description-row",
  tags: ["autodocs"],
};

export const calendarDialogDescriptionRow = {
  render({ description }) {
    const container = document.createElement("div");
    container.insertAdjacentHTML(
      "beforeend",
      `<template id="calendarDialogRowTemplate">
        <div class="row">
          <slot name="icon"></slot>
          <slot name="label"></slot>
          <slot name="content"></slot>
        </div>
      </template>
      <template id="calendarDialogDescriptionRowTemplate">
        <calendar-dialog-row>
          <img
            src=""
            slot="icon"
            class="icon-description"
            data-l10n-id="calendar-dialog-description-row-icon"
          />
          <span
            slot="label"
            class="row-label"
            data-l10n-id="calendar-dialog-description-label"
          ></span>
          <div slot="content"></div>
        </calendar-dialog-row>
      </template>
      <calendar-dialog-description-row id="expandingDescription">
      </calendar-dialog-description-row>`
    );

    // We need to delay to let the custom element connect and create its shadow
    // root.
    Promise.resolve().then(() => {
      const descriptionElement = container.querySelector(
        "calendar-dialog-description-row"
      );
      descriptionElement.setDescription(description);
    });
    return container;
  },
  args: {
    description: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  },
};
