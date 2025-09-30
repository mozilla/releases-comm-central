/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import { PositionedDialog } from "./positioned-dialog.mjs";
import "./calendar-dialog-subview-manager.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-date-row.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-description-row.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-categories.mjs"; // eslint-disable-line import/no-unassigned-import

// Eagerly loading modules, since we assume that an event will be displayed soon
// after this is loaded. Any module in an optional path for displaying an event
// should be lazy loaded, however.
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { recurrenceStringFromItem } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calRecurrenceUtils.sys.mjs"
);

export const DEFAULT_DIALOG_MARGIN = 12;

/**
 * Dialog for calendar.
 * Template ID: #calendarDialogTemplate
 *
 * @tagname calendar-dialog
 * @attribute {string} event-id - ID of the event to display.
 * @attribute {string} calendar-id - ID of the calendar the event to display is
 *  in.
 * @attribute {string} [recurrence-id] - Recurrence ID as the nativeTime
 *  representation of a CalDateTime. icalString is not appropriately portable.
 */

export class CalendarDialog extends PositionedDialog {
  static get observedAttributes() {
    return ["event-id", "calendar-id"];
  }

  #subviewManager = null;

  /**
   * The margin the dialog should maintain from the trigger and container edges
   *
   * @type {number}
   */
  margin = DEFAULT_DIALOG_MARGIN;

  /**
   * Selector for trigger element to position the dialog relative to.
   *
   * @type {string}
   */
  triggerSelector =
    "calendar-event-box,calendar-month-day-box-item,.multiday-event-listitem";

  connectedCallback() {
    if (!this.hasConnected) {
      this.hasConnected = true;
      const template = document
        .getElementById("calendarDialogTemplate")
        .content.cloneNode(true);

      this.append(template);

      window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");

      this.#subviewManager = this.querySelector(
        "calendar-dialog-subview-manager"
      );

      this.querySelector(".close-button").addEventListener("click", this);
      this.querySelector("#locationLink").addEventListener("click", this);
      this.#subviewManager.addEventListener("subviewchanged", this);
      this.querySelector(".back-button").addEventListener("click", this);
      this.querySelector("#expandDescription").addEventListener("click", this);

      this.querySelector(".back-button").hidden =
        this.#subviewManager.isDefaultSubviewVisible();

      this.setAttribute("is", "calendar-dialog");

      this.container = document.getElementById("calendarDisplayBox");
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

  /**
   * The handlers are matched based on the selector in the key
   * applying to the target of the click event.
   *
   * @type {Record<string,Function>}
   */
  #clickHandlers = {
    ".close-button": () => this.close(),
    ".back-button": () => this.#subviewManager.showDefaultSubview(),
    "#expandDescription": () =>
      this.#subviewManager.showSubview("calendarDescriptionSubview"),
  };

  handleEvent(event) {
    switch (event.type) {
      case "click":
        for (const [selector, handler] of Object.entries(this.#clickHandlers)) {
          if (event.target.closest(selector)) {
            handler(event);
            break;
          }
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
    if (event.recurrenceId) {
      this.setAttribute("recurrence-id", event.recurrenceId.nativeTime);
    }
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
        await this.#clearData();
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
      await this.#clearData();
      return;
    }
    let event = await calendar.getItem(eventId);
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

    // If we want a specific recurrence, retrieve it.
    if (this.getAttribute("recurrence-id")) {
      const recurrenceId = cal.createDateTime();
      recurrenceId.nativeTime = this.getAttribute("recurrence-id");
      if (recurrenceId.isValid) {
        try {
          event = event.recurrenceInfo.getOccurrenceFor(recurrenceId);
        } catch {
          console.warn(
            "Error retrieving occurrence for",
            calendarId,
            eventId,
            recurrenceId.icalString
          );
        }
      }
    }

    // We did it, we have an event to display \o/.
    this.#subviewManager.showDefaultSubview();

    const cssSafeCalendarId = cal.view.formatStringForCSSRule(calendar.id);
    this.style.setProperty(
      "--calendar-bar-color",
      `var(--calendar-${cssSafeCalendarId}-backcolor)`
    );

    this.querySelector(".event-title").textContent = event.title;
    this.querySelector(".calendar-name").textContent = calendar.name;

    const dateRow = this.querySelector("calendar-dialog-date-row");
    const startDate = cal.dtz.dateTimeToJsDate(event.startDate);
    dateRow.setAttribute("start-date", startDate.toISOString());
    const endDate = cal.dtz.dateTimeToJsDate(event.endDate);
    dateRow.setAttribute("end-date", endDate.toISOString());

    const recurrence = recurrenceStringFromItem(
      event,
      "calendar-event-dialog",
      "ruleTooComplexSummary"
    );
    if (recurrence) {
      dateRow.setAttribute("repeats", recurrence);
    } else {
      // Make sure the attribute is unset, since we might be switching event.
      dateRow.removeAttribute("repeats");
    }

    this.querySelector("calendar-dialog-categories").setCategories(
      event.getCategories()
    );

    this.#setLocation(event.getProperty("LOCATION") ?? "");

    const plainDescriptionPromise = this.querySelector(
      "#expandingDescription"
    ).setDescription(event.descriptionText);
    const richDescriptionPromise = this.querySelector(
      "#expandedDescription"
    ).setDescription(event.descriptionText, event.descriptionHTML);
    await Promise.allSettled([plainDescriptionPromise, richDescriptionPromise]);
  }

  /**
   * Clear the data displayed in the dialog.
   */
  async #clearData() {
    this.#subviewManager.showDefaultSubview();
    this.querySelector(".event-title").textContent = "";
    this.querySelector(".calendar-name").textContent = "";
    // Only clearing the repeats attribute, the dates are expected to always
    // have a value.
    this.querySelector("calendar-dialog-date-row").removeAttribute("repeats");
    this.querySelector("calendar-dialog-categories").setCategories([]);
    this.#setLocation("");
    this.style.removeProperty("--calendar-bar-color");
    await this.querySelector("#expandingDescription").setDescription("");
    await this.querySelector("#expandedDescription").setDescription("");
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
    locationText.hidden = parsedURL || !eventLocation;

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
