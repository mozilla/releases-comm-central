/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Dialog for calendar.
 * Template ID: #calendarDialogTemplate
 */
class CalendarDialog extends HTMLDialogElement {
  #subviewManager = null;

  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("calendarDialogTemplate")
        .content.cloneNode(true);

      const styles = document.createElement("link");
      styles.rel = "stylesheet";
      styles.href = "chrome://messenger/skin/calendar/calendarDialog.css";

      this.append(template, styles);

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

      this.#subviewManager = this.querySelector(
        "calendar-dialog-subview-manager"
      );

      this.querySelector(".close-button").addEventListener("click", this);
      this.#subviewManager.addEventListener("subviewchanged", this);
      this.querySelector(".back-button").addEventListener("click", this);

      this.querySelector(".back-button").hidden =
        this.#subviewManager.isDefaultSubviewVisible();
    }

    document.l10n.translateFragment(this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (event.target.closest(".close-button")) {
          this.close();
        } else if (event.target.closest(".back-button")) {
          this.#subviewManager.showDefaultSubview();
        }
        break;
      case "subviewchanged":
        this.querySelector(".back-button").hidden =
          this.#subviewManager.isDefaultSubviewVisible();
        break;
    }
  }
}

customElements.define("calendar-dialog", CalendarDialog, { extends: "dialog" });
