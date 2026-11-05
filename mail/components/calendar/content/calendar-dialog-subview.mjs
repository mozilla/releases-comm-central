/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A calendar dialog subview with a Back button.
 *
 * Template ID: #calendarDialogSubviewTemplate
 *
 * @fires CustomEvent - Event "calendar-dialog-close-subview" requests that the
 *   parent returns to its default subview.
 * @slot main - The main subview content.
 * @slot footer - Additional footer content.
 * @attribute initial-focus-id - The ID of the initial focus element.
 * @tagname calendar-dialog-subview
 */
export class CalendarDialogSubview extends HTMLElement {
  connectedCallback() {
    if (this.shadowRoot) {
      return;
    }

    const shadowRoot = this.attachShadow({ mode: "open" });
    const template = document.getElementById("calendarDialogSubviewTemplate");
    const content = template.content.cloneNode(true);
    content.querySelector("button").addEventListener("click", this);

    document.l10n.connectRoot(shadowRoot);
    shadowRoot.append(content);
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/calendar/calendarDialogSubview.css";
    shadowRoot.append(style);
    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  /**
   * Focuses the element with the ID from `initial-focus-id`. If absent, focuses
   * the shadow `main` element instead.
   */
  focus() {
    const initialFocusId = this.getAttribute("initial-focus-id");
    if (initialFocusId) {
      const focusableElement =
        this.ownerDocument.getElementById(initialFocusId);
      if (focusableElement) {
        focusableElement.focus();
        return;
      }
    }

    this.shadowRoot.querySelector("main").focus();
  }

  handleEvent(event) {
    if (event.type == "click") {
      this.dispatchEvent(
        new CustomEvent("calendar-dialog-close-subview", {
          bubbles: true,
          composed: true,
        })
      );
    }
  }
}
customElements.define("calendar-dialog-subview", CalendarDialogSubview);
