/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import

const DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  timeStyle: "short",
  dateStyle: "medium",
});

/**
 * Template ID: #calendarDialogDateRowTemplate
 *
 * @tagname calendar-dialog-date-row
 * @attribute {string} start-date - ISO timestamp when the event starts.
 * @attribute {string} end-date - ISO timestamp when the event ends.
 * @attribute {string} [repeats] - Human readable description of the repeat
 *   pattern. If omitted, the repeats icon is hidden.
 */
class CalendarDialogDateRow extends HTMLElement {
  static get observedAttributes() {
    return ["start-date", "end-date", "repeats"];
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogDateRowTemplate")
      .content.cloneNode(true);
    this.append(template);

    this.attributeChangedCallback("start-date");
    this.attributeChangedCallback(
      "repeats",
      undefined,
      this.getAttribute("repeats")
    );
  }

  attributeChangedCallback(attribute, oldValue, newValue) {
    switch (attribute) {
      case "start-date":
      case "end-date":
        this.querySelector(".date-label").textContent =
          DATE_FORMATTER.formatRange(
            new Date(this.getAttribute("start-date")),
            new Date(this.getAttribute("end-date"))
          );
        break;
      case "repeats": {
        const repeats = this.querySelector(".repeats");
        repeats.title = newValue;
        repeats.hidden = !newValue;
        break;
      }
    }
  }
}
customElements.define("calendar-dialog-date-row", CalendarDialogDateRow);
