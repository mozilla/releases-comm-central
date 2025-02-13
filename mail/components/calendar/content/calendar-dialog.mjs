/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Dialog for calendar.
 * Template ID: #calendarDialogTemplate
 */
class CalendarDialog extends HTMLDialogElement {
  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("calendarDialogTemplate")
        .content.cloneNode(true);

      this.append(template);

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

      this.querySelector(".close-button").addEventListener("click", this);
    }

    document.l10n.translateFragment(this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (event.target.closest(".close-button")) {
          this.close();
        }
        break;
    }
  }
}

customElements.define("calendar-dialog", CalendarDialog, { extends: "dialog" });
