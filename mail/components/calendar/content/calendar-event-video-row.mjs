/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { CalendarDialogToggleableRow } from "./calendar-dialog-toggleable-row.mjs";
import { calendarEventSessionRow } from "./calendar-event-session-row.mjs";
import {
  selectVideoDisabled,
  selectVideoEnabled,
  selectVideoUrl,
} from "./state/calendar-event-create-edit-selectors.mjs";
import { updateSection } from "./state/calendarEventDraftSlice.mjs";

/**
 * Shows the Video toggle and URL input. Sets `enabledRows.video` and
 * `videoUrl` in the event draft.
 *
 * Template ID: #calendarDialogToggleableRowTemplate (inherited)
 *
 * @tagname calendar-event-video-row
 * @slot icon - The row icon.
 * @slot label - The row label.
 * @slot content - The video URL controls.
 */
export class CalendarEventVideoRow extends calendarEventSessionRow(
  CalendarDialogToggleableRow,
  forSession => ({
    videoEnabled: forSession(selectVideoEnabled),
    videoUrl: forSession(selectVideoUrl),
    videoDisabled: forSession(selectVideoDisabled),
  })
) {
  /**
   * The text input for the video URL.
   *
   * @type {HTMLInputElement}
   */
  #urlInput;

  connectedCallback() {
    super.connectedCallback();
    this.#urlInput = this.querySelector(".calendar-event-video-url");
    this.#urlInput.addEventListener("input", this);
    this.querySelector(".calendar-event-clear-video-url").addEventListener(
      "click",
      this
    );
  }

  handleEvent(event) {
    if (this.selectValue("videoDisabled")) {
      return;
    }

    super.handleEvent(event);

    if (event.type == "click") {
      this.#urlInput.value = "";
    }

    this.dispatchSessionAction(updateSection, {
      section: "video",
      patch: {
        enabledRows: { video: this.hasAttribute("checked") },
        videoUrl: this.#urlInput.value,
      },
    });
  }

  /**
   * Sets the toggle, the URL input and whether the controls are disabled from
   * the draft and the Save status.
   *
   * @param {string} fieldName - The registered selector name.
   * @param {boolean|string|undefined} _previous - The old value.
   * @param {boolean|string} value - The new value.
   */
  handleStateChange(fieldName, _previous, value) {
    if (fieldName == "videoEnabled") {
      this.toggleAttribute("checked", value);
    } else if (fieldName == "videoDisabled") {
      this.shadowRoot.querySelector(".toggle-checkbox").disabled = value;

      for (const control of this.querySelectorAll("input, button")) {
        control.disabled = value;
      }
    } else if (this.#urlInput.value != value) {
      this.#urlInput.value = value;
    }
  }
}

customElements.define("calendar-event-video-row", CalendarEventVideoRow);
