/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Calendar Dialog Row Template
 * Template ID: #calendarDialogRow (from calendarDialogRowTemplate.inc.xhtml)
 *
 * @tagname calendar-dialog-row
 *
 * @slot icon - The icon image for the row
 * @slot label - The label for the row.
 * @slot content - Body content for the row.
 */
export class CalendarDialogRow extends HTMLElement {
  async connectedCallback() {
    if (this.shadowRoot) {
      // Already connected, no need to run it again.
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    const template = document.getElementById("calendarDialogRowTemplate");
    const clonedNode = template.content.cloneNode(true);
    shadowRoot.append(clonedNode);
  }
}

customElements.define("calendar-dialog-row", CalendarDialogRow);
