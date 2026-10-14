/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A toggleable row that shows/hides row content.
 *
 * Template ID: #calendarDialogToggleableRowTemplate
 *
 * @tagname calendar-dialog-toggleable-row
 * @slot icon - The icon image for the row
 * @slot label - The label for the row.
 * @slot content - Body content for the row. Displayed when `checked` is set.
 * @attribute {boolean} [checked] - Observed state for the checkbox.
 */
export class CalendarDialogToggleableRow extends HTMLElement {
  static observedAttributes = ["checked"];

  /**
   * The toggleable checkbox for changing the display state of the content.
   *
   * @type {HTMLInputElement}
   */
  #toggle;

  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href =
      "chrome://messenger/skin/calendar/calendarDialogToggleableRow.css";

    const template = document.getElementById(
      "calendarDialogToggleableRowTemplate"
    );
    shadowRoot.append(style, template.content.cloneNode(true));

    this.#toggle = shadowRoot.querySelector(".toggle-checkbox");
    this.#toggle.addEventListener("change", this);
    this.#syncState();
  }

  attributeChangedCallback() {
    this.#syncState();
  }

  handleEvent(event) {
    if (event.type === "change") {
      this.toggleAttribute("checked", this.#toggle.checked);
    }
  }

  /**
   * Synchronizes checkbox and `aria-expanded` state.
   */
  #syncState() {
    if (!this.#toggle) {
      return;
    }

    const checked = this.hasAttribute("checked");
    this.#toggle.checked = checked;

    this.#toggle.setAttribute("aria-expanded", String(checked));
  }
}

customElements.define(
  "calendar-dialog-toggleable-row",
  CalendarDialogToggleableRow
);
