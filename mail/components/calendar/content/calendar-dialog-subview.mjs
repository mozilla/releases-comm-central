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
 * @attribute {string} initial-focus-id - The ID of the element to focus on entry.
 * @attribute {boolean} [resize-to-content] - Lets the subview use its own size
 *   when shown by the subview manager.
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
    const backButton = content.querySelector("button");

    backButton.addEventListener("click", this);

    const style = document.createElement("link");

    style.rel = "stylesheet";
    style.href = "chrome://messenger/skin/calendar/calendarDialogSubview.css";

    document.l10n.connectRoot(shadowRoot);
    shadowRoot.append(style, content);

    window.MozXULElement?.insertFTLIfNeeded("messenger/calendarDialog.ftl");
  }

  disconnectedCallback() {
    document.l10n.disconnectRoot(this.shadowRoot);
  }

  /**
   * Focuses the element named by `initial-focus-id`. Checks the shadow root
   * first, then the document. If neither has the element, focuses the main
   * container.
   */
  focus() {
    const initialFocusId = this.getAttribute("initial-focus-id");

    if (initialFocusId) {
      const focusableElement =
        this.shadowRoot.getElementById(initialFocusId) ??
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
