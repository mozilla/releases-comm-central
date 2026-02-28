/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Template ID: #calendarAttendeeTemplate
 *
 * @tagname calendar-dialog-attendee
 */
class CalendarDialogAttendee extends HTMLLIElement {
  /**
   * The attendee name element
   *
   * @type {HTMLElement}
   */
  #name = null;

  /**
   * The attendee email element
   *
   * @type {HTMLElement}
   */
  #email = null;

  /**
   * The attendee label element
   *
   * @type {HTMLElement}
   */
  #label = null;

  /**
   * The attendee icon element
   *
   * @type {HTMLElement}
   */
  #icon = null;

  /**
   * The attendee object
   *
   * @type {calIAttendee}
   */
  attendee = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogAttendeeTemplate")
      .content.cloneNode(true);
    this.append(template);

    this.#name = this.querySelector(".attendee-name");
    this.#email = this.querySelector(".attendee-email");
    this.#label = this.querySelector(".attendee-label");
    this.#icon = this.querySelector(".attendee-icon");

    if (this.attendee) {
      this.setAttendee(this.attendee);
    }
  }

  /**
   * Set the the attendee information from attendee object.
   *
   * @param {calIAttendee} attendee - An event attendee.
   */
  setAttendee(attendee) {
    this.attendee = attendee;

    if (!this.hasConnected) {
      return;
    }

    if (attendee.id.includes(attendee.commonName)) {
      this.#name.hidden = true;
    } else {
      this.#name.textContent = attendee.commonName;
    }

    this.#email.textContent = attendee.id.split(":", 2)[1];

    if (attendee.isOrganizer) {
      document.l10n.setAttributes(
        this.#label,
        "calendar-dialog-attendee-organizer"
      );
    } else if (attendee.role === "OPT-PARTICIPANT") {
      document.l10n.setAttributes(
        this.#label,
        "calendar-dialog-attendee-optional"
      );
    }

    switch (attendee.participationStatus) {
      case "ACCEPTED":
        this.#icon.classList.add("attending");
        document.l10n.setAttributes(
          this.#icon,
          "calendar-dialog-icon-attending"
        );
        break;
      case "DECLINED":
        this.#icon.classList.add("declined");
        document.l10n.setAttributes(
          this.#icon,
          "calendar-dialog-icon-declined"
        );
        break;
      case "TENTATIVE":
      case "NEEDS-ACTION":
        this.#icon.classList.add("maybe");
        document.l10n.setAttributes(this.#icon, "calendar-dialog-icon-maybe");
        break;
    }
  }
}

customElements.define("calendar-dialog-attendee", CalendarDialogAttendee, {
  extends: "li",
});
