/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-attendee.mjs"; // eslint-disable-line import/no-unassigned-import

/**
 * Template ID: #calendarAttendeesRowTemplate
 *
 * @tagname calendar-dialog-attendees-row
 * @attribute {string} [type] - If type is full, attendees is expanded with
 *  a browser, otherwise it is truncated.
 */
class CalendarDialogAttendeesRow extends HTMLElement {
  /**
   * The attendee summary element
   *
   * @type {HTMLElement}
   */
  #summary = null;

  /**
   * The attendee list element
   *
   * @type {HTMLElement}
   */
  #list = null;

  /**
   * If the attendees view is a full subview or in the flow
   *
   * @type {boolean}
   */
  #isFullAttendees = null;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    this.hasConnected = true;
    const template = document
      .getElementById("calendarDialogAttendeesRowTemplate")
      .content.cloneNode(true);

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/calendar/calendarDialogAttendees.css";

    this.append(style, template);

    const row = this.querySelector("calendar-dialog-row");

    this.#isFullAttendees = this.getAttribute("type") === "full";
    row
      .querySelector('[slot="content"]')
      .classList.toggle("truncated-content", !this.#isFullAttendees);
    row.toggleAttribute("expanded", this.#isFullAttendees);
    row.toggleAttribute("expanding", !this.#isFullAttendees);
    this.#summary = this.querySelector(".attendees-summary");
    this.#list = this.querySelector(".attendees-list");
  }

  /**
   * Set the attendee information from an array of attendee objects.
   *
   * @param {calIAttendee[]} attendees - An array of event attendees.
   */
  setAttendees(attendees) {
    this.#list.innerHTML = "";
    document.l10n.setAttributes(
      this.querySelector("#attendeesCount"),
      "calendar-dialog-attendee-count",
      { count: attendees.length }
    );

    if (!this.#isFullAttendees) {
      this.dispatchEvent(
        new CustomEvent("toggleRowVisibility", {
          bubbles: true,
          detail: {
            isHidden: attendees.length === 0,
          },
        })
      );
    }

    if (this.#isFullAttendees && attendees.length > 50) {
      this.#list.hidden = true;
      this.#summary.hidden = false;

      document.l10n.setAttributes(
        this.#summary,
        "calendar-dialog-attendees-too-many-guests"
      );

      return;
    }

    if (!this.#isFullAttendees) {
      this.querySelector("calendar-dialog-row").toggleAttribute(
        "expanding",
        attendees.length > 3
      );
    }

    const showSummary = attendees.length > 3 && !this.#isFullAttendees;
    this.#list.hidden = showSummary;
    this.#summary.hidden = !showSummary;

    if (showSummary) {
      const counts = Object.groupBy(
        attendees,
        attendee => attendee.participationStatus
      );
      document.l10n.setAttributes(
        this.#summary,
        "calendar-dialog-attendee-summary",
        {
          going: counts.ACCEPTED?.length || 0,
          maybe: counts.TENTATIVE?.length || 0,
          declined: counts.DECLINED?.length || 0,
          pending: counts["NEEDS-ACTION"]?.length || 0,
        }
      );
    } else {
      this.#list.replaceChildren(
        ...attendees.map(attendee => {
          const attendeeElement = document.createElement("li", {
            is: "calendar-dialog-attendee",
          });
          attendeeElement.setAttendee(attendee);
          return attendeeElement;
        })
      );
    }
  }
}

customElements.define(
  "calendar-dialog-attendees-row",
  CalendarDialogAttendeesRow
);
