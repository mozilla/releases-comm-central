/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A row with an action button that triggers subview navigation.
 *
 * Template ID: #calendarDialogNavigationRowTemplate
 *
 * @tagname calendar-dialog-navigation-row
 * @attribute {string} subview-id - The ID of the subview to show.
 * @slot icon - The row icon.
 * @slot label - The row label.
 * @slot action - The action button icon.
 * @slot content - The row content.
 * @fires CustomEvent - Event "calendar-dialog-open-subview" requests that the
 *   parent shows the subview identified by this row's `subview-id`.
 */
export class CalendarDialogNavigationRow extends HTMLElement {
  /**
   * The action button that triggers the subview navigation.
   *
   * @type {HTMLButtonElement}
   */
  #actionButton;

  connectedCallback() {
    if (this.shadowRoot) {
      document.l10n.connectRoot(this.shadowRoot);
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const template = document.getElementById(
      "calendarDialogNavigationRowTemplate"
    );
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href =
      "chrome://messenger/skin/calendar/calendarDialogNavigationRow.css";
    shadowRoot.append(template.content.cloneNode(true), style);

    this.#actionButton = shadowRoot.querySelector("button");
    this.#actionButton.addEventListener("click", this);
    document.l10n.connectRoot(shadowRoot);
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  handleEvent(event) {
    if (event.type == "click") {
      this.dispatchEvent(
        new CustomEvent("calendar-dialog-open-subview", {
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  /**
   * Moves focus to the row action button.
   */
  focusRowAction() {
    this.#actionButton.focus();
  }
}

customElements.define(
  "calendar-dialog-navigation-row",
  CalendarDialogNavigationRow
);
