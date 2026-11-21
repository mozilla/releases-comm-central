/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalendarDialogSubview } from "./calendar-dialog-subview.mjs";

/**
 * Provides the Description editor area in the event dialog.
 *
 * Template ID: #calendarDialogSubviewTemplate
 *
 * @tagname calendar-event-description-subview
 * @slot main - The Description heading and editor region.
 */
class CalendarEventDescriptionSubview extends CalendarDialogSubview {}

customElements.define(
  "calendar-event-description-subview",
  CalendarEventDescriptionSubview
);
