/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PositionedDialog } from "./positioned-dialog.mjs";

/**
 * Static shell for the calendar event create/edit dialog.
 *
 * The shell deliberately owns only the dialog's common structure. Routing,
 * positioning, sizing, header controls, field rows, and event data belong to
 * their respective follow-up components.
 *
 * Template ID: #calendarEventCreateEditDialogTemplate
 *
 * @tagname calendar-event-create-edit-dialog
 */
export class CalendarEventCreateEditDialog extends PositionedDialog {
  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document.getElementById(
      "calendarEventCreateEditDialogTemplate"
    );
    this.append(template.content.cloneNode(true));

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
    document.l10n.setAttributes(this, "calendar-event-create-edit-dialog");
  }
}

customElements.define(
  "calendar-event-create-edit-dialog",
  CalendarEventCreateEditDialog,
  { extends: "dialog" }
);
