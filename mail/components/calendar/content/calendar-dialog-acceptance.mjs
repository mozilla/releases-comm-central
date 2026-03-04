/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Calendar Dialog Acceptance Widget
 * Template ID: #calendarDialogAcceptanceTemplate (from calendarDialogAcceptance.inc.xhtml)
 *
 * @tagname calendar-dialog-acceptance
 * @attribute {string} status - The user's response status from the event.
 */
export class CalendarDialogAcceptance extends HTMLElement {
  static get observedAttributes() {
    return ["status"];
  }
  async connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });

    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href =
      "chrome://messenger/skin/calendar/calendarDialogAcceptance.css";

    const template = document.getElementById(
      "calendarDialogAcceptanceTemplate"
    );
    const clonedNode = template.content.cloneNode(true);

    document.l10n.connectRoot(this.shadowRoot);
    shadowRoot.append(clonedNode, style);
    this.shadowRoot.addEventListener("change", this);

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
  }

  attributeChangedCallback(attribute, oldValue, newValue) {
    // Status attribute has changed.
    if (!newValue || newValue === "NEEDS-ACTION") {
      return;
    }

    this.shadowRoot.querySelector(`input[value="${newValue}"]`).checked = true;
  }

  handleEvent(event) {
    // Change event on shadowRoot has been triggered.
    this.dispatchEvent(
      new CustomEvent("setEventResponse", {
        bubbles: true,
        detail: {
          status: event.target.value,
        },
      })
    );
  }

  /**
   * Resets the state of the acceptance widget.
   */
  reset() {
    const checkedInput = this.shadowRoot.querySelector("input:checked");
    if (checkedInput) {
      checkedInput.checked = false;
    }

    this.removeAttribute("status");
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }
}

customElements.define("calendar-dialog-acceptance", CalendarDialogAcceptance);
