/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-date-row.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-categories.mjs"; // eslint-disable-line import/no-unassigned-import

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

/**
 * Dialog for calendar.
 * Template ID: #calendarDialogTemplate
 *
 * @tagname calendar-dialog
 * @attribute {string} event-id - ID of the event to display.
 * @attribute {string} calendar-id - ID of the calendar the event to display is
 *  in.
 */
export class CalendarDialog extends HTMLDialogElement {
  static get observedAttributes() {
    return ["event-id", "calendar-id"];
  }

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
      this.querySelector("#locationLink").addEventListener("click", this);
      this.#subviewManager.addEventListener("subviewchanged", this);
      this.querySelector(".back-button").addEventListener("click", this);

      this.querySelector(".back-button").hidden =
        this.#subviewManager.isDefaultSubviewVisible();

      this.setAttribute("is", "calendar-dialog");
    }

    document.l10n.translateFragment(this);
    this.#loadCalendarEvent();
  }

  attributeChangedCallback(attribute) {
    switch (attribute) {
      case "calendar-id":
      case "event-id":
        this.#loadCalendarEvent();
        break;
    }
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
   * Helper to set up the calendar event reference for the dialog. When called
   * with a calIEvent the dialog will update to show the data of that event.
   *
   * @param {calIEvent} event
   * @throws {Error} When passed a calIItemBase that isn't an event.
   */
  setCalendarEvent(event) {
    if (!event.isEvent()) {
      throw new Error("Can only display events");
    }
    this.removeAttribute("calendar-id");
    this.setAttribute("event-id", event.id);
    this.setAttribute("calendar-id", event.calendar.id);
  }

  /**
   * Load the data from the event given by attributes. The displayed data is
   * cleared if either of the attributes is unset.
   */
  async #loadCalendarEvent() {
    if (!this.hasConnected) {
      return;
    }

    // Let's find the calendar we're displaying an event from.
    const calendarId = this.getAttribute("calendar-id");
    if (!calendarId) {
      // Only clear if event ID is still set.
      if (this.getAttribute("event-id")) {
        this.#clearData();
      }
      return;
    }
    const calendar = cal.manager.getCalendarById(calendarId);
    if (!calendar) {
      console.error("No calendar", calendarId);
      this.close();
      return;
    }

    // Let's find the event in the calendar.
    const eventId = this.getAttribute("event-id");
    if (!eventId) {
      // Should clear now, since calendar ID is still set.
      this.#clearData();
      return;
    }
    const event = await calendar.getItem(eventId);
    if (!event) {
      // Only dismiss the dialog if the state hasn't changed while awaiting.
      if (eventId === this.getAttribute("event-id")) {
        console.error("Could not find", eventId, "in", calendarId);
        this.close();
      }
      return;
    }
    if (!event.isEvent()) {
      console.error(calendarId, eventId, "is not an event");
      this.close();
      return;
    }

    // We did it, we have an event to display \o/.
    this.querySelector(".calendar-dialog-title").textContent = event.title;
  }

  /**
   * Clear the data displayed in the dialog.
   */
  #clearData() {
    this.querySelector(".calendar-dialog-title").textContent = "";
  }

  /**
   * Updates the event data showing in the dialog. Deprecated in favor of
   * populating data from the calIEvent. Left in place as reference for adding
   * more loading above.
   *
   * @param {object} data - Event data to be displayed in the dialog.
   */
  updateDialogData(data) {
    if (data.eventLocation) {
      this.#setLocation(data.eventLocation);
    }

    if (data.description) {
      this.querySelector("#calendarDescriptionContent").textContent =
        data.description;
    }

    if (Array.isArray(data.categories)) {
      this.querySelector("calendar-dialog-categories").setCategories(
        data.categories
      );
    }
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
