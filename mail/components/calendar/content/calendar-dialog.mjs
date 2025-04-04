/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-date-row.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Dialog for calendar.
 * Template ID: #calendarDialogTemplate
 */
export class CalendarDialog extends HTMLDialogElement {
  #subviewManager = null;
  /**
   * The data for the current dialog
   *
   * @type {object}
   */
  #data = null;

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
      this.querySelector("#locationLink").addEventListener("click", this);
      this.#subviewManager.addEventListener("subviewchanged", this);
      this.querySelector(".back-button").addEventListener("click", this);

      this.querySelector(".back-button").hidden =
        this.#subviewManager.isDefaultSubviewVisible();

      this.setAttribute("is", "calendar-dialog");
    }

    document.l10n.translateFragment(this);

    this.updateDialogData(this.#data, true);
  }

  handleEvent(event) {
    switch (event.type) {
      case "click":
        if (event.target.closest(".close-button")) {
          this.close();
        } else if (event.target.closest(".back-button")) {
          this.#subviewManager.showDefaultSubview();
        } else if (event.target.closest("#locationLink")) {
          event.preventDefault();
          // TODO: Open the link without breaking storybook.
          // lazy.openLinkExternally(event.detail.url);
          break;
        }
        break;
      case "subviewchanged":
        this.querySelector(".back-button").hidden =
          this.#subviewManager.isDefaultSubviewVisible();
        break;
    }
  }

  /**
   * Updates the event data showing in the dialog
   *
   * @param {object} data - Event data to be displayed in the dialog.
   * @param {boolean} init - If this is being callon on component connection.
   */
  updateDialogData(data, init) {
    if (!data) {
      return;
    }

    if (!this.hasConnected) {
      this.#data = data;
      return;
    }

    if (!this.#data || data.title !== this.#data.title || init) {
      this.querySelector(".calendar-dialog-title").textContent = data.title;
    }

    if (data.eventLocation) {
      this.#setLocation(data.eventLocation);
    }

    this.#data = data;
  }

  /**
   * Sets the location in the dialog for the calendar event.
   *
   * @param {string} eventLocation - The location of the event.
   */
  #setLocation(eventLocation) {
    const parsedURL = URL.parse(eventLocation.trim());
    const locationLink = this.querySelector("#locationLink");
    const locationText = this.querySelector("#locationText");
    locationLink.hidden = !parsedURL;
    locationText.hidden = parsedURL;

    if (parsedURL) {
      locationLink.textContent = eventLocation;
      locationLink.setAttribute("href", eventLocation);
      locationText.textContent = "";
      return;
    }

    locationText.textContent = eventLocation;
    locationLink.textContent = "";
    locationLink.setAttribute("href", "");
  }
}

customElements.define("calendar-dialog", CalendarDialog, { extends: "dialog" });
