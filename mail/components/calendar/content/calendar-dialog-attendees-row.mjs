/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import "./calendar-dialog-row.mjs"; // eslint-disable-line import/no-unassigned-import
import "./calendar-dialog-attendee.mjs"; // eslint-disable-line import/no-unassigned-import

// Number of attendees to render before yielding to the scheduler.
const RENDER_CHUNK_SIZE = 50;

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

  /**
   * Controller used to abort stale attendee rendering tasks.
   *
   * @type {?AbortController}
   */
  #renderAbortController = null;

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

  disconnectedCallback() {
    this.#renderAbortController?.abort();
    this.#renderAbortController = null;
  }

  /**
   * Set the attendee information from an array of attendee objects.
   *
   * @param {calIAttendee[]} attendees - An array of event attendees.
   */
  setAttendees(attendees) {
    this.#renderAbortController?.abort();
    this.#renderAbortController = null;

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
      // Just like setting attributes for l10n is async we call this method
      // without awaiting to not delay the overall dialog rendering.
      this.#setSummary(attendees);
    } else {
      this.#renderAttendees(attendees).catch(error => {
        console.error("Failed to render calendar attendees", error);
      });
    }
  }

  /**
   * Renders the attendees to the UI in a non-blocking fashion. Allows aborting
   * in the middle of rendering. In the very rare case that the Scheduler API is
   * unavailable, this function will be blocking for very large attendee
   * lists.
   *
   * @param {calIAttendee[]} attendees - An array of event attendees.
   */
  async #renderAttendees(attendees) {
    const controller = new AbortController();
    this.#renderAbortController = controller;
    const { signal } = controller;

    const renderChunked = async () => {
      let fragment = document.createDocumentFragment();
      let fragmentLength = 0;

      for (const attendee of attendees) {
        signal.throwIfAborted();
        const attendeeElement = document.createElement("li", {
          is: "calendar-dialog-attendee",
        });
        attendeeElement.setAttendee(attendee);
        fragment.appendChild(attendeeElement);
        fragmentLength++;

        if (globalThis.scheduler && fragmentLength >= RENDER_CHUNK_SIZE) {
          signal.throwIfAborted();

          // Add the current group before yielding the task.
          this.#list.appendChild(fragment);

          this.#list.ariaBusy = true;

          // appendChild empties the fragment. Make a new fragment for the next
          // group.
          fragment = document.createDocumentFragment();
          fragmentLength = 0;

          await globalThis.scheduler.yield();
        }
      }

      signal.throwIfAborted();

      // Add the remaining attendees to the list.
      this.#list.appendChild(fragment);
      this.#list.ariaBusy = false;
    };

    try {
      if (globalThis.scheduler) {
        await globalThis.scheduler.postTask(renderChunked, {
          signal,
        });
      } else {
        await renderChunked();
      }
    } catch (error) {
      if (!signal.aborted) {
        throw error;
      }
    } finally {
      if (this.#renderAbortController === controller) {
        this.#renderAbortController = null;
      }
    }
  }

  /**
   * Translates the summary and updates the dom asynchronously.
   *
   * @param {calIAttendee[]} attendees - An array of event attendees.
   */
  async #setSummary(attendees) {
    const counts = Object.groupBy(
      attendees,
      attendee => attendee.participationStatus
    );

    const translations = await document.l10n.formatValues([
      {
        id: "calendar-dialog-attendee-summary-going",
        args: { count: counts.ACCEPTED?.length || 0 },
      },
      {
        id: "calendar-dialog-attendee-summary-maybe",
        args: { count: counts.TENTATIVE?.length || 0 },
      },
      {
        id: "calendar-dialog-attendee-summary-declined",
        args: { count: counts.DECLINED?.length || 0 },
      },
      {
        id: "calendar-dialog-attendee-summary-pending",
        args: { count: counts["NEEDS-ACTION"]?.length || 0 },
      },
    ]);
    this.#summary.textContent = new Intl.ListFormat(
      Services.locale.appLocalesAsBCP47,
      {
        style: "narrow",
      }
    ).format(translations);
  }
}

customElements.define(
  "calendar-dialog-attendees-row",
  CalendarDialogAttendeesRow
);
