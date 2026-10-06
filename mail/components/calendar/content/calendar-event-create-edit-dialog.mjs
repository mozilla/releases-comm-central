/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { PositionedDialog } from "./positioned-dialog.mjs";
import { CalendarEventDialogSourceMixin } from "./calendar-event-dialog-source-mixin.mjs";

/**
 * The static shell for the calendar event create/edit dialog.
 *
 * The dialog reads route attributes and loads event data. Other components add
 * position, size, header controls, field rows, and event data mapping.
 *
 * Template ID: #calendarEventCreateEditDialogTemplate
 *
 * @tagname calendar-event-create-edit-dialog
 */
export class CalendarEventCreateEditDialog extends CalendarEventDialogSourceMixin(
  PositionedDialog
) {
  /**
   * The current dialog mode. It is "create", "edit", or null.
   *
   * @type {"create"|"edit"|null}
   */
  #mode = null;

  /**
   * Create the dialog content and start route observation.
   */
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;

      const template = document.getElementById(
        "calendarEventCreateEditDialogTemplate"
      );
      this.append(template.content.cloneNode(true));

      this.setAttribute("is", "calendar-event-create-edit-dialog");

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
      document.l10n.setAttributes(this, "calendar-event-create-edit-dialog");
    }
    this.initializeCalendarEventRoute();
  }

  /**
   * The current dialog mode.
   *
   * "create" has an empty route. "edit" has a complete event route. null
   * means the route is incomplete, cleared, or failed.
   *
   * @returns {"create"|"edit"|null}
   */
  get mode() {
    return this.#mode;
  }

  /**
   * Allow an empty route to open this dialog in create mode.
   *
   * @returns {boolean}
   */
  get allowsEmptyCalendarEventRoute() {
    return true;
  }

  /**
   * Clear the dialog mode after a route error.
   */
  onCalendarEventRouteError() {
    this.#mode = null;
  }

  /**
   * Clear the dialog mode after the route is cleared.
   */
  onCalendarEventRouteCleared() {
    this.#mode = null;
  }

  /**
   * Set create mode for an empty route.
   *
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onEmptyCalendarEventRoute(_route) {
    this.#mode = "create";
  }

  /**
   * Set edit mode before an event source starts to load.
   *
   * @param {CalendarEventSourceIdentity} _identity
   * @param {CalendarEventDialogRouteRequest} _route
   */
  async onCalendarEventSourceLoadStart(_identity, _route) {
    this.#mode = "edit";
  }
}

customElements.define(
  "calendar-event-create-edit-dialog",
  CalendarEventCreateEditDialog,
  { extends: "dialog" }
);
