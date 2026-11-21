/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalendarDialogNavigationRow } from "./calendar-dialog-navigation-row.mjs";
import { calendarEventSessionRow } from "./calendar-event-session-row.mjs";
import {
  selectCurrentDraft,
  selectGuestsViewModel,
} from "./state/calendar-event-create-edit-selectors.mjs";

/**
 * Displays guest counts and opens the guests view.
 * Template ID: #calendarDialogNavigationRowTemplate (inherited)
 *
 * @tagname calendar-event-guests-row
 * @attribute {string} subview-id - The ID of the subview to show.
 * @slot icon - The row icon.
 * @slot label - The row label.
 * @slot action - The action button icon.
 * @slot content - The response summary.
 * @fires CustomEvent - Event "calendar-dialog-open-subview" requests that the
 *   parent shows the subview identified by this row's `subview-id`.
 */
export class CalendarEventGuestsRow extends calendarEventSessionRow(
  CalendarDialogNavigationRow,
  forSession => ({
    guests: forSession((state, key) =>
      selectCurrentDraft(state, key) ? selectGuestsViewModel(state, key) : null
    ),
  })
) {
  /**
   * ID for the current guest summary render.
   *
   * @type {number}
   */
  #renderGeneration = 0;

  /**
   * The completion promise for the current guest summary render.
   *
   * @type {Promise<void>}
   */
  #renderComplete = Promise.resolve();

  connectedCallback() {
    super.connectedCallback();
    const guestCounts = this.selectValue("guests");
    if (guestCounts !== undefined) {
      this.#startGuestRender(guestCounts);
    }
  }

  disconnectedCallback() {
    this.#cancelRender();
    super.disconnectedCallback();
  }

  dispose() {
    this.#cancelRender();
    super.dispose();
  }

  get #summarySlot() {
    return this.querySelector(".guests-summary");
  }

  /**
   * Returns the completion promise for the current guest summary rendering.
   *
   * @returns {Promise<void>} The promise for the current guest summary render.
   */
  get renderComplete() {
    return this.#renderComplete;
  }

  handleStateChange(_fieldName, _previous, guestCounts) {
    if (this.isConnected) {
      this.#startGuestRender(guestCounts);
    }
  }

  /**
   * Invalidates pending renders and resets the current completion promise.
   */
  #cancelRender() {
    this.#renderGeneration++;
    this.#renderComplete = Promise.resolve();
  }

  /**
   * Starts a guest summary render or clears the summary when counts are absent.
   *
   * @param {?CalendarEventGuestsViewModel} guestCounts - The guest counts.
   */
  #startGuestRender(guestCounts) {
    if (!guestCounts) {
      this.#cancelRender();

      this.#clearSummary();

      document.l10n.setAttributes(
        this.querySelector(".guests-label"),
        "calendar-event-add-guests"
      );
      return;
    }

    const generation = ++this.#renderGeneration;
    this.#renderComplete = this.#renderGuests(guestCounts, generation);
  }

  #clearSummary() {
    this.#summarySlot.hidden = true;
    // Remove the slot attribute, so that the label and icon are vertically
    // aligned to the middle when there's no summary content
    this.#summarySlot.removeAttribute("slot");
    this.#summarySlot.textContent = "";
  }

  /**
   * Updates the guest label and translates the current response counts.
   *
   * @param {CalendarEventGuestsViewModel} guestCounts - The guest counts.
   * @param {number} generation - The render generation.
   * @returns {Promise<void>} Resolves when the render attempt finishes.
   */
  async #renderGuests(guestCounts, generation) {
    try {
      const labelMessageId = guestCounts.invited
        ? "calendar-event-guests-invited"
        : "calendar-event-add-guests";
      const labelMessageArgs = guestCounts.invited
        ? { count: guestCounts.invited }
        : null;

      document.l10n.setAttributes(
        this.querySelector(".guests-label"),
        labelMessageId,
        labelMessageArgs
      );

      if (generation != this.#renderGeneration) {
        return;
      }

      if (!guestCounts.invited) {
        this.#clearSummary();
        return;
      }

      const messages = [
        {
          id: "calendar-dialog-attendee-summary-going",
          args: { count: guestCounts.attending },
        },
        {
          id: "calendar-dialog-attendee-summary-maybe",
          args: { count: guestCounts.maybe },
        },
        {
          id: "calendar-dialog-attendee-summary-declined",
          args: { count: guestCounts.notAttending },
        },
        {
          id: "calendar-dialog-attendee-summary-pending",
          args: { count: guestCounts.pending },
        },
      ];

      const translatedResponses = await document.l10n.formatValues(messages);

      if (generation != this.#renderGeneration) {
        return;
      }

      this.#summarySlot.textContent = new Intl.ListFormat(
        Services.locale.appLocalesAsBCP47,
        { style: "narrow" }
      ).format(translatedResponses);

      this.#summarySlot.hidden = false;
      // Slot is missing if row was previously empty, so add it back.
      this.#summarySlot.slot = "content";
    } catch (error) {
      if (generation != this.#renderGeneration) {
        return;
      }

      this.#clearSummary();
      console.error("Failed to render calendar guest responses", error);
    }
  }
}

customElements.define("calendar-event-guests-row", CalendarEventGuestsRow);
